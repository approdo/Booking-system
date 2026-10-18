import { existsSync, readFileSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'
import { localApiUrl, site } from './app/data/site'

// `npm run preview` serves the generated site on this port under the same path as the live site,
// e.g. http://localhost:4176/Booking-system/ (lesson G-010: a port no other local project uses).
const PREVIEW_PORT = 4176
const previewUrl = new URL(new URL(site.url).pathname, `http://localhost:${PREVIEW_PORT}`).href

const isCI = Boolean(process.env.CI)

// The tests book through the API on this machine. A build from `npm run generate` calls the live API
// instead, which refuses pages served from localhost (CORS), so every test that books would fail with a
// network error: stop here with the fix instead.
const generatedPage = new URL('./.output/public/index.html', import.meta.url)
if (existsSync(generatedPage) && !readFileSync(generatedPage, 'utf8').includes(localApiUrl)) {
  throw new Error(`The generated site does not call the local API (${localApiUrl}). `
    + 'Run `npm run generate:local` before the end-to-end tests.')
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? 'github' : 'list',
  use: {
    // Tests open pages with relative URLs such as './', which resolve under the site path.
    baseURL: previewUrl,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    // Tests run against the generated static site: run `npm run generate:local` first.
    {
      command: 'npm run preview',
      url: previewUrl,
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
    // The booking API the pages of that build call (localApiUrl, http://localhost:8787): the Worker on
    // this machine with a fresh local D1 (worker/scripts/e2e-server.mjs). No Cloudflare account is used.
    {
      command: 'npm run e2e:api',
      url: new URL('/health', localApiUrl).href,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
})
