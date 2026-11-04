import { defineConfig } from "vitest/config";
import path from "node:path";

// API tests run route handlers directly against a real MySQL database
// (see tests/globalSetup.ts). Point MYSQL_* at a throwaway database.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/globalSetup.ts"],
    setupFiles: ["tests/setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      MYSQL_HOST:     process.env.MYSQL_HOST     ?? "127.0.0.1",
      MYSQL_PORT:     process.env.MYSQL_PORT     ?? "3306",
      MYSQL_USER:     process.env.MYSQL_USER     ?? "root",
      MYSQL_PASSWORD: process.env.MYSQL_PASSWORD ?? "test",
      MYSQL_DATABASE: process.env.MYSQL_DATABASE ?? "sportify_test",
      MYSQL_SSL:      "false",
    },
  },
});
