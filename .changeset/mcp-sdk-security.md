---
"@sedis/mcp": patch
---

Requires `@modelcontextprotocol/sdk` 1.32.1 or later, which fixes GHSA-6qxp-vccf-f47h (High: the SDK's
OAuth client could send credentials to an authorization server the MCP server chose). This server speaks
stdio only and never runs that OAuth client, so it was not exposed — but the old `^1.29.0` range let an
install resolve a vulnerable SDK. Transitive fixes from `npm audit fix` ride along (fast-uri via ajv, plus
the HTTP-transport packages this server does not load). `engines.node` is now `>=22`: Node 20 reached end of
life on 2026-04-30, and CI and the release already run on 22.
