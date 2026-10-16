import { describe, expect, it } from 'vitest'
import { testApi, TODAY } from './helpers'

// Back office changes reach the booking pages of the same sandbox (the contract BK-007 builds on).

async function signedIn() {
  const api = testApi()
  const { session, sandbox } = await api.login()
  return { api, session, sandbox: sandbox ?? '' }
}

type Day = { date: string, status: string, slots: { time: string, available: boolean }[] }

describe('services and prices', () => {
  it('adds a service, changes a price and closes a service, as the booking pages see it', async () => {
    const { api, session, sandbox } = await signedIn()
    const created = await api.request('POST', '/api/admin/services', {
      token: session,
      body: { categoryId: 'oil', name: 'นวดน้ำมันทดลอง', description: 'บริการตัวอย่าง', options: [{ minutes: 90, price: 900 }, { minutes: 60, price: 700 }], enabled: true },
    })
    expect(created.status).toBe(201)
    expect(created.body.service).toMatchObject({ categoryId: 'oil', options: [{ minutes: 60, price: 700 }, { minutes: 90, price: 900 }], enabled: true })
    expect(created.body.service.id).toMatch(/^svc-[a-z2-9]{8}$/)

    expect((await api.request('PATCH', '/api/admin/services/hot-stone', { token: session, body: { enabled: false } })).status).toBe(200)
    expect((await api.request('PATCH', '/api/admin/services/neck-shoulder', { token: session, body: { options: [{ minutes: 30, price: 300 }] } })).status).toBe(200)

    const services = (await api.request('GET', '/api/shop', { token: sandbox })).body.services as { id: string, options: { price: number }[] }[]
    expect(services.map(service => service.id)).toContain(created.body.service.id)
    expect(services.map(service => service.id)).not.toContain('hot-stone')
    expect(services.find(service => service.id === 'neck-shoulder')?.options).toEqual([{ minutes: 30, price: 300 }])
    // The back office still lists the closed service; a closed service cannot be booked.
    const adminServices = (await api.request('GET', '/api/admin/shop', { token: session })).body.services as { id: string, enabled: boolean }[]
    expect(adminServices.find(service => service.id === 'hot-stone')?.enabled).toBe(false)
    expect((await api.book({ serviceId: 'hot-stone', minutes: 90, time: '12:00' }, { token: sandbox })).body.fields).toEqual({ serviceId: 'unknown' })
  })

  it('checks a service like the form does (spec section 7)', async () => {
    const { api, session } = await signedIn()
    const response = await api.request('POST', '/api/admin/services', {
      token: session,
      body: { categoryId: 'thai', name: 'ก', description: '', options: [{ minutes: 60, price: 0 }], enabled: true },
    })
    expect(response.body).toEqual({ error: 'invalid_input', fields: { name: 'name_length', options: 'price_invalid' } })
    const repeated = await api.request('PATCH', '/api/admin/services/thai-traditional', { token: session, body: { options: [{ minutes: 60, price: 400 }, { minutes: 60, price: 500 }] } })
    expect(repeated.body.fields).toEqual({ options: 'minutes_repeated' })
    expect((await api.request('PATCH', '/api/admin/services/thai-traditional', { token: session, body: { options: [] } })).body.fields).toEqual({ options: 'options_required' })
    expect((await api.request('PATCH', '/api/admin/services/nothing', { token: session, body: { enabled: false } })).status).toBe(404)
  })
})

describe('opening hours and closed days', () => {
  it('changes the times the booking pages offer', async () => {
    const { api, session, sandbox } = await signedIn()
    const shop = (await api.request('GET', '/api/admin/shop', { token: session })).body
    const hours = shop.hours.map((day: { weekday: number }) => (day.weekday === 6 ? { ...day, open: '12:00', lastBooking: '18:00', close: '19:00' } : day))
    expect((await api.request('PUT', '/api/admin/hours', { token: session, body: { hours } })).status).toBe(200)
    expect((await api.request('POST', '/api/admin/closed-dates', { token: session, body: { date: '2026-10-20' } })).body).toEqual({ closedDates: ['2026-10-20'] })

    const days = (await api.request('GET', '/api/availability?minutes=60&therapist=any', { token: sandbox })).body.days as Day[]
    const today = days.find(day => day.date === TODAY)
    expect(today?.slots[0]?.time).toBe('12:00')
    expect(today?.slots.at(-1)?.time).toBe('18:00')
    expect(days.find(day => day.date === '2026-10-20')?.status).toBe('closed')

    expect((await api.request('DELETE', '/api/admin/closed-dates/2026-10-20', { token: session })).body).toEqual({ closedDates: [] })
  })

  it('refuses hours that close before they open, and closed days outside today to +60', async () => {
    const { api, session } = await signedIn()
    const shop = (await api.request('GET', '/api/admin/shop', { token: session })).body
    const hours = shop.hours.map((day: { weekday: number }) => (day.weekday === 1 ? { ...day, open: '20:00', close: '12:00' } : day))
    expect((await api.request('PUT', '/api/admin/hours', { token: session, body: { hours } })).body.fields).toEqual({ 'hours.1': 'close_before_open' })
    expect((await api.request('PUT', '/api/admin/hours', { token: session, body: { hours: hours.slice(1) } })).body.fields).toEqual({ hours: 'seven_days' })
    expect((await api.request('POST', '/api/admin/closed-dates', { token: session, body: { date: '2026-12-17' } })).body.fields).toEqual({ date: 'out_of_range' })
    expect((await api.request('POST', '/api/admin/closed-dates', { token: session, body: { date: '2026-02-30' } })).body.fields).toEqual({ date: 'invalid' })
  })
})

describe('therapists\' working days and days off', () => {
  it('changes when a chosen therapist can be booked', async () => {
    const { api, session, sandbox } = await signedIn()
    // Somsri works every day except Monday; make Monday a working day and take a day off on Thursday 22nd.
    expect((await api.request('PATCH', '/api/admin/therapists/somsri', { token: session, body: { workDays: [0, 1, 2, 3, 4, 5, 6] } })).body.therapist.workDays).toHaveLength(7)
    expect((await api.request('POST', '/api/admin/therapists/somsri/leave-dates', { token: session, body: { date: '2026-10-22' } })).body.therapist.leaveDates).toEqual(['2026-10-22'])

    const days = (await api.request('GET', '/api/availability?minutes=60&therapist=somsri', { token: sandbox })).body.days as Day[]
    expect(days.find(day => day.date === '2026-10-19')?.status).toBe('available')
    expect(days.find(day => day.date === '2026-10-22')?.status).toBe('closed')

    expect((await api.request('DELETE', '/api/admin/therapists/somsri/leave-dates/2026-10-22', { token: session })).body.therapist.leaveDates).toEqual([])
    expect((await api.request('PATCH', '/api/admin/therapists/somsri', { token: session, body: { workDays: [7] } })).body.fields).toEqual({ workDays: 'invalid' })
  })

  it('refuses a booking with a therapist on their day off, and takes it with "no preference" (BK-010 AC1)', async () => {
    const { api, session, sandbox } = await signedIn()
    // Malai is on leave on Saturday 24 October and stops working on Sundays.
    expect((await api.request('POST', '/api/admin/therapists/malai/leave-dates', { token: session, body: { date: '2026-10-24' } })).status).toBe(200)
    expect((await api.request('PATCH', '/api/admin/therapists/malai', { token: session, body: { workDays: [1, 3, 4, 5, 6] } })).status).toBe(200)

    for (const date of ['2026-10-24', '2026-10-25']) {
      expect((await api.book({ therapistId: 'malai', date, time: '14:00' }, { token: sandbox })).body.error, date).toBe('slot_taken')
      expect((await api.book({ therapistId: null, date, time: '14:00' }, { token: sandbox })).status, date).toBe(201)
    }
    expect((await api.book({ therapistId: 'malai', date: '2026-10-23', time: '14:00' }, { token: sandbox })).status).toBe(201)
  })
})
