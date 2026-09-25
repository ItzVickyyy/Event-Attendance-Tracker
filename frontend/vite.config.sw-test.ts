/**
 * TEST-ONLY Vite configuration, used exclusively by the Playwright
 * "background-sync" project (see playwright.config.ts) to serve
 * background-sync.spec.ts.
 *
 * Why this file exists:
 *
 *  - background-sync.spec.ts specifically tests the production
 *    service-worker/background-sync architecture, so it needs a genuinely
 *    registered and active service worker (`navigator.serviceWorker.ready`
 *    must actually resolve).
 *  - The normal `bun run dev` server intentionally does NOT register one:
 *    vite.config.ts sets VitePWA's `devOptions.enabled` to `false` so the
 *    dev-mode service worker doesn't intercept/cache API requests during
 *    day-to-day development (see the comment next to that option). That is
 *    correct and must not change - foreground-sync.spec.ts exercises
 *    exactly that no-service-worker environment.
 *  - A `vite build` always emits and auto-registers the real generated
 *    service worker (which `importScripts`'s the unmodified
 *    `public/sw-sync.js`) regardless of `devOptions`, because `devOptions`
 *    only ever gates dev-server behavior, never production builds. So a
 *    real production build, served statically, is the correct - and only -
 *    way to get a genuinely active service worker for this suite.
 *
 * This file intentionally reuses the base `vite.config.ts` unchanged (same
 * plugins, same PWA/workbox config, same `public/sw-sync.js`) rather than
 * duplicating it, and only overrides `build.outDir`: the base config's
 * `outDir` points at `../backend/app/frontend` (the real production build
 * target - `backend/**` is out of scope for this test-infrastructure change
 * and must never be written to by a test run). Output instead goes to
 * `frontend/dist`, Vite's own conventional default build directory, which
 * is already gitignored by the existing `dist` entry in `.gitignore` - so
 * no additional ignore rule is needed for this throwaway test build.
 */
import { defineConfig, mergeConfig } from "vite"
import baseConfig from "./vite.config.ts"

export default defineConfig(
  mergeConfig(baseConfig, {
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  }),
)
