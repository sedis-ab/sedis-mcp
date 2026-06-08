# Security

`@sedis/mcp` is a **thin, inert wrapper** around the Sedis PartnerAPI
v2. Understanding what it does — and deliberately does **not** do — is the core
of its security posture.

## API key handling

- Your `SEDIS_API_KEY` is read from the environment and sent **only** as the
  `X-Api-Key` header on outbound requests to PartnerAPI v2. It is the single
  outbound integration point in the codebase.
- **The key is never logged.** It does not appear in tool results, in
  `structuredContent`, in error messages, or on stdout/stderr. A dedicated
  key-non-leakage test suite asserts this across every tool and every error
  path (401/404/429/400/500/non-JSON), and is a **publish-blocking** CI check.
- The key is validated **lazily** — there is no startup ping that could echo it.
  A missing or invalid key yields a friendly error that names the env var but
  never a key value.

## Session token handling (user-owned keys)

- For **user-owned** keys, a short-lived **session token** is sent as the
  `X-Api-Session` header alongside `X-Api-Key`. Like the key, it is **never
  logged** — the same key-non-leakage suite covers it, and `set_session` confirms
  receipt without ever echoing the token back.
- It is sent **only when present**: machine / org-wide keys send no session header.
- **At rest**, a pasted token is cached in `~/.sedis-mcp/session.json`, written
  with `0600` permissions where the OS supports it (best-effort on Windows), so a
  fresh token survives a restart. It is short-lived (server-side TTL) and stored
  **hashed** server-side. Call `clear_session` (or delete that file) to remove it.

## The wrapper enforces nothing

By design, this server contains **no** tenant-isolation, authentication,
authorization, rate-limiting, billing, caching, or translation logic. All of
that is enforced by PartnerAPI v2:

- **Multi-tenant isolation** is v2's responsibility. A request for an object
  outside your tenant returns a v2 _404 not found_ (never a 403), so existence
  is not leaked. A cross-tenant **404** test suite proves the wrapper preserves
  this — it is the second **publish-blocking** CI check.
- Adding any "safety" filter, cache, or tenant check **in the wrapper** would be
  a confidentiality bug, not a feature. The wrapper's only jobs are *shape*
  (tool schemas + lean payloads) and *transport* (forward the key).

## Supply-chain posture

- **Provenance.** Releases are published to npm via **OIDC trusted publishing**
  on GitHub Actions — there is no long-lived npm token to steal in steady state.
  npm auto-generates a Sigstore-backed **provenance attestation** binding each
  published artifact to this public repo and the `release.yml` workflow. Verify
  it with `npm view @sedis/mcp` (look for the provenance attestation).
- **Public source.** The repository is public — a precondition for provenance to
  generate at all.
- **Locked dependencies.** A committed `package-lock.json` pins the full
  dependency tree; the dependency surface is deliberately minimal
  (`@modelcontextprotocol/sdk` + `zod` at runtime).
- **Lean published artifact.** Only the compiled `build/` directory ships
  (`files: ["build"]`); no source, tests, or secrets are included in the tarball.
- **Blocking gates.** No release can publish unless the two security suites
  (cross-tenant 404 + key non-leakage), the contract suites, and the smoke tests
  pass first.

## Reporting a vulnerability

Please report security issues privately rather than via a public issue. Email
**security@sedis.se** (or use GitHub's private "Report a vulnerability"
advisory on this repository). Include reproduction steps and the affected
version. We will acknowledge receipt and keep you updated on remediation.

Do **not** include a real `SEDIS_API_KEY` in any report, issue, or pull request.
