import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environmentMatchGlobs: [["frontend/**/*.{test,spec}.{ts,tsx}", "jsdom"]],
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "frontend"),
      "@worldforge/shared": path.resolve(__dirname, "shared/src"),
    },
  },
});
