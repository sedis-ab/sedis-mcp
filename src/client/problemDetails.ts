// problemDetails.ts — RFC 7807 -> friendly tool-error mapping (D-11).
//
// The PartnerAPI v2 wire shape is a strict RFC 7807 Problem Details document
// (docs/partnerapi-v2/09-errors.md): `application/problem+json` with
// { type, title, status, detail } and Sedis-specific signals under `extensions`
// (notably `extensions.traceId`, plus the `Retry-After` response header on 429).
//
// This maps each expected status to a short, actionable message a partner's LLM
// can reason about. It NEVER includes the API key or a stack trace.
//
// 404 vs 403 (09-errors.md §404 vs 403, plus D-15 / ENTITLE-04):
//   - Cross-tenant access stays 404 ("not found, or not in your tenant") so a
//     resource's existence is never confirmed — no existence leak.
//   - A PRODUCT-ENTITLEMENT 403 (the partner key is authenticated but not licensed
//     for the requested product surface — the gate Sedis Plan 64-03 introduces) is
//     mapped to an explicit, friendly product-licensing error. It names a PRODUCT
//     the partner already knows about (not a tenant/resource), so it leaks no
//     existence. The message is fixed — the upstream `detail` is never passed
//     through — and, like every branch, it never includes the API key.

/**
 * A friendly, key-free, stack-free tool error. Handlers catch this and turn it
 * into a CallToolResult with `isError: true` so the LLM self-corrects instead of
 * seeing an opaque protocol error (AI-SPEC Pitfall #6 / D-11).
 */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

/**
 * Turn ANY caught error into a friendly, key-free message for a CallToolResult.
 *
 * A {@link ToolError} (our own expected/mapped errors — auth, 404, rate-limit, etc.)
 * passes its message through verbatim. Anything else is an UNEXPECTED failure — almost
 * always a transport error from the single `fetch` in v2Client: a per-app/host firewall
 * or VPN blocking the MCP host's node process, no outbound internet, a DNS/TLS failure,
 * or a runtime without a global `fetch`. The old generic "Unexpected error contacting
 * Sedis." swallowed the one fact that makes these diagnosable — the underlying Node
 * error code — so a partner saw only "could not connect" with nothing to act on.
 *
 * We now (a) log the raw error to stderr (lands in the client's MCP server log) and
 * (b) surface the specific code (ECONNREFUSED, ENOTFOUND, a TLS code, or "fetch is not
 * defined") in the returned message — while still never leaking the key or a stack trace.
 */
export function describeToolError(e: unknown): string {
  if (e instanceof ToolError) return e.message;

  // Unexpected: log the full error for the operator (stderr is separate from the
  // stdio JSON-RPC channel, so this can't corrupt the protocol).
  console.error("[sedis] unexpected tool error:", e);

  // Node's fetch rejects with a TypeError whose `.cause` carries the real transport
  // error (code on `.cause.code`); other failures (e.g. a missing global `fetch`) put
  // the signal on the top-level error. Probe both, prefer the most specific.
  const err = e as {
    message?: string;
    code?: string;
    cause?: { code?: string; message?: string };
  };

  // A header-value encoding failure (a non-Latin-1 char in a request header) is a
  // client-side input problem, NOT transport — most often a "…" (U+2026) from a
  // truncated key/token paste, which makes fetch throw while building the request.
  // v2Client validates the key + session up front, but catch any that slips through
  // here so it is never misreported as a network/firewall error.
  if (String(err?.message ?? "").includes("ByteString")) {
    return (
      "A request header contains an invalid (non-Latin-1) character — usually a '…' " +
      "from a truncated API-key or session-token paste. Re-copy the full value into " +
      "your MCP client's config."
    );
  }

  const detail =
    err?.cause?.code ?? err?.code ?? err?.cause?.message ?? err?.message ?? "unknown error";

  return (
    `Could not reach the Sedis API (${detail}). This is a connection error from the ` +
    "MCP host (network / firewall / VPN), not an API rejection — your API key was not " +
    "the problem."
  );
}

/** Minimal shape of the RFC 7807 body we read (everything is optional/defensive). */
interface ProblemBody {
  detail?: string;
  extensions?: {
    traceId?: string;
    /** Machine-readable 401 reproof reason (e.g. "twofactor_proof_expired"); SEC-01 / Phase 66. */
    reason?: string;
    /** Absolute, browser-openable URL the owner visits to re-prove 2FA; SEC-01 / Phase 66. */
    reproveUrl?: string;
  };
}

/**
 * Map an RFC 7807 problem response to a friendly ToolError.
 *
 * @param status  HTTP status code (always equals problem.status at v2).
 * @param p       Parsed problem body (may be `{}` if the body was not JSON).
 * @param headers Response headers — read for `Retry-After` on 429.
 */
export function mapProblem(status: number, p: ProblemBody, headers: Headers): ToolError {
  const traceId = p?.extensions?.traceId; // propagate for support correlation
  const tail = traceId ? ` (traceId: ${traceId})` : "";
  switch (status) {
    case 401: {
      // Phase-66 / SEC-01 owner-2FA reproof gate AND the Phase-69 per-session gate
      // both return 401 with a `reproveUrl` (+ a machine-readable `reason`). Surface
      // the URL so the partner LLM tells the user to re-prove — NOT the generic
      // "check your key" message. The reproveUrl is a public, key-free URL.
      const reproveUrl = p?.extensions?.reproveUrl;
      const reason = p?.extensions?.reason;
      if (reproveUrl) {
        // Phase-69 session-token gate (D-04): an expired/invalid X-Api-Session needs
        // a freshly-minted token pasted via the `set_session` tool — NO client
        // restart. session_invalid additionally hints a wrong/stale pasted token.
        if (reason === "session_expired" || reason === "session_invalid") {
          const hint =
            reason === "session_invalid"
              ? " (the current session token is invalid — likely a wrong or stale paste)"
              : "";
          return new ToolError(
            `Session re-verification required${hint}: open ${reproveUrl} in a ` +
              "browser, complete 2FA, copy the freshly-minted session token, then " +
              "paste it via the `set_session` tool and retry — no client restart " +
              `needed.${tail}`,
          );
        }
        // Phase-66 owner-2FA reproof gate (or any other reproveUrl-bearing 401).
        return new ToolError(
          "Two-factor re-verification required: this key's owner must re-prove 2FA " +
            `before it can be used. Open ${reproveUrl} in a browser, complete the 2FA ` +
            `step, then retry.${tail}`,
        );
      }
      return new ToolError(
        "Authentication failed — your SEDIS_API_KEY is invalid, revoked, or expired. " +
          `Check the key (it is shown only once at creation, so a lost key must be regenerated).${tail}`,
      );
    }
    case 403:
      // Product-entitlement 403 (D-15 / ENTITLE-04): authenticated, but the key is
      // not licensed for the requested product. Fixed friendly message — never echo
      // the upstream `detail`, never the key. Distinct from the 404 tenant branch.
      return new ToolError(`Your API key is not licensed for this product.${tail}`);
    case 404:
      // Cross-tenant access is 404, never 403 — no existence leak.
      return new ToolError(`Not found, or not in your tenant.${tail}`);
    case 429: {
      const retry = headers.get("Retry-After");
      return new ToolError(`Rate limited. Retry after ${retry ?? "a moment"}.${tail}`);
    }
    case 400:
      return new ToolError(`Bad request: ${p?.detail ?? "invalid argument"}.${tail}`);
    default:
      return new ToolError(`Sedis API error ${status}: ${p?.detail ?? "unexpected"}.${tail}`);
  }
}
