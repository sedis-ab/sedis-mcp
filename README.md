# @sedis/mcp

[![CI](https://github.com/sedis-ab/sedis-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/sedis-ab/sedis-mcp/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@sedis/mcp.svg)](https://www.npmjs.com/package/@sedis/mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node.js >= 20](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that
wraps the **Sedis PartnerAPI v2** as a small set of curated, **read-only** tools,
so AI assistants and agents (Claude Desktop, Cursor, and any MCP-capable client)
can query your Sedis _Bolagsanalys_ (listed-company financials) and
_Fastighetsbenchmark_ (real-estate comparables) data in natural language. The
server is a **thin pass-through**: it adds shape and transport only — every
tenant-isolation, authentication, rate-limit, and billing rule lives in
PartnerAPI v2, not here.

## Install

The server runs over stdio and is launched on demand via `npx` — no global
install needed. The canonical launch command is:

```bash
npx -y @sedis/mcp
```

Add it to your client's MCP config and set your PartnerAPI key:

```jsonc
{
  "mcpServers": {
    "sedis": {
      "command": "npx",
      "args": ["-y", "@sedis/mcp"],
      "env": {
        "SEDIS_API_KEY": "your-partnerapi-v2-key"
      }
    }
  }
}
```

- **Claude Desktop:** add the block above to `claude_desktop_config.json`.
- **Cursor / other clients:** add it to the client's `mcp.json` (same shape).

### Configuration

| Env var              | Required | Default               | Purpose                                                                 |
| -------------------- | -------- | --------------------- | ----------------------------------------------------------------------- |
| `SEDIS_API_KEY`      | yes      | —                     | Your PartnerAPI v2 key. Sent **only** as the `X-Api-Key` header; never logged. |
| `SEDIS_API_BASE_URL` | no       | `https://api.sedis.se`| Override the v2 base URL (e.g. for an alpha/beta environment).          |
| `SEDIS_API_SESSION`  | no       | —                     | Optional startup **seed** for the session token (user-owned keys only). Sent as `X-Api-Session`; never logged. Usually you set this at runtime with the `set_session` tool instead — no restart needed. |

The key is validated **lazily** — the server starts without it and returns a
friendly, actionable error on the first tool call if it is missing or invalid.
There is no startup ping.

> **Tools not showing up?** MCP servers are loaded when your client **starts** —
> after editing the config, fully restart/reload the client (a new chat in the same
> window is not enough). If you registered it via a CLI (`claude mcp add`), make sure
> it landed in the right **scope**: a server added in one directory isn't visible in
> another project unless you use a global/user scope.

### Session tokens (user-owned keys)

If your key is **owned by a specific user** (issued to a named person, not a
machine/M2M integration key), PartnerAPI v2 requires a short-lived **session
token** alongside `X-Api-Key`, refreshed periodically via two-factor auth:

1. On a `401` with reason `session_expired` / `session_invalid`, the tool error
   carries a **`reproveUrl`**. Open it in a browser, complete 2FA, and copy the
   freshly-minted `sedis_sess_…` token.
2. Paste it with the **`set_session`** tool — it is carried as `X-Api-Session`
   on the **very next call, no client restart needed**. Use **`clear_session`**
   to sign out.
3. Optionally seed a token at startup with the `SEDIS_API_SESSION` env var (handy
   for CI / power users); at runtime `set_session` always takes precedence.

**Machine / org-wide keys (no owner) are headless** — `X-Api-Key` only, no
session token, and you never call `set_session`.

### Local development / testing against beta

To run a local build (unpublished) or point at a non-prod environment, swap `npx`
for the built entrypoint and override the base URL:

```jsonc
{
  "mcpServers": {
    "sedis-beta": {
      "command": "node",
      "args": ["/absolute/path/to/sedis-mcp/build/index.js"],
      "env": {
        "SEDIS_API_KEY": "your-beta-key",
        "SEDIS_API_BASE_URL": "https://beta.sedis.se"
      }
    }
  }
}
```

This is a development convenience only — production users just use the `npx -y @sedis/mcp`
block above with a single `SEDIS_API_KEY`.

## Tools

All tools are **read-only**. Tenant scope is enforced by v2: the "YOUR …" tools
only ever return data your key is entitled to, and a request for another
tenant's object comes back as a friendly _not found_ (never a 403 that would
leak existence).

### Bolagsanalys (listed-company financials)

| Tool                          | What it does                                                          |
| ----------------------------- | -------------------------------------------------------------------- |
| `bolagsanalys_list_companies` | Search the catalog of listed companies by name fragment.             |
| `bolagsanalys_find_parameter` | Discover the right financial parameter by name fragment.             |
| `bolagsanalys_get_data`       | Fetch quarterly figures. Pass one `companyId`, or **omit it to get all companies** for a parameter/quarter. |
| `bolagsanalys_search_data`    | Batch-fetch figures for a specific set of companies — `companyIds[]` (max 50). |

### Fastighetsbenchmark (real-estate comparables)

| Tool                                       | What it does                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| `fastighetsbenchmark_find_parameter`       | Discover the right real-estate benchmark parameter by name.              |
| `fastighetsbenchmark_search_property_units`| Find YOUR property units (Fastighet) by name, municipality, zone, or **property-type name** (`propertyTypeName`, e.g. "Office"/"Kontor"). |
| `fastighetsbenchmark_list_samlingar`       | List YOUR collections (Samling) and their members.                       |
| `fastighetsbenchmark_list_jamforelseobjekt`| List YOUR comparison zones (Jämförelseobjekt).                           |
| `fastighetsbenchmark_get_comp_timeseries`  | Pull the actual CompDatum benchmarking time-series (self-describing values). |
| `fastighetsbenchmark_list_reference_zones` | List the shared, Sedis-owned market **reference zones** (same for every key). |

Names and descriptions are **English by default**; pass `lang: "sv"` on the
parameter-discovery and property-unit tools to get Swedish.

### Session (user-owned keys)

| Tool            | What it does                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `set_session`   | Paste a freshly-minted `sedis_sess_…` token (from the reprove page) — carried as `X-Api-Session` on the next call, no restart. |
| `clear_session` | Forget the current session token (sign out).                                                                                  |

These are needed only for **user-owned** keys (see [_Session tokens_](#session-tokens-user-owned-keys) above);
machine / org-wide keys never use them.

Errors are mapped from PartnerAPI v2's RFC 7807 problem responses into short,
friendly tool errors that carry a `traceId` for support — and never the API key
or a stack trace. If a tool reports a **session / two-factor re-verification**
error, open the `reproveUrl` in the message, complete 2FA, copy the new
`sedis_sess_…` token, and paste it via the **`set_session`** tool — then retry
(no client restart). See [_Session tokens (user-owned keys)_](#session-tokens-user-owned-keys) above.

## API reference

This server is a wrapper. The underlying endpoints, query conventions,
multi-tenant isolation model, geometry, error shapes, rate limits, and data
freshness are documented in the **PartnerAPI v2 guide** that Sedis provides with
your API key — contact Sedis if you need access. The live OpenAPI description is
served at `<SEDIS_API_BASE_URL>/openapi/v2.json` (default
[`https://api.sedis.se/openapi/v2.json`](https://api.sedis.se/openapi/v2.json)).
This README does not duplicate that reference.

## Data use

Use of Sedis data in AI/LLM contexts is subject to your Sedis agreement and the
accompanying MCP data-use terms. See [SECURITY.md](SECURITY.md) for the
key-handling and supply-chain posture.

## Licence

[MIT](LICENSE).
