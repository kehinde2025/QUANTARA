import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});