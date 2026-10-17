import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { ROWS_ESTIMATE } from '../src/core/estimates'
import { sql } from '../src/core/sql'
import { BUDGET_UPDATE_ROWS, Store } from '../src/core/store'
import { utcDate } from '../src/core/time'
import { ipHash, ipKey } from '../src/core/ids'
import { D1Db } from '../src/platform/cloudflare/d1'
import { budgetUsed, HOUR, SATURDAY_9AM, tableCounts, testApi } from './helpers'

const DAY = utcDate(SATURDAY_9AM)

describe('the daily D1 write budget (AC4, D-008 ก)', () => {
  it('refuses writes with 503 demo_full once the budget is reached, changes nothing, and keeps reads working', async () => {
    // A low budget (AC4: 300 rows); the per-minute limit of back office changes and the share of one IP
    // address (test/writesPerIp.test.ts) are lifted so that the budget of everyone is hit first.
    const api = testApi({ env: { D1_WRITE_BUDGET: '300', ADMIN_CHANGES_PER_MINUTE: '1000', D1_WRITE_BUDGET_PER_IP_PERCENT: '100' } })
    const { session, sandbox } = await api.login()

    // Write until the budget refuses: back office changes cost a few rows each.
    let refused = null
    for (let change = 0; change < 100 && !refused; change++) {
      const response = await api.request('PATCH', '/api/admin/services/hot-stone', { token: session, body: { enabled: change % 2 === 1 } })
      if (response.status !== 200) refused = response
    }
    expect(refused).toMatchObject({ status: 503, body: { error: 'demo_full' } })
    expect(await budgetUsed(DAY)).toBeLessThanOrEqual(300)

    // Today's budget is used up: every kind of write is refused before it writes anything.
    await env.DB.prepare('UPDATE write_budget SET rows = 300 WHERE day = ?1').bind(DAY).run()
    const before = await tableCounts()
    const writes = [
      api.book({ time: '12:00' }, { token: sandbox }),
      api.book({ time: '12:00' }, { ip: '203.0.113.20' }),
      api.request('POST', '/api/admin/login', { body: { email: 'demo@nuanplai.example', password: 'nuanplai-demo' } }),
      api.request('POST', '/api/admin/login', { body: { email: 'demo@nuanplai.example', password: 'wrong' } }),
      api.request('PATCH', '/api/admin/bookings/NP-2MW8D', { token: session, body: { status: 'confirmed' } }),
      api.request('POST', '/api/admin/closed-dates', { token: session, body: { date: '2026-10-20' } }),
      api.request('POST', '/api/admin/logout', { token: session }),
    ]
    for (const response of await Promise.all(writes)) expect(response.body).toEqual({ error: 'demo_full' })
    expect(await tableCounts()).toEqual(before)

    // Reading still works, with and without a sandbox.
    for (const token of [null, sandbox]) {
      expect((await api.request('GET', '/api/shop', { token })).status).toBe(200)
      expect((await api.request('GET', '/api/availability?minutes=60&therapist=any', { token })).status).toBe(200)
    }
    expect((await api.request('GET', '/api/admin/bookings', { token: session })).status).toBe(200)

    // The purge still runs, and adds what it wrote to today's count.
    api.advance(25 * HOUR)
    const nextDay = utcDate(api.now)
    await env.DB.prepare('INSERT INTO write_budget (day, rows) VALUES (?1, 300)').bind(nextDay).run()
    const store = new Store(new D1Db(env.DB), { writeBudget: 300, now: api.now })
    expect(await store.rowsWrittenToday()).toBe(300)
    await api.scheduled()
    const purged = await budgetUsed(nextDay) - 300
    expect(purged).toBeGreaterThan(20)
    expect((await tableCounts()).sandboxes).toBe(0)
  })

  it('counts exactly the rows_written that D1 reports, plus the updates of the counts, for everyone and per IP', async () => {
    const ip = 'v4:203.0.113.10'
    const store = new Store(new D1Db(env.DB), { writeBudget: 60_000, ip: { key: ip, budget: 3000 }, now: SATURDAY_9AM })
    let reported = 0
    await store.guardedWrite(10, async (write) => {
      const results = await write([
        sql('INSERT INTO meta (key, value) VALUES (?1, ?2)', 'a', '1'),
        sql('INSERT INTO login_failures (ip_key, at) VALUES (?1, ?2)', 'k', 1),
      ])
      reported = results.reduce((sum, result) => sum + (result.rowsWritten ?? 0), 0)
    })
    expect(reported).toBe(3) // one row in meta; one row and one index entry in login_failures
    // Both counts get the rows written plus what updating the two counts costs.
    expect(await budgetUsed(DAY)).toBe(reported + 2 * BUDGET_UPDATE_ROWS)
    const perIp = await env.DB.prepare('SELECT rows FROM ip_write_budget WHERE day = ?1 AND ip_key = ?2')
      .bind(DAY, await ipHash(ipKey('203.0.113.10'))).first<{ rows: number }>()
    expect(perIp?.rows).toBe(reported + 2 * BUDGET_UPDATE_ROWS)

    // Each update of a count really costs BUDGET_UPDATE_ROWS, whether it inserts or updates the day.
    const upserts = [
      env.DB.prepare('INSERT INTO write_budget (day, rows) VALUES (?1, 1) ON CONFLICT (day) DO UPDATE SET rows = rows + excluded.rows')
        .bind('2000-01-01'),
      env.DB.prepare('INSERT INTO ip_write_budget (day, ip_key, rows) VALUES (?1, ?2, 1) ON CONFLICT (day, ip_key) DO UPDATE SET rows = rows + excluded.rows')
        .bind('2000-01-01', 'key'),
    ]
    for (let run = 0; run < 2; run++) {
      for (const upsert of upserts) expect((await upsert.run()).meta.rows_written).toBe(BUDGET_UPDATE_ROWS)
    }
  })

  it('never writes more than ROWS_ESTIMATE says, and fits at least 100 sandboxes a day in the budget (AC5)', async () => {
    const api = testApi()
    await api.request('GET', '/api/shop') // writes today's starting data first
    const used = () => budgetUsed(DAY)

    let mark = await used()
    const first = await api.book({ time: '12:00' })
    const sandboxAndBooking = await used() - mark
    expect(sandboxAndBooking).toBeLessThanOrEqual(ROWS_ESTIMATE.newSandbox + ROWS_ESTIMATE.booking)
    const token = first.body.sandbox.token as string

    mark = await used()
    expect((await api.book({ time: '16:00' }, { token })).status).toBe(201)
    const booking = await used() - mark
    expect(booking).toBeLessThanOrEqual(ROWS_ESTIMATE.booking)

    mark = await used()
    const { session } = await api.login({ token })
    expect(await used() - mark).toBeLessThanOrEqual(ROWS_ESTIMATE.session)

    // Signing in when the sandbox already has SESSIONS_PER_SANDBOX sessions also ends the oldest one.
    for (let count = 1; count < Number(env.SESSIONS_PER_SANDBOX); count++) await api.login({ token })
    mark = await used()
    const { session: newest } = await api.login({ token })
    expect(await used() - mark).toBeLessThanOrEqual(ROWS_ESTIMATE.session)

    mark = await used()
    expect((await api.request('POST', '/api/admin/logout', { token: newest })).status).toBe(204)
    expect(await used() - mark).toBeLessThanOrEqual(ROWS_ESTIMATE.adminChange)

    mark = await used()
    await api.request('POST', '/api/admin/login', { body: { email: 'demo@nuanplai.example', password: 'wrong' } })
    expect(await used() - mark).toBeLessThanOrEqual(ROWS_ESTIMATE.loginFailure)

    mark = await used()
    await api.request('PATCH', '/api/admin/bookings/NP-2MW8D', { token: session, body: { status: 'confirmed' } })
    expect(await used() - mark).toBeLessThanOrEqual(ROWS_ESTIMATE.adminChange)
  })

  it('costs about 70 rows for one visitor (sandbox, one booking, purge): at least 100 visitors a day fit (AC5)', async () => {
    const visitor = testApi()
    await visitor.request('GET', '/api/shop') // today's starting data, written once a day for everyone
    const before = await budgetUsed(DAY)
    await visitor.book({ time: '12:00' })
    const created = await budgetUsed(DAY) - before
    visitor.advance(25 * HOUR)
    await visitor.scheduled()
    const purged = await budgetUsed(utcDate(visitor.now))
    const perVisitor = created + purged
    const visitorsPerDay = Math.floor(60_000 / perVisitor)
    // Printed for README.md ("Back end on your machine"): `npx vitest run test/budget.test.ts --silent=false`.
    console.info(`rows_written: sandbox + 1 booking ${created}, purge ${purged}, total ${perVisitor}; 60,000 / ${perVisitor} = ${visitorsPerDay} visitors a day`)
    expect(visitorsPerDay).toBeGreaterThanOrEqual(100)
  })
})
