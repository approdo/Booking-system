import type { D1Migration } from 'cloudflare:test'
import type { Env as WorkerEnv } from '../src/settings'

// The bindings the tests see through `env` from 'cloudflare:test': the Worker's own, plus the migrations
// that vitest.config.ts passes in.
declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}
