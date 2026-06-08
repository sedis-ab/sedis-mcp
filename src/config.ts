// config.ts — environment contract for @sedis-ab/mcp (D-09 / D-10).
//
// Two env values matter:
//   SEDIS_API_KEY       (required) — the partner's PartnerAPI v2 key. Read lazily
//                       (on the first tool call), NEVER asserted at import time, so a
//                       client spawning the server eagerly does not see it "fail at
//                       startup" (AI-SPEC Pitfall #5). The value is forwarded ONLY as
//                       the outbound X-Api-Key header and is never logged or echoed.
//   SEDIS_API_BASE_URL  (optional) — defaults to https://api.sedis.se. The override
//                       exists solely for Sedis's own alpha/beta testing; partners
//                       never set it (D-10).
//   SEDIS_API_SESSION   (optional) — a STARTUP SEED for the Phase-69 session token
//                       (X-Api-Session). Useful for CI / power users. At runtime the
//                       owner refreshes the token via the `set_session` tool (no
//                       restart, D-01/D-04); getSession() resolves precedence
//                       in-memory (tool) > on-disk cache > this env seed (D-03).

import { getCachedSession } from "./session/sessionStore.js";

/** Default PartnerAPI v2 base URL (D-10). Partners never override this. */
export const DEFAULT_BASE_URL = "https://api.sedis.se";

/**
 * The base URL for PartnerAPI v2. Read from SEDIS_API_BASE_URL when present
 * (Sedis alpha/beta only), otherwise the public default.
 *
 * Read as a function (not a module-level const snapshot) so tests can point the
 * wrapper at a stub by setting process.env before a call.
 */
export function getBaseUrl(): string {
  return process.env.SEDIS_API_BASE_URL ?? DEFAULT_BASE_URL;
}

/**
 * The partner's API key, read lazily from the environment. Returns `undefined`
 * when unset — the caller (v2Client) turns that into a friendly first-call error
 * rather than throwing at startup. The value is never logged.
 */
export function getApiKey(): string | undefined {
  return process.env.SEDIS_API_KEY;
}

/**
 * The in-memory session token set at runtime by the `set_session` tool. It takes
 * precedence over the on-disk cache and the env seed so a freshly-pasted token is
 * carried IMMEDIATELY on the next call — no client restart (D-01/D-04). Held only
 * for the lifetime of the process; the on-disk cache is what survives a restart.
 */
let inMemorySession: string | undefined;

/**
 * Set (or clear, with `undefined`) the in-memory session token. Called by the
 * `set_session` tool alongside the on-disk write. Never logs the token.
 */
export function setInMemorySession(token: string | undefined): void {
  inMemorySession = token;
}

/**
 * The Phase-69 session token (X-Api-Session), read lazily, mirroring getApiKey().
 * Returns `undefined` when no session is configured — the v2 client then sends NO
 * session header (M2M / no-session calls; Pitfall 2 / SESSION-05).
 *
 * Precedence (D-01/D-03): in-memory (set via the `set_session` tool) > on-disk cache
 * (sessionStore) > SEDIS_API_SESSION env seed. Read as a function (not a const
 * snapshot) so tests can set process.env before a call. Never logs the token.
 */
export function getSession(): string | undefined {
  return inMemorySession ?? getCachedSession() ?? process.env.SEDIS_API_SESSION;
}
