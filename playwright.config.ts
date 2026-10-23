import { defineConfig, devices } from "@playwright/test";

const port = 3100;
// Next.js allows one dev server per folder. If one is already running (e.g. `pnpm dev` on 3000),
// run with E2E_BASE_URL=http://localhost:3000 to test against it instead of starting another.
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  // One dev server serves every worker; more than 4 locally makes it queue requests for seconds.
  workers: process.env.CI ? undefined : 4,
  // A dev server compiling routes under parallel workers can take over 5 s for a server round trip;
  // the app's own budget (NFR-1) is met by optimistic updates, which the assertions see at once.
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: external ?? `http://localhost:${port}`, trace: "retain-on-failure" },
  projects: [
    { name: "chromium", testIgnore: /calendar\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    // Phase 3: the owner's calendar is connected for the whole file, which other specs must not see, so it
    // runs alone after everything else. It needs the edge functions served (`pnpm functions:e2e`).
    { name: "calendar", testMatch: /calendar\.spec\.ts/, dependencies: ["chromium"], fullyParallel: false, use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: [
    // A stand-in for Google (OAuth, tokeninfo, Calendar events), so calendar sync is tested without Google.
    { command: "node e2e/fake-google/server.mjs", url: "http://localhost:4010/__state", reuseExistingServer: true },
    ...(external
      ? []
      : [
          {
            command: `pnpm dev --port ${port}`,
            url: `http://localhost:${port}/login`, // a public page: "/" redirects
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
          },
        ]),
  ],
});
