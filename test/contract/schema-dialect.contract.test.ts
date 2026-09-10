// test/contract/schema-dialect.contract.test.ts — SED-1026 regression gate.
//
// Claude Desktop (and any Ajv2020-based MCP client) REFUSES to register a tool
// whose schema declares an unsupported dialect. The SDK stamps
// "$schema": "http://json-schema.org/draft-07/schema#" onto every schema it
// converts, because McpServer's tools/list handler calls the compat shim without
// a `target` and the shim falls back to draft-7. src/schemaDialect.ts removes the
// marker on the way out.
//
// This suite is the thing that stops it coming back. The failure it guards
// against is invisible in normal use — every tool still WORKS in a lenient
// client, so only a client that validates catches it, i.e. a partner, in
// production. It is offline and needs no secrets, so it runs on every CI job.
//
// It must keep failing loudly if a future SDK bump reintroduces the marker.

import { describe, it, expect, afterEach } from "vitest";
import { stripToolSchemaDialect } from "../../src/schemaDialect.js";
import { connectInProcess, type InProcessHandle } from "../_util/inProcess.js";

describe("SED-1026: emitted tool schemas declare no JSON Schema dialect", () => {
  let handle: InProcessHandle | undefined;

  afterEach(async () => {
    await handle?.close();
    handle = undefined;
  });

  it("no tool carries $schema on inputSchema or outputSchema", async () => {
    handle = await connectInProcess();
    const { tools } = await handle.client.listTools();

    expect(tools.length).toBeGreaterThan(0);

    const offenders = tools.flatMap((tool) => {
      const hits: string[] = [];
      for (const which of ["inputSchema", "outputSchema"] as const) {
        const schema = tool[which] as Record<string, unknown> | undefined;
        if (schema && "$schema" in schema) {
          hits.push(`${tool.name}.${which} = ${String(schema.$schema)}`);
        }
      }
      return hits;
    });

    // Named rather than counted: if this ever fires, the message must say which
    // tools and which dialect, so the fix is obvious without a debugger.
    expect(offenders).toEqual([]);
  });

  it("stripping the dialect leaves the schema body intact", async () => {
    handle = await connectInProcess();
    const { tools } = await handle.client.listTools();

    // The marker is all that may be removed — the tools must still describe
    // themselves, or we would have traded a registration error for silent
    // argument corruption.
    for (const tool of tools) {
      const input = tool.inputSchema as Record<string, unknown>;
      expect(input, `${tool.name} lost its inputSchema`).toBeDefined();
      expect(input.type, `${tool.name} inputSchema.type`).toBe("object");
      expect(input).toHaveProperty("properties");
    }

    // The 10 data tools declare structured output; the two session tools do not.
    const withOutput = tools.filter((t) => t.outputSchema !== undefined);
    expect(withOutput.length).toBeGreaterThanOrEqual(10);
    for (const tool of withOutput) {
      const output = tool.outputSchema as Record<string, unknown>;
      expect(output.type, `${tool.name} outputSchema.type`).toBe("object");
      expect(output).toHaveProperty("properties");
    }
  });
});

describe("stripToolSchemaDialect", () => {
  it("removes $schema from every tool in a tools/list result", () => {
    const message = {
      jsonrpc: "2.0" as const,
      id: 1,
      result: {
        tools: [
          {
            name: "a",
            inputSchema: { $schema: "http://json-schema.org/draft-07/schema#", type: "object" },
            outputSchema: { $schema: "http://json-schema.org/draft-07/schema#", type: "object" },
          },
          { name: "b", inputSchema: { type: "object" } }, // no outputSchema, no marker
        ],
      },
    };

    const out = stripToolSchemaDialect(message) as typeof message;

    expect(out.result.tools[0].inputSchema).toEqual({ type: "object" });
    expect(out.result.tools[0].outputSchema).toEqual({ type: "object" });
    expect(out.result.tools[1].inputSchema).toEqual({ type: "object" });
    expect(out.result.tools[1]).not.toHaveProperty("outputSchema");
    expect(out.result.tools[0].name).toBe("a");
  });

  it("does not mutate the input message", () => {
    const schema = { $schema: "http://json-schema.org/draft-07/schema#", type: "object" };
    const message = { jsonrpc: "2.0" as const, id: 1, result: { tools: [{ name: "a", inputSchema: schema }] } };

    stripToolSchemaDialect(message);

    // The SDK owns the object it handed us; rewriting it in place would be a
    // side effect on a caller that never asked for one.
    expect(schema).toHaveProperty("$schema");
  });

  it("passes every other message through by identity", () => {
    const notification = { jsonrpc: "2.0" as const, method: "notifications/initialized" };
    expect(stripToolSchemaDialect(notification)).toBe(notification);

    const callResult = { jsonrpc: "2.0" as const, id: 2, result: { content: [{ type: "text", text: "hi" }] } };
    expect(stripToolSchemaDialect(callResult)).toBe(callResult);

    const error = { jsonrpc: "2.0" as const, id: 3, error: { code: -32601, message: "nope" } };
    expect(stripToolSchemaDialect(error)).toBe(error);
  });
});
