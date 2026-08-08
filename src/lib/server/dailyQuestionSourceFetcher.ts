import { isIP } from "node:net";

import { load } from "cheerio";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 1_000_000;
const DEFAULT_MAX_REDIRECTS = 3;
const MAX_TITLE_LENGTH = 300;
const MAX_EXCERPT_LENGTH = 4_000;
const MAX_ERROR_LENGTH = 300;
const MAX_SAVED_SOURCE_URLS = 20;
const MAX_SOURCE_URL_LENGTH = 2_048;

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
  ".example",
  ".home.arpa",
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

export interface SourceUrlOptions {
  additionalApprovedDomains?: string;
}

export interface SourceFetchOptions extends SourceUrlOptions {
  fetchImpl?: SourceFetch;
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
        | "invalid_redirect"
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
      !isSafeHostname(domain) ||
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

// Hostname allowlisting is URL-level protection; it does not pin DNS results.
// Production egress controls or a DNS-aware proxy are still needed to fully
// prevent DNS rebinding between validation and connection establishment.
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
  if (url.username || url.password) {
    return { ok: false, reason: "credentials_not_allowed" };
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

function boundedError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return truncateUnicode(normalizeWhitespace(message), MAX_ERROR_LENGTH);
}

function positiveIntegerOrDefault(
  value: number | undefined,
  fallback: number,
): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0
    ? (value as number)
    : fallback;
}

async function cancelBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Cancellation is best-effort after a redirect or rejected response.
  }
}

async function readBoundedBody(
  response: Response,
  maxBytes: number,
): Promise<
  | { status: "ok"; bytes: number; text: string }
  | { status: "too_large" }
> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength)) {
    const bytes = Number(declaredLength);
    if (Number.isSafeInteger(bytes) && bytes > maxBytes) {
      await cancelBody(response);
      return { status: "too_large" };
    }
  }

  if (!response.body) {
    return { status: "ok", bytes: 0, text: "" };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;

  try {
    while (true) {
      const read = await reader.read();
      if (read.done) {
        break;
      }
      bytes += read.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        return { status: "too_large" };
      }
      chunks.push(read.value);
    }
  } catch (error) {
    try {
      await reader.cancel(error);
    } catch {
      // Preserve the original stream error.
    }
    throw error;
  } finally {
    reader.releaseLock();
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
    text: new TextDecoder("utf-8", { fatal: false }).decode(body),
  };
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
  const fetchImpl: SourceFetch =
    options.fetchImpl ?? ((url, init) => fetch(url, init));
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
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const redirects: string[] = [];
  const visited = new Set([requestedUrl]);
  let currentUrl = requestedUrl;

  try {
    while (true) {
      let response: Response;
      try {
        response = await fetchImpl(currentUrl, {
          redirect: "manual",
          signal: controller.signal,
          headers: {
            accept: "text/html, application/xhtml+xml, text/plain;q=0.9",
          },
        });
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
        await cancelBody(response);
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
        try {
          redirectUrl = new URL(location, currentUrl).toString();
        } catch {
          return {
            ...resultBase(requestedUrl, currentUrl, redirects),
            status: "rejected",
            reason: "invalid_redirect",
          };
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
        await cancelBody(response);
        return {
          ...resultBase(requestedUrl, currentUrl, redirects),
          status: "http_error",
          httpStatus: response.status,
        };
      }

      const rawContentType = response.headers.get("content-type") ?? "";
      const contentType = rawContentType.split(";", 1)[0].trim().toLowerCase();
      if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
        await cancelBody(response);
        return {
          ...resultBase(requestedUrl, currentUrl, redirects),
          status: "content_type_error",
          contentType: truncateUnicode(rawContentType, 200),
        };
      }

      let body: Awaited<ReturnType<typeof readBoundedBody>>;
      try {
        body = await readBoundedBody(response, maxBytes);
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

      const evidence = extractEvidenceText(body.text, contentType);
      return {
        ...resultBase(requestedUrl, currentUrl, redirects),
        status: "fetched",
        ...evidence,
        bytes: body.bytes,
        contentType,
      };
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
  return Promise.all(urls.map((url) => fetchSourceEvidence(url, options)));
}
