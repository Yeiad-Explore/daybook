import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

// Source: node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs", "supabase/functions/**/*.test.ts"],
  },
});
