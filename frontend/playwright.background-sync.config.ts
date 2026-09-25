import { defineConfig, devices } from "@playwright/test"
import "dotenv/config"

/**
 * Dedicated Playwright configuration for `tests/background-sync.spec.ts`.
 *
 * Why this file exists (see playwright.config.ts's removed "Server /
 * environment matrix" comment for the full history): Playwright's
 * `webServer` option is global to a config file, not scoped per-project.
 * Previously both the normal `bun run dev` server and this suite's
 * production build + preview server lived in a single `webServer` array in
 * `playwright.config.ts`, and Playwright started *every* entry in that
 * array regardless of which `--project` was selected. Selecting
 * `--project=background-sync` still started `bun run dev` (and then timed
 * out waiting on it), because the array itself is not project-scoped.
 *
 * The fix is architectural, not a flag: this suite gets its own top-level
 * Playwright config, and therefore its own independent `webServer` entry,
 * `use`/`baseURL`, and project list. Run it with:
 *
 *   bunx playwright test --config=playwright.background-sync.config.ts tests/background-sync.spec.ts
 *
 * `playwright.config.ts` (the normal config) no longer knows this suite
 * exists at all - it keeps managing `bun run dev` for every other suite,
 * unaffected by anything below.
 *
 * Why this needs a real production build (not `bun run dev`):
 * background-sync.spec.ts specifically tests the production
 * service-worker/background-sync architecture, so it needs a genuinely
 * registered and active service worker (`navigator.serviceWorker.ready`
 * must actually resolve). The normal `bun run dev` server intentionally
 * does NOT register one: vite.config.ts sets VitePWA's
 * `devOptions.enabled` to `false` so the dev-mode service worker doesn't
 * intercept/cache API requests during day-to-day development. A `vite
 * build` always emits and auto-registers the real generated service worker
 * (which `importScripts`'s the unmodified `public/sw-sync.js`) regardless
 * of `devOptions`, because `devOptions` only ever gates dev-server
 * behavior, never production builds. So a real production build, served
 * statically via `vite preview`, is the correct - and only - way to get a
 * genuinely active service worker for this suite. See
 * vite.config.sw-test.ts for the test-only build config this uses.
 *
 * No `setup` project / no auth storage state: this suite never uses the
 * authenticated storage state (each test sets its own bare `access_token`
 * directly via `localStorage`, and explicitly overrides `storageState` to
 * `{ cookies: [], origins: [] }` in its own `test.describe`), so it does
 * not need a real login and has no `setup` dependency here.
 *
 * Like `bun run dev`, `vite preview` inherits the base config's
 * `server.https` (LAN dev certs), so this defaults to `https://` and the
 * project below trusts that (self-signed, dev-only) certificate.
 */
const swBaseURL = process.env.PLAYWRIGHT_SW_BASE_URL ?? "https://localhost:4173"

if (!process.env.VITE_API_URL) {
  process.env.VITE_API_URL = "http://localhost:8000"
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
        // The preview server uses the same self-signed LAN dev
        // certificate as `bun run dev` (see the comment above).
        ignoreHTTPSErrors: true,
      },
    },
  ],

  /* This suite's own, independent server lifecycle. Only ever this one
   * entry - never `bun run dev`, and never a global array shared with the
   * normal config. */
  webServer: process.env.PLAYWRIGHT_SW_BASE_URL
    ? undefined
    : {
        // Real production build + static preview, via the test-only
        // config - see vite.config.sw-test.ts for why this must be a
        // build rather than a dev server.
        command:
          "bunx vite build --config vite.config.sw-test.ts && bunx vite preview --config vite.config.sw-test.ts --port 4173 --strictPort",
        url: swBaseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        ignoreHTTPSErrors: true,
      },
})