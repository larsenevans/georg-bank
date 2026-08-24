/// <reference types="node" />
import { defineConfig, devices } from '@playwright/test'
import { loadEnvConfig } from '@next/env'
import { nothingPhone1 } from './e2e/devices/nothing-phone-1'

// Load .env / .env.local so SITE_GATE_PASSWORD, TEST_USER_*, etc. work in E2E helpers.
loadEnvConfig(process.cwd())

const isProduction = !!process.env.BASE_URL
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3030'

const mobileFolderIgnore = [
  /production-check\.spec\.ts/,
  /prod-safari-smoke\.spec\.ts/,
  /prod-smoke-qr\.spec\.ts/,
  /iphone\//,
  /iphone-14-plus\//,
  /iphone-17-air\//,
  /nothing-phone-1\//,
]

export default defineConfig({
  testDir: './e2e',
  fullyParallel: !isProduction, // serial in prod to avoid rate limits
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  // CI: serial workers avoid guest-auth / DB pool flakiness across parallel suites
  workers: process.env.CI || isProduction ? 1 : 2,
  reporter: [['html'], ['list']],
  timeout: process.env.CI ? 90000 : 60000,

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    extraHTTPHeaders: {
      'X-Tailscale-User-Login': 'playwright-e2e',
    },
    // channel: 'chrome',
    // Extra time for production (network latency) and cold CI
    actionTimeout: process.env.CI || isProduction ? 20000 : 10000,
    navigationTimeout: process.env.CI || isProduction ? 30000 : 15000,
  },

  projects: [
    // Setup project – runs login once and stores session
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'production',
      testMatch: /production-check\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: { cookies: [], origins: [] },
      },
    },
    {
      name: 'chromium',
      testIgnore: mobileFolderIgnore,
      use: {
        ...devices['Desktop Chrome'],
        // Ensure CI runs Chromium in a desktop-sized viewport so desktop-only helpers work.
        // This prevents openDashboardMenu from detecting a "mobile" width and throwing.
        viewport: { width: 1280, height: 800 },
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'Mobile Chrome',
      testIgnore: mobileFolderIgnore,
      use: {
        ...devices['Pixel 5'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    // Modern iPhone suites – shared e2e/iphone/ specs, official Playwright presets
    {
      name: 'iPhone 15',
      testMatch: /iphone\/.*\.spec\.ts/,
      use: {
        ...devices['iPhone 15'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'iPhone 15 Pro',
      testMatch: /iphone\/.*\.spec\.ts/,
      use: {
        ...devices['iPhone 15 Pro'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'iPhone 17',
      testMatch: /iphone\/.*\.spec\.ts/,
      use: {
        ...devices['iPhone 17'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'iPhone 17 Pro',
      testMatch: /iphone\/.*\.spec\.ts/,
      use: {
        ...devices['iPhone 17 Pro'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'iPhone Air',
      testMatch: /iphone\/.*\.spec\.ts/,
      use: {
        // Official preset is "iPhone Air" (iPhone 17 Air family); npm: test:iphone-17-air
        ...devices['iPhone Air'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    // Legacy – excluded from npm run test:iphone; still runnable via --project
    {
      name: 'iPhone 14 Plus',
      testMatch: /iphone-14-plus\/.*\.spec\.ts/,
      use: {
        ...devices['iPhone 14 Plus'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'Nothing Phone 1',
      testMatch: /nothing-phone-1\/.*\.spec\.ts/,
      use: {
        ...nothingPhone1,
        storageState: { cookies: [], origins: [] },
      },
    },
  ],

  // Only start local server when NOT targeting production
  ...(isProduction
    ? {}
    : {
        webServer: {
          command: 'npm run build && npm run start',
          // Static asset returns 200 without auth/guest redirects (root may 307).
          url: 'http://localhost:3030/manifest.json',
          reuseExistingServer: true,
          timeout: 180000,
          env: {
            SITE_GATE_ENABLED: 'false',
            DISABLE_RATE_LIMIT: 'true',
          },
        },
      }),
})
