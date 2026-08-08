import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo, LookupFunction } from "node:net";

import { fetch as undiciFetch } from "undici";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  collectSavedSourceEvidence as collectSavedSourceEvidenceProduction,
  createPinnedSourceLookup,
  createTestOnlyPinnedDispatcher,
  createTestOnlySourceFetcher,
  extractApprovedSourceUrls,
  fetchSourceEvidence as fetchSourceEvidenceProduction,
  isPublicSourceAddress,
  resolvePublicSourceAddresses,
  validateSourceUrl,
  type SourceFetchOptions,
} from "@/lib/server/dailyQuestionSourceFetcher";

type SourceFetch = (input: string, init: RequestInit) => Promise<Response>;
interface SourceDnsAddress {
  address: string;
  family: 4 | 6;
}
type SourceDnsResolver = (
  hostname: string,
) => Promise<readonly SourceDnsAddress[]>;
interface PinnedSourceContext {
  hostname: string;
  addresses: readonly SourceDnsAddress[];
  lookup: LookupFunction;
}
interface PinnedSourceResponse {
  response: Response;
  close: () => Promise<void>;
  destroy?: () => Promise<void> | void;
}
type PinnedSourceFetch = (
  input: string,
  init: RequestInit,
  context: PinnedSourceContext,
) => Promise<PinnedSourceResponse>;

interface TestSourceFetchOptions extends SourceFetchOptions {
  fetchImpl?: SourceFetch;
  resolver?: SourceDnsResolver;
  pinnedFetchImpl?: PinnedSourceFetch;
  cleanupTimeoutMs?: number;
}

function createFetcherForTest(options: TestSourceFetchOptions) {
  const {
    fetchImpl,
    resolver,
    pinnedFetchImpl,
    cleanupTimeoutMs,
    ...safeOptions
  } = options;
  const fetcher = createTestOnlySourceFetcher({
    fetchImpl,
    resolver,
    pinnedFetchImpl,
    cleanupTimeoutMs,
  });
  return { fetcher, safeOptions };
}

async function fetchSourceEvidence(
  input: string,
  options: TestSourceFetchOptions,
) {
  const { fetcher, safeOptions } = createFetcherForTest(options);
  return fetcher.fetchSourceEvidence(input, safeOptions);
}

async function collectSavedSourceEvidence(
  sourceNotes: string,
  options: TestSourceFetchOptions,
) {
  const { fetcher, safeOptions } = createFetcherForTest(options);
  return fetcher.collectSavedSourceEvidence(sourceNotes, safeOptions);
}

function asFetch(implementation: SourceFetch): SourceFetch {
  return vi.fn(implementation);
}

function asPinnedFetch(implementation: PinnedSourceFetch): PinnedSourceFetch {
  return vi.fn(implementation);
}

async function withTestDeadline<T>(
  promise: Promise<T>,
  timeoutMs = 2_000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Test operation exceeded ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function htmlResponse(
  body: string,
  init: ResponseInit = {},
): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    ...init,
  });
}

function singleByteHtmlResponse(
  body: string,
  contentType = "text/html",
): Response {
  return new Response(
    Uint8Array.from(body, (character) => character.charCodeAt(0)),
    {
      status: 200,
      headers: { "content-type": contentType },
    },
  );
}

describe("approved question source URLs", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("extracts, canonicalizes, and deduplicates URLs in first-seen order", () => {
    const notes = [
      "Sources: <https://WWW.NCAA.com/example>.",
      "ESPN: https://www.espn.com/story?q=first%2Csecond,",
      "balanced: https://www.ncaa.com/archive/(champions).",
      "duplicate: https://www.ncaa.com/example",
    ].join(" ");

    expect(extractApprovedSourceUrls(notes)).toEqual([
      "https://www.ncaa.com/example",
      "https://www.espn.com/story?q=first%2Csecond",
      "https://www.ncaa.com/archive/(champions)",
    ]);
  });

  it.each([
    "https://www.nba.com/news/example",
    "https://stats.nfl.com/example",
    "https://www.nhl.com/news/example",
    "https://www.mlb.com/news/example",
    "https://www.ncaa.com/news/example",
    "https://www.espn.com/college-football/story",
    "https://www.sports-reference.com/example",
    "https://www.basketball-reference.com/example",
    "https://www.baseball-reference.com/example",
    "https://www.pro-football-reference.com/example",
    "https://www.hockey-reference.com/example",
    "https://www.heisman.com/example",
    "https://www.hhof.com/example",
    "https://baseballhall.org/example",
    "https://sabr.org/example",
    "https://goduke.com/news/example",
    "https://lsusports.net/news/example",
    "https://osubeavers.com/news/example",
    "https://uconnhuskies.com/news/example",
    "https://uhcougars.com/news/example",
    "https://www.seahawks.com/news/example",
  ])("accepts a represented default source host: %s", (url) => {
    expect(validateSourceUrl(url)).toEqual({ ok: true, url });
  });

  it.each([
    ["HTTP", "http://www.ncaa.com/example"],
    ["credentials", "https://user:secret@www.ncaa.com/example"],
    ["port", "https://www.ncaa.com:8443/example"],
    ["explicit default port", "https://www.ncaa.com:443/example"],
    ["fragment", "https://www.ncaa.com/example#answer"],
    ["suffix attack", "https://espn.com.attacker.test/example"],
    ["prefix attack", "https://notespn.com/example"],
    ["localhost", "https://localhost/example"],
    ["single-label host", "https://intranet/example"],
    ["IPv4", "https://127.0.0.1/example"],
    ["short IPv4", "https://127.1/example"],
    ["integer IPv4", "https://2130706433/example"],
    ["hex IPv4", "https://0x7f000001/example"],
    ["private IPv4", "https://10.0.0.1/example"],
    ["IPv6", "https://[::1]/example"],
    ["trailing-dot host", "https://www.ncaa.com./example"],
    ["obfuscated absolute URL", "https:////www.ncaa.com:443/path"],
    ["percent-obfuscated hostname", "https://%77%77%77.ncaa.com/path"],
    ["overlong URL", `https://www.ncaa.com/${"a".repeat(2_100)}`],
  ])("rejects %s source URLs", (_label, url) => {
    expect(validateSourceUrl(url)).toMatchObject({ ok: false });
  });

  it("evaluates safe environment additions per call", () => {
    expect(validateSourceUrl("https://ohiostatebuckeyes.com/news/example")).toMatchObject({
      ok: false,
    });

    vi.stubEnv(
      "DAILY_REVIEW_APPROVED_SOURCE_DOMAINS",
      "ohiostatebuckeyes.com, fightingillini.com, com, *.attacker.test, 127.0.0.1, localhost",
    );

    expect(validateSourceUrl("https://ohiostatebuckeyes.com/news/example")).toEqual({
      ok: true,
      url: "https://ohiostatebuckeyes.com/news/example",
    });
    expect(
      validateSourceUrl("https://www.fightingillini.com/news/example"),
    ).toMatchObject({ ok: true });
    expect(validateSourceUrl("https://unrelated.com/example")).toMatchObject({
      ok: false,
    });
    expect(validateSourceUrl("https://x.attacker.test/example")).toMatchObject({
      ok: false,
    });

    vi.stubEnv("DAILY_REVIEW_APPROVED_SOURCE_DOMAINS", "");
    expect(validateSourceUrl("https://ohiostatebuckeyes.com/news/example")).toMatchObject({
      ok: false,
    });
  });

  it("supports validated comma-separated additions supplied per call", () => {
    expect(
      validateSourceUrl("https://www.huskers.com/news/example", {
        additionalApprovedDomains:
          "huskers.com, https://attacker.test, local, 192.168.1.2",
      }),
    ).toEqual({
      ok: true,
      url: "https://www.huskers.com/news/example",
    });
    expect(
      validateSourceUrl("https://attacker.test/example", {
        additionalApprovedDomains: "https://attacker.test",
      }),
    ).toMatchObject({ ok: false });
  });

  it.each([
    ["reserved example.com", "example.com", "https://example.com/source"],
    [
      "reserved example.net subdomain",
      "example.net",
      "https://stats.example.net/source",
    ],
    [
      "reserved example.org subdomain",
      "stats.example.org",
      "https://stats.example.org/source",
    ],
    ["ARPA domain", "sports.arpa", "https://sports.arpa/source"],
    ["ARPA subdomain", "stats.sports.arpa", "https://stats.sports.arpa/source"],
    ["public suffix", "co.uk", "https://school.co.uk/source"],
    ["unsupported TLD", "officialsports.io", "https://officialsports.io/source"],
  ])("rejects a %s configurable domain", (_label, domain, url) => {
    expect(
      validateSourceUrl(url, { additionalApprovedDomains: domain }),
    ).toMatchObject({ ok: false });
  });

  it.each([
    ["official .com", "gators.com", "https://www.gators.com/news/source"],
    ["official .edu", "umich.edu", "https://mgoblue.umich.edu/news/source"],
    ["official .org", "naia.org", "https://www.naia.org/news/source"],
  ])("accepts a valid %s configurable domain", (_label, domain, url) => {
    expect(
      validateSourceUrl(url, { additionalApprovedDomains: domain }),
    ).toEqual({ ok: true, url });
  });

  it("ignores malformed and rejected URL tokens while preserving valid URLs", () => {
    expect(
      extractApprovedSourceUrls(
        "http://www.ncaa.com/no https://[::1]/no https://www.ncaa.com/yes#no https://www.nba.com/yes",
      ),
    ).toEqual(["https://www.nba.com/yes"]);
  });

  it("bounds the number of saved sources collected from one note", () => {
    const notes = Array.from(
      { length: 25 },
      (_, index) => `https://www.ncaa.com/source-${index}`,
    ).join(" ");

    expect(extractApprovedSourceUrls(notes)).toHaveLength(20);
  });
});

describe("source fetch runtime requirements", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("declares Undici and a Node runtime compatible with local Node 22", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../../../../package.json", import.meta.url), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      engines?: { node?: string };
    };
    const packageLock = JSON.parse(
      readFileSync(
        new URL("../../../../package-lock.json", import.meta.url),
        "utf8",
      ),
    ) as {
      packages?: Record<
        string,
        {
          dependencies?: Record<string, string>;
          engines?: { node?: string };
        }
      >;
    };

    expect(packageJson.dependencies?.undici).toBe("^7.29.0");
    expect(packageJson.engines?.node).toBe(">=20.18.1");
    expect(packageLock.packages?.[""]?.dependencies?.undici).toBe("^7.29.0");
    expect(packageLock.packages?.[""]?.engines?.node).toBe(">=20.18.1");

    const minimum = [20, 18, 1];
    const localNode22 = [22, 0, 0];
    const isAtLeastMinimum = (version: number[]) => {
      const firstDifference = version.findIndex(
        (part, index) => part !== minimum[index],
      );
      return (
        firstDifference === -1 ||
        version[firstDifference] > minimum[firstDifference]
      );
    };
    expect(isAtLeastMinimum(localNode22)).toBe(true);
    expect(
      isAtLeastMinimum(process.versions.node.split(".").map(Number)),
    ).toBe(true);
  });

  it("keeps unsafe dependency hooks out of normal production options", async () => {
    expectTypeOf<SourceFetchOptions>().not.toHaveProperty("fetchImpl");
    expectTypeOf<SourceFetchOptions>().not.toHaveProperty("resolver");
    expectTypeOf<SourceFetchOptions>().not.toHaveProperty("pinnedFetchImpl");
    expectTypeOf<
      NonNullable<Parameters<typeof fetchSourceEvidenceProduction>[1]>
    >().toEqualTypeOf<SourceFetchOptions>();
    expectTypeOf<
      NonNullable<Parameters<typeof collectSavedSourceEvidenceProduction>[1]>
    >().toEqualTypeOf<SourceFetchOptions>();

    const unsafeFetch = vi.fn(async () => htmlResponse("must not run"));
    await expect(
      fetchSourceEvidenceProduction("http://127.0.0.1/private", {
        fetchImpl: unsafeFetch,
      } as SourceFetchOptions),
    ).resolves.toMatchObject({ status: "rejected" });
    expect(unsafeFetch).not.toHaveBeenCalled();
  });

  it("guards test-only source construction outside the test environment", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(() => createTestOnlySourceFetcher({})).toThrow(/test environment/i);
    expect(() =>
      createTestOnlyPinnedDispatcher((() => undefined) as LookupFunction),
    ).toThrow(/test environment/i);
  });

  it("wires the real Undici Agent to pinned lookup while preserving Host", async () => {
    let receivedHost = "";
    const server = createServer((request, response) => {
      receivedHost = request.headers.host ?? "";
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("pinned connector response");
    });
    const lookup = vi.fn(
      createPinnedSourceLookup("www.ncaa.com", [
        { address: "127.0.0.1", family: 4 },
      ]),
    ) as unknown as LookupFunction;
    const dispatcher = createTestOnlyPinnedDispatcher(lookup);
    let loopbackAvailable = true;
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EPERM") {
        throw error;
      }
      loopbackAvailable = false;
    }

    try {
      if (!loopbackAvailable) {
        const optionsSymbol = Object.getOwnPropertySymbols(dispatcher).find(
          (symbol) => symbol.description === "options",
        );
        expect(optionsSymbol).toBeDefined();
        const agentOptions = (
          dispatcher as unknown as Record<
            symbol,
            { connect?: { lookup?: LookupFunction } }
          >
        )[optionsSymbol as symbol];
        expect(agentOptions.connect?.lookup).toBe(lookup);
        return;
      }

      const port = (server.address() as AddressInfo).port;
      const response = await withTestDeadline(
        undiciFetch(`http://www.ncaa.com:${port}/connector-test`, {
          dispatcher,
        }),
      );
      await expect(response.text()).resolves.toBe("pinned connector response");
      expect(lookup).toHaveBeenCalled();
      expect(receivedHost).toBe(`www.ncaa.com:${port}`);
    } finally {
      await withTestDeadline(dispatcher.close()).catch(async () => {
        await withTestDeadline(dispatcher.destroy()).catch(() => undefined);
      });
      if (server.listening) {
        server.closeAllConnections();
        await withTestDeadline(
          new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          }),
        );
      }
    }
  });
});

describe("public source DNS resolution and pinning", () => {
  it.each([
    "8.8.8.8",
    "93.184.216.34",
    "2001:4860:4860::8888",
    "2606:4700:4700::1111",
    "::ffff:8.8.8.8",
  ])("accepts public address %s", (address) => {
    expect(isPublicSourceAddress(address)).toBe(true);
  });

  it.each([
    "0.0.0.0",
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.1.1",
    "172.16.0.1",
    "192.0.0.1",
    "192.0.2.1",
    "192.88.99.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "240.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::ffff:10.0.0.1",
    "::ffff:192.168.1.1",
    "::ffff:0:8.8.8.8",
    "64:ff9b::192.168.1.1",
    "100::1",
    "2001::1",
    "2001:db8::1",
    "3fff::1",
    "4000::1",
    "8000::1",
    "2620:4f:8000::1",
    "fc00::1",
    "fd00::1",
    "fe80::1",
    "ff02::1",
  ])("rejects non-public address %s", (address) => {
    expect(isPublicSourceAddress(address)).toBe(false);
  });

  it("resolves and deduplicates public A and AAAA records", async () => {
    const resolver: SourceDnsResolver = vi.fn(async () => [
      { address: "93.184.216.34", family: 4 as const },
      { address: "2606:4700:4700::1111", family: 6 as const },
      { address: "93.184.216.34", family: 4 as const },
    ]);

    await expect(
      resolvePublicSourceAddresses("www.ncaa.com", resolver),
    ).resolves.toEqual({
      ok: true,
      addresses: [
        { address: "93.184.216.34", family: 4 },
        { address: "2606:4700:4700::1111", family: 6 },
      ],
    });
    expect(resolver).toHaveBeenCalledWith("www.ncaa.com");
  });

  it("rejects a mixed public and private DNS answer set", async () => {
    const resolver: SourceDnsResolver = async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ];

    await expect(
      resolvePublicSourceAddresses("www.ncaa.com", resolver),
    ).resolves.toMatchObject({ ok: false, reason: "non_public_address" });
  });

  it("returns structured failures for DNS errors and empty answers", async () => {
    const failedResolver: SourceDnsResolver = async () => {
      throw new Error("lookup unavailable");
    };
    const emptyResolver: SourceDnsResolver = async () => [];

    await expect(
      resolvePublicSourceAddresses("www.ncaa.com", failedResolver),
    ).resolves.toMatchObject({ ok: false, reason: "dns_resolution_failed" });
    await expect(
      resolvePublicSourceAddresses("www.ncaa.com", emptyResolver),
    ).resolves.toEqual({ ok: false, reason: "dns_no_addresses" });
  });

  it("pins lookup responses to the validated hostname and address set", async () => {
    const lookup = createPinnedSourceLookup("www.ncaa.com", [
      { address: "93.184.216.34", family: 4 as const },
      { address: "2606:4700:4700::1111", family: 6 as const },
    ]);

    const all = await new Promise<unknown>((resolve, reject) => {
      lookup("www.ncaa.com", { all: true, family: 0 }, (error, addresses) => {
        if (error) reject(error);
        else resolve(addresses);
      });
    });
    expect(all).toEqual([
      { address: "93.184.216.34", family: 4 as const },
      { address: "2606:4700:4700::1111", family: 6 as const },
    ]);

    const ipv6 = await new Promise((resolve, reject) => {
      lookup("www.ncaa.com", { family: 6 }, (error, address, family) => {
        if (error) reject(error);
        else resolve({ address, family });
      });
    });
    expect(ipv6).toEqual({
      address: "2606:4700:4700::1111",
      family: 6,
    });

    await expect(
      new Promise((resolve, reject) => {
        lookup("attacker.test", { family: 4 }, (error, address, family) => {
          if (error) reject(error);
          else resolve({ address, family });
        });
      }),
    ).rejects.toThrow(/hostname/i);
  });
});

describe("saved source evidence fetching", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("fetches manually and returns bounded normalized HTML evidence", async () => {
    const fetchMock = asFetch(async () =>
      htmlResponse(`
        <html><head><title>  Championship   archive </title><style>.x{}</style></head>
        <body>
          <header>Site header</header><nav>Links</nav>
          <main><h1>Title</h1><p>First&nbsp;fact.</p><script>secret()</script>
          <p>Second fact.</p></main><footer>Footer</footer>
        </body></html>
      `),
    );

    const result = await fetchSourceEvidence("https://www.ncaa.com/archive", {
      fetchImpl: fetchMock,
    });

    expect(result).toMatchObject({
      status: "fetched",
      requestedUrl: "https://www.ncaa.com/archive",
      finalUrl: "https://www.ncaa.com/archive",
      title: "Championship archive",
      excerpt: "Title First fact. Second fact.",
      redirects: [],
    });
    if (result.status !== "fetched") {
      throw new Error(`Expected fetched evidence, received ${result.status}`);
    }
    expect(result.bytes).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.ncaa.com/archive",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("uses resolved public addresses and closes the pinned production fetch", async () => {
    const close = vi.fn(async () => undefined);
    const resolver: SourceDnsResolver = vi.fn(async () => [
      { address: "93.184.216.34", family: 4 as const },
      { address: "2606:4700:4700::1111", family: 6 as const },
    ]);
    const pinnedFetch = asPinnedFetch(async (_input, _init, pin) => {
      expect(pin.hostname).toBe("www.ncaa.com");
      expect(pin.addresses).toEqual([
        { address: "93.184.216.34", family: 4 },
        { address: "2606:4700:4700::1111", family: 6 },
      ]);
      return {
        response: htmlResponse("<main>Verified fact</main>"),
        close,
      };
    });

    await expect(
      fetchSourceEvidence("https://www.ncaa.com/archive", {
        resolver,
        pinnedFetchImpl: pinnedFetch,
      }),
    ).resolves.toMatchObject({ status: "fetched", excerpt: "Verified fact" });
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(pinnedFetch).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("rejects non-public DNS answers before the production fetch", async () => {
    const resolver: SourceDnsResolver = async () => [
      { address: "10.0.0.1", family: 4 },
    ];
    const pinnedFetch = asPinnedFetch(async () => {
      throw new Error("must not fetch");
    });

    await expect(
      fetchSourceEvidence("https://www.ncaa.com/archive", {
        resolver,
        pinnedFetchImpl: pinnedFetch,
      }),
    ).resolves.toMatchObject({
      status: "rejected",
      reason: "non_public_address",
    });
    expect(pinnedFetch).not.toHaveBeenCalled();
  });

  it("returns a structured fetch error when production DNS resolution fails", async () => {
    const resolver: SourceDnsResolver = async () => {
      throw new Error("resolver unavailable");
    };

    await expect(
      fetchSourceEvidence("https://www.ncaa.com/archive", {
        resolver,
        pinnedFetchImpl: asPinnedFetch(async () => {
          throw new Error("must not fetch");
        }),
      }),
    ).resolves.toMatchObject({
      status: "fetch_error",
      error: expect.stringMatching(/DNS resolution failed/i),
    });
  });

  it("resolves and validates every relative redirect", async () => {
    const fetchMock = asFetch(async (input) => {
      if (input === "https://www.ncaa.com/start") {
        return new Response(null, {
          status: 302,
          headers: { location: "/archive" },
        });
      }
      return htmlResponse("<main>Verified fact</main>");
    });

    const result = await fetchSourceEvidence("https://www.ncaa.com/start", {
      fetchImpl: fetchMock,
    });

    expect(result).toMatchObject({
      status: "fetched",
      finalUrl: "https://www.ncaa.com/archive",
      redirects: ["https://www.ncaa.com/archive"],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("re-resolves and pins each production redirect hostname independently", async () => {
    const resolver: SourceDnsResolver = vi.fn(async (hostname) =>
      hostname === "www.ncaa.com"
        ? [{ address: "93.184.216.34", family: 4 as const }]
        : [{ address: "8.8.8.8", family: 4 as const }],
    );
    const closeFirst = vi.fn(async () => undefined);
    const closeSecond = vi.fn(async () => undefined);
    const pinnedFetch = asPinnedFetch(async (input, _init, pin) => {
      if (input === "https://www.ncaa.com/start") {
        expect(pin.hostname).toBe("www.ncaa.com");
        return {
          response: new Response(null, {
            status: 302,
            headers: { location: "https://www.espn.com/archive" },
          }),
          close: closeFirst,
        };
      }
      expect(pin.hostname).toBe("www.espn.com");
      expect(pin.addresses).toEqual([{ address: "8.8.8.8", family: 4 }]);
      return {
        response: htmlResponse("<main>Verified redirect fact</main>"),
        close: closeSecond,
      };
    });

    await expect(
      fetchSourceEvidence("https://www.ncaa.com/start", {
        resolver,
        pinnedFetchImpl: pinnedFetch,
      }),
    ).resolves.toMatchObject({
      status: "fetched",
      finalUrl: "https://www.espn.com/archive",
    });
    expect(resolver).toHaveBeenNthCalledWith(1, "www.ncaa.com");
    expect(resolver).toHaveBeenNthCalledWith(2, "www.espn.com");
    expect(closeFirst).toHaveBeenCalledTimes(1);
    expect(closeSecond).toHaveBeenCalledTimes(1);
  });

  it("blocks a redirect hop when its DNS answers include a private address", async () => {
    const resolver: SourceDnsResolver = vi.fn(async (hostname) =>
      hostname === "www.ncaa.com"
        ? [{ address: "93.184.216.34", family: 4 as const }]
        : [
            { address: "8.8.8.8", family: 4 as const },
            { address: "192.168.1.1", family: 4 as const },
          ],
    );
    const close = vi.fn(async () => undefined);
    const pinnedFetch = asPinnedFetch(async () => ({
      response: new Response(null, {
        status: 302,
        headers: { location: "https://www.espn.com/archive" },
      }),
      close,
    }));

    await expect(
      fetchSourceEvidence("https://www.ncaa.com/start", {
        resolver,
        pinnedFetchImpl: pinnedFetch,
      }),
    ).resolves.toMatchObject({
      status: "rejected",
      reason: "non_public_address",
    });
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(pinnedFetch).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("rejects a redirect without a usable Location header", async () => {
    const fetchMock = asFetch(async () =>
      new Response(null, { status: 302 }),
    );

    await expect(
      fetchSourceEvidence("https://www.ncaa.com/start", { fetchImpl: fetchMock }),
    ).resolves.toMatchObject({ status: "rejected", reason: "invalid_redirect" });
  });

  it("rejects a malformed redirect Location", async () => {
    const fetchMock = asFetch(async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://[invalid-host" },
      }),
    );

    await expect(
      fetchSourceEvidence("https://www.ncaa.com/start", { fetchImpl: fetchMock }),
    ).resolves.toMatchObject({ status: "rejected", reason: "invalid_redirect" });
  });

  it("rejects an obfuscated absolute redirect before its port can normalize away", async () => {
    const fetchMock = asFetch(async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https:////www.ncaa.com:443/path" },
      }),
    );

    await expect(
      fetchSourceEvidence("https://www.ncaa.com/start", { fetchImpl: fetchMock }),
    ).resolves.toMatchObject({
      status: "rejected",
      reason: "disallowed_redirect",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects backslashes in a raw relative redirect before URL resolution", async () => {
    const fetchMock = asFetch(async () =>
      new Response(null, {
        status: 302,
        headers: { location: "/\\www.ncaa.com:443/path" },
      }),
    );

    await expect(
      fetchSourceEvidence("https://www.ncaa.com/start", { fetchImpl: fetchMock }),
    ).resolves.toMatchObject({
      status: "rejected",
      reason: "disallowed_redirect",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["disallowed redirect", "https://attacker.test/private", "disallowed_redirect"],
    ["credential redirect", "https://user:pass@www.ncaa.com/private", "disallowed_redirect"],
    ["explicit-port redirect", "https://www.ncaa.com:443/private", "disallowed_redirect"],
    ["fragment redirect", "https://www.ncaa.com/private#answer", "disallowed_redirect"],
    ["IP redirect", "https://127.0.0.1/private", "disallowed_redirect"],
  ])("rejects a %s", async (_label, location, reason) => {
    const fetchMock = asFetch(async () =>
      new Response(null, { status: 302, headers: { location } }),
    );

    await expect(
      fetchSourceEvidence("https://www.ncaa.com/start", { fetchImpl: fetchMock }),
    ).resolves.toMatchObject({ status: "rejected", reason });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects redirect loops", async () => {
    const fetchMock = asFetch(async (input) =>
      new Response(null, {
        status: 302,
        headers: {
          location:
            input === "https://www.ncaa.com/a"
              ? "https://www.ncaa.com/b"
              : "https://www.ncaa.com/a",
        },
      }),
    );

    await expect(
      fetchSourceEvidence("https://www.ncaa.com/a", { fetchImpl: fetchMock }),
    ).resolves.toMatchObject({ status: "rejected", reason: "redirect_loop" });
  });

  it("rejects more than three redirects", async () => {
    const fetchMock = asFetch(async (input) => {
      const step = Number(new URL(input).pathname.slice(1));
      return new Response(null, {
        status: 302,
        headers: { location: `/${step + 1}` },
      });
    });

    await expect(
      fetchSourceEvidence("https://www.ncaa.com/0", { fetchImpl: fetchMock }),
    ).resolves.toMatchObject({
      status: "rejected",
      reason: "too_many_redirects",
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not allow a caller to raise the three-redirect safety cap", async () => {
    const fetchMock = asFetch(async (input) => {
      const step = Number(new URL(input).pathname.slice(1));
      return new Response(null, {
        status: 302,
        headers: { location: `/${step + 1}` },
      });
    });

    await expect(
      fetchSourceEvidence("https://www.ncaa.com/0", {
        fetchImpl: fetchMock,
        maxRedirects: 99,
      }),
    ).resolves.toMatchObject({
      status: "rejected",
      reason: "too_many_redirects",
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("times out and aborts a slow request", async () => {
    vi.useFakeTimers();
    const fetchMock = asFetch(
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    const pending = fetchSourceEvidence("https://www.ncaa.com/slow", {
      fetchImpl: fetchMock,
      timeoutMs: 25,
    });
    await vi.advanceTimersByTimeAsync(25);

    await expect(pending).resolves.toMatchObject({ status: "timeout" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out when fetch ignores AbortSignal", async () => {
    vi.useFakeTimers();
    const fetchMock = asFetch(async () => new Promise<Response>(() => {}));

    const pending = fetchSourceEvidence("https://www.ncaa.com/slow", {
      fetchImpl: fetchMock,
      timeoutMs: 25,
    });
    await vi.advanceTimersByTimeAsync(25);

    await expect(pending).resolves.toMatchObject({ status: "timeout" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out and cancels best-effort when a response stream stalls", async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("partial evidence"));
      },
      cancel() {
        cancelled = true;
        return new Promise<void>(() => {});
      },
    });
    const fetchMock = asFetch(async () =>
      new Response(stream, {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
      }),
    );

    const pending = fetchSourceEvidence("https://www.ncaa.com/stalled", {
      fetchImpl: fetchMock,
      timeoutMs: 25,
    });
    await vi.advanceTimersByTimeAsync(25);

    await expect(pending).resolves.toMatchObject({ status: "timeout" });
    expect(cancelled).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds stalled response cancellation and dispatcher close, then destroys", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const close = vi.fn(() => new Promise<void>(() => {}));
    const destroy = vi.fn(() => new Promise<void>(() => {}));
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("partial evidence"));
      },
      cancel,
    });
    const resolver: SourceDnsResolver = async () => [
      { address: "93.184.216.34", family: 4 },
    ];
    const pinnedFetch = asPinnedFetch(async () => ({
      response: new Response(stream, {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
      }),
      close,
      destroy,
    }));

    const pending = fetchSourceEvidence("https://www.ncaa.com/stalled", {
      resolver,
      pinnedFetchImpl: pinnedFetch,
      timeoutMs: 25,
      cleanupTimeoutMs: 10,
    });
    await vi.advanceTimersByTimeAsync(25);
    await vi.advanceTimersByTimeAsync(10);

    await expect(pending).resolves.toMatchObject({ status: "timeout" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects a declared body larger than the byte limit", async () => {
    const fetchMock = asFetch(async () =>
      htmlResponse("small", {
        headers: {
          "content-type": "text/html",
          "content-length": "101",
        },
      }),
    );

    await expect(
      fetchSourceEvidence("https://www.ncaa.com/large", {
        fetchImpl: fetchMock,
        maxBytes: 100,
      }),
    ).resolves.toMatchObject({ status: "too_large" });
  });

  it("stops streaming when actual UTF-8 bytes exceed the limit", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("🏀🏀🏀"));
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchMock = asFetch(async () =>
      new Response(stream, {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
      }),
    );

    await expect(
      fetchSourceEvidence("https://www.espn.com/story", {
        fetchImpl: fetchMock,
        maxBytes: 8,
      }),
    ).resolves.toMatchObject({ status: "too_large" });
    expect(cancelled).toBe(true);
  });

  it("accepts a body exactly at the UTF-8 byte limit", async () => {
    const fetchMock = asFetch(async () =>
      new Response("🏀🏀", {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
      }),
    );

    await expect(
      fetchSourceEvidence("https://www.espn.com/story", {
        fetchImpl: fetchMock,
        maxBytes: 8,
      }),
    ).resolves.toMatchObject({ status: "fetched", excerpt: "🏀🏀", bytes: 8 });
  });

  it("normalizes useful plain-text evidence", async () => {
    const fetchMock = asFetch(async () =>
      new Response("  First fact.\r\n\tSecond   fact.  ", {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
      }),
    );

    await expect(
      fetchSourceEvidence("https://www.espn.com/story", { fetchImpl: fetchMock }),
    ).resolves.toMatchObject({
      status: "fetched",
      title: "",
      excerpt: "First fact. Second fact.",
    });
  });

  it("decodes authoritative text using its declared non-UTF-8 charset", async () => {
    const fetchMock = asFetch(async () =>
      new Response(Uint8Array.from([0x43, 0x61, 0x66, 0xe9]), {
        status: 200,
        headers: { "content-type": "text/plain; charset=iso-8859-1" },
      }),
    );

    await expect(
      fetchSourceEvidence("https://www.espn.com/story", { fetchImpl: fetchMock }),
    ).resolves.toMatchObject({ status: "fetched", excerpt: "Café" });
  });

  it("sniffs a Unicode BOM when the HTTP content type omits charset", async () => {
    const utf16Le = Uint8Array.from([
      0xff,
      0xfe,
      0x43,
      0x00,
      0x61,
      0x00,
      0x66,
      0x00,
      0xe9,
      0x00,
    ]);
    const fetchMock = asFetch(async () =>
      new Response(utf16Le, {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );

    await expect(
      fetchSourceEvidence("https://www.espn.com/story", { fetchImpl: fetchMock }),
    ).resolves.toMatchObject({ status: "fetched", excerpt: "Café" });
  });

  it.each([
    {
      label: "UTF-8",
      body: Uint8Array.from([
        0xef,
        0xbb,
        0xbf,
        ...new TextEncoder().encode("Café"),
      ]),
      transportCharset: "windows-1252",
    },
    {
      label: "UTF-16LE",
      body: Uint8Array.from([
        0xff,
        0xfe,
        0x43,
        0x00,
        0x61,
        0x00,
        0x66,
        0x00,
        0xe9,
        0x00,
      ]),
      transportCharset: "utf-8",
    },
  ])(
    "uses a $label BOM before a conflicting HTTP charset",
    async ({ body, transportCharset }) => {
      const fetchMock = asFetch(async () =>
        new Response(body, {
          status: 200,
          headers: {
            "content-type": `text/plain; charset=${transportCharset}`,
          },
        }),
      );

      await expect(
        fetchSourceEvidence("https://www.espn.com/story", {
          fetchImpl: fetchMock,
        }),
      ).resolves.toMatchObject({ status: "fetched", excerpt: "Café" });
    },
  );

  it.each([
    '<meta charset="windows-1252">',
    '<meta http-equiv="Content-Type" content="text/html; charset=windows-1252">',
  ])("sniffs legacy HTML encoding from %s", async (meta) => {
    const prefix = new TextEncoder().encode(
      `<html><head>${meta}<title>Caf`,
    );
    const suffix = new TextEncoder().encode("</title></head><body>Caf");
    const ending = new TextEncoder().encode("</body></html>");
    const body = new Uint8Array(
      prefix.byteLength + suffix.byteLength + ending.byteLength + 2,
    );
    let offset = 0;
    body.set(prefix, offset);
    offset += prefix.byteLength;
    body[offset] = 0xe9;
    offset += 1;
    body.set(suffix, offset);
    offset += suffix.byteLength;
    body[offset] = 0xe9;
    offset += 1;
    body.set(ending, offset);
    const fetchMock = asFetch(async () =>
      new Response(body, {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    await expect(
      fetchSourceEvidence("https://www.espn.com/story", { fetchImpl: fetchMock }),
    ).resolves.toMatchObject({
      status: "fetched",
      title: "Café",
      excerpt: "Café",
    });
  });

  it.each([
    [
      "comment",
      '<!-- <meta charset="utf-8"> --><meta charset="windows-1252">',
    ],
    [
      "script",
      '<script>const fake = \'<meta charset="utf-8">\';</script><meta charset="windows-1252">',
    ],
    [
      "style",
      '<style>.fake::after { content: \'<meta charset="utf-8">\'; }</style><meta charset="windows-1252">',
    ],
  ])(
    "ignores a fake meta charset inside a %s before a real declaration",
    async (_label, declarations) => {
      const fetchMock = asFetch(async () =>
        singleByteHtmlResponse(
          `<html><head>${declarations}<title>Café</title></head><body>Café</body></html>`,
        ),
      );

      await expect(
        fetchSourceEvidence("https://www.espn.com/story", {
          fetchImpl: fetchMock,
        }),
      ).resolves.toMatchObject({
        status: "fetched",
        title: "Café",
        excerpt: "Café",
      });
    },
  );

  it.each([
    ["comment", '<!-- <meta charset="windows-1252">'],
    ["script", '<script><meta charset="windows-1252">'],
  ])(
    "does not leak a fake meta charset from an unclosed %s",
    async (_label, unclosedMarkup) => {
      const fetchMock = asFetch(async () =>
        singleByteHtmlResponse(
          `<html><body>Café</body>${unclosedMarkup}`,
        ),
      );

      const result = await fetchSourceEvidence("https://www.espn.com/story", {
        fetchImpl: fetchMock,
      });

      expect(result).toMatchObject({ status: "fetched" });
      if (result.status === "fetched") {
        expect(result.excerpt).not.toContain("Café");
      }
    },
  );

  it("keeps HTTP charset precedence over HTML meta when no BOM exists", async () => {
    const fetchMock = asFetch(async () =>
      singleByteHtmlResponse(
        '<html><head><meta charset="utf-8"></head><body>Café</body></html>',
        "text/html; charset=windows-1252",
      ),
    );

    await expect(
      fetchSourceEvidence("https://www.espn.com/story", {
        fetchImpl: fetchMock,
      }),
    ).resolves.toMatchObject({ status: "fetched", excerpt: "Café" });
  });

  it("falls back to UTF-8 when no BOM, HTTP charset, or meta exists", async () => {
    const fetchMock = asFetch(async () =>
      new Response(new TextEncoder().encode("<html><body>Café</body></html>"), {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    await expect(
      fetchSourceEvidence("https://www.espn.com/story", {
        fetchImpl: fetchMock,
      }),
    ).resolves.toMatchObject({ status: "fetched", excerpt: "Café" });
  });

  it("rejects unsupported content types", async () => {
    const fetchMock = asFetch(async () =>
      new Response('{"answer":true}', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      fetchSourceEvidence("https://www.espn.com/data", { fetchImpl: fetchMock }),
    ).resolves.toMatchObject({ status: "content_type_error" });
  });

  it("rejects a missing content type", async () => {
    const fetchMock = asFetch(
      async () =>
        new Response(new TextEncoder().encode("unknown"), { status: 200 }),
    );

    await expect(
      fetchSourceEvidence("https://www.espn.com/data", { fetchImpl: fetchMock }),
    ).resolves.toMatchObject({ status: "content_type_error" });
  });

  it("returns an HTTP error for a non-success response", async () => {
    const fetchMock = asFetch(async () =>
      new Response("missing", {
        status: 404,
        headers: { "content-type": "text/plain" },
      }),
    );

    await expect(
      fetchSourceEvidence("https://www.ncaa.com/missing", { fetchImpl: fetchMock }),
    ).resolves.toMatchObject({ status: "http_error", httpStatus: 404 });
  });

  it("returns a fetch error instead of throwing for a network failure", async () => {
    const fetchMock = asFetch(async () => {
      throw new TypeError("network down");
    });

    await expect(
      fetchSourceEvidence("https://www.ncaa.com/archive", { fetchImpl: fetchMock }),
    ).resolves.toMatchObject({ status: "fetch_error" });
  });

  it("returns a byte-bounded Unicode fetch error when the stream reader fails", async () => {
    const message = "🏀".repeat(200);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error(message));
      },
    });
    const fetchMock = asFetch(async () =>
      new Response(stream, {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
      }),
    );

    const result = await fetchSourceEvidence("https://www.ncaa.com/broken", {
      fetchImpl: fetchMock,
    });

    expect(result.status).toBe("fetch_error");
    if (result.status === "fetch_error") {
      expect(new TextEncoder().encode(result.error).byteLength).toBeLessThanOrEqual(
        300,
      );
      expect(result.error.length).toBeGreaterThan(0);
      expect(result.error.endsWith("🏀")).toBe(true);
    }
  });

  it("handles malformed and empty HTML safely", async () => {
    const malformedFetch = asFetch(async () =>
      htmlResponse("<main><p>Useful fact<div>More context"),
    );
    const emptyFetch = asFetch(async () =>
      htmlResponse("<html><script>only script</script><nav>only nav</nav></html>"),
    );

    await expect(
      fetchSourceEvidence("https://www.ncaa.com/malformed", {
        fetchImpl: malformedFetch,
      }),
    ).resolves.toMatchObject({
      status: "fetched",
      excerpt: "Useful fact More context",
    });
    await expect(
      fetchSourceEvidence("https://www.ncaa.com/empty", {
        fetchImpl: emptyFetch,
      }),
    ).resolves.toMatchObject({ status: "fetched", excerpt: "" });
  });

  it("caps title and excerpt", async () => {
    const title = "T".repeat(1_000);
    const text = "Evidence ".repeat(2_000);
    const fetchMock = asFetch(async () =>
      htmlResponse(`<title>${title}</title><main>${text}</main>`),
    );

    const result = await fetchSourceEvidence("https://www.ncaa.com/long", {
      fetchImpl: fetchMock,
    });

    expect(result.status).toBe("fetched");
    if (result.status === "fetched") {
      expect(result.title.length).toBeLessThanOrEqual(300);
      expect(result.excerpt.length).toBeLessThanOrEqual(4_000);
      expect(JSON.stringify(result).length).toBeLessThan(6_000);
    }
  });

  it("bounds Unicode output without splitting surrogate pairs", async () => {
    const fetchMock = asFetch(async () =>
      htmlResponse(
        `<title>${"🏀".repeat(200)}</title><main>${"🏀".repeat(3_000)}</main>`,
      ),
    );

    const result = await fetchSourceEvidence("https://www.ncaa.com/unicode", {
      fetchImpl: fetchMock,
    });

    expect(result.status).toBe("fetched");
    if (result.status === "fetched") {
      expect(result.title.length).toBeLessThanOrEqual(300);
      expect(result.excerpt.length).toBeLessThanOrEqual(4_000);
      expect(result.title.endsWith("🏀")).toBe(true);
      expect(result.excerpt.endsWith("🏀")).toBe(true);
    }
  });

  it("rejects the initial URL without calling fetch", async () => {
    const fetchMock = asFetch(async () => htmlResponse("never"));

    await expect(
      fetchSourceEvidence("http://127.0.0.1/private", { fetchImpl: fetchMock }),
    ).resolves.toMatchObject({ status: "rejected" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("collects each approved saved source in order without throwing on failures", async () => {
    const fetchMock = asFetch(async (input) => {
      if (input === "https://www.espn.com/fail") {
        throw new TypeError("offline");
      }
      return htmlResponse("<main>Verified fact</main>");
    });

    await expect(
      collectSavedSourceEvidence(
        "https://www.ncaa.com/good, https://www.espn.com/fail; https://attacker.test/no",
        { fetchImpl: fetchMock },
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        status: "fetched",
        requestedUrl: "https://www.ncaa.com/good",
      }),
      expect.objectContaining({
        status: "fetch_error",
        requestedUrl: "https://www.espn.com/fail",
      }),
    ]);
  });

  it("limits saved-source fetch concurrency while preserving output order", async () => {
    let active = 0;
    let maxActive = 0;
    const fetchMock = asFetch(async (input) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return htmlResponse(`<main>${new URL(input).pathname}</main>`);
    });
    const urls = Array.from(
      { length: 10 },
      (_, index) => `https://www.ncaa.com/source-${index}`,
    );

    const results = await collectSavedSourceEvidence(urls.join(" "), {
      fetchImpl: fetchMock,
    });

    expect(maxActive).toBe(4);
    expect(results.map((result) => result.requestedUrl)).toEqual(urls);
  });
});
