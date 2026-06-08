// resources/gettingStarted.ts — an on-demand onboarding doc exposed as an MCP resource.
//
// Complements the server-level `instructions` (which the client surfaces at initialize):
// this is the *depth* an assistant can fetch when it needs more than the one-paragraph
// orientation — what the products are, how to obtain/configure a key, the tool-chaining
// flows, the locale and error semantics, and what to do on a 2FA-reprove challenge.
//
// It is a static, side-effect-free resource (no v2 call, no key needed) — reading it never
// touches the partner's data, so it is safe to fetch at any time, including before a key is
// configured. Thin-pass-through invariant preserved: this adds onboarding text only.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const GETTING_STARTED_MD = `# Sedis MCP — Getting Started

The Sedis MCP server wraps the **Sedis PartnerAPI v2** as curated, **read-only** tools.
It is a thin pass-through: tenant isolation, authentication, entitlement, and rate limits
all live in PartnerAPI v2, not here. Two products are exposed:

## Bolagsanalys — listed-company financials (shared reference data)
Typical flow:
1. \`bolagsanalys_list_companies\` — find a company → \`companyId\`
2. \`bolagsanalys_find_parameter\` — find a metric → \`parameterCode\`
3. \`bolagsanalys_get_data\` — quarterly figures for that company

Multi-company in one call:
- **All companies:** omit \`companyId\` on \`bolagsanalys_get_data\` (returns every company for
  the parameter/quarter — good for ranking/aggregation).
- **A specific subset:** \`bolagsanalys_search_data\` with \`companyIds[]\` (max 50).

## Fastighetsbenchmark — commercial real-estate comparables (YOUR tenant data)
Typical flow:
1. \`fastighetsbenchmark_list_jamforelseobjekt\` / \`fastighetsbenchmark_search_property_units\`
   / \`fastighetsbenchmark_list_samlingar\` — find the \`sedisId\`s you care about
   (filter property units by name with \`propertyTypeName\`, e.g. "Office"/"Kontor")
2. \`fastighetsbenchmark_find_parameter\` — find a benchmark metric (note its \`dataType\`)
3. \`fastighetsbenchmark_get_comp_timeseries\` — the actual numbers; each row is
   self-describing via \`dataType\` (read \`figure\` / \`boolean\` / \`enum\` / \`date\` accordingly)

\`fastighetsbenchmark_list_reference_zones\` returns shared, Sedis-owned market reference zones.

## Getting a key & configuring it
You need a **PartnerAPI v2 key** (issued per customer by Sedis). Set it in your MCP client's
config \`env\` block as \`SEDIS_API_KEY\` — it is sent only as the \`X-Api-Key\` header and is never
logged. The key is validated lazily (the server starts without it and returns a friendly error
on the first call). Names default to English; pass \`lang:"sv"\` for Swedish.

\`\`\`jsonc
{
  "mcpServers": {
    "sedis": {
      "command": "npx",
      "args": ["-y", "@sedis-ab/mcp"],
      "env": { "SEDIS_API_KEY": "your-partnerapi-v2-key" }
    }
  }
}
\`\`\`

## Session token (\`X-Api-Session\`) — user-owned keys only
A **user-owned** key (one tied to a person, not a system) also needs a short-lived **session
token** alongside its \`X-Api-Key\`. The token is minted on the **reprove page** after you complete
2FA, and the server sends it as the \`X-Api-Session\` header on every call. You do **not** hold it
in plaintext config — you paste it into the running server with a tool:

1. Make a call. If the owner's 2FA proof has lapsed you get a **401** with reason
   \`session_expired\` (or \`session_invalid\` if a stale/wrong token was sent) and a clickable
   \`reproveUrl\` in the error body.
2. Open that \`reproveUrl\` in a browser and complete 2FA — the page shows a freshly-minted
   session token (\`sedis_sess_…\`).
3. Copy the token and paste it via the **\`set_session\`** tool. It is stored in memory and in a
   private \`0600\` on-disk cache, and is carried on the **very next call with NO client restart**.
   Use **\`clear_session\`** to sign the session out.

Optionally seed a token once at startup via the \`SEDIS_API_SESSION\` env var (same \`env\` block as
\`SEDIS_API_KEY\`); the in-memory token set by \`set_session\` takes precedence over the cache, which
takes precedence over this env seed.

**M2M / customer-level (system) keys are headless** — they carry no session token and never need
\`set_session\`; they authenticate with \`X-Api-Key\` alone.

## Error semantics (act on these, don't retry blindly)
- **Session re-verification required** (\`session_expired\` / \`session_invalid\`) — a user-owned
  key whose session token has lapsed (or is stale/wrong). Open the \`reproveUrl\` in the error,
  complete 2FA, copy the freshly-minted token, and paste it via the \`set_session\` tool — then
  retry. No client restart is needed (a \`session_invalid\` reason usually means the pasted token
  was stale or copied incorrectly — re-mint and \`set_session\` again).
- **Two-factor re-verification required** — a user-owned key whose owner's periodic 2FA proof has
  lapsed. Open the \`reproveUrl\` in the error, complete 2FA in a browser, then retry.
- **Not licensed for this product** — the key isn't entitled to that product.
- **Not found, or not in your tenant** — the object isn't in your data (no existence leak).
- **Rate limited** — wait the stated \`Retry-After\`, then retry.
- **Missing SEDIS_API_KEY** — the key isn't configured in the client's env block.

All tools are read-only — this server never creates, updates, or deletes anything.
`;

/** Register the static `sedis://getting-started` onboarding resource. */
export function registerGettingStartedResource(server: McpServer): void {
  server.registerResource(
    "getting-started",
    "sedis://getting-started",
    {
      title: "Sedis MCP — Getting Started",
      description:
        "Onboarding guide: the two products, tool-chaining flows, how to get/configure a key, " +
        "the X-Api-Session / reprove / set_session flow for user-owned keys, locale, and " +
        "error/2FA-reprove semantics. Read this for orientation before using the tools.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: GETTING_STARTED_MD }],
    }),
  );
}
