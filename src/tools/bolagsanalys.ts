// bolagsanalys.ts — registration of the bolagsanalys_* tools (Plan 02).
//
// Three curated, intent-named, READ-ONLY tools forming the documented chaining
// flow (AI-SPEC §4 table):
//
//   bolagsanalys_list_companies  → companyId
//   bolagsanalys_find_parameter  → parameterCode
//   bolagsanalys_get_data        ← (companyId, parameterCode)
//
// Each tool wraps exactly ONE v2 GET via callV2 (the single outbound point), folds
// friendly paging/sort args into the v2 query string, and returns BOTH `content`
// (text) and `structuredContent` (validated against its Zod outputSchema). Expected
// HTTP errors are mapped to a friendly `isError:true` result — a handler NEVER
// throws for a ToolError (AI-SPEC §3 Pitfall #6 / D-11).
//
// Thin-wrapper inertness (PATTERNS §E): no cache, no tenant/auth/billing/translation
// logic here. Rows are forwarded as-is — `companyId`/`parameterCode` stay on every
// row (object-identity integrity, T-63-10); nothing is merged or aggregated.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { callV2, callV2Post } from "../client/v2Client.js";
import { describeToolError } from "../client/problemDetails.js";
import {
  listCompaniesInput,
  listCompaniesOutput,
  findParameterInput,
  findParameterOutput,
  getDataInput,
  getDataOutput,
  searchDataInput,
  searchDataOutput,
} from "../schemas/bolagsanalys.js";

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
    return { content: [{ type: "text", text: describeToolError(e) }], isError: true };
  }
}

/**
 * POST sibling of {@link runTool} — turns a single v2 POST round-trip (via callV2Post)
 * into a CallToolResult with the identical friendly-error wrapper. Used by the batch
 * search tool; preserves the inertness invariant (one tool call == one v2 round-trip).
 */
async function runToolPost(
  path: string,
  body: Record<string, unknown>,
): Promise<CallToolResult> {
  try {
    const out = await callV2Post(path, body);
    return {
      content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
      structuredContent: out as Record<string, unknown>,
    };
  } catch (e) {
    return { content: [{ type: "text", text: describeToolError(e) }], isError: true };
  }
}

/**
 * Register the Bolagsanalys (listed-company financials) tools on the server.
 */
export function registerBolagsanalysTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // 1. bolagsanalys_list_companies → GET /bolagsanalys/companies
  // -------------------------------------------------------------------------
  server.registerTool(
    "bolagsanalys_list_companies",
    {
      title: "List listed companies (Bolagsanalys)",
      description:
        "Read-only. Search Sedis's catalog of listed companies by name fragment " +
        "or country code and return each company's `companyId` and name. " +
        "This is the FIRST step of the Bolagsanalys flow: take a `companyId` from " +
        "here and pass it to `bolagsanalys_get_data` to fetch its quarterly figures. " +
        "Example: nameContains 'Volvo', countryCode 'SE'. " +
        "Reference data shared across all tenants; this tool never writes or ingests.",
      inputSchema: listCompaniesInput,
      outputSchema: listCompaniesOutput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ nameContains, countryCode, sort, page, pageSize }): Promise<CallToolResult> =>
      runTool("/bolagsanalys/companies", {
        nameContains,
        countryCode,
        sort,
        page,
        pageSize,
      }),
  );

  // -------------------------------------------------------------------------
  // 2. bolagsanalys_find_parameter → GET /bolagsanalys/parameters
  // -------------------------------------------------------------------------
  server.registerTool(
    "bolagsanalys_find_parameter",
    {
      title: "Find a Bolagsanalys parameter",
      description:
        "Read-only. Discover the right financial parameter by name fragment or " +
        "group and return each parameter's `code`, English name, group and description. " +
        "Use this to resolve the `parameterCode` you then pass to " +
        "`bolagsanalys_get_data` (alongside a `companyId` from " +
        "`bolagsanalys_list_companies`). Example: nameContains 'revenue', " +
        "group 'Income statement'. Shared reference data; read-only — never writes.",
      inputSchema: findParameterInput,
      outputSchema: findParameterOutput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ nameContains, group, lang, sort, page, pageSize }): Promise<CallToolResult> =>
      runTool("/bolagsanalys/parameters", {
        nameContains,
        groupName: group,
        lang,
        sort,
        page,
        pageSize,
      }),
  );

  // -------------------------------------------------------------------------
  // 3. bolagsanalys_get_data → GET /bolagsanalys/data
  // -------------------------------------------------------------------------
  server.registerTool(
    "bolagsanalys_get_data",
    {
      title: "Get Bolagsanalys quarterly figures",
      description:
        "Read-only. Fetch quarterly figures for one company — optionally narrowed to " +
        "a single parameter and a quarter range. Pass a `companyId` from " +
        "`bolagsanalys_list_companies` and (optionally) a `parameterCode` from " +
        "`bolagsanalys_find_parameter`. Quarter bounds use packed ids: `quarterId`, " +
        "`fromDate`, `toDate` accept e.g. '20251' or '2025Q1' (these are QUARTERS, " +
        "not calendar dates). Example: companyId 'SE-VOLV-B', parameterCode 'REV', " +
        "fromDate '2024Q1', toDate '2025Q4'. Every row keeps its `companyId` and " +
        "`parameterCode`; read-only — never writes.",
      inputSchema: getDataInput,
      outputSchema: getDataOutput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({
      companyId,
      parameterCode,
      quarterId,
      fromDate,
      toDate,
      count,
      sort,
      page,
      pageSize,
    }): Promise<CallToolResult> =>
      runTool("/bolagsanalys/data", {
        companyId,
        parameterCode,
        quarterId,
        fromDate,
        toDate,
        count,
        sort,
        page,
        pageSize,
      }),
  );

  // -------------------------------------------------------------------------
  // 4. bolagsanalys_search_data → POST /bolagsanalys/data/search  (D-03 batch)
  // -------------------------------------------------------------------------
  server.registerTool(
    "bolagsanalys_search_data",
    {
      title: "Search Bolagsanalys figures for many companies (batch)",
      description:
        "Read-only. Fetch quarterly figures for a SPECIFIC SET of companies in one call " +
        "by passing `companyIds` (up to 50, from `bolagsanalys_list_companies`), optionally " +
        "narrowed to a `parameterCode` (from `bolagsanalys_find_parameter`) and a quarter " +
        "range. Use this for a specific N-company subset — v2's GET has no companyIdIn, so to " +
        "fetch ALL companies instead omit `companyId` on `bolagsanalys_get_data`. Quarter " +
        "bounds use packed ids: `quarterId`, `fromDate`, `toDate` accept e.g. '20251' or " +
        "'2025Q1' (QUARTERS, not calendar dates). The cap is 50 — more is rejected. Returns " +
        "the same envelope as `bolagsanalys_get_data`; every row keeps its `companyId` and " +
        "`parameterCode`; read-only — never writes.",
      inputSchema: searchDataInput,
      outputSchema: searchDataOutput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({
      companyIds,
      companyId,
      parameterCode,
      quarterId,
      fromDate,
      toDate,
      count,
      sort,
      page,
      pageSize,
    }): Promise<CallToolResult> =>
      runToolPost("/bolagsanalys/data/search", {
        companyIds,
        companyId,
        parameterCode,
        quarterId,
        fromDate,
        toDate,
        count,
        sort,
        page,
        pageSize,
      }),
  );
}
