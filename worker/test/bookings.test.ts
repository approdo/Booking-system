import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { BOOKING_CODE_PATTERN } from '../../app/utils/bookingRules'
import { insertBookingStatement } from '../src/core/bookings'
import { newBookingCode, randomBytes, sha256 } from '../src/core/ids'
import type { Statement } from '../src/core/ports'
import { SATURDAY_9AM, testApi, TODAY } from './helpers'

/** A statement of the core as D1's own prepared statement, to run it in a batch of the test's choice. */
const prepared = (statement: Statement) => env.DB.prepare(statement.sql).bind(...statement.params)

describe('two bookings of the same time at the same moment (AC1 d)', () => {
  it('lets exactly one through and tells the other the time is taken', async () => {
    const api = testApi()
    const { body } = await api.book({ therapistId: 'somsri', time: '16:00' })
    const token = body.sandbox.token as string

    const attempts = await Promise.all([1, 2].map(() => api.book({ therapistId: 'nuanchan', time: '16:00' }, { token })))
    expect(attempts.map(attempt => attempt.status).sort()).toEqual([201, 409])
    expect(attempts.find(attempt => attempt.status === 409)?.body).toEqual({ error: 'slot_taken' })
  })

  it('guards the database write itself: the second of two identical inserts changes nothing', async () => {
    // Bypasses the API's own check before writing: two inserts for the same therapist and time in one
    // batch, which D1 runs one after the other.
    const api = testApi()
    const { body } = await api.book({ therapistId: 'somsri', time: '16:00' })
    const sandboxId = await sha256(body.sandbox.token)
    const booking = { sandboxId, serviceId: 'thai-traditional', serviceName: 'นวดแผนไทย', minutes: 60, price: 400, therapistId: 'preecha', date: TODAY, start: 16 * 60, customerName: 'ทดลอง ตัวอย่าง', phone: '020000000', createdAt: SATURDAY_9AM }
    const limits = { windowStart: 0, perWindow: 100, perSandbox: 100 } // far from both limits
    const results = await env.DB.batch([
      prepared(insertBookingStatement({ ...booking, code: 'NP-AAAA2' }, limits)),
      prepared(insertBookingStatement({ ...booking, code: 'NP-AAAA3' }, limits)),
    ])
    expect(results.map(result => result.meta.changes)).toEqual([1, 0])
  })

  it('also guards "no preference": two people taking the last free therapist get one booking', async () => {
    const api = testApi()
    const { body } = await api.book({ therapistId: 'somsri', time: '16:30' })
    const token = body.sandbox.token as string
    for (const therapistId of ['nuanchan', 'malai']) expect((await api.book({ therapistId, time: '16:30' }, { token })).status).toBe(201)

    // Only Preecha is free at 16:30 now.
    const attempts = await Promise.all([1, 2].map(() => api.book({ therapistId: null, time: '16:30' }, { token })))
    expect(attempts.map(attempt => attempt.status).sort()).toEqual([201, 409])
    const availability = await api.request('GET', '/api/availability?minutes=60&therapist=any', { token })
    expect(availability.body.days[0].slots.find((slot: { time: string }) => slot.time === '16:30').available).toBe(false)
  })
})

describe('a booking', () => {
  it('starts as pending, marked new, with a booking number, the price of the option and the sandbox token', async () => {
    const api = testApi()
    const response = await api.book({ serviceId: 'aroma-oil', minutes: 90, therapistId: 'malai', time: '10:00' })
    expect(response.status).toBe(201)
    expect(response.body.booking).toMatchObject({
      serviceId: 'aroma-oil', serviceName: 'นวดน้ำมันอโรมา', minutes: 90, price: 1000, therapistId: 'malai',
      date: TODAY, start: '10:00', end: '11:30', status: 'pending', isNew: true,
    })
    expect(response.body.booking.code).toMatch(BOOKING_CODE_PATTERN)
    expect(response.body.sandbox.token).toMatch(/^[\w-]{43}$/)
    expect(Date.parse(response.body.sandbox.expiresAt) - SATURDAY_9AM).toBe(24 * 60 * 60 * 1000)
  })

  it('is refused for a time that is taken, outside the opening hours or already past', async () => {
    const api = testApi()
    // Malai's starting data has a booking 13:00–14:30 today.
    expect((await api.book({ therapistId: 'malai', time: '13:30' })).body).toEqual({ error: 'slot_taken' })
    expect((await api.book({ time: '21:00' })).status).toBe(409)
    api.advance(6 * 60 * 60 * 1000) // 15:00 Thai time
    expect((await api.book({ time: '14:00', therapistId: 'preecha' })).status).toBe(409)
  })
})

describe('the contract of the design spec (AC10)', () => {
  it('accepts today to 13 days ahead and refuses day 14 with 400 and the field', async () => {
    const api = testApi()
    expect((await api.book({ date: '2026-10-30', time: '12:00' })).status).toBe(201)
    const response = await api.book({ date: '2026-10-31', time: '12:00' })
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'invalid_input', fields: { date: 'out_of_range' } })
  })

  it('refuses a one-letter name and the number 12345 with 400 naming each field (N8)', async () => {
    const api = testApi()
    const response = await api.book({ name: 'ก', phone: '12345' })
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'invalid_input', fields: { name: 'too_short', phone: 'invalid' } })
    expect((await api.book({ name: '  ', phone: '' })).body.fields).toEqual({ name: 'required', phone: 'required' })
    expect((await api.book({ name: 'ก'.repeat(101) })).body.fields).toEqual({ name: 'too_long' })
    expect((await api.book({ phone: '02000000000' })).body.fields).toEqual({ phone: 'invalid' })
  })

  it('stores accepted phone numbers as digits only, keeping the + of +66', async () => {
    const api = testApi()
    const accepted = [['02-000-0000', '020000000'], ['+66 2 000 0000', '+6620000000'], ['020-000-0000', '0200000000'], ['+66 20 000 0000', '+66200000000']]
    let token: string | undefined
    for (const [index, [phone, stored]] of accepted.entries()) {
      const response = await api.book({ phone, time: `1${index}:00` }, { token })
      expect(response.status, phone).toBe(201)
      expect(response.body.booking.phone, phone).toBe(stored)
      token ??= response.body.sandbox.token
    }
    const sandboxId = await sha256(token ?? '')
    const { results } = await env.DB.prepare('SELECT phone FROM bookings WHERE sandbox_id = ?1 AND is_seed = 0 ORDER BY start_min').bind(sandboxId).all<{ phone: string }>()
    expect(results.map(row => row.phone)).toEqual(accepted.map(([, stored]) => stored))
  })

  it('makes booking numbers that all match ^NP-[2-9A-HJ-NP-Z]{5}$ (200 of them)', () => {
    const codes = Array.from({ length: 200 }, () => newBookingCode(randomBytes))
    for (const code of codes) expect(code).toMatch(/^NP-[2-9A-HJ-NP-Z]{5}$/)
  })

  it('tries another booking number when the first is already used in the sandbox', async () => {
    // The first five random bytes spell NP-3F8KW, a booking number of the starting data.
    let firstCode = true
    const api = testApi({
      random: (length) => {
        if (length === 5 && firstCode) {
          firstCode = false
          return new Uint8Array([1, 13, 6, 17, 28])
        }
        return randomBytes(length)
      },
    })
    const response = await api.book({ time: '12:00' })
    expect(response.status).toBe(201)
    expect(response.body.booking.code).not.toBe('NP-3F8KW')
    expect(response.body.booking.code).toMatch(BOOKING_CODE_PATTERN)
  })

  it('names unknown services, lengths and therapists, and a time that is not a time', async () => {
    const api = testApi()
    expect((await api.book({ serviceId: 'nothing' })).body.fields).toEqual({ serviceId: 'unknown' })
    expect((await api.book({ minutes: 45 })).body.fields).toEqual({ minutes: 'invalid' })
    expect((await api.book({ therapistId: 'nobody' })).body.fields).toEqual({ therapistId: 'unknown' })
    expect((await api.book({ time: '25:00' })).body.fields).toEqual({ time: 'invalid' })
    expect((await api.request('POST', '/api/bookings', { body: 'not an object' })).body.fields).toEqual({ body: 'invalid_json' })
  })
})
