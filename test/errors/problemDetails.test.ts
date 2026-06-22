// test/errors/problemDetails.test.ts — RFC 7807 → friendly-error mapping (D-11).
//
// Pure unit test of the error path, NO secrets: a stubbed `fetch` forces each
// documented v2 status (401/404/429/400) with a sample RFC 7807 body + a
// `Retry-After` header, and we assert the wrapper maps it to a friendly
// `isError:true` CallToolResult with the right text — driven THROUGH the real
// callV2 → mapProblem → runTool chain in-process (so the assertion is on what a
// partner LLM actually sees, not on mapProblem in isolation).
//
// Wire shape per docs/partnerapi-v2/09-errors.md: application/problem+json with
// { type, title, status, detail, extensions.traceId }, and the `Retry-After`
// response header on 429. NO 403 branch (cross-tenant is 404). NO stack, NO key.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { connectInProcess, type InProcessHandle } from "../_util/inProcess.js";

const TRACE = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
const SENTINEL = "sk_sentinel_DO_NOT_LEAK_0123456789abcdef";

function problemBody(status: number, detail: string): Record<string, unknown> {
  return {
    type: `https://httpstatuses.io/${status}`,
    title: `Status ${status}`,
    status,
    detail,
    extensions: { traceId: TRACE },
  };
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/problem+json", ...headers },
  });
}

describe("RFC 7807 → friendly ToolError mapping (D-11)", () => {
  let handle: InProcessHandle | undefined;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.SEDIS_API_KEY = SENTINEL; // any key — fetch is stubbed
    process.env.SEDIS_API_BASE_URL = "https://stub.invalid";
  });

  afterEach(async () => {
    await handle?.close();
    handle = undefined;
    fetchSpy?.mockRestore();
    delete process.env.SEDIS_API_SESSION; // a test may seed it; don't leak across tests
  });

  function stubStatus(status: number, detail: string, headers: Record<string, string> = {}): void {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(status, problemBody(status, detail), headers),
    );
  }

  // A representative read-only tool — the error mapping is shared by all 8 tools.
  async function callOnce(): Promise<{ isError: boolean; text: string }> {
    handle = await connectInProcess();
    const res = await handle.client.callTool({
      name: "bolagsanalys_list_companies",
      arguments: { nameContains: "anything" },
    });
    return { isError: res.isError === true, text: JSON.stringify(res) };
  }

  it("401 → friendly invalid/revoked/expired key message, isError, with traceId, no key/stack", async () => {
    stubStatus(401, "Missing or invalid X-Api-Key.");
    const { isError, text } = await callOnce();
    expect(isError).toBe(true);
    expect(text).toMatch(/SEDIS_API_KEY/);
    expect(text).toMatch(/invalid, revoked, or expired/i);
    expect(text).toContain(TRACE);
    expect(text).not.toContain(SENTINEL);
    expect(text).not.toMatch(/at .*\.ts:\d+|node:internal|\bstack\b/i);
  });

  it("401 with reproveUrl → surfaces the 2FA reprove URL (SEC-01), not the generic key message", async () => {
    // Phase-66 owner-2FA reproof gate: a user-owned key whose owner is outside the
    // reproof window returns 401 carrying extensions.reproveUrl. The wrapper must
    // surface that URL so the LLM tells the user to re-prove — not "check your key".
    const reproveUrl = "https://beta.sedis.se/Identity/Account/Manage/ReproveApi";
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(401, {
        type: "https://datatracker.ietf.org/doc/html/rfc7235#section-3.1",
        title: "Unauthorized",
        status: 401,
        detail: "This API key's owner must re-prove two-factor authentication before it can be used.",
        extensions: { reason: "twofactor_proof_expired", reproveUrl, traceId: TRACE },
      }),
    );
    const { isError, text } = await callOnce();
    expect(isError).toBe(true);
    expect(text).toMatch(/two-factor re-verification required/i);
    expect(text).toContain(reproveUrl); // the actionable URL is surfaced
    expect(text).not.toMatch(/invalid, revoked, or expired/i); // NOT the generic 401 message
    expect(text).toContain(TRACE);
    expect(text).not.toContain(SENTINEL); // never leak the key
  });

  it("401 session_expired → reprove + set_session paste flow, no restart (MCP-01/D-04)", async () => {
    // Phase-69 per-session gate: the X-Api-Session token expired. The wrapper must
    // tell the user to open the reproveUrl, complete 2FA, and PASTE the new token via
    // the set_session tool — no client restart, and NOT the generic key message.
    const reproveUrl = "https://beta.sedis.se/Identity/Account/Manage/ReproveApi";
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(401, {
        type: "https://datatracker.ietf.org/doc/html/rfc7235#section-3.1",
        title: "Unauthorized",
        status: 401,
        detail: "The session token has expired.",
        extensions: { reason: "session_expired", reproveUrl, traceId: TRACE },
      }),
    );
    const { isError, text } = await callOnce();
    expect(isError).toBe(true);
    expect(text).toContain(reproveUrl); // actionable URL
    expect(text).toMatch(/set_session/); // the paste flow
    expect(text).toMatch(/no client restart|no restart/i); // D-04
    expect(text).not.toMatch(/invalid, revoked, or expired/i); // NOT the generic 401 message
    expect(text).toContain(TRACE);
    expect(text).not.toContain(SENTINEL); // never leak the key
  });

  it("401 session_invalid → reprove + set_session, hints a stale/wrong paste (MCP-01/D-04)", async () => {
    const reproveUrl = "https://beta.sedis.se/Identity/Account/Manage/ReproveApi";
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(401, {
        type: "https://datatracker.ietf.org/doc/html/rfc7235#section-3.1",
        title: "Unauthorized",
        status: 401,
        detail: "The session token is invalid.",
        extensions: { reason: "session_invalid", reproveUrl, traceId: TRACE },
      }),
    );
    const { isError, text } = await callOnce();
    expect(isError).toBe(true);
    expect(text).toContain(reproveUrl);
    expect(text).toMatch(/set_session/);
    expect(text).toMatch(/invalid|stale|wrong/i); // session_invalid hint
    expect(text).not.toMatch(/check SEDIS_API_KEY/i);
    expect(text).toContain(TRACE);
    expect(text).not.toContain(SENTINEL);
  });

  it("API key with a non-Latin-1 char (truncated '…' paste) fails fast, before any fetch", async () => {
    // The field-reported bug: a key copied from an abbreviated display carries a U+2026
    // ellipsis, which makes fetch throw while building the X-Api-Key header. We validate
    // up front and return an actionable message — never echoing the key — and never hit
    // the network.
    process.env.SEDIS_API_KEY = "sk_LEAKCHECK_" + "a".repeat(160) + "…";
    fetchSpy = vi.spyOn(globalThis, "fetch"); // must NOT be called
    const { isError, text } = await callOnce();
    expect(isError).toBe(true);
    expect(text).toMatch(/invalid character at position/i);
    expect(text).toContain("8230"); // the offending code point (… = U+2026)
    expect(text).not.toContain("LEAKCHECK"); // the key value is never echoed
    expect(fetchSpy).not.toHaveBeenCalled(); // threw while building the request
  });

  it("session token with a non-Latin-1 char fails fast with a set_session hint", async () => {
    process.env.SEDIS_API_KEY = SENTINEL; // valid key
    process.env.SEDIS_API_SESSION = "sess_…truncated";
    fetchSpy = vi.spyOn(globalThis, "fetch"); // must NOT be called
    const { isError, text } = await callOnce();
    expect(isError).toBe(true);
    expect(text).toMatch(/session token contains an invalid character/i);
    expect(text).toMatch(/set_session/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("404 → 'not found, or not in your tenant' (never 403/existence leak), with traceId", async () => {
    stubStatus(404, "No such resource.");
    const { isError, text } = await callOnce();
    expect(isError).toBe(true);
    expect(text).toMatch(/not found|not in your tenant/i);
    expect(text).not.toMatch(/forbidden|403/i);
    expect(text).toContain(TRACE);
  });

  it("403 → friendly 'not licensed for this product', isError, with traceId, no key", async () => {
    // Product-entitlement 403 (Sedis Plan 64-03): the key is authenticated but not
    // licensed for the requested product surface. Distinct from the 404 cross-tenant
    // branch — this is an explicit, partner-facing product-licensing signal (D-15).
    // The stubbed detail is intentionally distinctive so we can prove it is NOT
    // echoed verbatim — the 403 branch uses a FIXED friendly message (no detail
    // pass-through), unlike the 400 branch.
    stubStatus(403, "VERBATIM_DETAIL_MUST_NOT_LEAK product=Bolagsanalys.");
    const { isError, text } = await callOnce();
    expect(isError).toBe(true);
    expect(text).toMatch(/not licensed for this product/i);
    expect(text).toContain(TRACE);
    expect(text).not.toContain(SENTINEL);
    expect(text).not.toMatch(/at .*\.ts:\d+|node:internal|\bstack\b/i);
    // Fixed friendly message — the upstream `detail` is never passed through.
    expect(text).not.toContain("VERBATIM_DETAIL_MUST_NOT_LEAK");
    // Distinct from the 404 branch — must NOT claim "not found".
    expect(text).not.toMatch(/not found/i);
    // Distinct from the generic catch-all — must NOT read "Sedis API error 403".
    expect(text).not.toMatch(/Sedis API error 403/i);
  });

  it("429 → surfaces the Retry-After header value, isError, with traceId", async () => {
    stubStatus(429, "Rate limit exceeded.", { "retry-after": "42" });
    const { isError, text } = await callOnce();
    expect(isError).toBe(true);
    expect(text).toMatch(/rate limited/i);
    expect(text).toMatch(/retry after 42/i); // the exact Retry-After value
    expect(text).toContain(TRACE);
  });

  it("429 without Retry-After degrades gracefully ('a moment')", async () => {
    stubStatus(429, "Rate limit exceeded."); // no header
    const { isError, text } = await callOnce();
    expect(isError).toBe(true);
    expect(text).toMatch(/retry after a moment/i);
  });

  it("400 → surfaces the v2 `detail`, isError, with traceId", async () => {
    stubStatus(400, "Unknown sort field 'foo'.");
    const { isError, text } = await callOnce();
    expect(isError).toBe(true);
    expect(text).toMatch(/bad request/i);
    expect(text).toContain("Unknown sort field 'foo'.");
    expect(text).toContain(TRACE);
  });

  it("an unexpected 500 maps to a friendly catch-all, isError, no key/stack", async () => {
    stubStatus(500, "Unexpected server fault.");
    const { isError, text } = await callOnce();
    expect(isError).toBe(true);
    expect(text).toMatch(/Sedis API error 500/i);
    expect(text).not.toContain(SENTINEL);
    expect(text).not.toMatch(/at .*\.ts:\d+|node:internal/i);
  });

  it("a non-JSON error body still maps cleanly (defensive {} parse)", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html>502 Bad Gateway</html>", {
        status: 502,
        headers: { "content-type": "text/html" },
      }),
    );
    const { isError, text } = await callOnce();
    expect(isError).toBe(true);
    expect(text).toMatch(/Sedis API error 502/i);
    expect(text).not.toContain("<html>"); // raw upstream body never echoed
  });
});
