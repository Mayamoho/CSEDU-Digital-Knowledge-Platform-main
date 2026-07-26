import { defineConfig, devices } from "@playwright/test";

// End-to-end tests (SDD §8.3). These drive a real browser against a running
// stack — they do not start one. Point BASE_URL at whatever you want to verify:
//
//   BASE_URL=http://localhost:8080 pnpm test:e2e     # local compose
//   BASE_URL=https://devops.farefin.com pnpm test:e2e
//
// Deliberately not part of the deploy gate: they need the whole stack up, and a
// flaky browser test must not be able to block a release.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:8080",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
