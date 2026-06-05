// test/security/cross-tenant.test.ts — BLOCKING security suite (SC#5 / CFM#1).
//
// Proves the wrapper stayed INERT and v2's tenant isolation survives the MCP→REST
// hop: a Customer-A key asking `fastighetsbenchmark_get_comp_timeseries` for a
// SedisId owned by Customer B must get v2's 404 (NOT 403 — no existence leak),
// surfaced as the friendly "not found, or not in your tenant" `isError`, with ZERO
// of B's identifiers anywhere in the result body.
//
// `describe.runIf`-guarded on the three live-v2 secrets (CI repo secrets). With no
// secrets locally the suite SKIPS cleanly — it never embeds a real key.
//
// Secrets CI must provide (see 63-04-SUMMARY): SEDIS_API_BASE_URL, SEDIS_API_KEY_A,
// B_SEDIS_ID (a SedisId owned by Customer B but NOT Customer A).

import { describe, it, expect, afterEach } from "vitest";
import { connectInProcess, type InProcessHandle } from "../_util/inProcess.js";

const BASE = process.env.SEDIS_API_BASE_URL; // alpha/beta — from CI secret
const KEY_A = process.env.SEDIS_API_KEY_A; // Customer A's real key
const B_SEDIS_ID = process.env.B_SEDIS_ID; // a SedisId that belongs to Customer B

// Optional extra B identifiers to assert absence of (comma-separated): names,
// lineage refs, etc. Lets the PO harden the leak-scan beyond the bare id.
const B_EXTRA = (process.env.B_KNOWN_IDENTIFIERS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

describe.runIf(Boolean(BASE && KEY_A && B_SEDIS_ID))(
  "cross-tenant isolation survives the MCP→REST hop (BLOCKING)",
  () => {
    let handle: InProcessHandle | undefined;
    afterEach(async () => {
      await handle?.close();
      handle = undefined;
    });

    it("Customer-A key against Customer-B SedisId → 404-mapped isError, no B data", async () => {
      // The wrapper forwards this ONLY as the outbound X-Api-Key header.
      process.env.SEDIS_API_KEY = KEY_A;
      handle = await connectInProcess();

      const res = await handle.client.callTool({
        name: "fastighetsbenchmark_get_comp_timeseries",
        arguments: { sedisIdIn: B_SEDIS_ID! },
      });

      // v2 returns 404-not-403; the wrapper maps it to a friendly isError.
      expect(res.isError).toBe(true);

      const blob = JSON.stringify(res);
      // Friendly 404 mapping — never a raw 403/existence confirmation.
      expect(blob).toMatch(/not found|not in your tenant/i);
      expect(blob).not.toMatch(/forbidden|403/i);

      // No leakage of B's identifier(s) — the keystone assertion.
      expect(blob).not.toContain(B_SEDIS_ID!);
      for (const extra of B_EXTRA) {
        expect(blob).not.toContain(extra);
      }
    });

    it("the cross-tenant call exposes no structuredContent rows for B", async () => {
      process.env.SEDIS_API_KEY = KEY_A;
      handle = await connectInProcess();

      const res = await handle.client.callTool({
        name: "fastighetsbenchmark_get_comp_timeseries",
        arguments: { sedisIdIn: B_SEDIS_ID! },
      });

      // An errored call must NOT carry a populated data array (no stale-cache / no
      // partial leak). structuredContent is either absent or empty on the error path.
      const sc = res.structuredContent as { data?: unknown[] } | undefined;
      const rows = sc?.data ?? [];
      expect(rows).toHaveLength(0);
    });
  },
);
