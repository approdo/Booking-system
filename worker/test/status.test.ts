import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { BOOKING_STATUSES, STATUS_TRANSITIONS } from '../../app/utils/bookingRules'
import { sha256 } from '../src/core/ids'
import { testApi } from './helpers'

// The starting data has one booking in each status (spec section 10).
const SEED_BOOKING_IN = { pending: 'NP-2MW8D', confirmed: 'NP-H4T7C', done: 'NP-3F8KW', cancelled: 'NP-R6J3V' } as const

async function statusOf(sandboxToken: string, code: string) {
  const row = await env.DB.prepare('SELECT status FROM bookings WHERE sandbox_id = ?1 AND code = ?2')
    .bind(await sha256(sandboxToken), code).first<{ status: string }>()
  return row?.status
}

describe('status changes follow spec section 4 only (AC10)', () => {
  for (const from of BOOKING_STATUSES) {
    for (const to of BOOKING_STATUSES) {
      const allowed = STATUS_TRANSITIONS[from].includes(to)
      it(`${from} → ${to}: ${allowed ? '200' : '409, row unchanged'}`, async () => {
        const api = testApi()
        const { session, sandbox } = await api.login()
        const code = SEED_BOOKING_IN[from]
        const response = await api.request('PATCH', `/api/admin/bookings/${code}`, { token: session, body: { status: to } })
        if (allowed) {
          expect(response.status).toBe(200)
          expect(response.body.booking).toMatchObject({ code, status: to })
          expect(await statusOf(sandbox ?? '', code)).toBe(to)
        }
        else {
          expect(response).toMatchObject({ status: 409, body: { error: 'invalid_transition', status: from } })
          expect(await statusOf(sandbox ?? '', code)).toBe(from)
        }
      })
    }
  }

  it('cannot restore a cancelled booking whose time someone else has taken: 409 slot_taken', async () => {
    const api = testApi()
    const { session, sandbox } = await api.login()
    // NP-R6J3V (cancelled) was Preecha 17:30–19:00. Book Preecha at 18:00 in the same sandbox.
    expect((await api.book({ therapistId: 'preecha', time: '18:00' }, { token: sandbox })).status).toBe(201)
    const restore = await api.request('PATCH', '/api/admin/bookings/NP-R6J3V', { token: session, body: { status: 'pending' } })
    expect(restore).toMatchObject({ status: 409, body: { error: 'slot_taken' } })
    expect(await statusOf(sandbox ?? '', 'NP-R6J3V')).toBe('cancelled')
  })

  it('accepts the booking number as people type it, and answers 404 for one that does not exist', async () => {
    const api = testApi()
    const { session } = await api.login()
    expect((await api.request('PATCH', '/api/admin/bookings/np%202mw8d', { token: session, body: { status: 'confirmed' } })).status).toBe(200)
    expect((await api.request('PATCH', '/api/admin/bookings/NP-ZZZZZ', { token: session, body: { status: 'confirmed' } })).status).toBe(404)
    expect((await api.request('PATCH', '/api/admin/bookings/NP-H4T7C', { token: session, body: { status: 'lost' } })).body)
      .toEqual({ error: 'invalid_input', fields: { status: 'invalid' } })
  })
})
