import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "frontend"),
      "@worldforge/shared": path.resolve(__dirname, "shared/src"),
    },
  },
});
