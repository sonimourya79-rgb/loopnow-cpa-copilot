import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // Unit tests only by default — pure/DB-free, safe to run with no
    // services up. Integration tests (*.integration.test.ts) need a live
    // Postgres and run via `npm run test:integration`.
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules/**", "src/**/*.integration.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/lib/rules/**", "src/lib/tools/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
