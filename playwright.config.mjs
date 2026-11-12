import { defineConfig, devices } from "@playwright/test";
import { assertSafeChessDemoBrowserEnvironment } from "./e2e/demo-harness.mjs";

const baseURL = process.env.CHESS_DEMO_E2E_BASE_URL || "http://127.0.0.1:3000";
assertSafeChessDemoBrowserEnvironment(process.env, baseURL);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  outputDir: "test-results",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "clerk-setup",
      testMatch: /clerk\.setup\.mjs/,
    },
    {
      name: "chromium",
      dependencies: ["clerk-setup"],
      testMatch: /chess-demo\.spec\.mjs/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev -- -H 127.0.0.1 -p 3000",
    url: new URL("/chess-demo/login", baseURL).toString(),
    // Never silently attach to an unrelated server, even on localhost.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
