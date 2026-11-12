import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.CHESS_DEMO_E2E_BASE_URL || "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
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
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
