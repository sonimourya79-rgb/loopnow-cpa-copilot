import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Integration tests need a real, reachable Postgres (`docker compose up
 * postgres` or the full stack) — they exercise actual Prisma writes/reads,
 * not mocks. Kept in a separate config/script from the unit suite so
 * `npm test` never silently fails just because Docker isn't running.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    // Integration tests share state in the same DB connection pool and can
    // race each other on the same rows if run in parallel workers.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
