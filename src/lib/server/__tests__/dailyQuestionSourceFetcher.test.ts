import { afterEach, describe, expect, it, vi } from "vitest";

import {
  collectSavedSourceEvidence,
  extractApprovedSourceUrls,
  fetchSourceEvidence,
  validateSourceUrl,
  type SourceFetch,
} from "@/lib/server/dailyQuestionSourceFetcher";

function asFetch(implementation: SourceFetch): SourceFetch {
  return vi.fn(implementation);
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
});
