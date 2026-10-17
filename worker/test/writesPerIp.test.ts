import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { ipHash, ipKey } from '../src/ids'
import { utcDate } from '../src/time'
import { DEMO_LOGIN, rowsCounter, SATURDAY_9AM, testApi } from './helpers'
import type { TestResponse } from './helpers'

/**
 * One IP address (IPv6: one /64) may write at most D1_WRITE_BUDGET_PER_IP_PERCENT (5%) of the day's write
 * budget, all its sandboxes together (BK-005 scope 13, D-011 M1): without it, one address that keeps
 * creating sandboxes within every per-sandbox limit could use up the day's budget for everyone.
 */

const IP = '203.0.113.40'

async function ipRowsToday(ip: string): Promise<number> {
  const row = await env.DB.prepare('SELECT rows FROM ip_write_budget WHERE day = ?1 AND ip_key = ?2')
    .bind(utcDate(SATURDAY_9AM), await ipHash(ipKey(ip))).first<{ rows: number }>()
  return row?.rows ?? 0
}

describe('the daily write budget per IP address (D-011 M1)', () => {
  it('stops one address that keeps creating sandboxes, signing in and changing things at 5% of the budget', async () => {
    const budget = 4000
    const share = budget * 5 / 100
    const rows = rowsCounter()
    // A low budget; the limit of new sandboxes per address is lifted so that only the write budget can stop it.
    const api = testApi({ env: { DB: rows.db, D1_WRITE_BUDGET: String(budget), SANDBOXES_PER_10_MINUTES_PER_IP: '1000' } })
    await api.request('GET', '/api/shop') // today's starting data: written by the Worker for everyone, not by this address
    rows.reset()

    const responses: TestResponse[] = []
    const send = async (response: Promise<TestResponse>) => {
      responses.push(await response)
      return responses.at(-1)!
    }
    const change = (session: string) =>
      send(api.request('PATCH', '/api/admin/services/hot-stone', { ip: IP, token: session, body: { enabled: false } }))
    let session = ''
    for (let round = 0; round < 40 && responses.at(-1)?.status !== 429; round++) {
      const login = await send(api.request('POST', '/api/admin/login', { ip: IP, body: DEMO_LOGIN }))
      if (login.status !== 200) break
      session = login.body.session.token
      if ((await change(session)).status !== 200) break
      const again = await send(api.request('POST', '/api/admin/login', { ip: IP, token: login.body.sandbox.token, body: DEMO_LOGIN }))
      if (again.status === 200) session = again.body.session.token
    }
    // A sign-in may be refused while a smaller change still fits in what is left of the share: keep
    // changing things until a change is refused too.
    for (let count = 0; count < 50; count++) {
      if ((await change(session)).status !== 200) break
    }

    // It wrote close to its share, never more, and was then refused with 429.
    expect(responses.at(-1)).toMatchObject({ status: 429, body: { error: 'rate_limited' } })
    expect(responses.filter(response => response.status !== 200 && response.status !== 429)).toEqual([])
    expect(rows.written).toBeLessThanOrEqual(share)
    expect(rows.written).toBeGreaterThan(share * 0.9)
    expect(await ipRowsToday(IP)).toBe(rows.written)

    // Every other kind of write from this address is refused too, and writes nothing, even in another
    // address's sandbox.
    const other = await api.login({ ip: '203.0.113.41' })
    rows.reset()
    for (const response of await Promise.all([
      api.book({ time: '12:00' }, { ip: IP }),
      api.request('POST', '/api/admin/login', { ip: IP, body: { ...DEMO_LOGIN, password: 'wrong' } }),
      api.request('POST', '/api/admin/login', { ip: IP, token: other.sandbox, body: DEMO_LOGIN }),
      api.request('PATCH', '/api/admin/services/hot-stone', { ip: IP, token: other.session, body: { enabled: false } }),
      api.request('POST', '/api/admin/logout', { ip: IP, token: other.session }),
    ])) {
      expect(response).toMatchObject({ status: 429, body: { error: 'rate_limited' } })
    }
    expect(rows.written).toBe(0)

    // Another address is not affected, and the next UTC day this one may write again.
    expect((await api.book({ time: '12:00' }, { ip: '203.0.113.42' })).status).toBe(201)
    api.advance(24 * 60 * 60 * 1000)
    expect((await api.book({ date: '2026-10-19', time: '12:00' }, { ip: IP })).status).toBe(201)
  })

  it('counts the addresses of one IPv6 /64 together', async () => {
    const api = testApi({ env: { D1_WRITE_BUDGET: '2000', SANDBOXES_PER_10_MINUTES_PER_IP: '1000' } })
    await api.request('GET', '/api/shop')
    const statuses: number[] = []
    for (let n = 1; n <= 10 && statuses.at(-1) !== 429; n++) {
      statuses.push((await api.request('POST', '/api/admin/login', { ip: `2001:db8:5:6::${n}`, body: DEMO_LOGIN })).status)
    }
    expect(statuses.at(-1)).toBe(429)
    expect((await api.request('POST', '/api/admin/login', { ip: '2001:db8:5:7::1', body: DEMO_LOGIN })).status).toBe(200)
  })

  it('does not limit ordinary use: a new address signs in, books once and makes 20 back office changes', async () => {
    const api = testApi() // the settings of wrangler.toml
    const ip = '203.0.113.43'
    const login = await api.request('POST', '/api/admin/login', { ip, body: DEMO_LOGIN })
    expect(login.status).toBe(200)
    const { session } = login.body
    const sandbox = login.body.sandbox.token as string
    expect((await api.book({ time: '12:00' }, { ip, token: sandbox })).status).toBe(201)
    for (let change = 0; change < 20; change++) {
      const response = await api.request('PATCH', '/api/admin/services/hot-stone', { ip, token: session.token, body: { enabled: change % 2 === 1 } })
      expect(response.status, `change ${change + 1}`).toBe(200)
    }
  })
})
