import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

// The Worker's tests run inside the Workers runtime (workerd, through Miniflare) with a local D1 database:
// no Cloudflare account, no network. The migrations are read here, in Node (paths are relative to this
// folder, where `npm test` runs), and applied by test/setup.ts before every test.
export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations')
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.toml' },
        miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
      }),
    ],
    test: {
      include: ['test/**/*.test.ts'],
      setupFiles: ['./test/setup.ts'],
    },
  }
})
