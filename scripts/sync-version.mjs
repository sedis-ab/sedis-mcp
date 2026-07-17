// sync-version.mjs — keep the committed version placeholders in lockstep with
// package.json (the single source of truth, bumped by changesets).
//
// Why this exists: three files carry their own `version` but must always match
// the npm package version:
//   - manifest.json  — the .mcpb (Claude Desktop bundle) version. build-mcpb.mjs
//     syncs it INTO the staged bundle at build time, but never writes it back, so
//     the committed value used to drift (it sat at 1.0.0 while npm was 1.1.2).
//   - server.json    — the MCP registry descriptor. release.yml stamps it from
//     package.json at publish time; we keep the committed value in lockstep too so
//     the repo never shows a misleading version.
//   - package-lock.json — `changeset version` bumps package.json but leaves the
//     lockfile's own two version fields behind, so they drifted the same way
//     (they read 1.1.2 while package.json was 1.1.5). Harmless to a build —
//     `npm ci` validates the dependency tree, not the root version — but it is
//     the same misleading-version problem, so it belongs here. This only
//     rewrites the version fields; the dependency tree is npm's to own.
//
// Run as part of a version bump: `npm run version-packages` does
// `changeset version` (bumps package.json + CHANGELOG) then this script.
// Idempotent — running it when everything already matches is a no-op.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

/** Set obj.version (and an optional nested path) to `version`; return true if changed. */
function syncFile(file, apply) {
  const path = join(root, file);
  const obj = JSON.parse(readFileSync(path, "utf8"));
  const before = JSON.stringify(obj);
  apply(obj);
  const after = JSON.stringify(obj);
  if (before === after) {
    console.log(`  = ${file} already at ${version}`);
    return false;
  }
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n");
  console.log(`  ✓ ${file} -> ${version}`);
  return true;
}

console.log(`Syncing version placeholders to package.json@${version}`);
syncFile("manifest.json", (m) => {
  m.version = version;
});
// server.json carries the version twice: top-level and on packages[0].
syncFile("server.json", (s) => {
  s.version = version;
  if (Array.isArray(s.packages) && s.packages[0]) s.packages[0].version = version;
});
// package-lock.json carries it twice as well: top-level and on the root package
// entry, keyed by the empty string.
syncFile("package-lock.json", (l) => {
  l.version = version;
  if (l.packages?.[""]) l.packages[""].version = version;
});
