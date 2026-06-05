// server.ts — buildServer() factory.
//
// Constructs the McpServer and pre-wires the two domain tool-registration
// functions. Keeping the two register*Tools calls here (and the tool modules as
// separate files) lets Plan 02 and Plan 03 implement their tool surfaces in
// parallel without editing any shared file.
//
// The factory is exported (rather than built inline in index.ts) so the in-process
// test harness (InMemoryTransport) can construct a server without spawning a child
// process.

import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGettingStartedResource } from "./resources/gettingStarted.js";
import { registerBolagsanalysTools } from "./tools/bolagsanalys.js";
import { registerFastighetsbenchmarkTools } from "./tools/fastighetsbenchmark.js";
import { registerSessionTools } from "./tools/session.js";

// Read the package version at runtime rather than importing package.json (which
// lives outside the tsc rootDir). createRequire resolves relative to this module,
// and `files:["build"]` does not ship package.json's siblings — but package.json
// itself is always present in the installed package root, one level above build/.
const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

/**
 * Top-level orientation surfaced to the model at `initialize` (MCP `instructions`).
 * Clients forward this to the LLM like a system prompt, so it learns what Sedis is,
 * the canonical tool-chaining flows, the auth model, and how to react to errors —
 * BEFORE the first tool call. Keep it concise; per-tool detail lives in each tool's
 * description. See also the `sedis://getting-started` resource for onboarding depth.
 */
const SERVER_INSTRUCTIONS = `
Sedis exposes two READ-ONLY data products as MCP tools. This server is a thin
pass-through to the Sedis PartnerAPI v2 — it never mutates data.

• Bolagsanalys (listed-company financials; shared reference data).
  Flow: bolagsanalys_list_companies → bolagsanalys_find_parameter → bolagsanalys_get_data.
  Many companies at once: OMIT companyId on bolagsanalys_get_data (returns all companies
  for the parameter/quarter), or use bolagsanalys_search_data with companyIds[] (max 50)
  for a specific subset.

• Fastighetsbenchmark (commercial real-estate comparables; YOUR tenant-scoped data).
  Flow: fastighetsbenchmark_list_jamforelseobjekt / _search_property_units / _list_samlingar
  to find sedisIds → fastighetsbenchmark_get_comp_timeseries (read each row's dataType to
  pick the right value member: figure / boolean / enum / date). fastighetsbenchmark_list_
  reference_zones returns shared market reference zones. Filter property units by name with
  propertyTypeName (e.g. "Office"/"Kontor").

Auth: set SEDIS_API_KEY (your PartnerAPI v2 key) in the MCP client's env block; it is sent
only as the X-Api-Key header, never logged. User-owned keys also need a short-lived session
token (sent as X-Api-Session): after re-proving 2FA on the reprove page, paste the freshly-
minted token via the set_session tool — it is carried on every call with NO client restart
(optionally seed it once via the SEDIS_API_SESSION env var). M2M/customer-level keys need no
session. Names/descriptions default to English — pass lang:"sv" for Swedish.

When a tool returns an error, act on it rather than retrying blindly:
• "Session re-verification required" → open the reproveUrl shown in the message, complete
  2FA, copy the new session token, call set_session with it, then retry — no client restart.
• "Two-factor re-verification required" → tell the user to open the reproveUrl shown in the
  message, complete 2FA, then retry the call.
• "not licensed for this product" → the key isn't entitled to that product; the user must
  enable it.
• "not found, or not in your tenant" → the object isn't in your data (no existence leak).
• "Rate limited" → wait the stated time, then retry.
• "Missing SEDIS_API_KEY" → the key isn't configured in the client's env block.
`.trim();

/**
 * Build a fully-configured McpServer with all domain tools registered.
 * No transport is connected here — the caller (index.ts or a test) connects one.
 */
export function buildServer(): McpServer {
  const server = new McpServer(
    { name: "sedis", version: pkg.version },
    { instructions: SERVER_INSTRUCTIONS },
  );

  registerGettingStartedResource(server);
  registerBolagsanalysTools(server);
  registerFastighetsbenchmarkTools(server);
  registerSessionTools(server);

  return server;
}
