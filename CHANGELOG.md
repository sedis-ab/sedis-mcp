# @sedis/mcp

## 1.1.5

### Patch Changes

- f4f0eb0: Point the package metadata at sedis.se instead of back at GitHub/npm.

  `homepage` (package.json + manifest.json) and the MCP registry's `websiteUrl`
  (server.json) now resolve to https://www.sedis.se/fraga-sedis/; `author.url`
  skips the apex 301 and goes straight to https://www.sedis.se/. `repository`,
  `bugs`, and `documentation` still point at GitHub — that is where the code, the
  issue tracker, and the technical docs actually live.

  The README gained a short customer-contact callout: the server needs a Sedis
  PartnerAPI v2 key, there is no free tier or trial, and the way in is
  info@sedis.se.

  Metadata and docs only — no change to the server, its tools, or its behaviour.

## 1.1.4

### Patch Changes

- Fail fast with an actionable message when the API key or session token can't go into an HTTP header. A value copied from an abbreviated/displayed key carries a Unicode character — most often a `…` ellipsis (U+2026) from a truncated copy — and HTTP header values must be Latin-1, so `fetch` used to throw synchronously with an opaque error before any network I/O. The key and session token are now validated up front: a non-Latin-1 character is rejected with the exact position and a "re-copy the FULL key (shown only once — you may need to generate a new one)" / "re-prove 2FA and set_session" hint, without ever echoing the value. As a backstop, a header-encoding error that still reaches the catch-all is reported as a paste problem rather than a misleading "network/firewall" error. The 401 message now also names the invalid/revoked/expired-key case explicitly.

## 1.1.3

### Patch Changes

- Surface the real transport error when a tool call can't reach the Sedis API, instead of the opaque "Unexpected error contacting Sedis." The underlying Node error code (e.g. `ECONNREFUSED`, `ENOTFOUND`, a TLS code, or `fetch is not defined`) is now both logged to stderr — so it lands in the client's MCP server log — and included in the returned message, which also clarifies that a connection failure is a host/network/firewall issue, not an API-key problem. Shared `describeToolError` helper replaces the duplicated catch logic in the Bolagsanalys and Fastighetsbenchmark tools. No API, data, or auth change.

## 1.1.2

### Patch Changes

- Make the MCP registry publish resilient to npm propagation lag (retry with backoff), completing the registry listing. No runtime or API changes.

## 1.1.1

### Patch Changes

- Fix the release pipeline so publishing actually completes end-to-end: upgrade npm to >=11.5.1 on the CI runner (Node 22 ships npm 10.x, which can't do tokenless OIDC trusted publishing and 404'd on the publish PUT), and shorten the `server.json` description to <=100 characters (the MCP registry's hard cap, which was rejecting the registry listing with a 422). No runtime or API changes.

## 1.1.0

### Minor Changes

- 4cfb63a: Add a one-click **Claude Desktop bundle** (`.mcpb` / MCP Bundle, formerly "Desktop Extension"). Non-technical users can now install the server by downloading a single `sedis-mcp.mcpb` from the GitHub Release, double-clicking it, and pasting their API key into a field (stored in the OS keychain) — no Node, no JSON config, no terminal.

  - New build pipeline: `npm run build:mcpb` esbuild-bundles the server into one self-contained ESM file, stages `manifest.json`, validates against the MCPB schema, and packs `dist/sedis-mcp.mcpb`.
  - The release workflow builds the bundle and attaches it to the GitHub Release (and as a workflow artifact).
  - No change to the server code or the `npx -y @sedis/mcp` path — the bundle wraps the same server.

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
