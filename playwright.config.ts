import { defineConfig, devices } from '@playwright/test'
import { site } from './app/data/site'

// `npm run preview` serves the generated site on this port under the same path as the live site,
// e.g. http://localhost:4176/Booking-system/ (lesson G-010: a port no other local project uses).
const PREVIEW_PORT = 4176
const previewUrl = new URL(new URL(site.url).pathname, `http://localhost:${PREVIEW_PORT}`).href

const isCI = Boolean(process.env.CI)

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
  // Tests run against the generated static site: run `npm run generate` first.
  webServer: {
    command: 'npm run preview',
    url: previewUrl,
    reuseExistingServer: !isCI,
    timeout: 60_000,
  },
})
