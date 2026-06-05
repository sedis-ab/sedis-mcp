// test/contract/fastighetsbenchmark.contract.test.ts — contract / v2-drift detector (MCP-01).
//
// For each fastighetsbenchmark_* tool, call it in-process against LIVE alpha/beta v2
// with a known-good arg, then safeParse its `structuredContent` against the declared
// Zod outputSchema. Extra fidelity assertions on the time-series tool (T-63-07):
//   - every CompDatum row carries `dataType` AND its matching value member
//   - every returned `valueDate` ∈ the requested [fromDate, toDate] span (period alignment)
//
// `describe.runIf`-guarded on live-v2 secrets; SKIPS cleanly with no secrets.
// Secrets CI must provide: SEDIS_API_BASE_URL, SEDIS_API_KEY_A, A_KNOWN_SEDIS_ID
// (a SedisId Customer A can read). Optional: A_KNOWN_FB_PARAMETER.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import {
  findParameterOutput,
  searchPropertyUnitsOutput,
  listSamlingarOutput,
  listJamforelseobjektOutput,
  listReferenceZonesOutput,
} from "../../src/schemas/fastighetsbenchmark.js";
import { getCompTimeseriesOutput } from "../../src/schemas/compData.js";
import { connectInProcess, type InProcessHandle } from "../_util/inProcess.js";

const BASE = process.env.SEDIS_API_BASE_URL;
const KEY = process.env.SEDIS_API_KEY_A;
const A_SEDIS_ID = process.env.A_KNOWN_SEDIS_ID; // a SedisId Customer A owns/can read
const A_PARAM = process.env.A_KNOWN_FB_PARAMETER; // optional parameterCode for the series
const A_PROPERTY_TYPE_NAME = process.env.A_KNOWN_PROPERTY_TYPE_NAME ?? "Kontor"; // D-02.2 name filter, e.g. 'Kontor'/'Office'

const FROM = "2016-01-01";
const TO = "2026-12-31";

describe.runIf(Boolean(BASE && KEY))(
  "contract: fastighetsbenchmark_* vs declared outputSchema",
  () => {
    let handle: InProcessHandle | undefined;

    beforeEach(() => {
      process.env.SEDIS_API_KEY = KEY!;
    });
    afterEach(async () => {
      await handle?.close();
      handle = undefined;
    });

    async function call(name: string, args: Record<string, unknown>) {
      handle = await connectInProcess();
      const res = await handle.client.callTool({ name, arguments: args });
      expect(res.isError, JSON.stringify(res.content)).not.toBe(true);
      return res;
    }

    function expectPaging(sc: unknown): void {
      const env = sc as { page?: unknown; totalCount?: unknown };
      expect(env.page, "paging envelope: page present").toBeTypeOf("number");
      // totalCount is OMITTED by v2 when count=false (the bulk-paging opt-out); when present it is number|null.
      if (Object.prototype.hasOwnProperty.call(env, "totalCount") && env.totalCount !== null) {
        expect(env.totalCount, "paging envelope: totalCount numeric when present").toBeTypeOf("number");
      }
    }

    it("find_parameter structuredContent passes findParameterOutput", async () => {
      const res = await call("fastighetsbenchmark_find_parameter", { pageSize: 5 });
      const parsed = z.object(findParameterOutput).safeParse(res.structuredContent);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      expectPaging(res.structuredContent);
    });

    it("search_property_units structuredContent passes searchPropertyUnitsOutput", async () => {
      const res = await call("fastighetsbenchmark_search_property_units", { pageSize: 5 });
      const parsed = z.object(searchPropertyUnitsOutput).safeParse(res.structuredContent);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      expectPaging(res.structuredContent);
    });

    it("list_samlingar structuredContent passes listSamlingarOutput", async () => {
      const res = await call("fastighetsbenchmark_list_samlingar", { pageSize: 5 });
      const parsed = z.object(listSamlingarOutput).safeParse(res.structuredContent);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      expectPaging(res.structuredContent);
    });

    it("list_jamforelseobjekt structuredContent passes listJamforelseobjektOutput", async () => {
      const res = await call("fastighetsbenchmark_list_jamforelseobjekt", { pageSize: 5 });
      const parsed = z.object(listJamforelseobjektOutput).safeParse(res.structuredContent);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      expectPaging(res.structuredContent);
    });

    // ------------------------------------------------------------------------
    // D-02.4 (reference zones) + D-02.2 (propertyTypeName) — new parity tools
    // ------------------------------------------------------------------------

    it("list_reference_zones structuredContent passes listReferenceZonesOutput (D-02.4)", async () => {
      const res = await call("fastighetsbenchmark_list_reference_zones", { pageSize: 5 });
      const parsed = z.object(listReferenceZonesOutput).safeParse(res.structuredContent);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      expectPaging(res.structuredContent);
      // Reference zones are shared Sedis-owned data (no tenant filter) — at least one
      // zone should be visible to any key when the catalogue is populated.
      const rows = (res.structuredContent as { data?: Array<{ name?: string }> }).data ?? [];
      for (const row of rows) {
        expect(row.name, "every reference-zone row carries a required name").toBeTruthy();
      }
    });

    it("search_property_units accepts the propertyTypeName name filter (D-02.2)", async () => {
      // Name-based, locale-aware property-type filter (alternative to the numeric id).
      const res = await call("fastighetsbenchmark_search_property_units", {
        propertyTypeName: A_PROPERTY_TYPE_NAME,
        pageSize: 5,
      });
      const parsed = z.object(searchPropertyUnitsOutput).safeParse(res.structuredContent);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      expectPaging(res.structuredContent);
    });

    it.runIf(Boolean(A_SEDIS_ID))(
      "get_comp_timeseries passes outputSchema + datatype fidelity + period alignment",
      async () => {
        const res = await call("fastighetsbenchmark_get_comp_timeseries", {
          sedisIdIn: A_SEDIS_ID!,
          parameterCode: A_PARAM, // undefined → all parameters; callV2 drops it
          fromDate: FROM,
          toDate: TO,
          pageSize: 50,
          count: false,
        });

        const parsed = z.object(getCompTimeseriesOutput).safeParse(res.structuredContent);
        expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
        expectPaging(res.structuredContent);

        const rows = (res.structuredContent as {
          data?: Array<{
            dataType?: string;
            valueDate?: string;
            figure?: number | null;
            boolean?: boolean | null;
            enum?: { value: number; name: string; enumType: string } | null;
            date?: string | null;
          }>;
        }).data ?? [];

        for (const row of rows) {
          // Datatype fidelity (T-63-07): dataType present + the matching member set.
          expect(row.dataType, "every row carries a dataType").toBeTruthy();
          switch (row.dataType) {
            case "decimal":
              expect(row.figure, "decimal → figure").not.toBeUndefined();
              break;
            case "boolean":
              expect(row.boolean, "boolean → boolean").not.toBeUndefined();
              break;
            case "enum":
              expect(row.enum?.name, "enum → enum.name (never a raw int)").toBeTruthy();
              break;
            case "date":
              expect(row.date, "date → date").not.toBeUndefined();
              break;
          }

          // Period alignment: every valueDate ∈ the requested [FROM, TO] span.
          if (row.valueDate) {
            expect(row.valueDate >= FROM && row.valueDate <= TO, `valueDate ${row.valueDate} in span`).toBe(true);
          }
        }
      },
    );
  },
);
