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
  const apiKey = getApiKey();
  if (!apiKey) {
    // Lazy validation (D-11): friendly, no key value, fails on the first tool
    // call rather than at startup.
    throw new ToolError(
      "Missing SEDIS_API_KEY. Set it in your MCP client's env block.",
    );
  }

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) qs.set(k, String(v));
  }

  const query = qs.toString();
  const url = `${getBaseUrl()}/v2${path}${query ? `?${query}` : ""}`;

  // The Phase-69 session token (X-Api-Session) is sent ONLY when present — M2M /
  // no-session calls send no session header (Pitfall 2 / SESSION-05). Never logged.
  const session = getSession();
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
  const apiKey = getApiKey();
  if (!apiKey) {
    // Lazy validation (D-11): friendly, no key value, fails on the first tool call.
    throw new ToolError(
      "Missing SEDIS_API_KEY. Set it in your MCP client's env block.",
    );
  }

  const url = `${getBaseUrl()}/v2${path}`;

  // The Phase-69 session token (X-Api-Session) is sent ONLY when present — M2M /
  // no-session calls send no session header (Pitfall 2 / SESSION-05). Never logged.
  const session = getSession();
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
