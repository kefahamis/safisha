import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Database tests seed an embedded Postgres; give them room on a slow machine.
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
