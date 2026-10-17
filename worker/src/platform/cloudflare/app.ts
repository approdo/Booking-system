import { createCore } from '../../core/app'
import type { CoreOptions, Platform } from '../../core/app'
import { clientIp } from './clientIp'
import { D1Db } from './d1'
import type { Env } from './env'

/** What the core needs from one Worker call: D1 behind the database port, and the [vars] as settings. */
function platformOf(env: Env): Platform {
  const { DB, ...config } = env
  return { db: new D1Db(DB), config }
}

/**
 * The Worker: `fetch` answers the API, `scheduled` runs the daily purge (the Cron Trigger "10 0 * * *" of
 * wrangler.toml: 00:10 UTC, 07:10 Thai time). Tests create their own with a clock they control;
 * index.ts exports the real one.
 */
export function createApp(options: CoreOptions = {}) {
  const core = createCore(options)
  return {
    fetch(request: Request, env: Env): Promise<Response> {
      return core.handle(request, clientIp(request), platformOf(env))
    },

    async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
      await core.runDailyPurge(platformOf(env))
    },
  }
}
