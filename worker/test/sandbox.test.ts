import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { ipKey, sha256 } from '../src/ids'
import { HOUR, MINUTE, sandboxRowCounts, tableCounts, testApi, TODAY } from './helpers'

describe('each visitor\'s sandbox is private (AC2 a)', () => {
  it('keeps A\'s booking, status change and price change away from B and from visitors without a token', async () => {
    const api = testApi()
    const a = (await api.book({ time: '12:00', therapistId: 'somsri' }, { ip: '203.0.113.1' })).body
    const aSession = (await api.login({ token: a.sandbox.token, ip: '203.0.113.1' })).session
    expect((await api.request('PATCH', '/api/admin/bookings/NP-2MW8D', { token: aSession, body: { status: 'confirmed' } })).status).toBe(200)
    expect((await api.request('PATCH', '/api/admin/services/thai-traditional', {
      token: aSession, body: { options: [{ minutes: 60, price: 450 }, { minutes: 90, price: 550 }, { minutes: 120, price: 700 }] },
    })).status).toBe(200)

    // A sees its own changes.
    const aShop = await api.request('GET', '/api/shop', { token: a.sandbox.token })
    expect(aShop.body.services.find((service: { id: string }) => service.id === 'thai-traditional').options[0].price).toBe(450)

    const b = (await api.book({ time: '18:00', therapistId: 'malai' }, { ip: '203.0.113.2' })).body
    const bSession = (await api.login({ token: b.sandbox.token, ip: '203.0.113.2' })).session
    for (const [label, token] of [['sandbox B', b.sandbox.token], ['no token', null]] as const) {
      const shop = await api.request('GET', '/api/shop', { token })
      expect(shop.body.services.find((service: { id: string }) => service.id === 'thai-traditional').options[0].price, label).toBe(400)
      const day = (await api.request('GET', '/api/availability?minutes=60&therapist=somsri', { token })).body.days[0]
      expect(day.slots.find((slot: { time: string }) => slot.time === '12:00').available, label).toBe(true)
    }
    const bBookings = (await api.request('GET', '/api/admin/bookings', { token: bSession })).body.bookings as { code: string, status: string }[]
    expect(bBookings.map(booking => booking.code)).not.toContain(a.booking.code)
    expect(bBookings.find(booking => booking.code === 'NP-2MW8D')?.status).toBe('pending')
  })
})

describe('a sandbox older than 24 hours (AC2 b)', () => {
  it('answers 410 sandbox_expired to its token and to its session, even before the purge', async () => {
    const api = testApi()
    const { sandbox } = (await api.book({ time: '12:00' })).body
    const { session } = await api.login({ token: sandbox.token })
    api.advance(24 * HOUR - MINUTE)
    expect((await api.request('GET', '/api/shop', { token: sandbox.token })).status).toBe(200)
    api.advance(MINUTE)
    expect(await api.request('GET', '/api/shop', { token: sandbox.token })).toMatchObject({ status: 410, body: { error: 'sandbox_expired' } })
    expect((await api.book({ date: '2026-10-19' }, { token: sandbox.token })).body).toEqual({ error: 'sandbox_expired' })
    expect((await api.request('GET', '/api/admin/bookings', { token: session })).body).toEqual({ error: 'sandbox_expired' })
  })

  it('treats an unknown (already purged) token the same way', async () => {
    const api = testApi()
    expect((await api.request('GET', '/api/shop', { token: 'x'.repeat(43) })).status).toBe(410)
  })

  it('is replaced by a new sandbox when the visitor signs in again', async () => {
    const api = testApi()
    const { sandbox } = (await api.book({ time: '12:00' })).body
    api.advance(25 * HOUR)
    const again = await api.login({ token: sandbox.token })
    expect(again.sandbox).toBeDefined()
    expect(again.sandbox).not.toBe(sandbox.token)
  })
})

describe('the daily purge (AC2 c)', () => {
  it('deletes every row of sandboxes older than 24 hours, keeps younger ones, and can run twice', async () => {
    const api = testApi()
    const old = (await api.book({ time: '12:00' }, { ip: '203.0.113.1' })).body.sandbox.token as string
    await api.login({ token: old, ip: '203.0.113.1' })
    api.advance(23 * HOUR)
    const young = (await api.book({ date: '2026-10-19', time: '12:00' }, { ip: '203.0.113.2' })).body.sandbox.token as string
    await api.login({ token: young, ip: '203.0.113.2' })
    api.advance(2 * HOUR) // old: 25 hours, young: 2 hours

    const [oldId, youngId] = await Promise.all([sha256(old), sha256(young)])
    const youngBefore = await sandboxRowCounts(youngId)
    const seedBefore = await sandboxRowCounts('seed')

    await api.scheduled()
    const firstPurge = (await api.request('GET', '/health')).body.last_purge_at
    expect(Object.values(await sandboxRowCounts(oldId))).toEqual([0, 0, 0, 0, 0, 0])
    expect(await sandboxRowCounts(youngId)).toEqual(youngBefore)
    expect(await sandboxRowCounts('seed')).toMatchObject({ services: seedBefore.services, bookings: seedBefore.bookings })

    api.advance(MINUTE)
    await expect(api.scheduled()).resolves.toBeUndefined()
    const secondPurge = (await api.request('GET', '/health')).body.last_purge_at
    expect(secondPurge).not.toBe(firstPurge)
    expect(Date.parse(secondPurge) - Date.parse(firstPurge)).toBe(MINUTE)
  })
})

describe('reading creates no sandbox; the first write does (AC5, D-008 ข)', () => {
  it('serves 10 reads without a token without adding a sandbox', async () => {
    const api = testApi()
    for (let index = 0; index < 5; index++) {
      expect((await api.request('GET', '/api/shop')).status).toBe(200)
      expect((await api.request('GET', '/api/availability?minutes=60&therapist=any')).status).toBe(200)
    }
    const counts = await tableCounts()
    expect(counts.sandboxes).toBe(0)
    expect(counts.sessions).toBe(0)
    // Only the starting data was written (once).
    const { results } = await env.DB.prepare('SELECT DISTINCT sandbox_id FROM bookings').all<{ sandbox_id: string }>()
    expect(results).toEqual([{ sandbox_id: 'seed' }])
  })

  it('gives every new sandbox a full copy of the starting data', async () => {
    const api = testApi()
    const { sandbox } = (await api.book({ time: '12:00' })).body
    expect(await sandboxRowCounts(await sha256(sandbox.token))).toEqual({
      ...(await sandboxRowCounts('seed')),
      bookings: (await sandboxRowCounts('seed')).bookings + 1,
      sandboxes: 1,
    })
  })
})

describe('at most 5 new sandboxes per IP address in 10 minutes (AC5, D-008 ค)', () => {
  it('refuses the 6th from one IPv4 address, and lets another address through', async () => {
    const api = testApi()
    for (let index = 0; index < 5; index++) expect((await api.book({ time: '12:00' }, { ip: '203.0.113.7' })).status).toBe(201)
    const sixth = await api.book({ time: '12:00' }, { ip: '203.0.113.7' })
    expect(sixth).toMatchObject({ status: 429, body: { error: 'rate_limited' } })
    expect((await api.request('POST', '/api/admin/login', { ip: '203.0.113.7', body: { email: 'demo@nuanplai.example', password: 'nuanplai-demo' } })).status).toBe(429)
    expect((await tableCounts()).sandboxes).toBe(5)
    expect((await api.book({ time: '12:00' }, { ip: '203.0.113.8' })).status).toBe(201)
    api.advance(10 * MINUTE)
    expect((await api.book({ time: '12:00' }, { ip: '203.0.113.7' })).status).toBe(201)
  })

  it('counts IPv6 addresses of one /64 network together, and other networks apart', async () => {
    const api = testApi()
    for (let index = 0; index < 5; index++) {
      expect((await api.book({ time: '12:00' }, { ip: `2001:db8:1:2::${index + 1}` })).status).toBe(201)
    }
    expect((await api.book({ time: '12:00' }, { ip: '2001:db8:1:2:ffff:ffff:ffff:ffff' })).status).toBe(429)
    expect((await api.book({ time: '12:00' }, { ip: '2001:db8:1:3::1' })).status).toBe(201)
  })

  it('reads the IP key from CF-Connecting-IP: IPv4 alone, IPv6 by its /64', () => {
    expect(ipKey('203.0.113.7')).toBe('v4:203.0.113.7')
    expect(ipKey('::ffff:203.0.113.7')).toBe('v4:203.0.113.7')
    expect(ipKey('2001:db8:1:2::1')).toBe(ipKey('2001:0DB8:0001:0002:abcd:0:0:9'))
    expect(ipKey('2001:db8:1:2::1')).toBe('v6:2001:db8:1:2::/64')
    expect(ipKey('2001:db8:1:3::1')).not.toBe(ipKey('2001:db8:1:2::1'))
    expect(ipKey(null)).toBe('unknown')
  })
})

describe('the starting data', () => {
  it('is dated from today in Thai time: six bookings today and one tomorrow', async () => {
    const api = testApi()
    await api.request('GET', '/api/shop')
    const { results } = await env.DB.prepare('SELECT date, COUNT(*) AS count FROM bookings WHERE sandbox_id = ?1 GROUP BY date ORDER BY date')
      .bind('seed').all<{ date: string, count: number }>()
    expect(results).toEqual([{ date: TODAY, count: 6 }, { date: '2026-10-18', count: 1 }])
  })

  it('moves with the Thai day: written again on the first request after midnight in Thailand', async () => {
    const api = testApi()
    await api.request('GET', '/api/shop')
    api.advance(15 * HOUR + MINUTE) // 00:01 on Sunday in Thailand
    await api.request('GET', '/api/shop')
    const { results } = await env.DB.prepare('SELECT DISTINCT date FROM bookings WHERE sandbox_id = ?1 ORDER BY date').bind('seed').all<{ date: string }>()
    expect(results.map(row => row.date)).toEqual(['2026-10-18', '2026-10-19'])
  })
})
