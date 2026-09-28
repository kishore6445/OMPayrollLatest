import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 60000,
    // DB-backed integration tests share one Postgres connection pool; run serially.
    fileParallelism: false,
    pool: "forks",
    maxWorkers: 1,
    minWorkers: 1,
  },
});
