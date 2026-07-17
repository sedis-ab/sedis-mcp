---
"@sedis/mcp": patch
---

Point the package metadata at sedis.se instead of back at GitHub/npm.

`homepage` (package.json + manifest.json) and the MCP registry's `websiteUrl`
(server.json) now resolve to https://www.sedis.se/fraga-sedis/; `author.url`
skips the apex 301 and goes straight to https://www.sedis.se/. `repository`,
`bugs`, and `documentation` still point at GitHub — that is where the code, the
issue tracker, and the technical docs actually live.

The README gained a short customer-contact callout: the server needs a Sedis
PartnerAPI v2 key, there is no free tier or trial, and the way in is
info@sedis.se.

Metadata and docs only — no change to the server, its tools, or its behaviour.
