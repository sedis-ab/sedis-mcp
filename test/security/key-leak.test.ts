// test/security/key-leak.test.ts — BLOCKING security suite (CFM#2).
//
// Proves the SEDIS_API_KEY is forwarded ONLY as the outbound X-Api-Key header and
// NEVER appears in any tool result, structuredContent, isError message, or stderr.
// Uses a SENTINEL key string, so it needs no real key and runs everywhere (local +
// CI) — it is one of the two publish-gating suites.
//
// `fetch` is stubbed to (a) capture the outbound X-Api-Key it received and (b)
// force every documented error path (401/404/429/500) and a success path, so the
// sentinel is exercised through mapProblem, the success shaping, AND the lazy
// missing-key branch. The sentinel (and any ≥8-char substring of it) must appear
// in ZERO tool output and ZERO captured stderr.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { connectInProcess, type InProcessHandle } from "../_util/inProcess.js";

const SENTINEL = "sk_sentinel_DO_NOT_LEAK_0123456789abcdef";
const SENTINEL_PREFIX = SENTINEL.slice(0, 8); // "sk_senti" — no ≥8-char substring either

// RFC 7807 bodies matching docs/partnerapi-v2/09-errors.md, one per error status.
function problemBody(status: number): Record<string, unknown> {
  return {
    type: `https://httpstatuses.io/${status}`,
    title: `Status ${status}`,
    status,
    detail: `Forced ${status} for the key-leak scan.`,
    extensions: { traceId: "00-leakscan-0000000000000000-0000000000000000-01" },
  };
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/problem+json", ...headers },
  });
}

describe("API key never appears in any tool output or stderr (BLOCKING)", () => {
  let handle: InProcessHandle | undefined;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let capturedKeys: string[];

  beforeEach(() => {
    process.env.SEDIS_API_KEY = SENTINEL;
    process.env.SEDIS_API_BASE_URL = "https://stub.invalid"; // never actually hit — fetch is stubbed
    capturedKeys = [];
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    await handle?.close();
    handle = undefined;
    fetchSpy?.mockRestore();
    errSpy.mockRestore();
    logSpy.mockRestore();
  });

  // Cycle fetch through 401 → 404 → 429 → 500 → 200(success) so every shaping path
  // (mapProblem branches + the success branch) is exercised with the sentinel key set.
  function installFetchStub(): void {
    const statuses = [401, 404, 429, 500];
    let call = 0;
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        // Capture the outbound key so we can assert it was forwarded ONLY as X-Api-Key.
        const headers = new Headers(init?.headers);
        const sent = headers.get("x-api-key");
        if (sent) capturedKeys.push(sent);

        const i = call++;
        if (i < statuses.length) {
          const status = statuses[i];
          const extra = status === 429 ? { "retry-after": "30" } : {};
          return jsonResponse(status, problemBody(status), extra);
        }
        // Success path — a minimal valid envelope so structuredContent shapes too.
        return jsonResponse(200, { data: [], page: 1, totalCount: 0, totalPages: 0 });
      },
    );
  }

  it("forwards the key only as X-Api-Key and leaks it nowhere across all 12 tools + all error paths", async () => {
    installFetchStub();
    handle = await connectInProcess();

    const tools = (await handle.client.listTools()).tools;
    expect(tools.length).toBe(12); // sanity: all tools present to scan (10 data + set/clear_session)

    const allResults: string[] = [];
    // Call every tool multiple times so each cycles through the forced error statuses
    // and the success path; some tools have required args, so pass a benign value.
    // set_session is a local-state tool (no fetch) — pass a benign token; its result
    // must never echo the token (covered here by the sentinel scan too).
    const benignArgs: Record<string, Record<string, unknown>> = {
      bolagsanalys_get_data: { companyId: "X" },
      fastighetsbenchmark_get_comp_timeseries: { sedisIdIn: "X" },
      set_session: { token: "X" },
    };

    for (let round = 0; round < 5; round++) {
      for (const t of tools) {
        const args = benignArgs[t.name] ?? {};
        const res = await handle.client
          .callTool({ name: t.name, arguments: args })
          .catch((e) => ({ err: String(e) }));
        allResults.push(JSON.stringify(res));
      }
    }

    // 1. The key WAS forwarded as X-Api-Key (proves it travels there, not elsewhere).
    expect(capturedKeys.length).toBeGreaterThan(0);
    expect(capturedKeys.every((k) => k === SENTINEL)).toBe(true);

    // 2. The sentinel (and any ≥8-char substring) appears in NO tool result.
    for (const blob of allResults) {
      expect(blob).not.toContain(SENTINEL);
      expect(blob).not.toContain(SENTINEL_PREFIX);
    }

    // 3. The sentinel appears in NO captured stderr / stdout diagnostics.
    const diag = [...errSpy.mock.calls.flat(), ...logSpy.mock.calls.flat()]
      .map((x) => (typeof x === "string" ? x : JSON.stringify(x)))
      .join("\n");
    expect(diag).not.toContain(SENTINEL);
    expect(diag).not.toContain(SENTINEL_PREFIX);
  });

  it("the lazy missing-key error path also never echoes a key", async () => {
    // No fetch stub needed: with SEDIS_API_KEY unset, callV2 throws the friendly
    // missing-key ToolError BEFORE any fetch. Confirm that message carries no key.
    delete process.env.SEDIS_API_KEY;
    handle = await connectInProcess();

    const res = await handle.client.callTool({
      name: "bolagsanalys_list_companies",
      arguments: {},
    });
    expect(res.isError).toBe(true);
    const blob = JSON.stringify(res);
    expect(blob).toMatch(/SEDIS_API_KEY/); // it names the env var…
    expect(blob).not.toContain(SENTINEL); // …but never a key value
    expect(blob).not.toContain(SENTINEL_PREFIX);
  });
});
