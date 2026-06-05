// schemas/compData.ts — Zod arg + response shapes for fastighetsbenchmark_get_comp_timeseries.
//
// CompDatum is the Fastighetsbenchmark time-series row. It is *self-describing*
// via a `dataType` discriminator (docs/partnerapi-v2/08-comp-composite.md §CompDatum):
// each row sets `dataType` ∈ {"decimal","boolean","enum","date"} and populates
// exactly the matching value member. Preserving this contract is a TAMPERING
// mitigation (T-63-07): an enum must resolve to its `{ value, name, enumType }`
// (never collapse to a raw int), a boolean must read as `true`/`false` (never as a
// yield), and a date-typed value lives in `date` (NOT `valueDate`, which is the
// period the value applies to — part of the natural key).
//
// v1.x SDK idiom (AI-SPEC §3 Pitfall #3): the TOP-LEVEL inputSchema/outputSchema
// passed to registerTool must be a *raw shape* — a plain object of z.* validators,
// NEVER z.object(...). z.object(...) is used ONLY for the nested element type.

import { z } from "zod";

// ---------------------------------------------------------------------------
// CompDatum — one self-describing time-series row.
// ---------------------------------------------------------------------------
// `dataType` tells the reader which value member to trust:
//   decimal → figure   |  boolean → boolean (+ raw figure 1/0)
//   enum    → enum {value,name,enumType} (+ raw figure int)  |  date → date
// Null members are omitted on the wire, so only the matching member appears.

/** Resolved enum value for an `E`-prefixed parameter (08-comp-composite §enum). */
const CompEnumValue = z.object({
  value: z.number().int().describe("Raw enum int, e.g. 1."),
  name: z.string().describe("Resolved enum label, e.g. 'Kontor'. Read THIS, never the int."),
  enumType: z
    .string()
    .describe("The enum domain this belongs to, e.g. 'PropertyType' or 'CompClassification'."),
}).passthrough();

/** A single self-describing CompDatum row (reusable element schema). */
export const CompDatum = z.object({
  sedisId: z
    .string()
    .describe("The Comp this value belongs to — kept on EVERY row (no comp conflation), e.g. 'PU-1'."),
  parameterCode: z
    .string()
    .describe("The CompParameter code this value is for, e.g. 'NX71'."),
  valueDate: z
    .string()
    .describe("ISO date (yyyy-MM-dd) of the period the value applies to (part of the natural key), e.g. '2025-12-31'."),
  dataType: z
    .enum(["decimal", "boolean", "enum", "date"])
    .describe(
      "Discriminator telling you which value member to read: 'decimal'→figure, 'boolean'→boolean, 'enum'→enum, 'date'→date.",
    ),
  figure: z
    .number()
    .nullable()
    .optional()
    .describe("Decimal value when dataType='decimal'; also the raw 1/0 (boolean) or raw int (enum) for transparency."),
  boolean: z
    .boolean()
    .nullable()
    .optional()
    .describe("Boolean value when dataType='boolean' (read this, not figure), e.g. true."),
  enum: CompEnumValue.nullable()
    .optional()
    .describe("Resolved enum when dataType='enum' — { value, name, enumType }; use `name`, never the raw int."),
  date: z
    .string()
    .nullable()
    .optional()
    .describe("ISO yyyy-MM-dd value when dataType='date' (the date-typed value itself, NOT valueDate), e.g. '2025-11-03'."),
}).passthrough();

// ---------------------------------------------------------------------------
// fastighetsbenchmark_get_comp_timeseries → GET /fastighetsbenchmark/comp-data
// ---------------------------------------------------------------------------

export const getCompTimeseriesInput = {
  sedisIdIn: z
    .string()
    .describe("Comma-separated Comp sedisIds to fetch (multi-value), e.g. 'PU-1,PU-2'."),
  parameterCode: z
    .string()
    .optional()
    .describe("CompParameter code from fastighetsbenchmark_find_parameter; omit for all parameters, e.g. 'NX71'."),
  fromDate: z
    .string()
    .optional()
    .describe("Inclusive lower ISO date bound (yyyy-MM-dd), e.g. '2016-01-01'."),
  toDate: z
    .string()
    .optional()
    .describe("Inclusive upper ISO date bound (yyyy-MM-dd), e.g. '2026-12-31'."),
  count: z
    .boolean()
    .default(false)
    .describe("false (default) skips totalCount for cheaper high-volume bulk paging, e.g. false."),
  page: z
    .number()
    .int()
    .min(1)
    .default(1)
    .describe("1-indexed result page (first page = 1), e.g. 1."),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe("Rows per page (v2 default 50, max 500), e.g. 50."),
};

export const getCompTimeseriesOutput = {
  data: z
    .array(CompDatum)
    .describe("Self-describing CompDatum rows — one per Comp+parameter+valueDate; dataType + sedisId kept on every row."),
  page: z.number().int().describe("The page you are on (1-indexed)."),
  pageSize: z.number().int().nullable().optional().describe("Rows per page used for this response."),
  totalCount: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe("Total matching rows across all pages; null/absent when count=false (v2 omits the key)."),
  totalPages: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe("Total page count; null/absent when count=false."),
};
