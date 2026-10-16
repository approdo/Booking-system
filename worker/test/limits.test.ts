import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { addDays, SERVICE_MAX_COUNT } from '../../app/utils/bookingRules'
import { rowsReadCounter, testApi, TODAY } from './helpers'

/**
 * Nothing one visitor does may make the API read more and more rows (security review of BK-005). D1's free
 * plan reads 5,000,000 rows a day for everyone, and D-008 promises that reading keeps working when a bot
 * fills the demo. So a sandbox holds at most SERVICE_MAX_COUNT services and BOOKINGS_PER_SANDBOX new
 * bookings, and a request that can be repeated (a read, or a write that is refused) never reads more than
 * MAX_ROWS_READ rows, however much was written before it.
 *
 * Measured with the local D1 (2026-10-17), rows read by a sandbox filled to both limits (by the starting
 * data in brackets): GET /api/shop 72 (31), GET /api/availability 110 (38), GET /api/admin/bookings 40, a
 * refused booking 110. An accepted booking reads more, up to about 240 for the last one, but a sandbox
 * accepts at most BOOKINGS_PER_SANDBOX of them.
 */
const MAX_ROWS_READ = 150

describe('reads stay small however much one visitor writes (D-008)', () => {
  it(`refuses a service above SERVICE_MAX_COUNT (${SERVICE_MAX_COUNT}), and reading the shop stops growing`, async () => {
    const reads = rowsReadCounter()
    const api = testApi({ env: { DB: reads.db, ADMIN_CHANGES_PER_MINUTE: '1000' } })
    const { session, sandbox } = await api.login()
    const addService = (n: number) => api.request('POST', '/api/admin/services', {
      token: session,
      body: { categoryId: 'oil', name: `บริการทดลอง ${n}`, options: [{ minutes: 60, price: 500 }] },
    })
    const serviceNames = async () =>
      ((await api.request('GET', '/api/admin/shop', { token: session })).body.services as { name: string }[]).map(service => service.name)

    const seedCount = (await serviceNames()).length
    for (let n = seedCount; n < SERVICE_MAX_COUNT; n++) {
      expect((await addService(n)).status, `service ${n + 1}`).toBe(201)
    }
    const readShop = async () => {
      reads.reset()
      expect((await api.request('GET', '/api/shop', { token: sandbox })).status).toBe(200)
      return reads.total
    }
    const readsWhenFull = await readShop()

    for (let n = SERVICE_MAX_COUNT; n < SERVICE_MAX_COUNT + 10; n++) {
      reads.reset()
      expect(await addService(n), `service ${n + 1}`).toMatchObject({
        status: 400,
        body: { error: 'invalid_input', fields: { services: 'services_too_many' } },
      })
      expect(reads.total, `rows read to refuse service ${n + 1}`).toBeLessThanOrEqual(MAX_ROWS_READ)
    }

    // The new services follow the starting ones, in the order they were added.
    const names = await serviceNames()
    expect(names).toHaveLength(SERVICE_MAX_COUNT)
    expect(names.slice(seedCount)).toEqual(Array.from({ length: SERVICE_MAX_COUNT - seedCount }, (_, i) => `บริการทดลอง ${seedCount + i}`))
    expect(await readShop()).toBe(readsWhenFull)
    expect(readsWhenFull).toBeLessThanOrEqual(MAX_ROWS_READ)
  })

  it('refuses a booking above BOOKINGS_PER_SANDBOX, and the back office list stops growing', async () => {
    const reads = rowsReadCounter()
    // The 10-minute limit is lifted so that this test reaches the limit per sandbox.
    const api = testApi({ env: { DB: reads.db, BOOKINGS_PER_10_MINUTES: '1000' } })
    const limit = Number(env.BOOKINGS_PER_SANDBOX)
    expect(limit).toBeGreaterThan(0)
    // One hour apart, ten a day from tomorrow: every one of them is a free time.
    const slot = (n: number) => ({ date: addDays(TODAY, 1 + Math.floor(n / 10)), time: `${10 + (n % 10)}:00` })

    const first = await api.book(slot(0))
    const token = first.body.sandbox.token as string
    for (let n = 1; n < limit; n++) {
      expect((await api.book(slot(n), { token })).status, `booking ${n + 1}`).toBe(201)
    }
    expect(await api.book(slot(limit), { token })).toMatchObject({ status: 429, body: { error: 'rate_limited' } })

    const { session } = await api.login({ token })
    reads.reset()
    const list = await api.request('GET', '/api/admin/bookings', { token: session })
    expect((list.body.bookings as { isNew: boolean }[]).filter(booking => booking.isNew)).toHaveLength(limit)
    expect(reads.total, 'rows read by GET /api/admin/bookings').toBeLessThanOrEqual(MAX_ROWS_READ)

    reads.reset()
    expect((await api.request('GET', '/api/availability?minutes=60&therapist=any', { token })).status).toBe(200)
    expect(reads.total, 'rows read by GET /api/availability').toBeLessThanOrEqual(MAX_ROWS_READ)

    reads.reset()
    expect((await api.book(slot(limit + 1), { token })).status).toBe(429)
    expect(reads.total, 'rows read to refuse a booking').toBeLessThanOrEqual(MAX_ROWS_READ)
  })
})
