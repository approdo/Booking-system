import { describe, expect, it } from 'vitest'
import { testApi } from './helpers'

// Every back office route, with a body that would be valid if there were a session.
const ADMIN_ROUTES: [string, string, unknown?][] = [
  ['POST', '/api/admin/logout'],
  ['GET', '/api/admin/bookings'],
  ['PATCH', '/api/admin/bookings/NP-2MW8D', { status: 'confirmed' }],
  ['GET', '/api/admin/shop'],
  ['POST', '/api/admin/services', { categoryId: 'thai', name: 'นวดทดลอง', description: '', options: [{ minutes: 60, price: 500 }], enabled: true }],
  ['PATCH', '/api/admin/services/hot-stone', { enabled: false }],
  ['PUT', '/api/admin/hours', { hours: [] }],
  ['POST', '/api/admin/closed-dates', { date: '2026-10-20' }],
  ['DELETE', '/api/admin/closed-dates/2026-10-20'],
  ['PATCH', '/api/admin/therapists/malai', { workDays: [1, 2, 3] }],
  ['POST', '/api/admin/therapists/malai/leave-dates', { date: '2026-10-20' }],
  ['DELETE', '/api/admin/therapists/malai/leave-dates/2026-10-20'],
]

describe('back office sessions (AC7)', () => {
  it('answers 401 unauthorized on every back office route without a session, or with a made-up one', async () => {
    const api = testApi()
    for (const [method, path, body] of ADMIN_ROUTES) {
      expect(await api.request(method, path, { body }), `${method} ${path}`).toMatchObject({ status: 401, body: { error: 'unauthorized' } })
      expect((await api.request(method, path, { body, token: 'y'.repeat(43) })).status, `${method} ${path}`).toBe(401)
    }
  })

  it('signs in with the demo account shown on the login page; the session then works', async () => {
    const api = testApi()
    const response = await api.request('POST', '/api/admin/login', { body: { email: ' Demo@Nuanplai.example ', password: 'nuanplai-demo' } })
    expect(response.status).toBe(200)
    expect(Object.keys(response.body).sort()).toEqual(['sandbox', 'session'])
    const session = response.body.session.token as string
    const bookings = await api.request('GET', '/api/admin/bookings', { token: session })
    expect(bookings.status).toBe(200)
    expect(bookings.body.bookings).toHaveLength(7)
  })

  it('answers a wrong password or e-mail with 401 invalid_credentials and writes no sandbox', async () => {
    const api = testApi()
    expect(await api.request('POST', '/api/admin/login', { body: { email: 'demo@nuanplai.example', password: 'nuanplai' } }))
      .toMatchObject({ status: 401, body: { error: 'invalid_credentials' } })
    expect((await api.request('POST', '/api/admin/login', { body: { email: 'owner@nuanplai.example', password: 'nuanplai-demo' } })).body)
      .toEqual({ error: 'invalid_credentials' })
    expect((await api.request('POST', '/api/admin/login', { body: { email: '', password: '' } })).body)
      .toEqual({ error: 'invalid_input', fields: { email: 'required', password: 'required' } })
    expect((await api.request('GET', '/health')).status).toBe(200)
  })

  it('signs in to the visitor\'s own sandbox, so the back office shows the booking just made', async () => {
    const api = testApi()
    const { body } = await api.book({ time: '12:00' })
    const login = await api.login({ token: body.sandbox.token })
    expect(login.sandbox).toBeUndefined()
    const bookings = (await api.request('GET', '/api/admin/bookings', { token: login.session })).body.bookings
    expect(bookings.find((booking: { code: string }) => booking.code === body.booking.code)).toMatchObject({ isNew: true, status: 'pending' })
    expect(bookings.filter((booking: { isNew: boolean }) => !booking.isNew)).toHaveLength(7)
  })

  it('ends the session on logout and keeps the sandbox', async () => {
    const api = testApi()
    const { session, sandbox } = await api.login()
    expect((await api.request('POST', '/api/admin/logout', { token: session })).status).toBe(204)
    expect((await api.request('GET', '/api/admin/bookings', { token: session })).status).toBe(401)
    expect((await api.request('GET', '/api/shop', { token: sandbox })).status).toBe(200)
  })
})
