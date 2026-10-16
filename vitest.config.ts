import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// Unit tests cover plain TypeScript (data rules, helpers of the scripts) and the few components that
// need nothing from Nuxt, so they run in Node without starting Nuxt. The Vue plugin compiles those
// .vue files. Browser tests live in tests/e2e and run with Playwright.
export default defineConfig({
  plugins: [vue()],
  test: {
    // The Worker's own tests (worker/test) run inside the Workers runtime: `npm run test:worker`.
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
})
