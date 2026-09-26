import { defineConfig, devices } from "@playwright/test"
import "dotenv/config"

/**
 * Dedicated Playwright configuration for background-sync.spec.ts.
 * The suite intentionally uses a production build served by vite preview
 * so the generated service worker is active. The normal Playwright config
 * remains responsible for the dev-server suites only.
 */
const swBaseURL = process.env.PLAYWRIGHT_SW_BASE_URL ?? (process.env.CI ? "http://localhost:4173" : "https://localhost:4173")

if (!process.env.VITE_API_URL) {
  process.env.VITE_API_URL = "http://localhost:8001"
}

export default defineConfig({
  testDir: "./tests",
  testMatch: "background-sync.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "blob" : "html",
  use: {
    baseURL: swBaseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "background-sync",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: swBaseURL,
        storageState: { cookies: [], origins: [] },
        ignoreHTTPSErrors: true,
      },
    },
  ],
  webServer: process.env.PLAYWRIGHT_SW_BASE_URL
    ? undefined
    : {
        command: "bunx vite build --config vite.config.sw-test.ts && bunx vite preview --config vite.config.sw-test.ts --port 4173 --strictPort",
        url: swBaseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        ignoreHTTPSErrors: true,
      },
})
