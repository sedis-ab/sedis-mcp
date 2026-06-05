// session.ts — the set_session / clear_session local-state tools (MCP-01 / D-01/D-04).
//
// Unlike every data tool, these MUTATE local state (annotations.readOnlyHint: false).
// The Phase-69 per-session 2FA gate mints a short-lived session token on the reprove
// page; the owner pastes it here ONCE per ~2h session and the MCP carries it as
// X-Api-Session on every subsequent call — WITHOUT a client restart (D-04).
//
// set_session writes the pasted token to BOTH the on-disk 0600 cache (survives a
// restart within the TTL) AND the in-memory layer (takes effect immediately on the
// next call). The handlers NEVER echo the token back in their result — same no-log
// invariant as the API key (Pattern: never log the key or session token).

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { setInMemorySession } from "../config.js";
import { setCachedSession, clearCachedSession } from "../session/sessionStore.js";

// Top-level inputSchema is a RAW shape (NOT z.object(...)) — v1.x SDK idiom
// (mirrors src/schemas/bolagsanalys.ts). English .describe() per the schema
// convention (developer-facing tool descriptions, distinct from the Swedish admin UI).
const setSessionInput = {
  token: z
    .string()
    .min(1)
    .describe(
      "The freshly-minted session token from the reprove page (e.g. starts with " +
        "'sedis_sess_…'). Open the reproveUrl shown in a 'Session re-verification " +
        "required' error, complete 2FA, copy the token, and paste it here.",
    ),
};

/**
 * Register the session-management tools (set_session / clear_session). These are the
 * runtime refresh path for the Phase-69 X-Api-Session token — no client restart (D-04).
 */
export function registerSessionTools(server: McpServer): void {
  server.registerTool(
    "set_session",
    {
      title: "Set the Sedis session token (after re-proving 2FA)",
      description:
        "Paste the freshly-minted session token from the Sedis reprove page to refresh " +
        "this session WITHOUT restarting the client. Use this when a tool returns " +
        "'Session re-verification required': open the reproveUrl, complete 2FA, copy the " +
        "new token, call this tool with it, then retry the original call. The token is " +
        "cached locally (owner-only file) and sent as the X-Api-Session header on every " +
        "subsequent call; it is never logged or echoed back.",
      inputSchema: setSessionInput,
      // Mutates local state (cache + in-memory) — NOT read-only.
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async ({ token }): Promise<CallToolResult> => {
      try {
        setCachedSession(token); // 0600 cache — survives a restart within the TTL
        setInMemorySession(token); // takes effect on the very next call (no restart)
        return {
          content: [
            {
              type: "text",
              // NEVER echo the token back (no-log invariant).
              text:
                "Session token updated. It is now sent as X-Api-Session on every " +
                "call. Retry your previous request.",
            },
          ],
        };
      } catch {
        return {
          content: [
            {
              type: "text",
              text:
                "Could not persist the session token to the local cache, but it is " +
                "set for this session. Retry your previous request; you may need to " +
                "re-paste it after a client restart.",
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "clear_session",
    {
      title: "Clear the cached Sedis session token",
      description:
        "Forget the locally-cached session token (removes it from memory and the " +
        "on-disk cache). After this, calls send no X-Api-Session header until you " +
        "set_session again. Use it to sign out of the current session.",
      // No input — raw empty shape.
      inputSchema: {},
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async (): Promise<CallToolResult> => {
      clearCachedSession();
      setInMemorySession(undefined);
      return {
        content: [
          {
            type: "text",
            text: "Session token cleared. Calls now send no X-Api-Session header.",
          },
        ],
      };
    },
  );
}
