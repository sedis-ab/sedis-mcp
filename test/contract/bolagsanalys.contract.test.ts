// test/contract/bolagsanalys.contract.test.ts — contract / v2-drift detector (MCP-01).
//
// For each bolagsanalys_* tool, call it in-process against LIVE alpha/beta v2 with a
// known-good arg, then `z.object(<tool>Output).safeParse(res.structuredContent)` and
// assert success. A failure here means the wrapper's declared Zod outputSchema has
// drifted from what v2 actually returns (stale wrapper vs additive v2 change) — the
// offline flywheel catches it before a partner does (T-63-13).
//
// `describe.runIf`-guarded on the live-v2 secrets; SKIPS cleanly with no secrets.
// Secrets CI must provide: SEDIS_API_BASE_URL, SEDIS_API_KEY_A. Optional refinement:
// A_KNOWN_COMPANY_ID / A_KNOWN_BA_PARAMETER for the get_data path.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import {
  listCompaniesOutput,
  findParameterOutput,
  getDataOutput,
  searchDataOutput,
} from "../../src/schemas/bolagsanalys.js";
import { connectInProcess, type InProcessHandle } from "../_util/inProcess.js";

const BASE = process.env.SEDIS_API_BASE_URL;
const KEY = process.env.SEDIS_API_KEY_A;
const KNOWN_COMPANY_ID = process.env.A_KNOWN_COMPANY_ID; // optional: a company id A can read
const BA_PARAM = process.env.A_KNOWN_BA_PARAMETER; // optional: a parameterCode for the all-companies path
const BA_QUARTER = process.env.A_KNOWN_QUARTER; // optional: a packed quarter, e.g. '20234'
// D-03 batch search wraps POST /bolagsanalys/data/search. That endpoint is part of the
// Phase-67 SHAPE-01 layer and may NOT be deployed on every beta build yet (the FBM
// /search siblings are, but /bolagsanalys/data/search can lag). Gate the live batch
// case on an explicit opt-in so the rest of the rehearsal isn't blocked by a 404 from
// a not-yet-deployed endpoint. Set BETA_HAS_DATA_SEARCH=1 once beta carries it.
const HAS_DATA_SEARCH = Boolean(process.env.BETA_HAS_DATA_SEARCH);

describe.runIf(Boolean(BASE && KEY))("contract: bolagsanalys_* vs declared outputSchema", () => {
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

  it("list_companies structuredContent passes listCompaniesOutput", async () => {
    const res = await call("bolagsanalys_list_companies", { pageSize: 5 });
    const parsed = z.object(listCompaniesOutput).safeParse(res.structuredContent);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expectPaging(res.structuredContent);
  });

  it("find_parameter structuredContent passes findParameterOutput", async () => {
    const res = await call("bolagsanalys_find_parameter", { pageSize: 5 });
    const parsed = z.object(findParameterOutput).safeParse(res.structuredContent);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expectPaging(res.structuredContent);
  });

  it("get_data structuredContent passes getDataOutput", async () => {
    // Prefer an explicit known company id; otherwise discover one from list_companies.
    let companyId = KNOWN_COMPANY_ID;
    if (!companyId) {
      const list = await call("bolagsanalys_list_companies", { pageSize: 1 });
      const rows = (list.structuredContent as { data?: { companyId?: string }[] }).data ?? [];
      companyId = rows[0]?.companyId;
    }
    expect(companyId, "need a company id to drive get_data").toBeTruthy();

    const res = await call("bolagsanalys_get_data", { companyId, pageSize: 5, count: false });
    const parsed = z.object(getDataOutput).safeParse(res.structuredContent);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expectPaging(res.structuredContent);
  });

  // -------------------------------------------------------------------------
  // D-03: multi-company Bolagsanalys (two mechanisms)
  // -------------------------------------------------------------------------

  it("get_data with companyId OMITTED returns many companies (all-companies path, D-03)", async () => {
    // Omitting companyId makes v2's GET fan out across companies. A parameterCode +
    // quarter keeps the result meaningful; provide them via env, else omit (still valid).
    const res = await call("bolagsanalys_get_data", {
      parameterCode: BA_PARAM,
      quarterId: BA_QUARTER,
      pageSize: 100,
      count: false,
    });
    const parsed = z.object(getDataOutput).safeParse(res.structuredContent);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    const rows = (res.structuredContent as { data?: { companyId?: string }[] }).data ?? [];
    const distinct = new Set(rows.map((r) => r.companyId));
    // The all-companies fan-out is only provable with a parameterCode: without one v2
    // returns data ordered by company, so a single page is single-company by construction.
    // With BA_PARAM (a single parameter across a quarter) the page spans many companies.
    if (BA_PARAM && rows.length > 1) {
      expect(distinct.size, "companyId omitted + a parameterCode should span multiple companies").toBeGreaterThan(1);
    } else {
      expect(rows.length, "all-companies path returns rows").toBeGreaterThan(0);
    }
  });

  it.runIf(HAS_DATA_SEARCH)(
    "search_data batch returns only the requested companies (D-03; set BETA_HAS_DATA_SEARCH=1)",
    async () => {
      // Discover 2-3 real company ids, then batch-fetch exactly those.
      const list = await call("bolagsanalys_list_companies", { pageSize: 3 });
      const ids = ((list.structuredContent as { data?: { companyId?: string }[] }).data ?? [])
        .map((r) => r.companyId)
        .filter((x): x is string => Boolean(x));
      expect(ids.length, "need ≥1 company id to drive search_data").toBeGreaterThan(0);

      const res = await call("bolagsanalys_search_data", { companyIds: ids, pageSize: 100, count: false });
      const parsed = z.object(searchDataOutput).safeParse(res.structuredContent);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      const returned = new Set(
        ((res.structuredContent as { data?: { companyId?: string }[] }).data ?? []).map((r) => r.companyId),
      );
      // Only the requested companies may appear (identity integrity).
      for (const got of returned) expect(ids).toContain(got);
    },
  );

  it("search_data rejects an over-cap (51 ids) request before any network call (D-03 cap)", async () => {
    // The .max(50) on companyIds rejects at the input layer — independent of beta/network.
    handle = await connectInProcess();
    const tooMany = Array.from({ length: 51 }, (_, i) => `C-${i}`);
    let threw = false;
    let res: { isError?: boolean } | undefined;
    try {
      res = await handle.client.callTool({
        name: "bolagsanalys_search_data",
        arguments: { companyIds: tooMany },
      });
    } catch {
      threw = true; // SDK rejected the input schema (InvalidParams) — also acceptable
    }
    expect(threw || res?.isError === true, "51 ids must be rejected by the .max(50) cap").toBe(true);
  });
});
