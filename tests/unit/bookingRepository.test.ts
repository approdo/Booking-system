import { describe, expect, it } from 'vitest'
import { createBookingRepository, stateMessages, STORAGE_KEYS } from '../../app/utils/bookingRepository'
import type { TokenStorage } from '../../app/utils/bookingRepository'

// The adapter between the pages and the API: what each answer becomes (spec section 5) and what happens to
// the tokens. The API is a fake fetch here; the real one is tested in worker/test.

function memoryStorage(initial: Record<string, string> = {}): TokenStorage & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial))
  return {
    values,
    get: key => values.get(key) ?? null,
    set: (key, value) => void values.set(key, value),
    remove: key => void values.delete(key),
  }
}

interface Call { url: string, method: string, headers: Record<string, string>, body: unknown }

/** A fetch that answers every request with `status` and `body`, and remembers the requests. */
function fakeApi(status: number, body: unknown) {
  const calls: Call[] = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET', headers: init?.headers as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    return new Response(body === undefined ? null : JSON.stringify(body), { status })
  }
  return { fetch: fetch as typeof globalThis.fetch, calls }
}

const booking = { serviceId: 'thai-traditional', minutes: 60, therapistId: null, date: '2026-10-17', time: '12:00', name: 'ทดลอง ตัวอย่าง', phone: '02-000-0000' }

describe('createBookingRepository', () => {
  it('reads without a token, and keeps the sandbox token the first booking brings back', async () => {
    const storage = memoryStorage()
    const api = fakeApi(201, { booking: { code: 'NP-2MW8D' }, sandbox: { token: 'sandbox-token', expiresAt: '2026-10-18T02:00:00.000Z' } })
    const repository = createBookingRepository({ baseUrl: 'http://localhost:8787/', storage, fetch: api.fetch })

    expect(repository.willPrepareSandbox()).toBe(true)
    await repository.getAvailability(60, null)
    expect(api.calls[0]).toMatchObject({ url: 'http://localhost:8787/api/availability?minutes=60&therapist=any', method: 'GET' })
    expect(api.calls[0]?.headers.Authorization).toBeUndefined()

    const result = await repository.createBooking(booking)
    expect(result.ok).toBe(true)
    expect(storage.values.get(STORAGE_KEYS.sandbox)).toBe('sandbox-token')
    expect(repository.willPrepareSandbox()).toBe(false)
    await repository.getShop()
    expect(api.calls.at(-1)?.headers.Authorization).toBe('Bearer sandbox-token')
  })

  it('turns the answers of spec section 5 into its states', async () => {
    const cases: [number, unknown, string][] = [
      [429, { error: 'rate_limited' }, 'rate_limited'],
      [503, { error: 'demo_full' }, 'demo_full'],
      [503, { error: 'backend_unavailable' }, 'unavailable'],
      [500, { error: 'internal_error' }, 'unavailable'],
      [502, undefined, 'unavailable'],
      [410, { error: 'sandbox_expired' }, 'sandbox_expired'],
      [409, { error: 'slot_taken' }, 'slot_taken'],
    ]
    for (const [status, body, state] of cases) {
      const repository = createBookingRepository({ baseUrl: 'http://api.test', storage: memoryStorage(), fetch: fakeApi(status, body).fetch })
      expect(await repository.createBooking(booking), `${status} ${JSON.stringify(body)}`).toEqual({ ok: false, state })
    }
    const offline = createBookingRepository({ baseUrl: 'http://api.test', storage: memoryStorage(), fetch: async () => {
      throw new TypeError('Failed to fetch')
    } })
    expect(await offline.getShop()).toEqual({ ok: false, state: 'unavailable' })
  })

  it('passes field errors on, for the form to show at each field', async () => {
    const repository = createBookingRepository({ baseUrl: 'http://api.test', storage: memoryStorage(), fetch: fakeApi(400, { error: 'invalid_input', fields: { phone: 'invalid' } }).fetch })
    expect(await repository.createBooking(booking)).toEqual({ ok: false, state: 'invalid_input', fields: { phone: 'invalid' } })
  })

  it('forgets both tokens when the sandbox has expired, and only its own keys', async () => {
    const storage = memoryStorage({ [STORAGE_KEYS.sandbox]: 'old', [STORAGE_KEYS.session]: 'old-session', 'business-site:other': 'kept' })
    const repository = createBookingRepository({ baseUrl: 'http://api.test', storage, fetch: fakeApi(410, { error: 'sandbox_expired' }).fetch })
    expect((await repository.getShop()).ok).toBe(false)
    expect([...storage.values.keys()]).toEqual(['business-site:other'])
  })

  it('signs in with the sandbox token, keeps the session, sends it to the back office, and drops it on logout', async () => {
    const storage = memoryStorage({ [STORAGE_KEYS.sandbox]: 'sandbox-token' })
    const login = fakeApi(200, { session: { token: 'session-token' }, sandbox: { expiresAt: '2026-10-18T02:00:00.000Z' } })
    const repository = createBookingRepository({ baseUrl: 'http://api.test', storage, fetch: login.fetch })
    expect((await repository.login('demo@nuanplai.example', 'nuanplai-demo')).ok).toBe(true)
    expect(login.calls[0]?.headers.Authorization).toBe('Bearer sandbox-token')
    expect(repository.hasSession()).toBe(true)

    await repository.listBookings()
    expect(login.calls.at(-1)?.headers.Authorization).toBe('Bearer session-token')
    await repository.logout()
    expect(repository.hasSession()).toBe(false)
    expect(storage.values.get(STORAGE_KEYS.sandbox)).toBe('sandbox-token')
  })

  it('drops a session the API no longer knows', async () => {
    const storage = memoryStorage({ [STORAGE_KEYS.session]: 'gone' })
    const repository = createBookingRepository({ baseUrl: 'http://api.test', storage, fetch: fakeApi(401, { error: 'unauthorized' }).fetch })
    expect(await repository.listBookings()).toEqual({ ok: false, state: 'unauthorized' })
    expect(repository.hasSession()).toBe(false)
  })

  it('has the messages of spec section 5 word for word', () => {
    expect(stateMessages.preparing.text).toBe('กำลังเตรียมข้อมูลตัวอย่าง…')
    expect(stateMessages.demo_full.title).toBe('เดโมเต็มชั่วคราว')
    expect(stateMessages.rate_limited.text).toBe('ส่งคำขอถี่เกินไป กรุณารอสักครู่แล้วลองใหม่')
  })
})
