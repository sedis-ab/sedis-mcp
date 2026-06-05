// test/_util/inProcess.ts — in-process tool-invocation driver for the test suite.
//
// Drives buildServer() over the SDK's InMemoryTransport.createLinkedPair() instead
// of spawning a child process: faster, deterministic, and the CallToolResult is
// returned directly so a test can inspect `isError` / `structuredContent` without
// parsing stdio JSON-RPC by hand. (Per 63-RESEARCH § "In-process tool invocation
// for tests" + § "Don't Hand-Roll".)
//
// A single stdio child-process smoke test (test/smoke/stdio-spawn.test.ts) covers
// the real `npx` bin path — everything else uses this in-process driver.
//
// Source: MCP TS SDK InMemoryTransport.createLinkedPair() —
// github.com/modelcontextprotocol/typescript-sdk

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../../src/server.js"; // factory that registers all 8 tools

export interface InProcessHandle {
  client: Client;
  server: ReturnType<typeof buildServer>;
  /** Disconnect both ends; call in afterEach/afterAll to avoid leaking transports. */
  close: () => Promise<void>;
}

/**
 * Build a server, link it to a Client over an in-memory transport pair, connect
 * both ends, and return the connected `{ client, server }` plus a `close()`.
 *
 * The caller sets `process.env.SEDIS_API_KEY` (and, for live-v2 suites,
 * `SEDIS_API_BASE_URL`) BEFORE invoking a tool — config.ts reads them lazily on
 * the first callV2, so env set after connect() still takes effect.
 */
export async function connectInProcess(): Promise<InProcessHandle> {
  const server = buildServer(); // McpServer with all tools registered
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  const close = async (): Promise<void> => {
    await Promise.allSettled([client.close(), server.close()]);
  };

  return { client, server, close };
}
