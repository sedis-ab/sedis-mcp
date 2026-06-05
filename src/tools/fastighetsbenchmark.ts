// fastighetsbenchmark.ts — registration of the fastighetsbenchmark_* tools (Plan 03).
//
// Five curated, intent-named, READ-ONLY tools that make the §8 A6 worked flow
// effortless (find zone → find your office units → find the parameter →
// pull the time-series):
//
//   fastighetsbenchmark_find_parameter         → parameterCode (+ dataType/enumValues)
//   fastighetsbenchmark_search_property_units   → your Fastighet sedisIds
//   fastighetsbenchmark_list_samlingar          → containingCompSedisIds (fan-out)
//   fastighetsbenchmark_list_jamforelseobjekt   → zone sedisId (+ opt-in lineage)
//   fastighetsbenchmark_get_comp_timeseries     ← (sedisIdIn, parameterCode, range)
//
// Each tool wraps exactly ONE v2 GET via callV2 (the single outbound point), folds
// friendly paging/sort + lean-by-default field selection into named args, and
// returns BOTH `content` (text) and `structuredContent` (validated against its Zod
// outputSchema). Expected HTTP errors map to a friendly `isError:true` result — a
// handler NEVER throws for a ToolError (AI-SPEC §3 Pitfall #6 / D-11).
//
// Thin-wrapper inertness (PATTERNS §E): no cache, no tenant/auth/billing/translation
// logic here. Comparable evidence is proprietary and tenant-filtered AT v2 — this
// module NEVER merges/aggregates CompDatum rows and NEVER caches or broadens the
// tenant-filtered lineage arrays (containingCompSedisIds / containsPropertyUnits —
// T-63-06). Every row keeps its `sedisId` (no comp conflation, T-63-10) and its
// self-describing `dataType` (T-63-07). One tool call == one v2 round-trip.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { callV2 } from "../client/v2Client.js";
import { ToolError } from "../client/problemDetails.js";
import {
  findParameterInput,
  findParameterOutput,
  searchPropertyUnitsInput,
  searchPropertyUnitsOutput,
  listSamlingarInput,
  listSamlingarOutput,
  listJamforelseobjektInput,
  listJamforelseobjektOutput,
  listReferenceZonesInput,
  listReferenceZonesOutput,
} from "../schemas/fastighetsbenchmark.js";
import {
  getCompTimeseriesInput,
  getCompTimeseriesOutput,
} from "../schemas/compData.js";

/**
 * Turn a single v2 round-trip into a CallToolResult. On success returns both the
 * text block (for the LLM) and `structuredContent` (validated vs outputSchema). A
 * ToolError (any expected HTTP status, mapped by problemDetails) becomes a friendly
 * `isError:true` result so the LLM self-corrects instead of seeing a protocol error.
 * No key, no stack ever reaches the result.
 */
async function runTool(
  path: string,
  params: Record<string, unknown>,
): Promise<CallToolResult> {
  try {
    const out = await callV2(path, params);
    return {
      content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
      structuredContent: out as Record<string, unknown>,
    };
  } catch (e) {
    const msg =
      e instanceof ToolError ? e.message : "Unexpected error contacting Sedis.";
    return { content: [{ type: "text", text: msg }], isError: true };
  }
}

/**
 * Register the Fastighetsbenchmark (commercial real-estate benchmark) tools on
 * the server. Five read-only tools wrapping the per-business-type v2 GET resources
 * and the CompDatum time-series.
 */
export function registerFastighetsbenchmarkTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // 1. fastighetsbenchmark_find_parameter → GET /fastighetsbenchmark/parameters
  // -------------------------------------------------------------------------
  server.registerTool(
    "fastighetsbenchmark_find_parameter",
    {
      title: "Find a Fastighetsbenchmark parameter",
      description:
        "Read-only. Discover the right real-estate benchmark parameter by name " +
        "fragment or group and return each parameter's `code`, English name, " +
        "`dataType` (decimal/boolean/enum/date) and — for enum parameters — its " +
        "`enumValues` legal-value domain. Use this to resolve the `parameterCode` " +
        "you pass to `fastighetsbenchmark_get_comp_timeseries`, and read `dataType` " +
        "to know which CompDatum value member to trust. Example: nameContains " +
        "'Total return'. Shared reference data; read-only — never writes.",
      inputSchema: findParameterInput,
      outputSchema: findParameterOutput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ nameContains, group, lang, sort, page, pageSize }): Promise<CallToolResult> =>
      runTool("/fastighetsbenchmark/parameters", {
        nameContains,
        groupName: group,
        lang,
        sort,
        page,
        pageSize,
      }),
  );

  // -------------------------------------------------------------------------
  // 2. fastighetsbenchmark_search_property_units → GET /fastighetsbenchmark/property-units
  // -------------------------------------------------------------------------
  server.registerTool(
    "fastighetsbenchmark_search_property_units",
    {
      title: "Search your property units (Fastighet)",
      description:
        "Read-only. Find YOUR property units (Fastighet) by name, property-type id, " +
        "municipality, or comparison-zone membership, returning each unit's `sedisId`. " +
        "This is the §8 A6 flow's object-finding step: take a comparison zone from " +
        "`fastighetsbenchmark_list_jamforelseobjekt` and filter here with " +
        "`belongsToJamforelseobjektSedisId`, then pass the resulting `sedisId`s to " +
        "`fastighetsbenchmark_get_comp_timeseries` via `sedisIdIn`. Lean by default: " +
        "geometry is omitted unless you set `includeGeometry: true`. Example: " +
        "propertyType 1 (Office), belongsToJamforelseobjektSedisId 'JO-A'. " +
        "Tenant-scoped to your data; read-only — never writes.",
      inputSchema: searchPropertyUnitsInput,
      outputSchema: searchPropertyUnitsOutput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({
      nameContains,
      propertyType,
      propertyTypeName,
      municipalityId,
      belongsToJamforelseobjektSedisId,
      lang,
      includeGeometry,
      sort,
      page,
      pageSize,
    }): Promise<CallToolResult> =>
      runTool("/fastighetsbenchmark/property-units", {
        nameContains,
        propertyType,
        propertyTypeName,
        municipalityId,
        belongsToJamforelseobjektSedisId,
        lang,
        // Lean-by-default: only request the heavy geometry member when asked (?fields=).
        fields: includeGeometry ? "sedisId,name,propertyType,municipalityId,geometry,lastUpdatedUtc" : undefined,
        sort,
        page,
        pageSize,
      }),
  );

  // -------------------------------------------------------------------------
  // 3. fastighetsbenchmark_list_samlingar → GET /fastighetsbenchmark/samlingar
  // -------------------------------------------------------------------------
  server.registerTool(
    "fastighetsbenchmark_list_samlingar",
    {
      title: "List your collections (Samling)",
      description:
        "Read-only. List YOUR collections (Samling). Each row exposes its members as " +
        "`containingCompSedisIds` — an array of ids, not nested objects — so you can " +
        "reference-then-resolve: take those ids and pass them to " +
        "`fastighetsbenchmark_get_comp_timeseries` via `sedisIdIn` only for the " +
        "collections you actually need (this keeps payloads bounded). Example: " +
        "nameContains 'Stockholm offices'. Tenant-scoped to your data; read-only — " +
        "never writes (creating/replacing/deleting a Samling is not exposed here).",
      inputSchema: listSamlingarInput,
      outputSchema: listSamlingarOutput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ nameContains, sort, page, pageSize }): Promise<CallToolResult> =>
      runTool("/fastighetsbenchmark/samlingar", {
        nameContains,
        sort,
        page,
        pageSize,
      }),
  );

  // -------------------------------------------------------------------------
  // 4. fastighetsbenchmark_list_jamforelseobjekt → GET /fastighetsbenchmark/jamforelseobjekt
  // -------------------------------------------------------------------------
  server.registerTool(
    "fastighetsbenchmark_list_jamforelseobjekt",
    {
      title: "List your comparison zones (Jämförelseobjekt)",
      description:
        "Read-only. List YOUR comparison zones (Jämförelseobjekt — your clones of a " +
        "Sedis-owned aggregate), returning each zone's `sedisId`. This is the FIRST " +
        "step of the §8 A6 flow: find a zone by name here, then pass its `sedisId` to " +
        "`fastighetsbenchmark_search_property_units` as " +
        "`belongsToJamforelseobjektSedisId` to find your units in it. Lean by default: " +
        "set `detail: true` to opt into the tenant-filtered `containsPropertyUnits` " +
        "lineage. Example: nameContains 'Stockholm'. Tenant-scoped to your data; " +
        "read-only — never writes.",
      inputSchema: listJamforelseobjektInput,
      outputSchema: listJamforelseobjektOutput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ nameContains, detail, sort, page, pageSize }): Promise<CallToolResult> =>
      runTool("/fastighetsbenchmark/jamforelseobjekt", {
        nameContains,
        // Lean-by-default: only request the tenant-filtered lineage array when asked.
        fields: detail ? "sedisId,name,containsPropertyUnits,lastUpdatedUtc" : undefined,
        sort,
        page,
        pageSize,
      }),
  );

  // -------------------------------------------------------------------------
  // 5. fastighetsbenchmark_get_comp_timeseries → GET /fastighetsbenchmark/comp-data
  // -------------------------------------------------------------------------
  server.registerTool(
    "fastighetsbenchmark_get_comp_timeseries",
    {
      title: "Get the CompDatum time-series",
      description:
        "Read-only. Pull the actual benchmarking numbers (CompDatum time-series) for " +
        "one or more Comps. This is the FINAL step of the §8 A6 flow: pass the " +
        "`sedisId`s you found (from `fastighetsbenchmark_search_property_units`, " +
        "`_list_samlingar`'s `containingCompSedisIds`, or `_list_jamforelseobjekt`) " +
        "as a comma-separated `sedisIdIn`, plus a `parameterCode` from " +
        "`fastighetsbenchmark_find_parameter` and an ISO date range. Each row is " +
        "SELF-DESCRIBING via `dataType` (decimal/boolean/enum/date) — read the " +
        "matching member (`figure`/`boolean`/`enum`/`date`); an enum resolves to " +
        "`{ value, name, enumType }`, so use `enum.name`, never the raw int. Every " +
        "row keeps its `sedisId` (do not conflate Comps). Use `count: false` for " +
        "cheap bulk paging. Example: sedisIdIn 'PU-1,PU-2', parameterCode 'NX71', " +
        "fromDate '2016-01-01', toDate '2026-12-31'. Tenant-scoped to your data; " +
        "read-only — never writes.",
      inputSchema: getCompTimeseriesInput,
      outputSchema: getCompTimeseriesOutput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({
      sedisIdIn,
      parameterCode,
      fromDate,
      toDate,
      count,
      page,
      pageSize,
    }): Promise<CallToolResult> =>
      runTool("/fastighetsbenchmark/comp-data", {
        sedisIdIn,
        parameterCode,
        fromDate,
        toDate,
        count,
        page,
        pageSize,
      }),
  );

  // -------------------------------------------------------------------------
  // 6. fastighetsbenchmark_list_reference_zones → GET /fastighetsbenchmark/reference-zones
  // -------------------------------------------------------------------------
  server.registerTool(
    "fastighetsbenchmark_list_reference_zones",
    {
      title: "List reference zones (shared)",
      description:
        "Read-only. List the SHARED Sedis-owned reference zones — the same for every " +
        "key, with NO tenant filter (these are not your private data). Each row exposes " +
        "its `sedisId`, `name`, and `sourceName` (the external-reference provider, e.g. " +
        "'Nils Holgersson'). Use a reference zone as a market benchmark to compare against " +
        "your own comparison zones and property units. Example: nameContains 'Stockholm'. " +
        "Shared reference data; read-only — never writes.",
      inputSchema: listReferenceZonesInput,
      outputSchema: listReferenceZonesOutput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ nameContains, sort, page, pageSize }): Promise<CallToolResult> =>
      runTool("/fastighetsbenchmark/reference-zones", {
        nameContains,
        sort,
        page,
        pageSize,
      }),
  );
}
