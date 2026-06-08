# @sedis-ab/mcp

## 1.0.0

First public release of the Sedis PartnerAPI v2 MCP server — a thin, read-only,
multi-tenant-safe wrapper that lets MCP-capable AI clients query Sedis
_Bolagsanalys_ and _Fastighetsbenchmark_ data in natural language.

### Features

- **Bolagsanalys (listed-company financials)** — `bolagsanalys_list_companies`,
  `bolagsanalys_find_parameter`, `bolagsanalys_get_data` (one company, or omit
  `companyId` for all companies), and `bolagsanalys_search_data` (batched
  `companyIds[]`, max 50).
- **Fastighetsbenchmark (real-estate comparables)** — parameter discovery,
  `search_property_units` (incl. `propertyTypeName`), collections, comparison
  zones, shared reference zones, and the self-describing CompDatum time-series.
- **Session tokens for user-owned keys** — carries/refreshes the `X-Api-Session`
  token alongside `X-Api-Key` via the `set_session` / `clear_session` tools, an
  optional `SEDIS_API_SESSION` startup seed, and a private `0600` on-disk cache
  (Node built-ins only, no extra dependency). On a session `401` the tool error
  surfaces the `reproveUrl` + paste-via-`set_session` flow — **no client
  restart**. Machine / org-wide keys remain headless.
- **English-by-default** tool names/descriptions, with `lang: "sv"` opt-in on the
  discovery tools.
- **Safe error mapping** — RFC 7807 problem responses become short, key-free
  `ToolError`s carrying a `traceId`. A product-entitlement **403** maps to a
  friendly "API key is not licensed for this product" message (distinct from the
  cross-tenant **404**, which returns a friendly not-found so existence is never
  leaked). The key and stack traces never appear in results or errors.
- **Supply-chain hardened** — lean runtime surface (`@modelcontextprotocol/sdk` +
  `zod`), committed lockfile, `build/`-only published tarball, and npm
  **provenance** via OIDC trusted publishing. Publish-blocking CI: key
  non-leakage, cross-tenant-404, contract, and smoke suites.
