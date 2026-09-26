import { defineConfig, devices } from '@playwright/test'
import 'dotenv/config'

/**
 * Server / environment matrix
 * ---------------------------------------------------------------------
 * This config manages exactly one frontend environment: the normal
 * `bun run dev` Vite dev server at PLAYWRIGHT_BASE_URL / baseURL.
 * vite.config.ts intentionally disables VitePWA's `devOptions`, so no
 * service worker is ever registered here - this is exactly the
 * environment foreground-sync.spec.ts exercises (the foreground
 * fallback), and the one every other suite (login, roster, sync-status
 * UI, etc.) already assumes.
 *
 * `background-sync.spec.ts` is NOT part of this config. It needs a real
 * production build + `vite preview` (so a genuine service worker
 * registers), which is a fundamentally different server lifecycle -
 * Playwright's `webServer` option is global to a config file, not
 * project-scoped, so that suite cannot share this config's `webServer`
 * without also starting `bun run dev` for it. It has its own dedicated
 * config instead: see `playwright.background-sync.config.ts`.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? (process.env.CI ? 'http://localhost:5173' : 'https://localhost:5173')

if (!process.env.VITE_API_URL) {
  process.env.VITE_API_URL = 'http://localhost:8001'
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'blob' : 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      use: {
        ignoreHTTPSErrors: true,
      },
    },
    {
      name: 'chromium',
      testIgnore: 'background-sync.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
        ignoreHTTPSErrors: true,
      },
      dependencies: ['setup'],
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'bun run dev',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        ignoreHTTPSErrors: true,
      },
})
