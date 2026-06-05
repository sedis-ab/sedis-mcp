// test/session/sessionStore.test.ts — the Node-built-ins 0600 session cache (MCP-01 / D-02).
//
// Verifies set→get round-trip, clear() empties, defensive get() on a missing/corrupt
// cache, and the 0600 file mode on POSIX (relaxed on win32, where POSIX perm bits are
// best-effort per D-02). The cache lives under os.homedir(); we redirect homedir to an
// isolated temp dir per test so we never touch a real ~/.sedis-mcp.

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { mkdtempSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// homedir() is read at module-import time inside sessionStore (CACHE_DIR is a
// module-const). We therefore mock node:os.homedir BEFORE importing the SUT and
// re-import it fresh per test via vi.resetModules so each test gets its own temp home.
const homes: string[] = [];
let currentHome = "";

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => currentHome };
});

type Store = typeof import("../../src/session/sessionStore.js");

async function freshStore(): Promise<Store> {
  vi.resetModules();
  return import("../../src/session/sessionStore.js");
}

describe("sessionStore — Node-built-ins 0600 token cache (D-02)", () => {
  beforeEach(() => {
    currentHome = mkdtempSync(join(tmpdir(), "sedis-mcp-test-"));
    homes.push(currentHome);
  });

  afterEach(() => {
    vi.resetModules();
  });

  afterAll(() => {
    for (const h of homes) rmSync(h, { recursive: true, force: true });
  });

  it("set → get round-trips the token", async () => {
    const store = await freshStore();
    expect(store.getCachedSession()).toBeUndefined(); // nothing cached yet
    store.setCachedSession("sedis_sess_roundtrip");
    expect(store.getCachedSession()).toBe("sedis_sess_roundtrip");
  });

  it("set overwrites a previous token", async () => {
    const store = await freshStore();
    store.setCachedSession("sedis_sess_first");
    store.setCachedSession("sedis_sess_second");
    expect(store.getCachedSession()).toBe("sedis_sess_second");
  });

  it("clear empties the cache (and is idempotent on a missing file)", async () => {
    const store = await freshStore();
    store.clearCachedSession(); // no file yet — must not throw
    store.setCachedSession("sedis_sess_to_clear");
    expect(store.getCachedSession()).toBe("sedis_sess_to_clear");
    store.clearCachedSession();
    expect(store.getCachedSession()).toBeUndefined();
  });

  it("get returns undefined for a corrupt (non-JSON) cache file", async () => {
    const store = await freshStore();
    mkdirSync(join(currentHome, ".sedis-mcp"), { recursive: true });
    writeFileSync(store.SESSION_CACHE_PATH, "this is not json{{");
    expect(store.getCachedSession()).toBeUndefined();
  });

  it("get returns undefined when the JSON lacks a string token", async () => {
    const store = await freshStore();
    mkdirSync(join(currentHome, ".sedis-mcp"), { recursive: true });
    writeFileSync(store.SESSION_CACHE_PATH, JSON.stringify({ token: 123 }));
    expect(store.getCachedSession()).toBeUndefined();
  });

  it.runIf(process.platform !== "win32")(
    "writes the cache file with mode 0600 on POSIX",
    async () => {
      const store = await freshStore();
      store.setCachedSession("sedis_sess_perm");
      const mode = statSync(store.SESSION_CACHE_PATH).mode & 0o777;
      expect(mode).toBe(0o600);
    },
  );

  it("setCachedSession does not throw on win32 (best-effort perms, D-02)", async () => {
    const store = await freshStore();
    // On any platform this must complete without throwing; on win32 the chmod is
    // a no-op/swallowed and the write still succeeds.
    expect(() => store.setCachedSession("sedis_sess_win")).not.toThrow();
    expect(store.getCachedSession()).toBe("sedis_sess_win");
  });
});
