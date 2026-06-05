// test/drift/openapi-parity.test.ts — D-06 read-surface drift guard.
//
// PURPOSE: fail CI the moment PartnerAPI v2 grows a READ endpoint that no
// registered MCP tool covers. The parity gap this whole phase closes (the MCP
// lagging the Phase-67 data-shape additions) existed because the hand-written
// tools had nothing structurally tying them to the spec. This guard makes future
// v2 read additions impossible to ship silently.
//
// OFFLINE by design (committed-snapshot pattern, RESEARCH §Pattern 4): the test
// imports a committed copy of the public /openapi/v2.json — it NEVER fetches live,
// so it runs everywhere (no secrets, no beta uptime dependency) and any spec change
// shows up as a reviewable diff to the fixture. Refresh the snapshot deliberately
// with `npm run snapshot:openapi` (which re-fetches it from beta) whenever a v2 read
// endpoint is added — that refresh + a COVERED-set edit is the one required step to
// adopt a new read endpoint into the MCP surface.

import { describe, it, expect } from "vitest";
// Vite resolves JSON imports natively; the committed snapshot is bundled at test time.
import spec from "../fixtures/openapi-v2.snapshot.json";

// The v2 read paths each registered tool calls (keep in sync with src/tools/*).
// Paths are the post-"/v2"-strip form. Adding a v2 read endpoint requires both a
// tool that calls it AND its path here (then `npm run snapshot:openapi`).
const COVERED = new Set<string>([
  // Bolagsanalys (src/tools/bolagsanalys.ts)
  "/bolagsanalys/companies", // bolagsanalys_list_companies
  "/bolagsanalys/parameters", // bolagsanalys_find_parameter
  "/bolagsanalys/data", // bolagsanalys_get_data (companyId optional → all companies)
  "/bolagsanalys/data/search", // bolagsanalys_search_data (D-03 batch; not yet on the beta snapshot — covered ahead of its deploy)
  // Fastighetsbenchmark (src/tools/fastighetsbenchmark.ts)
  "/fastighetsbenchmark/parameters", // fastighetsbenchmark_find_parameter
  "/fastighetsbenchmark/property-units", // fastighetsbenchmark_search_property_units
  "/fastighetsbenchmark/samlingar", // fastighetsbenchmark_list_samlingar
  "/fastighetsbenchmark/jamforelseobjekt", // fastighetsbenchmark_list_jamforelseobjekt
  "/fastighetsbenchmark/comp-data", // fastighetsbenchmark_get_comp_timeseries
  "/fastighetsbenchmark/reference-zones", // fastighetsbenchmark_list_reference_zones (D-02.4)
]);

// Endpoints intentionally NOT wrapped by a read tool:
//  - write endpoints — the published server is READ-ONLY this milestone (D-05);
//    no comp-uploads ingest / Samling mutation tools are exposed.
//  - operational endpoints — /status is a health ping, not partner read-data.
const ALLOWLIST = new Set<string>([
  "/fastighetsbenchmark/comp-uploads", // write (ingest) — read-only posture, D-05
  "/status", // operational health/status ping — not a data-read surface
]);

describe("v2 read-surface drift guard (D-06)", () => {
  it("every v2 read endpoint is covered by a tool (or explicitly allow-listed)", () => {
    const paths = (spec as { paths: Record<string, Record<string, unknown>> })
      .paths;
    const uncovered: string[] = [];

    for (const [rawPath, ops] of Object.entries(paths)) {
      const path = rawPath.replace(/^\/v2/, "");

      // A path is a READ surface if it has a GET op, or it is a filter-via-POST
      // /search endpoint (read-via-POST counts as read).
      const isRead = "get" in ops || path.endsWith("/search");
      if (!isRead) continue;

      // Single-resource GET-by-id (/{sedisId}, /{code}) is intentionally deferred
      // (list+filter covers it) — skip {…}-templated paths.
      if (path.includes("{")) continue;

      if (ALLOWLIST.has(path)) continue;

      // A /search path (filter-via-POST equivalent of a GET list) is covered when
      // its base GET path is covered — so the FBM *Search siblings do not
      // false-positive (only /bolagsanalys/data/search gets its own tool, D-03).
      if (path.endsWith("/search") && COVERED.has(path.replace(/\/search$/, ""))) {
        continue;
      }

      if (!COVERED.has(path)) uncovered.push(path);
    }

    expect(
      uncovered,
      `Uncovered v2 read endpoints (add a tool + COVERED entry, then \`npm run snapshot:openapi\`): ${uncovered.join(", ")}`,
    ).toEqual([]);
  });

  it("the committed snapshot is non-empty (guards against a truncated/failed fetch)", () => {
    const paths = (spec as { paths: Record<string, unknown> }).paths;
    expect(Object.keys(paths).length).toBeGreaterThan(0);
  });
});
