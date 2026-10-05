// schemas/fastighetsbenchmark.ts — Zod arg + response shapes for the four
// non-time-series Fastighetsbenchmark tools (the time-series shapes live in
// schemas/compData.ts).
//
//   fastighetsbenchmark_find_parameter        → GET /fastighetsbenchmark/parameters
//   fastighetsbenchmark_search_property_units → GET /fastighetsbenchmark/property-units
//   fastighetsbenchmark_list_samlingar        → GET /fastighetsbenchmark/samlingar
//   fastighetsbenchmark_list_jamforelseobjekt → GET /fastighetsbenchmark/jamforelseobjekt
//   fastighetsbenchmark_list_municipalities   → GET /fastighetsbenchmark/municipalities
//   fastighetsbenchmark_list_property_types   → GET /fastighetsbenchmark/property-types
//
// v1.x SDK idiom (AI-SPEC §3 Pitfall #3): the TOP-LEVEL inputSchema/outputSchema
// passed to registerTool must be a *raw shape* — a plain object of z.* validators,
// NEVER z.object(...). z.object(...) is used ONLY for nested element types.
//
// LEAN-BY-DEFAULT with opt-in detail (D-08 / T-63-11 DoS mitigation): the heavy
// opt-in members (`geometry`, the bidirectional clone-lineage arrays) are omitted
// unless an `includeGeometry` / `detail` boolean is passed (handlers fold these to
// the v2 `?fields=` sparse-fieldset). The lineage arrays are tenant-filtered AT v2
// (T-63-06) — the schema merely *shapes* them; nothing here caches or broadens them.
//
// Each arg carries an English `.describe()` with a concrete example (AI-SPEC §4b:
// the arg descriptions ARE part of the prompt the partner LLM reads).

import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared building blocks (mirrors schemas/bolagsanalys.ts conventions).
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

/** The v2 paging envelope echoed back on every list response (aligned with schemas/bolagsanalys.ts). */
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

/** A tenant-filtered `{ sedisId, name }` lineage reference (08-comp-composite §lineage). */
const CompReference = z.object({
  sedisId: z.string().describe("Referenced Comp sedisId; resolve via get_comp_timeseries / search, e.g. 'PU-1'."),
  name: z.string().nullable().optional().describe("Referenced Comp display name, e.g. 'Office tower 1'."),
}).passthrough();

// ---------------------------------------------------------------------------
// fastighetsbenchmark_find_parameter → GET /fastighetsbenchmark/parameters
// ---------------------------------------------------------------------------
// Shared reference metadata. Returns `dataType` (+ `enumValues` for E-prefixed
// codes) so the caller knows which CompDatum value member to read downstream.

export const findParameterInput = {
  nameContains: z
    .string()
    .optional()
    .describe("Case-insensitive parameter-name fragment, e.g. 'Total return'."),
  group: z
    .string()
    .optional()
    .describe("Parameter group name to filter by, e.g. 'Return'."),
  lang: z
    .enum(["sv", "en"])
    .optional()
    .describe("Language for names/descriptions; English default, 'sv' for Swedish."),
  sort,
  page,
  pageSize,
};

const ParameterEnumValue = z.object({
  value: z.number().int().describe("Raw enum int, e.g. 1."),
  name: z.string().describe("Resolved enum label, e.g. 'Kontor'."),
}).passthrough();

const FastighetParameterRow = z.object({
  code: z
    .string()
    .describe("CompParameter code; pass as parameterCode to fastighetsbenchmark_get_comp_timeseries, e.g. 'NX71'."),
  name: z.string().describe("English-primary parameter name, e.g. 'Total return'."),
  groupName: z.string().nullable().optional().describe("Group the parameter belongs to, e.g. 'Return'."),
  description: z.string().nullable().optional().describe("English-primary description."),
  unit: z.string().nullable().optional().describe("Unit of the value, e.g. '%' or 'SEK/m²'."),
  isBaseData: z
    .boolean()
    .nullable()
    .optional()
    .describe("True if manually entered base data; false if formula-derived (calculated)."),
  dataType: z
    .enum(["decimal", "boolean", "enum", "date"])
    .describe("Which CompDatum value member this parameter produces (decimal/boolean/enum/date)."),
  enumValues: z
    .array(ParameterEnumValue)
    .nullable()
    .optional()
    .describe("For enum (E-prefixed) parameters: the full legal-value domain; absent for non-enum parameters."),
}).passthrough();

export const findParameterOutput = {
  data: z.array(FastighetParameterRow).describe("Matching Fastighetsbenchmark CompParameters."),
  ...pagingShape,
};

// ---------------------------------------------------------------------------
// fastighetsbenchmark_search_property_units → GET /fastighetsbenchmark/property-units
// ---------------------------------------------------------------------------
// Tenant-scoped (your Fastighet rows). Lean by default; `includeGeometry` opts
// into the heavy geometry member via ?fields= (D-08 / T-63-11).

export const searchPropertyUnitsInput = {
  name: z
    .string()
    .optional()
    .describe("Exact property-unit name (your own designation), case-insensitive — returns that one unit, e.g. 'Kontoret Gladan 4'."),
  nameContains: z
    .string()
    .optional()
    .describe("Case-insensitive property-unit-name fragment, e.g. 'Office'."),
  propertyType: z
    .number()
    .int()
    .optional()
    .describe("Property-type id (int, NOT a name); look ids up with fastighetsbenchmark_list_property_types, e.g. 2."),
  municipalityId: z
    .number()
    .int()
    .optional()
    .describe("Municipality id to filter by; look ids up with fastighetsbenchmark_list_municipalities (e.g. Stockholm = 21)."),
  belongsToJamforelseobjektSedisId: z
    .string()
    .optional()
    .describe("Comparison-zone sedisId (from list_jamforelseobjekt) — returns only your units in that zone, e.g. 'JO-A'."),
  propertyTypeName: z
    .string()
    .optional()
    .describe("Property-type by NAME (locale-aware), e.g. 'Office'/'Kontor'; alternative to the numeric propertyType id."),
  lang: z
    .enum(["sv", "en"])
    .optional()
    .describe("Language for names/descriptions; English default, 'sv' for Swedish."),
  includeGeometry: z
    .boolean()
    .default(false)
    .describe("false (default, lean) omits geometry; true opts the heavy geometry member into the response via ?fields=."),
  sort,
  page,
  pageSize,
};

const PropertyTypeRef = z.object({
  id: z.number().int().describe("Property-type id; use as the propertyType filter, e.g. 1."),
  name: z.string().describe("Property-type label, e.g. 'Kontor'/'Office'."),
}).passthrough();

const MunicipalityRef = z.object({
  id: z.number().int().describe("Municipality id; use as the municipalityId filter, e.g. 21."),
  name: z.string().describe("Municipality name, e.g. 'Stockholm'."),
  code: z.string().nullable().optional().describe("Official municipality code (Sweden: SCB kommunkod), e.g. '0180'."),
}).passthrough();

const PropertyUnitRow = z.object({
  sedisId: z
    .string()
    .describe("Stable Comp sedisId; pass to get_comp_timeseries via sedisIdIn, e.g. 'PU-1'."),
  name: z.string().nullable().optional().describe("Property-unit display name."),
  propertyType: PropertyTypeRef.nullable().optional().describe("The unit's property type as { id, name }."),
  municipality: MunicipalityRef.nullable().optional().describe("The unit's municipality as { id, name, code }."),
  countryCode: z.string().nullable().optional().describe("ISO 3166-1 alpha-2 country of the unit, e.g. 'SE'."),
  geometry: z
    .unknown()
    .nullable()
    .optional()
    .describe("GeoJSON geometry — present ONLY when includeGeometry=true (omitted by default)."),
  lastUpdatedUtc: z.string().nullable().optional().describe("ISO-8601 UTC last-update timestamp."),
}).passthrough();

export const searchPropertyUnitsOutput = {
  data: z.array(PropertyUnitRow).describe("Your matching property units (Fastighet)."),
  ...pagingShape,
};

// ---------------------------------------------------------------------------
// fastighetsbenchmark_list_samlingar → GET /fastighetsbenchmark/samlingar
// ---------------------------------------------------------------------------
// Tenant-scoped collections. Exposes `containingCompSedisIds` (an ID array, NOT
// nested objects) for reference-then-resolve fan-out (08-comp-composite §A6).

export const listSamlingarInput = {
  nameContains: z
    .string()
    .optional()
    .describe("Case-insensitive collection-name fragment, e.g. 'Stockholm offices'."),
  sort,
  page,
  pageSize,
};

const SamlingRow = z.object({
  sedisId: z.string().describe("Collection sedisId, e.g. 'SAM-abc123'."),
  name: z.string().nullable().optional().describe("Collection display name."),
  containingCompSedisIds: z
    .array(z.string())
    .nullable()
    .optional()
    .describe("Member Comp sedisIds (IDs, not nested objects); resolve via get_comp_timeseries sedisIdIn. Tenant-filtered — yours only."),
  lastUpdatedUtc: z.string().nullable().optional().describe("ISO-8601 UTC last-update timestamp."),
}).passthrough();

export const listSamlingarOutput = {
  data: z.array(SamlingRow).describe("Your collections (Samling)."),
  ...pagingShape,
};

// ---------------------------------------------------------------------------
// fastighetsbenchmark_list_jamforelseobjekt → GET /fastighetsbenchmark/jamforelseobjekt
// ---------------------------------------------------------------------------
// Tenant-scoped comparison zones (clones of a Sedis-owned SedisObjekt). The
// forward clone-lineage array `containsPropertyUnits` is opt-in (`detail`) and
// tenant-filtered (08-comp-composite §lineage / T-63-06).

export const listJamforelseobjektInput = {
  nameContains: z
    .string()
    .optional()
    .describe("Case-insensitive comparison-zone-name fragment, e.g. 'Stockholm'."),
  detail: z
    .boolean()
    .default(false)
    .describe("false (default, lean) omits lineage; true opts the tenant-filtered containsPropertyUnits array in via ?fields=."),
  sort,
  page,
  pageSize,
};

const JamforelseobjektRow = z.object({
  sedisId: z.string().describe("Comparison-zone sedisId; use as belongsToJamforelseobjektSedisId in search_property_units, e.g. 'JO-A'."),
  name: z.string().nullable().optional().describe("Comparison-zone display name, e.g. 'Stockholm'."),
  containsPropertyUnits: z
    .array(CompReference)
    .nullable()
    .optional()
    .describe("Forward clone lineage — YOUR property units in this clone's source SedisObjekt; present ONLY when detail=true. Tenant-filtered."),
  lastUpdatedUtc: z.string().nullable().optional().describe("ISO-8601 UTC last-update timestamp."),
}).passthrough();

export const listJamforelseobjektOutput = {
  data: z.array(JamforelseobjektRow).describe("Your comparison zones (Jämförelseobjekt)."),
  ...pagingShape,
};

// ---------------------------------------------------------------------------
// fastighetsbenchmark_list_reference_zones → GET /fastighetsbenchmark/reference-zones
// ---------------------------------------------------------------------------
// Shared Sedis-owned reference zones — identical for every key, NO tenant filter
// (ReferenceZonesController). Read-only; never writes. `name` is required on the
// underlying CompBaseResponse; `sourceName` is the external-reference provider.

export const listReferenceZonesInput = {
  nameContains: z
    .string()
    .optional()
    .describe("Case-insensitive reference-zone-name fragment, e.g. 'Stockholm'."),
  sort,
  page,
  pageSize,
};

const ReferenceZoneRow = z.object({
  sedisId: z.string().describe("Reference-zone sedisId, e.g. 'NH-2025'."),
  name: z.string().describe("Zone display name (required)."),
  sourceName: z
    .string()
    .nullable()
    .optional()
    .describe("External-reference source/provider, e.g. 'Nils Holgersson'."),
  insertedOnUtc: z.string().nullable().optional().describe("ISO-8601 UTC insert timestamp."),
  lastUpdatedUtc: z.string().nullable().optional().describe("ISO-8601 UTC last-update timestamp."),
}).passthrough();

export const listReferenceZonesOutput = {
  data: z.array(ReferenceZoneRow).describe("Shared Sedis-owned reference zones (identical for every key)."),
  ...pagingShape,
};

// ---------------------------------------------------------------------------
// fastighetsbenchmark_list_municipalities → GET /fastighetsbenchmark/municipalities
// ---------------------------------------------------------------------------
// Shared reference data (SED-1093): the ids the municipalityId filter takes.

export const listMunicipalitiesInput = {
  nameContains: z
    .string()
    .optional()
    .describe("Case-insensitive municipality-name fragment, e.g. 'Stockholm'."),
  code: z
    .string()
    .optional()
    .describe("Exact official municipality code (Sweden: SCB kommunkod), e.g. '0180'."),
  countryCode: z
    .string()
    .optional()
    .describe("ISO 3166-1 alpha-2 country, e.g. 'SE'."),
  sort,
  page,
  pageSize,
};

const MunicipalityRow = z.object({
  id: z.number().int().describe("Municipality id; use as municipalityId in search_property_units, e.g. 21."),
  name: z.string().describe("Municipality name, e.g. 'Stockholm'."),
  countryCode: z.string().describe("ISO 3166-1 alpha-2 country, e.g. 'SE'."),
  code: z.string().nullable().optional().describe("Official municipality code (Sweden: SCB kommunkod), e.g. '0180'; absent outside Sweden."),
}).passthrough();

export const listMunicipalitiesOutput = {
  data: z.array(MunicipalityRow).describe("Municipalities (shared reference data)."),
  ...pagingShape,
};

// ---------------------------------------------------------------------------
// fastighetsbenchmark_list_property_types → GET /fastighetsbenchmark/property-types
// ---------------------------------------------------------------------------
// Shared reference data (SED-1093): the EB0 domain — the ids the propertyType filter takes.

export const listPropertyTypesInput = {
  nameContains: z
    .string()
    .optional()
    .describe("Case-insensitive property-type-name fragment (names are Swedish), e.g. 'Kontor'."),
  sort,
  page,
  pageSize,
};

const PropertyTypeRow = z.object({
  id: z.number().int().describe("Property-type id; use as propertyType in search_property_units, e.g. 2."),
  name: z.string().describe("Property-type name (Swedish), e.g. 'Kontor'."),
}).passthrough();

export const listPropertyTypesOutput = {
  data: z.array(PropertyTypeRow).describe("Property types (shared reference data)."),
  ...pagingShape,
};
