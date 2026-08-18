import { defineConfig, devices } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

// package.json is "type": "module", so Playwright loads this config as ESM —
// no CommonJS __dirname; derive it from import.meta.url instead.
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// CRED-ENVLOCAL: load the gitignored .env.local so E2E_* credentials reach the
// specs without shell exports — agent sessions (incl. mobile-driven Prompt3
// runs) launch playwright directly and must find the saved test logins.
// Hand-rolled parser (no dotenv dep in the frontend workspace); real env
// always wins over the file.
const envLocal = path.join(__dirname, '.env.local')
if (fs.existsSync(envLocal)) {
  for (const line of fs.readFileSync(envLocal, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
  }
}

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium-mobile',
      use: {
        ...devices['Pixel 5'],
        // Override to a wider viewport so nav is accessible in tests
        viewport: { width: 390, height: 844 },
      },
    },
  ],
})
