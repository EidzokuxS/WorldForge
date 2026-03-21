import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["**/__tests__/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["./__tests__/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      "@worldforge/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
});
