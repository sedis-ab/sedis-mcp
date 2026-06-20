// scripts/build-mcpb.mjs — build the Claude Desktop one-click bundle (.mcpb).
//
// MCPB ("MCP Bundle", formerly DXT) is the standardized, single-file install for
// local stdio MCP servers in Claude Desktop. We esbuild the same server that
// `npx -y @sedis/mcp` runs into ONE self-contained ESM file (no node_modules to
// ship — sdk + zod are pure JS), drop a manifest.json next to it, and pack.
//
//   node scripts/build-mcpb.mjs     →  dist/sedis-mcp.mcpb
//
// The bundle's manifest exposes a single user_config field (the API key, stored
// in the OS keychain via sensitive:true). Claude Desktop provides the Node
// runtime, so the end user installs nothing else.

import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const stage = join(dist, "mcpb");
const serverDir = join(stage, "server");

// Keep the .mcpb version in lockstep with package.json (single source of truth).
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
if (manifest.version !== pkg.version) {
  manifest.version = pkg.version;
}

// 1) Clean staging.
rmSync(dist, { recursive: true, force: true });
mkdirSync(serverDir, { recursive: true });

// 2) Bundle src/index.ts → server/index.mjs (single self-contained ESM file).
await build({
  entryPoints: [join(root, "src", "index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: join(serverDir, "index.mjs"),
  // node built-ins stay external; sdk + zod are inlined. Keeps the bundle ~MB.
  banner: {
    js: "// @sedis/mcp — bundled for Claude Desktop (MCPB). Source: https://github.com/sedis-ab/sedis-mcp",
  },
});

// 3) Stage the manifest (version synced above).
writeFileSync(
  join(stage, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);

// 3b) The bundled server reads its own version at runtime via
// createRequire("../package.json") (src/server.ts). In the npm layout that
// resolves to the package root; in the bundle it must sit one level above
// server/. Ship a minimal package.json with the version so it resolves.
writeFileSync(
  join(stage, "package.json"),
  JSON.stringify({ name: pkg.name, version: pkg.version, private: true }, null, 2) +
    "\n",
);

// 4) Optional icon.
if (existsSync(join(root, "icon.png"))) {
  cpSync(join(root, "icon.png"), join(stage, "icon.png"));
}

// 5) Validate + pack via the official CLI. Resolve its JS entry and run it with
// `node` directly — avoids the cross-platform .cmd/npx spawn pitfalls (EINVAL on
// Windows + Node 26). @anthropic-ai/mcpb is a devDependency, so it resolves locally.
const mcpbPkgDir = join(root, "node_modules", "@anthropic-ai", "mcpb");
const mcpbPkg = JSON.parse(
  readFileSync(join(mcpbPkgDir, "package.json"), "utf8"),
);
const binField = mcpbPkg.bin;
const binRel =
  typeof binField === "string"
    ? binField
    : (binField.mcpb ?? Object.values(binField)[0]);
const mcpbBin = join(mcpbPkgDir, binRel);
const run = (args) =>
  execFileSync(process.execPath, [mcpbBin, ...args], {
    cwd: root,
    stdio: "inherit",
  });

run(["validate", join(stage, "manifest.json")]);
const outFile = join(dist, "sedis-mcp.mcpb");
run(["pack", stage, outFile]);

console.log(`\n✓ Built ${outFile} (v${manifest.version})`);
