import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { MINUTE, testApi } from './helpers'

describe('rate limits in the Worker (AC3, D-004)', () => {
  it('refuses the 6th booking from one sandbox in 10 minutes, and lets a new sandbox book', async () => {
    const api = testApi()
    const first = await api.book({ time: '10:00', date: '2026-10-20' })
    const token = first.body.sandbox.token as string
    for (const time of ['11:00', '12:00', '13:00', '14:00']) {
      expect((await api.book({ time, date: '2026-10-20' }, { token })).status, time).toBe(201)
    }
    const sixth = await api.book({ time: '15:00', date: '2026-10-20' }, { token })
    expect(sixth).toMatchObject({ status: 429, body: { error: 'rate_limited' } })
    expect(sixth.headers.get('Retry-After')).toBe('60')

    // A visitor with a new sandbox books as usual (normal use is never limited).
    expect((await api.book({ time: '15:00', date: '2026-10-20' }, { ip: '203.0.113.99' })).status).toBe(201)
    // Ten minutes after the first booking, the first sandbox can book again.
    api.advance(10 * MINUTE)
    expect((await api.book({ time: '16:00', date: '2026-10-20' }, { token })).status).toBe(201)
  })

  it('refuses the 11th wrong password from one IP address in 10 minutes, even with the right one', async () => {
    const api = testApi()
    const wrong = { email: 'demo@nuanplai.example', password: 'not-the-password' }
    for (let attempt = 1; attempt <= 10; attempt++) {
      expect((await api.request('POST', '/api/admin/login', { body: wrong })).body, `attempt ${attempt}`).toEqual({ error: 'invalid_credentials' })
    }
    expect(await api.request('POST', '/api/admin/login', { body: wrong })).toMatchObject({ status: 429, body: { error: 'rate_limited' } })
    expect((await api.request('POST', '/api/admin/login', { body: { ...wrong, password: 'nuanplai-demo' } })).status).toBe(429)
    // Another IP address is not affected; ten minutes later this one is not either.
    expect((await api.request('POST', '/api/admin/login', { ip: '203.0.113.50', body: wrong })).status).toBe(401)
    api.advance(10 * MINUTE)
    expect((await api.request('POST', '/api/admin/login', { body: { ...wrong, password: 'nuanplai-demo' } })).status).toBe(200)
  })

  // Parallel requests (security review): the limit is checked inside the statement that writes, so a
  // burst of requests sent at the same moment cannot all pass a check made before any of them wrote.
  it('holds the booking limit when many bookings arrive at the same moment', async () => {
    const api = testApi()
    const first = await api.book({ time: '10:00', date: '2026-10-20' })
    const token = first.body.sandbox.token as string
    // Fifteen bookings at once, each at a free time: only the 4 that the limit of 5 leaves may pass.
    const slots = Array.from({ length: 15 }, (_, n) => ({ date: n < 10 ? '2026-10-21' : '2026-10-22', time: `${10 + (n % 10)}:00` }))
    const statuses = (await Promise.all(slots.map(slot => api.book(slot, { token })))).map(response => response.status)
    expect(statuses.filter(status => status === 201)).toHaveLength(4)
    expect(statuses.filter(status => status === 429)).toHaveLength(11)
    const made = await env.DB.prepare('SELECT COUNT(*) AS count FROM bookings WHERE is_seed = 0').first<{ count: number }>()
    expect(made?.count).toBe(5)
  })

  it('holds the wrong-password limit when many tries arrive at the same moment', async () => {
    const api = testApi()
    const wrong = { email: 'demo@nuanplai.example', password: 'not-the-password' }
    const statuses = (await Promise.all(Array.from({ length: 40 }, () =>
      api.request('POST', '/api/admin/login', { body: wrong })))).map(response => response.status)
    expect(statuses.filter(status => status === 401)).toHaveLength(10)
    expect(statuses.filter(status => status === 429)).toHaveLength(30)
    const remembered = await env.DB.prepare('SELECT COUNT(*) AS count FROM login_failures').first<{ count: number }>()
    expect(remembered?.count).toBe(10)
  })

  it('refuses back office changes above ADMIN_CHANGES_PER_MINUTE per sandbox', async () => {
    const api = testApi({ env: { ADMIN_CHANGES_PER_MINUTE: '3' } })
    const { session } = await api.login()
    const toggle = (enabled: boolean) => api.request('PATCH', '/api/admin/services/hot-stone', { token: session, body: { enabled } })
    for (const enabled of [false, true, false]) expect((await toggle(enabled)).status).toBe(200)
    expect(await toggle(true)).toMatchObject({ status: 429, body: { error: 'rate_limited' } })
    api.advance(MINUTE)
    expect((await toggle(true)).status).toBe(200)
  })

  it('does not limit ordinary use: one booking, then a back office session with a few changes', async () => {
    const api = testApi()
    const { body } = await api.book({ time: '12:00' })
    const { session } = await api.login({ token: body.sandbox.token })
    for (const status of ['confirmed', 'done', 'confirmed', 'cancelled', 'pending']) {
      expect((await api.request('PATCH', `/api/admin/bookings/${body.booking.code}`, { token: session, body: { status } })).status, status).toBe(200)
    }
  })
})
