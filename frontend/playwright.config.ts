import { defineConfig, devices } from '@playwright/test'
import 'dotenv/config'

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
