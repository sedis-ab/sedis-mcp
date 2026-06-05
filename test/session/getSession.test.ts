// test/session/getSession.test.ts — getSession() precedence resolver (MCP-01 / D-03).
//
// getSession() resolves the Phase-69 session token with precedence:
//   in-memory (set via the set_session tool) > on-disk cache (sessionStore) >
//   SEDIS_API_SESSION env seed.
// Returns undefined when nothing is set (so v2Client sends no X-Api-Session header).
//
// The on-disk cache is stubbed by mocking ./session/sessionStore.js so this test
// stays a pure precedence unit (the real 0600 file I/O is covered by
// sessionStore.test.ts). config.ts reads the env lazily on each call, so setting
// process.env between calls takes effect immediately.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Controllable stub for the on-disk cache layer.
let cached: string | undefined;
vi.mock("../../src/session/sessionStore.js", () => ({
  getCachedSession: () => cached,
}));

type Config = typeof import("../../src/config.js");

async function freshConfig(): Promise<Config> {
  vi.resetModules();
  return import("../../src/config.js");
}

describe("getSession() precedence: in-memory > cache > env (D-03)", () => {
  beforeEach(() => {
    cached = undefined;
    delete process.env.SEDIS_API_SESSION;
  });

  afterEach(() => {
    cached = undefined;
    delete process.env.SEDIS_API_SESSION;
    vi.resetModules();
  });

  it("returns undefined when nothing is set (no session header)", async () => {
    const config = await freshConfig();
    expect(config.getSession()).toBeUndefined();
  });

  it("falls back to the SEDIS_API_SESSION env seed when no cache/memory", async () => {
    const config = await freshConfig();
    process.env.SEDIS_API_SESSION = "sedis_sess_from_env";
    expect(config.getSession()).toBe("sedis_sess_from_env");
  });

  it("prefers the on-disk cache over the env seed", async () => {
    const config = await freshConfig();
    process.env.SEDIS_API_SESSION = "sedis_sess_from_env";
    cached = "sedis_sess_from_cache";
    expect(config.getSession()).toBe("sedis_sess_from_cache");
  });

  it("prefers the in-memory token over both cache and env", async () => {
    const config = await freshConfig();
    process.env.SEDIS_API_SESSION = "sedis_sess_from_env";
    cached = "sedis_sess_from_cache";
    config.setInMemorySession("sedis_sess_from_memory");
    expect(config.getSession()).toBe("sedis_sess_from_memory");
  });

  it("setInMemorySession(undefined) clears the in-memory layer (falls back)", async () => {
    const config = await freshConfig();
    cached = "sedis_sess_from_cache";
    config.setInMemorySession("sedis_sess_from_memory");
    expect(config.getSession()).toBe("sedis_sess_from_memory");
    config.setInMemorySession(undefined);
    expect(config.getSession()).toBe("sedis_sess_from_cache");
  });

  it("reads the env lazily (set after import still takes effect)", async () => {
    const config = await freshConfig();
    expect(config.getSession()).toBeUndefined();
    process.env.SEDIS_API_SESSION = "sedis_sess_late";
    expect(config.getSession()).toBe("sedis_sess_late");
  });
});
