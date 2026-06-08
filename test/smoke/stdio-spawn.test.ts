// test/smoke/stdio-spawn.test.ts — real-bin stdio smoke test (MCP-02).
//
// The ONE child-process test (everything else uses the in-process driver). It spawns
// the BUILT `build/index.js` as a real Node child over stdio and connects an SDK
// `Client` via `StdioClientTransport`, then `listTools()` and asserts all 12 tools
// register. This proves the real `npx -y @sedis/mcp` path works end-to-end: the
// shebang + `type:module` + `.js` ESM import specifiers all resolve when Node runs
// the bin (the failure mode an in-process import would mask).
//
// Windows-compatible: runs `process.execPath` (the current Node binary) on the built
// JS rather than relying on the shebang / a shell, so it works identically on win32
// and POSIX. No secrets needed — config is lazy, so the server starts without a key.

import { describe, it, expect, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// test/smoke/ → repo root → build/index.js
const BIN = resolve(__dirname, "..", "..", "build", "index.js");

const EXPECTED_TOOLS = [
  "bolagsanalys_list_companies",
  "bolagsanalys_find_parameter",
  "bolagsanalys_get_data",
  "bolagsanalys_search_data",
  "fastighetsbenchmark_find_parameter",
  "fastighetsbenchmark_search_property_units",
  "fastighetsbenchmark_list_samlingar",
  "fastighetsbenchmark_list_jamforelseobjekt",
  "fastighetsbenchmark_get_comp_timeseries",
  "fastighetsbenchmark_list_reference_zones",
  // Phase 71-03 (MCP-01): runtime session-token refresh tools (mutating).
  "set_session",
  "clear_session",
] as const;

describe("stdio child-process smoke: the real built bin registers all 12 tools (MCP-02)", () => {
  let client: Client | undefined;
  let transport: StdioClientTransport | undefined;

  afterEach(async () => {
    await client?.close().catch(() => {});
    await transport?.close().catch(() => {});
    client = undefined;
    transport = undefined;
  });

  it("`node build/index.js` over stdio lists exactly the 12 curated tools", async () => {
    expect(existsSync(BIN), `built bin missing at ${BIN} — run \`npm run build\` first`).toBe(true);

    transport = new StdioClientTransport({
      command: process.execPath, // current Node — cross-platform, no shell/shebang reliance
      args: [BIN],
      // No SEDIS_API_KEY: startup is lazy, so the server boots and lists tools
      // without one (a tool *call* would then fail with the friendly missing-key error).
      env: { ...process.env, SEDIS_API_KEY: "" },
      stderr: "pipe",
    });

    client = new Client({ name: "smoke", version: "0.0.0" });
    await client.connect(transport);

    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual([...EXPECTED_TOOLS].sort());
  }, 30_000);
});
