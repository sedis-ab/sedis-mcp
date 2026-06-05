import { defineConfig } from "vitest/config";

// Minimal ESM vitest config. The suites (contract/smoke/security/errors) land in
// later plans; this establishes the runner so `npm test` is wired from Wave 0.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
