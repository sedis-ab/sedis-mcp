# Contributing

Thanks for your interest in `@sedis/mcp`. This is a deliberately
small, **thin-wrapper** MCP server around the Sedis PartnerAPI v2. Contributions
should keep it that way.

## Ground rules

- **Additive only.** New read-only tools or richer schemas are welcome. The
  wrapper stays inert: **no** tenant-isolation, auth, rate-limiting, billing,
  caching, or translation logic belongs in this repo — all of that is enforced
  by PartnerAPI v2. A change that adds enforcement here will be rejected as a
  confidentiality risk (see [SECURITY.md](SECURITY.md)).
- **The security suites must pass.** The two BLOCKING suites — cross-tenant 404
  (`test/security/cross-tenant.test.ts`) and API-key non-leakage
  (`test/security/key-leak.test.ts`) — are required status checks on every PR
  and gate every release. Do not weaken or skip them.
- **Single outbound point.** All requests to v2 go through `src/client/v2Client.ts`,
  which is the only place the `X-Api-Key` header is set. Keep it that way.

## Development

```bash
npm ci
npm run build      # tsc -> build/
npm test           # full vitest suite
npm run build:mcpb # -> dist/sedis-mcp.mcpb (Claude Desktop one-click bundle)
```

`build:mcpb` esbuild-bundles the same server into one self-contained ESM file,
stages `manifest.json` (+ a minimal `package.json` so the runtime version lookup
in `src/server.ts` resolves), validates against the MCPB schema, and packs the
`.mcpb`. Edit packaging/identity in `manifest.json`; the build logic lives in
`scripts/build-mcpb.mjs`. No native deps, so the single bundle runs anywhere
Claude Desktop's Node does.

The live-v2 test suites (`runIf`-guarded) skip cleanly without secrets; the
sentinel key-leak case and the RFC 7807 error-mapping unit tests run locally with
no secrets. CI supplies the alpha/beta secrets to activate the live suites.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`,
`fix:`, `ci:`, `docs:`, `test:`, `chore:`, `refactor:`. (This repo does **not**
use the Sedis monolith's `+semver:` / `Refs:` footers.)

## Releases (changesets)

Versioning, the changelog, and the GitHub Release are driven by
[changesets](https://github.com/changesets/changesets):

1. For any user-facing change, add a changeset describing the bump:
   ```bash
   npx changeset
   ```
   Commit the generated `.changeset/*.md` file alongside your change.
2. Merging the accumulated changesets bumps the version and updates
   `CHANGELOG.md`.
3. Pushing a `v*` tag triggers `.github/workflows/release.yml`, which runs the
   BLOCKING security + contract + smoke gate, then publishes to npm via **OIDC
   trusted publishing** (auto-provenance, no token), then lists the metadata on
   the MCP registry via `mcp-publisher`, builds the **`.mcpb`** bundle and
   attaches it to the GitHub Release (also kept as a workflow artifact), then
   cuts the GitHub Release.

### First-ever publish (bootstrap, one-time)

The very first publish of the scoped package is a manual bootstrap (the npm
trusted-publisher settings page presupposes the package exists):

1. Reserve the npm scope (`@sedis`) and confirm public access.
2. Publish once with a **granular, short-lived, scoped** automation token:
   `npm publish --access public`.
3. On npmjs.com → the package → **Settings → Trusted Publisher → GitHub Actions**
   → Organization `sedis-ab`, Repository `sedis-mcp`, Workflow
   `release.yml`.
4. **Revoke the bootstrap token.** Every subsequent release uses tokenless OIDC.

The **public** launch (making the package public on npm + listing it on the MCP
registry) is additionally gated on PO + legal AI-data-use-terms sign-off — see
the phase plan. The pipeline can be dry-run against alpha/beta before that gate
clears.
