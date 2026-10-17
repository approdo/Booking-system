import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { sha256 } from '../src/ids'
import { DEMO_LOGIN, testApi } from './helpers'

/**
 * Back office sessions cannot pile up (BK-005 scope 13, D-011 M1): a sandbox keeps at most
 * SESSIONS_PER_SANDBOX sessions, and signing in to an existing sandbox or signing out counts as a back
 * office change (ADMIN_CHANGES_PER_MINUTE per sandbox), so repeating them cannot write rows without limit.
 */

/** AC11 (ก): the most sessions one sandbox may have, whatever SESSIONS_PER_SANDBOX says. */
const MOST_SESSIONS = 5

async function sessionCount(sandboxToken: string): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM sessions WHERE sandbox_id = ?1')
    .bind(await sha256(sandboxToken)).first<{ count: number }>()
  return row?.count ?? 0
}

describe('sessions of one sandbox (D-011 M1)', () => {
  it('keeps at most 5 sessions when 100 sign-ins with one sandbox token arrive at the same moment', async () => {
    const api = testApi()
    const { sandbox } = await api.login()
    if (!sandbox) throw new Error('the first sign-in creates a sandbox')

    const responses = await Promise.all(Array.from({ length: 100 }, () =>
      api.request('POST', '/api/admin/login', { token: sandbox, body: DEMO_LOGIN })))
    const statuses = responses.map(response => response.status)
    // Each sign-in either works or is refused by the per-sandbox limit; nothing else.
    expect(statuses.filter(status => status !== 200 && status !== 429)).toEqual([])
    expect(statuses.filter(status => status === 200).length).toBeGreaterThan(0)

    expect(await sessionCount(sandbox)).toBeLessThanOrEqual(MOST_SESSIONS)
  })

  it('ends the oldest session when a sandbox signs in once more than SESSIONS_PER_SANDBOX', async () => {
    const api = testApi()
    const first = await api.login()
    const sandbox = first.sandbox!
    const sessions = [first.session]
    for (let count = 1; count < MOST_SESSIONS + 2; count++) {
      api.advance(1000) // one second apart, so "oldest" is clear
      sessions.push((await api.login({ token: sandbox })).session)
    }

    expect(await sessionCount(sandbox)).toBe(Number(env.SESSIONS_PER_SANDBOX))
    const statuses = await Promise.all(sessions.map(async session =>
      (await api.request('GET', '/api/admin/bookings', { token: session })).status))
    // The two oldest sessions ended; the five newest work.
    expect(statuses).toEqual([401, 401, 200, 200, 200, 200, 200])
  })

  it('counts signing in to an existing sandbox and signing out as back office changes', async () => {
    const api = testApi({ env: { ADMIN_CHANGES_PER_MINUTE: '3' } })
    const { sandbox, session } = await api.login() // creates the sandbox: limited per IP address instead
    const signIn = () => api.request('POST', '/api/admin/login', { token: sandbox, body: DEMO_LOGIN })

    expect((await signIn()).status).toBe(200)
    expect((await signIn()).status).toBe(200)
    expect((await api.request('POST', '/api/admin/logout', { token: session })).status).toBe(204)
    expect(await signIn()).toMatchObject({ status: 429, body: { error: 'rate_limited' } })
    api.advance(60 * 1000)
    expect((await signIn()).status).toBe(200)
  })
})
