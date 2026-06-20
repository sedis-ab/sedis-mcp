---
"@sedis/mcp": minor
---

Add a one-click **Claude Desktop bundle** (`.mcpb` / MCP Bundle, formerly "Desktop Extension"). Non-technical users can now install the server by downloading a single `sedis-mcp.mcpb` from the GitHub Release, double-clicking it, and pasting their API key into a field (stored in the OS keychain) — no Node, no JSON config, no terminal.

- New build pipeline: `npm run build:mcpb` esbuild-bundles the server into one self-contained ESM file, stages `manifest.json`, validates against the MCPB schema, and packs `dist/sedis-mcp.mcpb`.
- The release workflow builds the bundle and attaches it to the GitHub Release (and as a workflow artifact).
- No change to the server code or the `npx -y @sedis/mcp` path — the bundle wraps the same server.
