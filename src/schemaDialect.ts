// schemaDialect.ts — strip the JSON Schema dialect marker from emitted tool schemas.
//
// WHY THIS EXISTS (SED-1026)
// --------------------------
// Claude Desktop refuses to register our tools with:
//
//   Tool 'bolagsanalys_find_parameter' has an invalid outputSchema: JSON Schema
//   declares an unsupported dialect ("$schema": "http://json-schema.org/draft-07/schema#").
//   The default validator supports JSON Schema 2020-12 only.
//
// The dialect is NOT something we declare. It comes from the SDK: McpServer's
// tools/list handler calls toJsonSchemaCompat(obj, { strictUnions, pipeStrategy })
// WITHOUT a `target` (server/mcp.js), and the compat shim's mapMiniTarget() falls
// back to 'draft-7' when target is undefined — on the Zod v4 branch too, even
// though we are on zod 4.x. Verified identical in SDK 1.29.0 and 1.30.0, so
// bumping the SDK does not fix it, and registerTool exposes no option that
// reaches the conversion (normalizeObjectSchema accepts only Zod, never a
// pre-built JSON Schema).
//
// WHY STRIPPING, NOT REWRITING TO 2020-12
// ---------------------------------------
// Measured before choosing: for our schemas the draft-7 and draft-2020-12 bodies
// produced by z4mini.toJSONSchema are byte-identical once `$schema` is removed —
// we only use constructs that mean the same thing in both dialects. So removing
// the marker is honest rather than a relabelling that hides a real difference.
//
// Omitting is also strictly more compatible than asserting 2020-12: a validator
// defaulting to 2020-12 (Ajv2020, what Claude Desktop uses) accepts it, and so
// does one still defaulting to draft-07. Asserting 2020-12 would break the latter.
//
// WHERE IT IS APPLIED
// -------------------
// On the transport's outgoing message, wired in buildServer() by wrapping
// McpServer.connect. Both entry points — the npx bin (index.ts) and the
// in-process test driver (test/_util/inProcess.ts) — call server.connect(), so
// the shipped path and the tested path are the same one. Doing it here rather
// than by replacing the tools/list request handler keeps us on public API only:
// re-registering the handler would mean reimplementing the SDK's tool listing.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

/** A tool entry as it appears on the wire in a tools/list result. */
interface WireTool {
  inputSchema?: unknown;
  outputSchema?: unknown;
  [key: string]: unknown;
}

/**
 * Return `schema` without a top-level `$schema` key.
 *
 * Only the top level is touched: that is where the converter puts the dialect
 * marker. Nested subschemas never carry one, and a blanket recursive strip could
 * damage a legitimately-embedded schema-valued property in future tool output.
 */
function withoutDialect(schema: unknown): unknown {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    return schema;
  }
  if (!("$schema" in schema)) return schema;

  const { $schema: _dialect, ...rest } = schema as Record<string, unknown>;
  return rest;
}

/**
 * If `message` is a tools/list result, return a copy whose tool schemas carry no
 * dialect marker. Every other message is returned untouched, by identity.
 *
 * Detection is on the shape of the payload (`result.tools` is an array) rather
 * than on the request id, because a Transport only sees the response.
 * `result.tools` is unique to tools/list in this server's surface.
 */
export function stripToolSchemaDialect(message: JSONRPCMessage): JSONRPCMessage {
  if (!("result" in message) || typeof message.result !== "object" || message.result === null) {
    return message;
  }

  const result = message.result as { tools?: unknown };
  if (!Array.isArray(result.tools)) return message;

  const tools = result.tools.map((tool) => {
    if (typeof tool !== "object" || tool === null) return tool;
    const t = tool as WireTool;
    const patched: WireTool = { ...t };
    if (t.inputSchema !== undefined) patched.inputSchema = withoutDialect(t.inputSchema);
    if (t.outputSchema !== undefined) patched.outputSchema = withoutDialect(t.outputSchema);
    return patched;
  });

  return { ...message, result: { ...result, tools } } as JSONRPCMessage;
}

/**
 * Wrap `server.connect` so every transport it is given has its outgoing
 * tools/list result cleaned of the dialect marker. Returns the same instance.
 */
export function applyToolSchemaDialectFix(server: McpServer): McpServer {
  const connect = server.connect.bind(server);

  server.connect = async (transport: Transport): Promise<void> => {
    const send = transport.send.bind(transport);
    transport.send = (message, options) => send(stripToolSchemaDialect(message), options);
    return connect(transport);
  };

  return server;
}
