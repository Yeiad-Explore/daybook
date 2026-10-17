import { defineConfig, devices } from "@playwright/test";

const port = 3100;
// Next.js allows one dev server per folder. If one is already running (e.g. `pnpm dev` on 3000),
// run with E2E_BASE_URL=http://localhost:3000 to test against it instead of starting another.
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: external ?? `http://localhost:${port}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: external
    ? undefined
    : {
    command: `pnpm dev --port ${port}`,
    url: `http://localhost:${port}/login`, // a public page: "/" redirects
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
