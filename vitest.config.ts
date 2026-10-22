import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 20_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/server/main.ts"],
      reporter: ["text", "json-summary", "lcov"],
      thresholds: { lines: 85, functions: 85, branches: 85, statements: 85 },
    },
  },
});
