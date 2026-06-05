// schemas/bolagsanalys.ts — Zod arg + response shapes for the 3 Bolagsanalys tools.
//
// v1.x SDK idiom (AI-SPEC §3 Pitfall #3): the TOP-LEVEL inputSchema/outputSchema
// passed to registerTool must be a *raw shape* — a plain object of z.* validators,
// NEVER z.object(...). z.object(...) is used ONLY for nested array element types.
//
// Each arg carries an English `.describe()` with a concrete example (AI-SPEC §4b:
// the arg descriptions ARE part of the prompt the partner LLM reads). v2 paging /
// sort / sparse-fieldset conventions (docs/partnerapi-v2/04-query-conventions.md)
// are folded into named args here; the handlers map them 1:1 to the v2 query string.
//
// Bolagsanalys is shared reference data (03-endpoints-overview.md): no tenant
// scoping. `quarterId` / `fromDate` / `toDate` are quarter bounds (e.g. 20251 or
// 2025Q1), NOT calendar dates.

import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

/** 1-indexed page selector — v2 paging is `?page=N` (04-query-conventions §Pagination). */
const page = z
  .number()
  .int()
  .min(1)
  .default(1)
  .describe("1-indexed result page (first page = 1), e.g. 1.");

/** Optional page size — v2 default 50, clamped server-side to 500. */
const pageSize = z
  .number()
  .int()
  .min(1)
  .max(500)
  .optional()
  .describe("Rows per page (v2 default 50, max 500), e.g. 50.");

/** Optional sort — comma list, leading '-' = descending (04-query-conventions §Sorting). */
const sort = z
  .string()
  .optional()
  .describe("Comma-separated sort fields; prefix '-' for descending, e.g. '-name'.");

/** The v2 paging envelope echoed back on every list response. */
const pagingShape = {
  page: z.number().int().describe("The page you are on (1-indexed)."),
  pageSize: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe("Rows per page echoed back by v2, e.g. 50."),
  totalCount: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe("Total matching rows across all pages; null/absent when count is skipped."),
  totalPages: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe("Total page count; null/absent when count is skipped."),
};

// ---------------------------------------------------------------------------
// bolagsanalys_list_companies  → GET /bolagsanalys/companies
// ---------------------------------------------------------------------------

export const listCompaniesInput = {
  nameContains: z
    .string()
    .optional()
    .describe("Case-insensitive company-name fragment, e.g. 'Volvo'."),
  countryCode: z
    .string()
    .length(2)
    .optional()
    .describe("ISO-3166 alpha-2 country code, e.g. 'SE'."),
  sort,
  page,
  pageSize,
};

const CompanyRow = z.object({
  companyId: z.string().describe("Stable company id; pass to bolagsanalys_get_data."),
  name: z.string().describe("Company display name."),
  countryCode: z.string().nullable().optional().describe("ISO-3166 alpha-2, e.g. 'SE'."),
  isInactive: z.boolean().nullable().optional().describe("True if the company is inactive."),
  nextReportDate: z
    .string()
    .nullable()
    .optional()
    .describe("ISO date of the next expected report, if known."),
}).passthrough();

export const listCompaniesOutput = {
  data: z.array(CompanyRow).describe("Matching listed companies."),
  ...pagingShape,
};

// ---------------------------------------------------------------------------
// bolagsanalys_find_parameter  → GET /bolagsanalys/parameters
// ---------------------------------------------------------------------------

export const findParameterInput = {
  nameContains: z
    .string()
    .optional()
    .describe("Case-insensitive parameter-name fragment, e.g. 'revenue'."),
  group: z
    .string()
    .optional()
    .describe("Parameter group name to filter by, e.g. 'Income statement'."),
  lang: z
    .enum(["sv", "en"])
    .optional()
    .describe("Language for names/descriptions; English default, 'sv' for Swedish."),
  sort,
  page,
  pageSize,
};

const ParameterRow = z.object({
  code: z.string().describe("Parameter code; pass as parameterCode to bolagsanalys_get_data."),
  name: z.string().describe("English-primary parameter name."),
  groupName: z.string().nullable().optional().describe("Group the parameter belongs to."),
  description: z.string().nullable().optional().describe("English-primary description."),
  period: z.string().nullable().optional().describe("Reporting period the parameter applies to."),
}).passthrough();

export const findParameterOutput = {
  data: z.array(ParameterRow).describe("Matching Bolagsanalys parameters."),
  ...pagingShape,
};

// ---------------------------------------------------------------------------
// bolagsanalys_get_data  → GET /bolagsanalys/data
// ---------------------------------------------------------------------------
// quarterId / fromDate / toDate are QUARTER bounds (e.g. 20251 or 2025Q1),
// not calendar dates (03-endpoints-overview.md).

export const getDataInput = {
  companyId: z
    .string()
    .optional()
    .describe(
      "Company id from bolagsanalys_list_companies, e.g. 'SE-VOLV-B'. " +
        "Omit to fetch ALL companies for the parameter/quarter (enables one-call ranking/aggregation).",
    ),
  parameterCode: z
    .string()
    .optional()
    .describe("Parameter code from bolagsanalys_find_parameter; omit for all parameters."),
  quarterId: z
    .string()
    .optional()
    .describe("Single packed quarter, e.g. '20251' or '2025Q1'."),
  fromDate: z
    .string()
    .optional()
    .describe("Inclusive lower quarter bound, e.g. '20241' or '2024Q1'."),
  toDate: z
    .string()
    .optional()
    .describe("Inclusive upper quarter bound, e.g. '20254' or '2025Q4'."),
  count: z
    .boolean()
    .default(false)
    .describe("false (default) skips totalCount for cheaper bulk paging."),
  sort,
  page,
  pageSize,
};

const DataRow = z.object({
  companyId: z.string().describe("The company this figure belongs to (identity-preserving)."),
  parameterCode: z.string().describe("The parameter this figure belongs to."),
  quarterId: z.number().int().describe("Packed quarter, e.g. 20251 = 2025 Q1."),
  figure: z.number().nullable().optional().describe("Numeric value, when the parameter is numeric."),
  text: z.string().nullable().optional().describe("Text value, when the parameter is textual."),
  lastUpdatedUtc: z.string().nullable().optional().describe("ISO-8601 UTC last-update timestamp."),
}).passthrough();

export const getDataOutput = {
  data: z.array(DataRow).describe("Quarterly figures, one row per company+parameter+quarter."),
  ...pagingShape,
};

// ---------------------------------------------------------------------------
// bolagsanalys_search_data  → POST /bolagsanalys/data/search  (D-03 batch)
// ---------------------------------------------------------------------------
// Multi-company batch fetch (companyIds[] cap 50) — the only tool that POSTs.
// Mirrors BolagsanalysDataSearchRequest.cs (camelCase on the wire). The response
// envelope is IDENTICAL to the GET /bolagsanalys/data (PartnerApiV2Envelope<DatumResponse>),
// so searchDataOutput re-exports getDataOutput. v2's GET has no companyIdIn filter —
// this batch endpoint is the only way to pull a specific N-company subset.

export const searchDataInput = {
  companyIds: z
    .array(z.string())
    .max(50)
    .optional()
    .describe(
      "Up to 50 company ids (from bolagsanalys_list_companies) to fetch in one call; over 50 is rejected.",
    ),
  companyId: z
    .string()
    .optional()
    .describe("Single company id; OR'd with companyIds."),
  parameterCode: z
    .string()
    .optional()
    .describe("Parameter code from bolagsanalys_find_parameter; omit for all parameters."),
  quarterId: z
    .string()
    .optional()
    .describe("Single packed quarter, e.g. '20251' or '2025Q1'."),
  fromDate: z
    .string()
    .optional()
    .describe("Inclusive lower quarter bound, e.g. '20241' or '2024Q1'."),
  toDate: z
    .string()
    .optional()
    .describe("Inclusive upper quarter bound, e.g. '20254' or '2025Q4'."),
  count: z
    .boolean()
    .default(false)
    .describe("false (default) skips totalCount for cheaper bulk paging."),
  sort,
  page,
  pageSize,
};

/** Identical envelope to GET /bolagsanalys/data (PartnerApiV2Envelope<DatumResponse>). */
export const searchDataOutput = getDataOutput;
