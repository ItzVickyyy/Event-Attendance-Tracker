import { defineConfig, devices } from '@playwright/test';
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
 * config instead: see `playwright.background-sync.config.ts`, run via
 * `bunx playwright test --config=playwright.background-sync.config.ts tests/background-sync.spec.ts`.
 *
 * `baseURL` defaults to Playwright managing its own dev server, and can be
 * pointed at an already-running, externally-managed server instead by
 * setting PLAYWRIGHT_BASE_URL (e.g. for the physical Android/LAN dev
 * flow) - in that case Playwright starts nothing and just connects to
 * what's already there.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'https://localhost:5173'

if (!process.env.VITE_API_URL) {
  process.env.VITE_API_URL = 'http://localhost:8000'
}

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI ? 'blob' : 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },

    {
      name: 'chromium',
      // background-sync.spec.ts runs entirely under its own dedicated
      // config (playwright.background-sync.config.ts) against a
      // SW-enabled production preview server - not here.
      testIgnore: 'background-sync.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
        ignoreHTTPSErrors: true,
      },
      dependencies: ['setup'],
    },

    // {
    //   name: 'firefox',
    //   use: {
    //     ...devices['Desktop Firefox'],
    //     storageState: 'playwright/.auth/user.json',
    //   },
    //   dependencies: ['setup'],
    // },

    // {
    //   name: 'webkit',
    //   use: {
    //     ...devices['Desktop Safari'],
    //     storageState: 'playwright/.auth/user.json',
    //   },
    //   dependencies: ['setup'],
    // },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* This config's own, single server: the normal `bun run dev` Vite dev
   * server. background-sync.spec.ts's dedicated production build/preview
   * server lives entirely in playwright.background-sync.config.ts - see
   * the "Server / environment matrix" comment above for why a single
   * global `webServer` array can no longer represent both environments. */
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'bun run dev',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        // Separate from (and in addition to) the chromium project's
        // `use.ignoreHTTPSErrors` above: this one governs Playwright's own
        // Node-side readiness probe that polls `url` before any test or
        // browser starts, and it does not inherit from `use`. Without it,
        // that probe rejects the self-signed LAN dev certificate and the
        // server is never considered "ready", even though `bun run dev`
        // started successfully and the URL responds 200 to a real request.
        ignoreHTTPSErrors: true,
      },
});