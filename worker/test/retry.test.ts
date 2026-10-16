import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import type { Env } from '../src/settings'
import { SATURDAY_9AM } from './helpers'

/**
 * A D1 database that fails the next `failures` calls the way an overloaded D1 does, then works again.
 * Statements are wrapped so that their own first(), all() and run() can fail too; batch() gets the real ones.
 */
function flakyDatabase(failures: number) {
  let left = failures
  const real = new WeakMap<object, D1PreparedStatement>()
  const fail = () => {
    if (left > 0) {
      left--
      throw new Error('D1_ERROR: Database is overloaded. Requests are queued for too long.')
    }
  }
  const wrap = (statement: D1PreparedStatement): D1PreparedStatement => {
    const proxy = new Proxy(statement, {
      get(target, property) {
        if (property === 'bind') return (...values: unknown[]) => wrap(target.bind(...values))
        if (property === 'first' || property === 'all' || property === 'run' || property === 'raw') {
          return async (...args: unknown[]) => {
            fail()
            return (target[property] as (...rest: unknown[]) => unknown).apply(target, args)
          }
        }
        return Reflect.get(target, property, target)
      },
    })
    real.set(proxy, statement)
    return proxy
  }
  const database = {
    prepare: (sql: string) => wrap(env.DB.prepare(sql)),
    batch: async (statements: D1PreparedStatement[]) => {
      fail()
      return env.DB.batch(statements.map(statement => real.get(statement) ?? statement))
    },
  }
  return database as unknown as D1Database
}

async function getShop(failures: number) {
  const app = createApp({ now: () => SATURDAY_9AM })
  const response = await app.fetch(new Request('https://api.test/api/shop'), { ...env, DB: flakyDatabase(failures) } as Env)
  return { status: response.status, body: await response.json<{ error?: string }>() }
}

describe('when D1 fails (D-008 ง)', () => {
  it('tries once more and answers normally if the second try works', async () => {
    expect((await getShop(1)).status).toBe(200)
  })

  it('answers 503 backend_unavailable when the second try fails too', async () => {
    expect(await getShop(2)).toEqual({ status: 503, body: { error: 'backend_unavailable' } })
  })

  it('retries a failed write batch once', async () => {
    const app = createApp({ now: () => SATURDAY_9AM })
    // Warm up: the starting data is in D1, so the one failure lands on the booking's batch.
    await app.fetch(new Request('https://api.test/api/shop'), env)
    let batchFailures = 1
    const database = {
      prepare: (sql: string) => env.DB.prepare(sql),
      batch: async (statements: D1PreparedStatement[]) => {
        if (batchFailures > 0) {
          batchFailures--
          throw new Error('D1_ERROR: Network connection lost.')
        }
        return env.DB.batch(statements)
      },
    } as unknown as D1Database
    const response = await app.fetch(new Request('https://api.test/api/bookings', {
      method: 'POST',
      headers: { 'CF-Connecting-IP': '203.0.113.30' },
      body: JSON.stringify({ serviceId: 'thai-traditional', minutes: 60, therapistId: null, date: '2026-10-17', time: '12:00', name: 'ทดลอง ตัวอย่าง', phone: '02-000-0000' }),
    }), { ...env, DB: database } as Env)
    expect(response.status).toBe(201)
    expect(batchFailures).toBe(0)
  })
})
