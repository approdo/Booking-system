import { defineConfig, devices } from '@playwright/test'

// Runs the same e2e tests (tests/e2e) against a site that is already online, e.g. right after a deploy
// (lesson G-053):
//
//   LIVE_URL=https://<owner>.github.io/<repo>/ npm run test:live
//
// There is no webServer here: nothing is started, the tests only open LIVE_URL. Its path must be the
// path of site.url in app/data/site.ts, because the tests compare page URLs with it.
const liveUrl = process.env.LIVE_URL

if (!liveUrl || !URL.canParse(liveUrl)) {
  throw new Error('Set LIVE_URL to the address of the deployed site, '
    + 'e.g. LIVE_URL=https://<owner>.github.io/<repo>/ npm run test:live')
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  // A live site is further away than the local preview.
  timeout: 60_000,
  use: {
    // Tests open pages with relative URLs such as './', so the base URL must end with '/'.
    baseURL: liveUrl.endsWith('/') ? liveUrl : `${liveUrl}/`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
