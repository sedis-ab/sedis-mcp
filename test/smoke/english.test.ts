// test/smoke/english.test.ts — English-fidelity smoke (MCP-05 / CFM#3).
//
// Verifies the wrapper is INERT and non-translating: where v2 resolved an English
// `*En` label it surfaces verbatim; where only a Swedish `*Sv` exists it passes
// through byte-for-byte (no wrapper-side translation/guessing). v2 owns the
// `*En ?? *Sv` resolution — this test only proves the wrapper neither mangles nor
// invents text across the MCP→REST hop.
//
// `describe.runIf`-guarded on live-v2 secrets; SKIPS cleanly with no secrets.
// Secrets CI must provide: SEDIS_API_BASE_URL, SEDIS_API_KEY_A.
// Optional refinement:
//   A_ENGLISH_PARAMETER_FRAGMENT — a parameter name fragment whose `*En` is set
//                                  (default 'return', a common English benchmark term)
//   A_SV_ONLY_EXPECT             — an exact Swedish string a `*Sv`-only row must carry
//                                  verbatim (when provided, asserted as a substring)

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { connectInProcess, type InProcessHandle } from "../_util/inProcess.js";

const BASE = process.env.SEDIS_API_BASE_URL;
const KEY = process.env.SEDIS_API_KEY_A;
const EN_FRAGMENT = process.env.A_ENGLISH_PARAMETER_FRAGMENT ?? "return";
const SV_ONLY_EXPECT = process.env.A_SV_ONLY_EXPECT; // optional verbatim Swedish string

describe.runIf(Boolean(BASE && KEY))("English fidelity: *En surfaces, *Sv passes through verbatim", () => {
  let handle: InProcessHandle | undefined;

  beforeEach(() => {
    process.env.SEDIS_API_KEY = KEY!;
  });
  afterEach(async () => {
    await handle?.close();
    handle = undefined;
  });

  async function findParameters(nameContains: string, lang?: "sv" | "en") {
    handle = await connectInProcess();
    const res = await handle.client.callTool({
      name: "fastighetsbenchmark_find_parameter",
      arguments: { nameContains, pageSize: 25, lang },
    });
    expect(res.isError, JSON.stringify(res.content)).not.toBe(true);
    return (res.structuredContent as { data?: Array<{ name?: string; description?: string }> }).data ?? [];
  }

  it("a parameter known to have *En surfaces recognizable English text", async () => {
    const rows = await findParameters(EN_FRAGMENT);
    expect(rows.length, `no parameters matched '${EN_FRAGMENT}'`).toBeGreaterThan(0);

    // The English fragment we searched on should appear (case-insensitively) in at
    // least one resolved name — proving the *En label surfaced through the wrapper.
    const matched = rows.some((r) => (r.name ?? "").toLowerCase().includes(EN_FRAGMENT.toLowerCase()));
    expect(matched, `expected an English '${EN_FRAGMENT}' label among: ${rows.map((r) => r.name).join(" | ")}`).toBe(true);
  });

  it.runIf(Boolean(SV_ONLY_EXPECT))("a *Sv-only value passes through byte-for-byte (no translation)", async () => {
    // Search broadly and assert the configured Swedish string survives verbatim.
    const rows = await findParameters("");
    const haystack = JSON.stringify(rows);
    expect(haystack).toContain(SV_ONLY_EXPECT!);
  });

  it("lang='sv' is accepted and returns well-formed rows (D-02.3 locale passthrough)", async () => {
    // The wrapper forwards `lang` to v2's locale chain and stays inert. We assert the
    // passthrough is ACCEPTED and returns well-formed rows — NOT that sv differs from
    // the English default, because where EN translations are unpopulated v2 correctly
    // falls back to Swedish for both (the G-4 data gap; visible-Swedish fidelity is
    // verified manually in the beta rehearsal). If A_SV_ONLY_EXPECT is set, assert it
    // surfaces under lang='sv'.
    const rows = await findParameters("", "sv");
    expect(rows.length, "lang='sv' should return parameter rows").toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.name, "every sv row carries a name").toBeTruthy();
    }
    if (SV_ONLY_EXPECT) {
      expect(JSON.stringify(rows)).toContain(SV_ONLY_EXPECT);
    }
  });
});
