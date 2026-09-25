import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config'

/**
 * Server / environment matrix
 * ---------------------------------------------------------------------
 * Two genuinely different frontend environments are in play here, and
 * each test suite is pinned to exactly one so there is never ambiguity
 * about what a suite is actually running against:
 *
 *  - "chromium" project (every spec except background-sync.spec.ts):
 *    the normal `bun run dev` Vite dev server at PLAYWRIGHT_BASE_URL /
 *    baseURL. vite.config.ts intentionally disables VitePWA's
 *    `devOptions`, so no service worker is ever registered here - this
 *    is exactly the environment foreground-sync.spec.ts exercises (the
 *    foreground fallback), and the one every other suite (login, roster,
 *    sync-status UI, etc.) already assumes.
 *
 *  - "background-sync" project (background-sync.spec.ts only): a real
 *    `vite build` + `vite preview` at PLAYWRIGHT_SW_BASE_URL / swBaseURL,
 *    using the test-only `vite.config.sw-test.ts`. Only a production
 *    build auto-registers the real generated service worker
 *    (importScripts-ing the unmodified `public/sw-sync.js`), which is
 *    what that suite specifically needs to test. Like `bun run dev`,
 *    `vite preview` inherits the base config's `server.https` (LAN dev
 *    certs), so this defaults to `https://` and the project below trusts
 *    that (self-signed, dev-only) certificate.
 *
 * Both default to Playwright managing their own server, and both can be
 * pointed at an already-running, externally-managed server instead by
 * setting the corresponding PLAYWRIGHT_*_BASE_URL env var (e.g. for the
 * physical Android/LAN dev flow) - in that case Playwright starts nothing
 * and just connects to what's already there.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173'
const swBaseURL = process.env.PLAYWRIGHT_SW_BASE_URL ?? 'https://localhost:4173'

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
      // background-sync.spec.ts runs in the dedicated "background-sync"
      // project below, against a SW-enabled production preview server -
      // not here.
      testIgnore: 'background-sync.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    // Isolated SW-enabled environment for background-sync.spec.ts. No
    // `setup` dependency: this suite never uses the authenticated storage
    // state (each test sets its own bare `access_token` directly, same as
    // the other pwa-queue suites), so it does not need a real login.
    {
      name: 'background-sync',
      testMatch: 'background-sync.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: swBaseURL,
        storageState: { cookies: [], origins: [] },
        // The preview server uses the same self-signed LAN dev
        // certificate as `bun run dev` (see the comment above).
        ignoreHTTPSErrors: true,
      },
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

  /* Run the required local server(s) before starting the tests. Each
   * entry is independent: PLAYWRIGHT_BASE_URL / PLAYWRIGHT_SW_BASE_URL
   * being set skips *only* that entry, leaving the other managed
   * automatically if needed. See the "Server / environment matrix"
   * comment above. */
  webServer: [
    ...(process.env.PLAYWRIGHT_BASE_URL
      ? []
      : [
          {
            command: 'bun run dev',
            url: baseURL,
            reuseExistingServer: !process.env.CI,
          },
        ]),
    ...(process.env.PLAYWRIGHT_SW_BASE_URL
      ? []
      : [
          {
            // Real production build + static preview, via the test-only
            // config - see vite.config.sw-test.ts for why this must be a
            // build rather than a dev server.
            command:
              'bunx vite build --config vite.config.sw-test.ts && bunx vite preview --config vite.config.sw-test.ts --port 4173 --strictPort',
            url: swBaseURL,
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            ignoreHTTPSErrors: true,
          },
        ]),
  ],
});
