// sessionStore.ts — cross-platform on-disk cache for the Phase-69 session token (MCP-01 / D-02).
//
// The owner pastes a freshly-minted, short-lived `X-Api-Session` token via the
// `set_session` tool (~once per ~2h session). We persist it under the user's home
// directory so it survives across tool calls within the same client run AND across
// a client restart within the TTL — WITHOUT a static restart-to-refresh env var.
//
// D-02: Node built-ins ONLY (os/fs/path) — NO new npm dependency. The cache file is
// written with mode 0o600 where the OS supports it (POSIX); on Windows the mode bits
// are best-effort — we still write and never fail on the chmod attempt. The token is
// short-lived and hashed server-side, so on-disk exposure is bounded; even so the
// token is NEVER logged or echoed (same no-log invariant as X-Api-Key).
//
// All file I/O is best-effort: a missing/corrupt/unreadable cache resolves to
// `undefined` (the caller then falls back to the SEDIS_API_SESSION env seed), and a
// failed write does not throw the tool handler — the in-memory setter still carries
// the token for the current run (see config.ts getSession precedence).

import { homedir } from "node:os";
import { join } from "node:path";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  chmodSync,
} from "node:fs";

/** Directory holding the MCP's local state under the user's home. */
const CACHE_DIR = join(homedir(), ".sedis-mcp");

/** The session-token cache file. JSON: `{ "token": "sedis_sess_…" }`. */
export const SESSION_CACHE_PATH = join(CACHE_DIR, "session.json");

/** Owner-only file permission (POSIX). Best-effort on Windows (D-02). */
const OWNER_ONLY = 0o600;

/**
 * Read the cached session token, or `undefined` when there is no usable cache.
 *
 * Defensive by design: a missing file, a non-JSON body, or any read error all
 * resolve to `undefined` so the resolver cleanly falls through to the env seed.
 * Never logs the token.
 */
export function getCachedSession(): string | undefined {
  try {
    const raw = readFileSync(SESSION_CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw) as { token?: unknown };
    const token = parsed?.token;
    return typeof token === "string" && token.length > 0 ? token : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Persist the pasted session token to the 0600 cache, creating `~/.sedis-mcp` if
 * missing. The directory and file are created with owner-only perms where the OS
 * supports it; on Windows the mode bits are best-effort and a chmod failure is
 * swallowed (D-02) — the write still happens. Never logs the token.
 */
export function setCachedSession(token: string): void {
  mkdirSync(CACHE_DIR, { recursive: true, mode: OWNER_ONLY });
  writeFileSync(SESSION_CACHE_PATH, JSON.stringify({ token }), {
    mode: OWNER_ONLY,
  });
  // writeFile's `mode` only applies when the file is CREATED; an existing file
  // keeps its old perms. chmod explicitly so a re-write also tightens perms.
  // Best-effort: Windows may reject/ignore POSIX bits — do not fail (D-02).
  try {
    chmodSync(SESSION_CACHE_PATH, OWNER_ONLY);
  } catch {
    /* best-effort on platforms without POSIX perms (D-02) */
  }
}

/**
 * Remove the cached session token. Idempotent — a missing file is not an error.
 */
export function clearCachedSession(): void {
  rmSync(SESSION_CACHE_PATH, { force: true });
}
