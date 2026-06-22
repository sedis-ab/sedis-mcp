// v2Client.ts — the SINGLE outbound integration point for the whole wrapper.
//
// callV2 is the only place a request header is set and the only place the API key
// is read. The key travels ONLY in the outbound X-Api-Key header (never logged,
// never echoed). On a non-2xx response the RFC 7807 body is parsed and turned into
// a friendly ToolError via mapProblem (D-11) — we never throw a raw protocol error
// for an expected HTTP status.
//
// Thin-wrapper inertness invariant (PATTERNS §E): NO cache, NO tenant/auth/billing
// logic, NO translation. One tool call == one v2 round-trip.

import { getApiKey, getBaseUrl, getSession } from "../config.js";
import { mapProblem, ToolError } from "./problemDetails.js";

/**
 * HTTP header values must be a ByteString — Latin-1, code points 0–255. A key or
 * session token copied from a UI that ABBREVIATES it carries a Unicode character —
 * most often a "…" ellipsis (U+2026, code 8230) from a truncated display — and that
 * makes `fetch` throw synchronously while building the request, before any network
 * I/O (observed in the field as an opaque ~30 ms "could not connect"). Return the
 * first offending character so we can fail fast with an actionable message.
 */
function firstNonLatin1(value: string): { index: number; code: number } | null {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code > 0xff) return { index: i, code };
  }
  return null;
}

/**
 * Resolve, trim and validate the API key BEFORE it reaches a header. Lazy (D-11):
 * fails on the first tool call, never at startup. The thrown ToolError never
 * includes the key value.
 */
function resolveApiKey(): string {
  const key = getApiKey()?.trim();
  if (!key) {
    throw new ToolError(
      "Missing SEDIS_API_KEY. Set it in your MCP client's env block.",
    );
  }
  const bad = firstNonLatin1(key);
  if (bad) {
    const hint =
      bad.code === 0x2026 ? " — a '…' ellipsis, the tell-tale of a truncated copy" : "";
    throw new ToolError(
      `Your SEDIS_API_KEY contains an invalid character at position ${bad.index} ` +
        `(Unicode ${bad.code}${hint}). Keys are plain ASCII, so this is almost certainly ` +
        "a partial paste of an abbreviated/displayed key. Re-copy the FULL key — it is " +
        "shown only once at creation, so you may need to generate a new one — and update " +
        "it in your MCP client's config.",
    );
  }
  return key;
}

/**
 * Resolve and validate the optional session token the same way before it reaches a
 * header (X-Api-Session). Returns `undefined` when no session is set (M2M / no-session
 * calls send no session header). Throws a friendly ToolError on a malformed token.
 */
function resolveSession(): string | undefined {
  const session = getSession()?.trim();
  if (!session) return undefined;
  const bad = firstNonLatin1(session);
  if (bad) {
    throw new ToolError(
      `Your session token contains an invalid character at position ${bad.index} ` +
        `(Unicode ${bad.code}) — likely a truncated paste. Re-prove 2FA, copy the ` +
        "freshly-minted token in full, and set it via the `set_session` tool.",
    );
  }
  return session;
}

/**
 * Issue a single GET to PartnerAPI v2 and return the parsed JSON body.
 *
 * @param path   v2 path beginning with "/" (e.g. "/bolagsanalys/companies").
 *               The "/v2" prefix and base URL are added here.
 * @param params Query parameters. `undefined`/`null` values are dropped so we
 *               never send empty filters; everything else is stringified.
 * @throws ToolError on a missing key (lazy validation) or any non-2xx response.
 */
export async function callV2(
  path: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const apiKey = resolveApiKey();

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) qs.set(k, String(v));
  }

  const query = qs.toString();
  const url = `${getBaseUrl()}/v2${path}${query ? `?${query}` : ""}`;

  // The Phase-69 session token (X-Api-Session) is sent ONLY when present — M2M /
  // no-session calls send no session header (Pitfall 2 / SESSION-05). Never logged.
  const session = resolveSession();
  const res = await fetch(url, {
    // The key + session travel ONLY here; no other auth header is set.
    headers: {
      "X-Api-Key": apiKey,
      ...(session ? { "X-Api-Session": session } : {}),
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const problem = (await res.json().catch(() => ({}))) as Parameters<
      typeof mapProblem
    >[1]; // RFC 7807 body (defensive: {} when not JSON)
    throw mapProblem(res.status, problem, res.headers); // -> friendly ToolError
  }

  return res.json();
}

/**
 * Issue a single POST (JSON body) to PartnerAPI v2 and return the parsed JSON body.
 *
 * The POST sibling of {@link callV2} — used by the multi-company batch tools that wrap
 * a v2 `/search` endpoint (e.g. `/bolagsanalys/data/search`, companyIds[] cap 50). It
 * preserves the same single-outbound-point + inertness invariant as callV2: the key is
 * read lazily, travels ONLY in the outbound X-Api-Key header (never logged, never
 * echoed), and any non-2xx RFC 7807 body becomes a friendly ToolError via mapProblem.
 *
 * @param path v2 path beginning with "/" (e.g. "/bolagsanalys/data/search").
 *             The "/v2" prefix and base URL are added here. No query string.
 * @param body JSON request body (the named filters + companyIds[]); stringified as-is.
 * @throws ToolError on a missing key (lazy validation) or any non-2xx response.
 */
export async function callV2Post(
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const apiKey = resolveApiKey();

  const url = `${getBaseUrl()}/v2${path}`;

  // The Phase-69 session token (X-Api-Session) is sent ONLY when present — M2M /
  // no-session calls send no session header (Pitfall 2 / SESSION-05). Never logged.
  const session = resolveSession();
  const res = await fetch(url, {
    method: "POST",
    // The key + session travel ONLY here; no other auth header is set.
    headers: {
      "X-Api-Key": apiKey,
      ...(session ? { "X-Api-Session": session } : {}),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const problem = (await res.json().catch(() => ({}))) as Parameters<
      typeof mapProblem
    >[1]; // RFC 7807 body (defensive: {} when not JSON)
    throw mapProblem(res.status, problem, res.headers); // -> friendly ToolError
  }

  return res.json();
}
