import { applyD1Migrations, env, reset } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { HOUR, rowsCounter, sandboxRowCounts, testApi } from './helpers'

/**
 * Today's starting data is written by the Worker itself, outside the write budget's refusals (src/seed.ts).
 * When the first requests of a day arrive at the same moment, they all see that it is missing; only one may
 * write it, the others must write nothing (BK-005 scope 13, D-011 M2).
 */

/**
 * Rows written by `requests` reads without a token sent at the same moment, from an empty D1, or on the
 * next Thai day after yesterday's starting data was written. Also returns the starting data that results.
 */
async function startingDataWrites(requests: number, options: { nextDay: boolean }) {
  await reset()
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
  const rows = rowsCounter()
  const api = testApi({ env: { DB: rows.db } })
  if (options.nextDay) {
    await api.request('GET', '/api/shop')
    api.advance(24 * HOUR)
  }
  rows.reset()
  const responses = await Promise.all(Array.from({ length: requests }, () => api.request('GET', '/api/shop')))
  expect(responses.map(response => response.status)).toEqual(Array.from({ length: requests }, () => 200))
  // Every answer shows the whole starting data.
  expect(new Set(responses.map(response => response.body.services.length)).size).toBe(1)
  return { written: rows.written, seed: await sandboxRowCounts('seed') }
}

describe('the starting data is written once a day (D-011 M2)', () => {
  for (const nextDay of [false, true]) {
    it(`writes it once when 30 requests arrive at the same moment ${nextDay ? 'on a new Thai day' : 'on an empty D1'}`, async () => {
      const once = await startingDataWrites(1, { nextDay })
      const together = await startingDataWrites(30, { nextDay })
      // Printed for the task record: `npx vitest run test/seedInstall.test.ts --silent=false` in worker/.
      console.info(`starting data (${nextDay ? 'new day' : 'empty D1'}): rows_written by 1 request ${once.written}, by 30 at once ${together.written}`)

      expect(once.written).toBeGreaterThan(20)
      expect(together.written).toBeLessThanOrEqual(once.written)
      expect(together.seed).toEqual(once.seed)
      expect(together.seed.bookings).toBe(7)
    })
  }
})
