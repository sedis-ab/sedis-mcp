#!/usr/bin/env node
// index.ts — the npx entry point. The shebang above survives tsc into
// build/index.js so `npx -y @sedis/mcp` runs it directly (D-03 / D-14).
//
// CRITICAL: stdout is the JSON-RPC channel for the stdio transport. NEVER write to
// stdout after connect() — any stray output desyncs the client. All diagnostics go
// to stderr via console.error (AI-SPEC Pitfall #1).

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // From here on, stdout belongs to JSON-RPC. Diagnostics → stderr only.
}

main().catch((err) => {
  // stderr only — never stdout.
  console.error("Fatal error starting @sedis/mcp:", err);
  process.exit(1);
});
