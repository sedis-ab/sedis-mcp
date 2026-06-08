# Named Parameters — governance values (RESOLVED)

This repo originally shipped with **placeholder tokens** for three governance
values whose final spelling was not yet confirmed. They were recorded as
**named parameters** rather than hard-coded guesses (Pitfall 5: do not bake the
org slug / npm scope into irreversible steps before they exist).

**The values were confirmed and substituted at the Plan 05 org/scope
`checkpoint:human-verify` (2026-06-01).** All `PLACEHOLDER_*` tokens have been
replaced with the confirmed strings below. The remaining gate before any
irreversible public step (`npm publish` + `mcp-publisher publish`) is the Task 4
PO + legal AI-data-use-terms sign-off — a rollout gate, not a naming gate.

The one-org strategy is locked (D-12): a single GitHub org owns `sedis-mcp` as
its first public repo, with the `@sedis` npm scope.

---

## ORG_SLUG

- **Placeholder token:** `PLACEHOLDER_ORG` (substituted)
- **Confirmed value:** `sedis-ab`
- **Appears in:**
  - `package.json` → `mcpName` (`io.github.sedis-ab/mcp`)
  - `server.json` → `name` (MCP registry manifest; matches `package.json` `mcpName`)
  - `server.json` → `repository.url` (`https://github.com/sedis-ab/sedis-mcp`)
  - `.github/workflows/release.yml` → npm trusted-publisher config + `mcp-publisher login github-oidc` namespace
- **Resolved by:** Plan 05 org/scope `checkpoint:human-verify` (GitHub org created, slug confirmed).

## NPM_SCOPE

- **Placeholder token:** `PLACEHOLDER_SCOPE` (substituted)
- **Confirmed value:** `sedis` (the `@sedis` npm scope → package `@sedis-ab/mcp`)
- **Appears in:**
  - `package.json` → `name` (`@sedis-ab/mcp`)
  - All install snippets / docs (`npx -y @sedis-ab/mcp`)
- **Resolved by:** Plan 05, `@sedis` scope reserved on npmjs.com.

## REGISTRY_NAMESPACE

- **Confirmed value (v1):** `io.github.sedis-ab/mcp` — GitHub-OIDC auth, **no
  secret** required in CI (`mcp-publisher login github-oidc`).
  - NOTE: the final segment is **`/mcp`** (the confirmed correction over the
    Plan-01 template's `/sedis`). The full registry name is `io.github.sedis-ab/mcp`.
- **Alternative (later):** a reverse-DNS namespace such as `se.sedis/mcp` (Sedis
  owns `sedis.se`). Cleaner brand and decoupled from the GitHub org slug, but
  needs an Ed25519 key + a DNS TXT record + a `MCP_PRIVATE_KEY` secret and
  `mcp-publisher login dns`. Deferred — ship v1 with the `io.github.*` form and
  revisit DNS naming if brand matters.
- **Constraint:** `server.json` `name` and `package.json` `mcpName` must be
  identical (both now `io.github.sedis-ab/mcp`), and the namespace must match the
  chosen auth method.
- **Resolved by:** Plan 05, in lockstep with `ORG_SLUG`.

---

## Substitution checklist (Plan 05) — COMPLETE

The real values were confirmed and the tokens replaced everywhere:

- [x] `package.json` `name`: `@PLACEHOLDER_SCOPE/mcp` → `@sedis-ab/mcp`
- [x] `package.json` `mcpName`: `io.github.PLACEHOLDER_ORG/sedis` → `io.github.sedis-ab/mcp`
- [x] `server.json` `name`: matches the substituted `mcpName` (`io.github.sedis-ab/mcp`)
- [x] `server.json` `repository.url` + package `identifier` substituted
- [x] `.github/workflows/release.yml`: trusted-publisher org/repo + registry namespace
- [x] `README.md` / `SECURITY.md` / `CONTRIBUTING.md` install + provenance references
- [x] `package-lock.json` `name` refreshed via `npm install`
- [ ] `npm publish` + `mcp-publisher publish` remain blocked on the Task 4 PO + legal sign-off.
