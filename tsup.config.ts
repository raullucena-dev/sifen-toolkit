import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "node22",
  },
  {
    entry: { "server/main": "src/server/main.ts" },
    format: ["esm"],
    sourcemap: true,
    target: "node22",
  },
]);
