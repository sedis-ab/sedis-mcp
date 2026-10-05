---
"@sedis/mcp": minor
---

Two new read-only tools for the shared reference data the property-unit filters take ids from:
`fastighetsbenchmark_list_municipalities` (by name or official code, e.g. SCB `0180`) and
`fastighetsbenchmark_list_property_types` (the EB0 domain). `fastighetsbenchmark_search_property_units`
gains an exact `name` filter, returns `municipality` as `{ id, name, code }` and the postal `address` (`streetNameAndNumber`, `postalCode`, `postalTown`, `countryCode`) (the schema
wrongly declared a `municipalityId` the API never sent), and `includeGeometry: true` works again — it asked
for `?fields=` values the API rejects, so every such call failed with 400.

`fastighetsbenchmark_get_comp_timeseries`: `valueDate` is documented as any quarter-end, not only 31 December, so
a model does not read every row as a year (SED-1092).
