import { promises as dns } from "node:dns";
import { isIP, type LookupFunction } from "node:net";

import { load } from "cheerio";
import { Agent, fetch as undiciFetch } from "undici";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 1_000_000;
const DEFAULT_MAX_REDIRECTS = 3;
const MAX_TITLE_LENGTH = 300;
const MAX_EXCERPT_LENGTH = 4_000;
const MAX_ERROR_LENGTH = 300;
const MAX_SAVED_SOURCE_URLS = 20;
const MAX_SOURCE_URL_LENGTH = 2_048;
const MAX_SOURCE_CONCURRENCY = 4;
const SOURCE_TIMEOUT = Symbol("source_timeout");
const UTF8_ENCODER = new TextEncoder();

// Configurable sources are intentionally limited to TLDs used by US leagues,
// teams, colleges, and governing bodies. This avoids treating public suffixes
// from broader country-code namespaces as organization-owned apex domains.
const CONFIGURABLE_SOURCE_TLDS = new Set([
  "com",
  "edu",
  "gov",
  "net",
  "org",
]);
const RESERVED_EXAMPLE_DOMAINS = [
  "example.com",
  "example.net",
  "example.org",
] as const;

const DEFAULT_APPROVED_SOURCE_DOMAINS = [
  "baseball-reference.com",
  "baseballhall.org",
  "basketball-reference.com",
  "espn.com",
  "goduke.com",
  "heisman.com",
  "hhof.com",
  "hockey-reference.com",
  "lsusports.net",
  "mlb.com",
  "nba.com",
  "ncaa.com",
  "nfl.com",
  "nhl.com",
  "osubeavers.com",
  "pro-football-reference.com",
  "sabr.org",
  "seahawks.com",
  "sports-reference.com",
  "uconnhuskies.com",
  "uhcougars.com",
] as const;

const SPECIAL_USE_SUFFIXES = [
  ".arpa",
  ".example",
  ".internal",
  ".invalid",
  ".local",
  ".localhost",
  ".onion",
  ".test",
] as const;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const ALLOWED_CONTENT_TYPES = new Set([
  "application/xhtml+xml",
  "text/html",
  "text/plain",
]);

export type SourceFetch = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

export interface SourceDnsAddress {
  address: string;
  family: 4 | 6;
}

export type SourceDnsResolver = (
  hostname: string,
) => Promise<readonly SourceDnsAddress[]>;

export interface PinnedSourceContext {
  hostname: string;
  addresses: readonly SourceDnsAddress[];
  lookup: LookupFunction;
}

export interface PinnedSourceResponse {
  response: Response;
  close: () => Promise<void>;
}

export type PinnedSourceFetch = (
  input: string,
  init: RequestInit,
  context: PinnedSourceContext,
) => Promise<PinnedSourceResponse>;

export interface SourceUrlOptions {
  additionalApprovedDomains?: string;
}

export interface SourceFetchOptions extends SourceUrlOptions {
  fetchImpl?: SourceFetch;
  resolver?: SourceDnsResolver;
  pinnedFetchImpl?: PinnedSourceFetch;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

export type SourceUrlRejectionReason =
  | "credentials_not_allowed"
  | "fragment_not_allowed"
  | "host_not_allowed"
  | "invalid_host"
  | "invalid_url"
  | "port_not_allowed"
  | "unsupported_scheme";

export type SourceUrlValidation =
  | { ok: true; url: string }
  | {
      ok: false;
      reason: SourceUrlRejectionReason;
    };

interface SourceResultBase {
  requestedUrl: string;
  finalUrl: string;
  redirects: string[];
}

export type SourceEvidenceResult =
  | (SourceResultBase & {
      status: "fetched";
      title: string;
      excerpt: string;
      bytes: number;
      contentType: string;
    })
  | (SourceResultBase & {
      status: "rejected";
      reason:
        | SourceUrlRejectionReason
        | "disallowed_redirect"
        | "dns_no_addresses"
        | "invalid_redirect"
        | "non_public_address"
        | "redirect_loop"
        | "too_many_redirects";
    })
  | (SourceResultBase & { status: "timeout" })
  | (SourceResultBase & {
      status: "too_large";
      maxBytes: number;
    })
  | (SourceResultBase & {
      status: "content_type_error";
      contentType: string;
    })
  | (SourceResultBase & {
      status: "http_error";
      httpStatus: number;
    })
  | (SourceResultBase & {
      status: "fetch_error";
      error: string;
    });

export type PublicSourceResolution =
  | { ok: true; addresses: SourceDnsAddress[] }
  | {
      ok: false;
      reason:
        | "dns_no_addresses"
        | "dns_resolution_failed"
        | "non_public_address";
      error?: string;
    };

function parseIpv4(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const bytes = parts.map((part) => Number(part));
  if (
    bytes.some(
      (byte, index) =>
        !Number.isInteger(byte) ||
        byte < 0 ||
        byte > 255 ||
        String(byte) !== parts[index],
    )
  ) {
    return null;
  }
  return bytes;
}

function parseIpv6(address: string): Uint8Array | null {
  if (address.includes("%") || isIP(address) !== 6) {
    return null;
  }

  let normalized = address.toLowerCase();
  if (normalized.includes(".")) {
    const lastColon = normalized.lastIndexOf(":");
    const ipv4 = parseIpv4(normalized.slice(lastColon + 1));
    if (lastColon < 0 || !ipv4) {
      return null;
    }
    normalized = `${normalized.slice(0, lastColon)}:${(
      (ipv4[0] << 8) |
      ipv4[1]
    ).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) {
    return null;
  }
  const parseHalf = (half: string): number[] | null => {
    if (!half) {
      return [];
    }
    const values = half.split(":");
    if (values.some((value) => !/^[0-9a-f]{1,4}$/i.test(value))) {
      return null;
    }
    return values.map((value) => Number.parseInt(value, 16));
  };
  const left = parseHalf(halves[0]);
  const right = parseHalf(halves[1] ?? "");
  if (!left || !right) {
    return null;
  }
  const compressed = halves.length === 2;
  const zeroCount = 8 - left.length - right.length;
  if ((!compressed && zeroCount !== 0) || (compressed && zeroCount < 1)) {
    return null;
  }

  const groups = [...left, ...Array(zeroCount).fill(0), ...right];
  if (groups.length !== 8) {
    return null;
  }
  const bytes = new Uint8Array(16);
  groups.forEach((group, index) => {
    bytes[index * 2] = group >> 8;
    bytes[index * 2 + 1] = group & 0xff;
  });
  return bytes;
}

function isPublicIpv4(address: string): boolean {
  const bytes = parseIpv4(address);
  if (!bytes) {
    return false;
  }
  const [a, b, c] = bytes;
  return !(
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function hasIpv6Prefix(
  address: Uint8Array,
  prefix: readonly number[],
  bits: number,
): boolean {
  const fullBytes = Math.floor(bits / 8);
  for (let index = 0; index < fullBytes; index += 1) {
    if (address[index] !== (prefix[index] ?? 0)) {
      return false;
    }
  }
  const remainingBits = bits % 8;
  if (remainingBits === 0) {
    return true;
  }
  const mask = (0xff << (8 - remainingBits)) & 0xff;
  return (address[fullBytes] & mask) === ((prefix[fullBytes] ?? 0) & mask);
}

function isPublicIpv6(address: string): boolean {
  const bytes = parseIpv6(address);
  if (!bytes) {
    return false;
  }

  const isMappedIpv4 =
    bytes.slice(0, 10).every((byte) => byte === 0) &&
    bytes[10] === 0xff &&
    bytes[11] === 0xff;
  if (isMappedIpv4) {
    return isPublicIpv4(
      `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`,
    );
  }

  if ((bytes[0] & 0xe0) !== 0x20) {
    return false;
  }

  const isIpv4Compatible = bytes.slice(0, 12).every((byte) => byte === 0);
  return !(
    isIpv4Compatible ||
    hasIpv6Prefix(
      bytes,
      [0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff, 0, 0],
      96,
    ) ||
    hasIpv6Prefix(bytes, [0x00, 0x64, 0xff, 0x9b], 96) ||
    hasIpv6Prefix(bytes, [0x00, 0x64, 0xff, 0x9b, 0x00, 0x01], 48) ||
    hasIpv6Prefix(bytes, [0x01, 0x00, 0, 0, 0, 0, 0, 0], 64) ||
    (bytes[0] === 0x20 && bytes[1] === 0x01 && (bytes[2] & 0xfe) === 0) ||
    hasIpv6Prefix(bytes, [0x20, 0x01, 0x0d, 0xb8], 32) ||
    hasIpv6Prefix(bytes, [0x20, 0x02], 16) ||
    hasIpv6Prefix(bytes, [0x3f, 0xff, 0x00], 20) ||
    hasIpv6Prefix(bytes, [0x5f, 0x00], 16) ||
    hasIpv6Prefix(bytes, [0x26, 0x20, 0x00, 0x4f, 0x80, 0x00], 48) ||
    (bytes[0] & 0xfe) === 0xfc ||
    (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) ||
    (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0xc0) ||
    bytes[0] === 0xff
  );
}

export function isPublicSourceAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    return isPublicIpv4(address);
  }
  if (family === 6) {
    return isPublicIpv6(address);
  }
  return false;
}

const defaultSourceDnsResolver: SourceDnsResolver = async (hostname) => {
  const answers = await dns.lookup(hostname, { all: true, verbatim: true });
  return answers.map((answer) => ({
    address: answer.address,
    family: answer.family === 6 ? 6 : 4,
  }));
};

export async function resolvePublicSourceAddresses(
  hostname: string,
  resolver: SourceDnsResolver = defaultSourceDnsResolver,
): Promise<PublicSourceResolution> {
  let answers: readonly SourceDnsAddress[];
  try {
    answers = await resolver(hostname);
  } catch (error) {
    return {
      ok: false,
      reason: "dns_resolution_failed",
      error: boundedError(error),
    };
  }
  if (!Array.isArray(answers) || answers.length === 0) {
    return { ok: false, reason: "dns_no_addresses" };
  }

  const addresses: SourceDnsAddress[] = [];
  const seen = new Set<string>();
  for (const answer of answers) {
    const detectedFamily = isIP(answer?.address ?? "");
    if (
      (answer?.family !== 4 && answer?.family !== 6) ||
      detectedFamily !== answer.family ||
      !isPublicSourceAddress(answer.address)
    ) {
      return { ok: false, reason: "non_public_address" };
    }
    const key = `${answer.family}:${answer.address.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      addresses.push({ address: answer.address, family: answer.family });
    }
  }

  return { ok: true, addresses };
}

function lookupError(message: string, code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(message), { code });
}

export function createPinnedSourceLookup(
  expectedHostname: string,
  addresses: readonly SourceDnsAddress[],
): LookupFunction {
  let nextAddress = 0;
  return (hostname, options, callback) => {
    if (hostname.toLowerCase() !== expectedHostname.toLowerCase()) {
      callback(
        lookupError("Pinned lookup received an unexpected hostname", "ENOTFOUND"),
        "",
      );
      return;
    }

    const requestedFamily =
      options.family === "IPv4"
        ? 4
        : options.family === "IPv6"
          ? 6
          : options.family ?? 0;
    const candidates = addresses.filter(
      (answer) => requestedFamily === 0 || answer.family === requestedFamily,
    );
    if (candidates.length === 0) {
      callback(
        lookupError("Pinned lookup has no address for the requested family", "EAI_ADDRFAMILY"),
        "",
      );
      return;
    }
    if (options.all) {
      callback(null, candidates.map((answer) => ({ ...answer })));
      return;
    }

    const answer = candidates[nextAddress % candidates.length];
    nextAddress += 1;
    callback(null, answer.address, answer.family);
  };
}

const defaultPinnedSourceFetch: PinnedSourceFetch = async (
  input,
  init,
  context,
) => {
  // Only DNS lookup is replaced. The request URL remains unchanged so Undici
  // uses the authoritative hostname for HTTP Host and TLS SNI/certificate checks.
  const dispatcher = new Agent({
    autoSelectFamily: true,
    autoSelectFamilyAttemptTimeout: 250,
    connections: 1,
    pipelining: 1,
    connect: { lookup: context.lookup },
  });
  try {
    const response = await undiciFetch(input, {
      ...init,
      dispatcher,
    } as Parameters<typeof undiciFetch>[1]);
    let closed = false;
    return {
      response: response as unknown as Response,
      close: async () => {
        if (closed) {
          return;
        }
        closed = true;
        try {
          await dispatcher.close();
        } catch (error) {
          await dispatcher.destroy(error instanceof Error ? error : null);
        }
      },
    };
  } catch (error) {
    await dispatcher.destroy(error instanceof Error ? error : null);
    throw error;
  }
};

function isSafeHostname(hostname: string): boolean {
  if (
    hostname.length === 0 ||
    hostname.endsWith(".") ||
    !hostname.includes(".") ||
    isIP(hostname) !== 0
  ) {
    return false;
  }

  if (
    SPECIAL_USE_SUFFIXES.some(
      (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
    )
  ) {
    return false;
  }

  const labels = hostname.split(".");
  if (
    labels.some(
      (label) =>
        label.length === 0 ||
        label.length > 63 ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
    )
  ) {
    return false;
  }

  const topLevelDomain = labels.at(-1);
  return Boolean(topLevelDomain && /^[a-z]{2,63}$/i.test(topLevelDomain));
}

function parseApprovedDomainList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  const domains: string[] = [];
  const seen = new Set<string>();

  for (const item of value.split(",")) {
    const domain = item.trim().toLowerCase();
    if (
      seen.has(domain) ||
      !isSafeConfigurableDomain(domain) ||
      domain.includes(":") ||
      domain.includes("/") ||
      domain.includes("*")
    ) {
      continue;
    }
    seen.add(domain);
    domains.push(domain);
  }

  return domains;
}

function isSafeConfigurableDomain(domain: string): boolean {
  if (!isSafeHostname(domain)) {
    return false;
  }

  const labels = domain.split(".");
  const topLevelDomain = labels.at(-1);
  if (
    labels.length < 2 ||
    !topLevelDomain ||
    !CONFIGURABLE_SOURCE_TLDS.has(topLevelDomain)
  ) {
    return false;
  }

  return !RESERVED_EXAMPLE_DOMAINS.some(
    (reserved) => domain === reserved || domain.endsWith(`.${reserved}`),
  );
}

function getApprovedDomains(options: SourceUrlOptions): Set<string> {
  return new Set([
    ...DEFAULT_APPROVED_SOURCE_DOMAINS,
    ...parseApprovedDomainList(
      process.env.DAILY_REVIEW_APPROVED_SOURCE_DOMAINS,
    ),
    ...parseApprovedDomainList(options.additionalApprovedDomains),
  ]);
}

function hasExplicitPort(input: string): boolean {
  const authorityStart = input.indexOf("//");
  if (authorityStart < 0) {
    return false;
  }
  const authority = input
    .slice(authorityStart + 2)
    .split(/[/?#]/, 1)[0];
  if (!authority || authority.startsWith("[")) {
    return false;
  }
  const host = authority.includes("@")
    ? authority.slice(authority.lastIndexOf("@") + 1)
    : authority;
  return /:\d*$/.test(host);
}

function isApprovedHostname(
  hostname: string,
  approvedDomains: Set<string>,
): boolean {
  for (const domain of approvedDomains) {
    if (hostname === domain || hostname.endsWith(`.${domain}`)) {
      return true;
    }
  }
  return false;
}

// The default fetch path supplements this URL policy with public-address DNS
// validation and a pinned connector. Network egress controls remain useful
// defense in depth against resolver or runtime failures.
export function validateSourceUrl(
  input: string,
  options: SourceUrlOptions = {},
): SourceUrlValidation {
  if (input.length > MAX_SOURCE_URL_LENGTH) {
    return { ok: false, reason: "invalid_url" };
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  if (url.protocol !== "https:") {
    return { ok: false, reason: "unsupported_scheme" };
  }
  if (
    input !== input.trim() ||
    !/^https:\/\/(?![/\\])/i.test(input) ||
    input.slice(input.indexOf("//") + 2).split(/[/?#]/, 1)[0].includes("\\")
  ) {
    return { ok: false, reason: "invalid_url" };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "credentials_not_allowed" };
  }
  const rawAuthority = input
    .slice(input.indexOf("//") + 2)
    .split(/[/?#]/, 1)[0];
  if (!/^[a-z0-9.-]+(?::\d*)?$/i.test(rawAuthority)) {
    return { ok: false, reason: "invalid_url" };
  }
  if (hasExplicitPort(input) || url.port) {
    return { ok: false, reason: "port_not_allowed" };
  }
  if (url.hash) {
    return { ok: false, reason: "fragment_not_allowed" };
  }

  const hostname = url.hostname.toLowerCase();
  if (!isSafeHostname(hostname)) {
    return { ok: false, reason: "invalid_host" };
  }
  if (!isApprovedHostname(hostname, getApprovedDomains(options))) {
    return { ok: false, reason: "host_not_allowed" };
  }

  if (url.toString().length > MAX_SOURCE_URL_LENGTH) {
    return { ok: false, reason: "invalid_url" };
  }

  return { ok: true, url: url.toString() };
}

function trimUrlToken(token: string): string {
  let result = token;
  while (/[.,;:!?\]}'"’”]$/.test(result)) {
    result = result.slice(0, -1);
  }

  while (result.endsWith(")")) {
    const opens = (result.match(/\(/g) ?? []).length;
    const closes = (result.match(/\)/g) ?? []).length;
    if (closes <= opens) {
      break;
    }
    result = result.slice(0, -1);
  }

  return result;
}

export function extractApprovedSourceUrls(
  sourceNotes: string | null | undefined,
  options: SourceUrlOptions = {},
): string[] {
  if (!sourceNotes) {
    return [];
  }

  const urls: string[] = [];
  const seen = new Set<string>();
  const matches = sourceNotes.match(/https?:\/\/[^\s<>"']+/gi) ?? [];

  for (const match of matches) {
    const validation = validateSourceUrl(trimUrlToken(match), options);
    if (!validation.ok || seen.has(validation.url)) {
      continue;
    }
    seen.add(validation.url);
    urls.push(validation.url);
    if (urls.length === MAX_SAVED_SOURCE_URLS) {
      break;
    }
  }

  return urls;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function truncateUnicode(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  const previousCodeUnit = value.charCodeAt(maxLength - 1);
  const nextCodeUnit = value.charCodeAt(maxLength);
  const splitsSurrogatePair =
    previousCodeUnit >= 0xd800 &&
    previousCodeUnit <= 0xdbff &&
    nextCodeUnit >= 0xdc00 &&
    nextCodeUnit <= 0xdfff;
  const end = splitsSurrogatePair ? maxLength - 1 : maxLength;
  return value.slice(0, end);
}

function truncateUtf8(value: string, maxBytes: number): string {
  let bytes = 0;
  let result = "";
  for (const character of value) {
    const characterBytes = UTF8_ENCODER.encode(character).byteLength;
    if (bytes + characterBytes > maxBytes) {
      break;
    }
    bytes += characterBytes;
    result += character;
  }
  return result;
}

function boundedError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const boundedInput = truncateUnicode(message, MAX_ERROR_LENGTH * 4);
  return truncateUtf8(normalizeWhitespace(boundedInput), MAX_ERROR_LENGTH);
}

function positiveIntegerOrDefault(
  value: number | undefined,
  fallback: number,
): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0
    ? (value as number)
    : fallback;
}

function cancelBody(response: Response): void {
  try {
    void response.body?.cancel().catch(() => undefined);
  } catch {
    // Cancellation is best-effort after a redirect or rejected response.
  }
}

function cancelReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  reason: unknown,
): void {
  try {
    void reader.cancel(reason).catch(() => undefined);
  } catch {
    // Cancellation is best-effort for streams that ignore cancellation.
  }
}

async function readBoundedBody(
  response: Response,
  maxBytes: number,
  timeoutPromise: Promise<typeof SOURCE_TIMEOUT>,
): Promise<
  | { status: "ok"; bytes: number; data: Uint8Array }
  | { status: "timeout" }
  | { status: "too_large" }
> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength)) {
    const bytes = Number(declaredLength);
    if (Number.isSafeInteger(bytes) && bytes > maxBytes) {
      cancelBody(response);
      return { status: "too_large" };
    }
  }

  if (!response.body) {
    return { status: "ok", bytes: 0, data: new Uint8Array() };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;

  try {
    while (true) {
      const read = await Promise.race([reader.read(), timeoutPromise]);
      if (read === SOURCE_TIMEOUT) {
        cancelReader(
          reader,
          new DOMException("Source fetch timed out", "AbortError"),
        );
        return { status: "timeout" };
      }
      if (read.done) {
        break;
      }
      bytes += read.value.byteLength;
      if (bytes > maxBytes) {
        cancelReader(reader, new Error("Source exceeded the byte limit"));
        return { status: "too_large" };
      }
      chunks.push(read.value);
    }
  } catch (error) {
    cancelReader(reader, error);
    throw error;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // A non-cooperative pending read can retain the lock after timeout.
    }
  }

  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    status: "ok",
    bytes,
    data: body,
  };
}

function decodeSourceBody(data: Uint8Array, rawContentType: string): string {
  const charsetMatch = rawContentType.match(
    /(?:^|;)\s*charset\s*=\s*(?:"([^"]+)"|'([^']+)'|([^;\s]+))/i,
  );
  const charset =
    charsetMatch?.[1] ?? charsetMatch?.[2] ?? charsetMatch?.[3] ?? "utf-8";
  try {
    return new TextDecoder(charset, { fatal: false }).decode(data);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(data);
  }
}

function extractEvidenceText(
  body: string,
  contentType: string,
): { title: string; excerpt: string } {
  if (contentType === "text/plain") {
    return {
      title: "",
      excerpt: truncateUnicode(
        normalizeWhitespace(body),
        MAX_EXCERPT_LENGTH,
      ),
    };
  }

  const $ = load(body);
  const title = truncateUnicode(
    normalizeWhitespace($("title").first().text()),
    MAX_TITLE_LENGTH,
  );
  $("script, style, noscript, nav, footer, header, form, svg, title").remove();
  $(
    "article, aside, blockquote, br, dd, div, dl, dt, figcaption, figure, h1, h2, h3, h4, h5, h6, hr, li, main, ol, p, pre, section, table, td, th, tr, ul",
  ).append(" ");
  const bodyText = $("body").length > 0 ? $("body").text() : $.root().text();

  return {
    title,
    excerpt: truncateUnicode(
      normalizeWhitespace(bodyText),
      MAX_EXCERPT_LENGTH,
    ),
  };
}

function resultBase(
  requestedUrl: string,
  finalUrl: string,
  redirects: string[],
): SourceResultBase {
  return { requestedUrl, finalUrl, redirects: [...redirects] };
}

export async function fetchSourceEvidence(
  input: string,
  options: SourceFetchOptions = {},
): Promise<SourceEvidenceResult> {
  const initialValidation = validateSourceUrl(input, options);
  const rejectedInput = truncateUnicode(input, 2_000);
  if (!initialValidation.ok) {
    return {
      ...resultBase(rejectedInput, rejectedInput, []),
      status: "rejected",
      reason: initialValidation.reason,
    };
  }

  const requestedUrl = initialValidation.url;
  const injectedFetch = options.fetchImpl;
  const resolver = options.resolver ?? defaultSourceDnsResolver;
  const pinnedFetch = options.pinnedFetchImpl ?? defaultPinnedSourceFetch;
  const timeoutMs = Math.min(
    positiveIntegerOrDefault(options.timeoutMs, DEFAULT_TIMEOUT_MS),
    DEFAULT_TIMEOUT_MS,
  );
  const maxBytes = Math.min(
    positiveIntegerOrDefault(options.maxBytes, DEFAULT_MAX_BYTES),
    DEFAULT_MAX_BYTES,
  );
  const maxRedirects = Math.min(
    positiveIntegerOrDefault(options.maxRedirects, DEFAULT_MAX_REDIRECTS),
    DEFAULT_MAX_REDIRECTS,
  );
  const controller = new AbortController();
  let resolveTimeout: (value: typeof SOURCE_TIMEOUT) => void = () => undefined;
  const timeoutPromise = new Promise<typeof SOURCE_TIMEOUT>((resolve) => {
    resolveTimeout = resolve;
  });
  const timeout = setTimeout(() => {
    controller.abort();
    resolveTimeout(SOURCE_TIMEOUT);
  }, timeoutMs);
  const redirects: string[] = [];
  const visited = new Set([requestedUrl]);
  let currentUrl = requestedUrl;

  try {
    while (true) {
      let closePinnedResponse: (() => Promise<void>) | null = null;
      try {
        let response: Response;
        const requestInit: RequestInit = {
          redirect: "manual",
          signal: controller.signal,
          headers: {
            accept: "text/html, application/xhtml+xml, text/plain;q=0.9",
          },
        };
        try {
          if (injectedFetch) {
            const fetchResult = await Promise.race([
              injectedFetch(currentUrl, requestInit),
              timeoutPromise,
            ]);
            if (fetchResult === SOURCE_TIMEOUT) {
              return {
                ...resultBase(requestedUrl, currentUrl, redirects),
                status: "timeout",
              };
            }
            response = fetchResult;
          } else {
            const hostname = new URL(currentUrl).hostname.toLowerCase();
            const resolution = await Promise.race([
              resolvePublicSourceAddresses(hostname, resolver),
              timeoutPromise,
            ]);
            if (resolution === SOURCE_TIMEOUT) {
              return {
                ...resultBase(requestedUrl, currentUrl, redirects),
                status: "timeout",
              };
            }
            if (!resolution.ok) {
              if (resolution.reason === "dns_resolution_failed") {
                return {
                  ...resultBase(requestedUrl, currentUrl, redirects),
                  status: "fetch_error",
                  error: boundedError(
                    `DNS resolution failed${resolution.error ? `: ${resolution.error}` : ""}`,
                  ),
                };
              }
              return {
                ...resultBase(requestedUrl, currentUrl, redirects),
                status: "rejected",
                reason: resolution.reason,
              };
            }

            const lookup = createPinnedSourceLookup(
              hostname,
              resolution.addresses,
            );
            const pinnedResult = await Promise.race([
              pinnedFetch(currentUrl, requestInit, {
                hostname,
                addresses: resolution.addresses,
                lookup,
              }),
              timeoutPromise,
            ]);
            if (pinnedResult === SOURCE_TIMEOUT) {
              return {
                ...resultBase(requestedUrl, currentUrl, redirects),
                status: "timeout",
              };
            }
            response = pinnedResult.response;
            closePinnedResponse = pinnedResult.close;
          }
        } catch (error) {
          if (controller.signal.aborted) {
            return {
              ...resultBase(requestedUrl, currentUrl, redirects),
              status: "timeout",
            };
          }
          return {
            ...resultBase(requestedUrl, currentUrl, redirects),
            status: "fetch_error",
            error: boundedError(error),
          };
        }

        if (REDIRECT_STATUSES.has(response.status)) {
          const location = response.headers.get("location");
          cancelBody(response);
          if (!location || hasExplicitPort(location)) {
            return {
              ...resultBase(requestedUrl, currentUrl, redirects),
              status: "rejected",
              reason: location ? "disallowed_redirect" : "invalid_redirect",
            };
          }
          if (redirects.length >= maxRedirects) {
            return {
              ...resultBase(requestedUrl, currentUrl, redirects),
              status: "rejected",
              reason: "too_many_redirects",
            };
          }

          let redirectUrl: string;
          const isAbsolute = /^[a-z][a-z0-9+.-]*:/i.test(location);
          if (isAbsolute) {
            try {
              new URL(location);
            } catch {
              return {
                ...resultBase(requestedUrl, currentUrl, redirects),
                status: "rejected",
                reason: "invalid_redirect",
              };
            }
            const absoluteValidation = validateSourceUrl(location, options);
            if (!absoluteValidation.ok) {
              return {
                ...resultBase(requestedUrl, currentUrl, redirects),
                status: "rejected",
                reason: "disallowed_redirect",
              };
            }
            redirectUrl = absoluteValidation.url;
          } else {
            try {
              redirectUrl = new URL(location, currentUrl).toString();
            } catch {
              return {
                ...resultBase(requestedUrl, currentUrl, redirects),
                status: "rejected",
                reason: "invalid_redirect",
              };
            }
          }

          const redirectValidation = validateSourceUrl(redirectUrl, options);
          if (!redirectValidation.ok) {
            return {
              ...resultBase(requestedUrl, currentUrl, redirects),
              status: "rejected",
              reason: "disallowed_redirect",
            };
          }
          if (visited.has(redirectValidation.url)) {
            return {
              ...resultBase(requestedUrl, currentUrl, redirects),
              status: "rejected",
              reason: "redirect_loop",
            };
          }

          currentUrl = redirectValidation.url;
          redirects.push(currentUrl);
          visited.add(currentUrl);
          continue;
        }

        if (!response.ok) {
          cancelBody(response);
          return {
            ...resultBase(requestedUrl, currentUrl, redirects),
            status: "http_error",
            httpStatus: response.status,
          };
        }

        const rawContentType = response.headers.get("content-type") ?? "";
        const contentType = rawContentType.split(";", 1)[0].trim().toLowerCase();
        if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
          cancelBody(response);
          return {
            ...resultBase(requestedUrl, currentUrl, redirects),
            status: "content_type_error",
            contentType: truncateUnicode(rawContentType, 200),
          };
        }

        let body: Awaited<ReturnType<typeof readBoundedBody>>;
        try {
          body = await readBoundedBody(response, maxBytes, timeoutPromise);
        } catch (error) {
          if (controller.signal.aborted) {
            return {
              ...resultBase(requestedUrl, currentUrl, redirects),
              status: "timeout",
            };
          }
          return {
            ...resultBase(requestedUrl, currentUrl, redirects),
            status: "fetch_error",
            error: boundedError(error),
          };
        }

        if (body.status === "too_large") {
          return {
            ...resultBase(requestedUrl, currentUrl, redirects),
            status: "too_large",
            maxBytes,
          };
        }
        if (body.status === "timeout") {
          return {
            ...resultBase(requestedUrl, currentUrl, redirects),
            status: "timeout",
          };
        }

        const decodedBody = decodeSourceBody(body.data, rawContentType);
        const evidence = extractEvidenceText(decodedBody, contentType);
        return {
          ...resultBase(requestedUrl, currentUrl, redirects),
          status: "fetched",
          ...evidence,
          bytes: body.bytes,
          contentType,
        };
      } finally {
        if (closePinnedResponse) {
          try {
            await closePinnedResponse();
          } catch {
            // The response has already been consumed or cancelled. The default
            // pinned fetch destroys its dispatcher if graceful close fails.
          }
        }
      }
    }
  } catch (error) {
    if (controller.signal.aborted) {
      return {
        ...resultBase(requestedUrl, currentUrl, redirects),
        status: "timeout",
      };
    }
    return {
      ...resultBase(requestedUrl, currentUrl, redirects),
      status: "fetch_error",
      error: boundedError(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function collectSavedSourceEvidence(
  sourceNotes: string | null | undefined,
  options: SourceFetchOptions = {},
): Promise<SourceEvidenceResult[]> {
  const urls = extractApprovedSourceUrls(sourceNotes, options);
  const results = new Array<SourceEvidenceResult>(urls.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < urls.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fetchSourceEvidence(urls[index], options);
    }
  };
  const workerCount = Math.min(MAX_SOURCE_CONCURRENCY, urls.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
