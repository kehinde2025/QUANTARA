import { describe, expect, it } from "vitest";
import { requestOtpUrl } from "./otp.js";

const BASE = "https://api.derivws.com";
const TOKEN = "pat_secret_token_value";
const DEMO_URL = "wss://api.derivws.com/trading/v1/options/ws/demo?otp=abc123";
const REAL_URL = "wss://api.derivws.com/trading/v1/options/ws/real?otp=abc123";

function fakeFetch(status: number, body: string) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(body, { status });
  }) as typeof fetch;
  return { impl, calls };
}

const okBody = (url: string) => JSON.stringify({ data: { url } });

const base = (over: Record<string, unknown> = {}) => ({
  token: TOKEN,
  accountId: "DOT0000001",
  accountType: "demo" as const,
  apiBase: BASE,
  appId: "12345",
  ...over,
});

describe("requestOtpUrl", () => {
  it("returns the socket address for a demo account", async () => {
    const f = fakeFetch(200, okBody(DEMO_URL));
    const result = await requestOtpUrl({ ...base(), fetchImpl: f.impl });
    expect(result).toEqual({ ok: true, url: DEMO_URL });
  });

  it("sends the token and the app id to the right address", async () => {
    const f = fakeFetch(200, okBody(DEMO_URL));
    await requestOtpUrl({ ...base(), fetchImpl: f.impl });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.url).toBe(`${BASE}/trading/v1/options/accounts/DOT0000001/otp`);
    expect(f.calls[0]!.init.method).toBe("POST");
    const headers = f.calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers["Deriv-App-ID"]).toBe("12345");
  });

  it("reports a refused token as auth_failed", async () => {
    const f = fakeFetch(401, "Invalid or expired token");
    expect(await requestOtpUrl({ ...base(), fetchImpl: f.impl })).toEqual({ ok: false, reason: "auth_failed" });
  });

  it("reports a missing app id as not_configured", async () => {
    const f = fakeFetch(401, "Deriv-App-ID header is required for PAT tokens");
    expect(await requestOtpUrl({ ...base(), fetchImpl: f.impl })).toEqual({ ok: false, reason: "not_configured" });
    const none = fakeFetch(200, okBody(DEMO_URL));
    expect(await requestOtpUrl({ ...base({ appId: "" }), fetchImpl: none.impl })).toEqual({
      ok: false,
      reason: "not_configured",
    });
    expect(none.calls).toHaveLength(0);
  });

  it("reports network problems and server errors as unreachable", async () => {
    const down = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    expect(await requestOtpUrl({ ...base(), fetchImpl: down })).toEqual({ ok: false, reason: "unreachable" });
    const f = fakeFetch(503, "busy");
    expect(await requestOtpUrl({ ...base(), fetchImpl: f.impl })).toEqual({ ok: false, reason: "unreachable" });
  });

  it("refuses replies it does not understand", async () => {
    for (const [status, body] of [
      [200, "not json"],
      [200, JSON.stringify({ data: {} })],
      [200, JSON.stringify({})],
      [404, "missing"],
    ] as Array<[number, string]>) {
      const f = fakeFetch(status, body);
      expect(await requestOtpUrl({ ...base(), fetchImpl: f.impl })).toEqual({ ok: false, reason: "unexpected" });
    }
  });

  it("refuses a socket address on another host or without TLS", async () => {
    for (const url of [
      "wss://evil.example/trading/v1/options/ws/demo?otp=abc",
      "ws://api.derivws.com/trading/v1/options/ws/demo?otp=abc",
      "not a url",
    ]) {
      const f = fakeFetch(200, okBody(url));
      expect(await requestOtpUrl({ ...base(), fetchImpl: f.impl })).toEqual({ ok: false, reason: "unexpected" });
    }
  });

  it("never lets a demo request end up on a real socket", async () => {
    const f = fakeFetch(200, okBody(REAL_URL));
    expect(await requestOtpUrl({ ...base(), fetchImpl: f.impl })).toEqual({ ok: false, reason: "unexpected" });
    const demoWhenRealWanted = fakeFetch(200, okBody(DEMO_URL));
    expect(await requestOtpUrl({ ...base({ accountType: "real" }), fetchImpl: demoWhenRealWanted.impl })).toEqual({
      ok: false,
      reason: "unexpected",
    });
  });

  it("never puts the token in a result", async () => {
    const failures = [
      fakeFetch(401, `Invalid token ${TOKEN}`),
      fakeFetch(500, TOKEN),
      fakeFetch(200, JSON.stringify({ data: { url: `wss://evil.example/ws/demo?t=${TOKEN}` } })),
    ];
    for (const f of failures) {
      const result = await requestOtpUrl({ ...base(), fetchImpl: f.impl });
      expect(JSON.stringify(result)).not.toContain(TOKEN);
    }
    const good = await requestOtpUrl({ ...base(), fetchImpl: fakeFetch(200, okBody(DEMO_URL)).impl });
    expect(JSON.stringify(good)).not.toContain(TOKEN);
  });
});