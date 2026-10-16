import { describe, expect, it } from 'vitest'
import type { Booking, DayHours } from '../../app/types/api'
import { fullDate, thaiTime, thaiToday } from '../../app/utils/bookingFormat'
import { hoursOn, todayCounts, upcomingToday } from '../../app/utils/todaySummary'

// "วันนี้" of the back office (spec section 7, BK-008): the numbers per status, the next booking and today's hours.
// Times are Thai time. Phone numbers are the reserved 02-000-0000 only (D-010).

const TODAY = '2026-10-17'
const TOMORROW = '2026-10-18'

function booking(code: string, changes: Partial<Booking> = {}): Booking {
  return {
    code,
    serviceId: 'thai-traditional',
    serviceName: 'นวดแผนไทย',
    minutes: 60,
    price: 400,
    therapistId: 'malai',
    date: TODAY,
    start: '10:00',
    end: '11:00',
    customerName: 'คุณกานดา',
    phone: '020000000',
    status: 'pending',
    isNew: false,
    createdAt: '2026-10-17T00:00:00.000Z',
    ...changes,
  }
}

/** Like the starting data (spec section 10): six bookings today, one tomorrow. */
const day: Booking[] = [
  booking('NP-3F8KW', { start: '10:00', end: '11:00', status: 'done' }),
  booking('NP-9QX2M', { start: '11:30', end: '13:00', status: 'done' }),
  booking('NP-H4T7C', { start: '13:00', end: '14:30', status: 'confirmed' }),
  booking('NP-2MW8D', { start: '15:00', end: '16:00', status: 'pending', therapistId: null }),
  booking('NP-R6J3V', { start: '17:30', end: '19:00', status: 'cancelled' }),
  booking('NP-5TB9L', { start: '19:00', end: '20:00', status: 'confirmed' }),
  booking('NP-C8N4F', { date: TOMORROW, start: '11:00', end: '12:30', status: 'confirmed' }),
]

const codes = (bookings: Booking[]) => bookings.map(item => item.code)

describe('todayCounts', () => {
  it('counts only today\'s bookings, per status', () => {
    expect(todayCounts(day, TODAY)).toEqual({ pending: 1, confirmed: 2, done: 2, cancelled: 1 })
    expect(todayCounts(day, TOMORROW)).toEqual({ pending: 0, confirmed: 1, done: 0, cancelled: 0 })
    expect(todayCounts([], TODAY)).toEqual({ pending: 0, confirmed: 0, done: 0, cancelled: 0 })
  })

  it('goes up by one for a new booking today, and not for one tomorrow (AC1)', () => {
    const before = todayCounts(day, TODAY)
    expect(todayCounts([...day, booking('NP-NEW23', { start: '16:00' })], TODAY).pending).toBe(before.pending + 1)
    expect(todayCounts([...day, booking('NP-NEW24', { date: TOMORROW })], TODAY)).toEqual(before)
  })
})

describe('upcomingToday', () => {
  it('lists today\'s "รอยืนยัน" and "ยืนยันแล้ว" bookings that start now or later, earliest first', () => {
    expect(codes(upcomingToday(day, TODAY, { date: TODAY, time: '06:00' }))).toEqual(['NP-H4T7C', 'NP-2MW8D', 'NP-5TB9L'])
    expect(codes(upcomingToday(day, TODAY, { date: TODAY, time: '13:00' }))).toEqual(['NP-H4T7C', 'NP-2MW8D', 'NP-5TB9L'])
    // A booking that has started is no longer next.
    expect(codes(upcomingToday(day, TODAY, { date: TODAY, time: '13:01' }))).toEqual(['NP-2MW8D', 'NP-5TB9L'])
    expect(upcomingToday(day, TODAY, { date: TODAY, time: '19:30' })).toEqual([])
  })

  it('puts a new booking first only when it really is the next one (AC1)', () => {
    const added = [...day, booking('NP-NEW23', { start: '14:00', end: '15:00' })]
    expect(upcomingToday(added, TODAY, { date: TODAY, time: '13:30' })[0]?.code).toBe('NP-NEW23')
    expect(upcomingToday(added, TODAY, { date: TODAY, time: '12:00' })[0]?.code).toBe('NP-H4T7C')
    expect(codes(upcomingToday(added, TODAY, { date: TODAY, time: '12:00' }))).toContain('NP-NEW23')
  })

  it('keeps the order of the times whatever order the bookings come in', () => {
    expect(codes(upcomingToday([...day].reverse(), TODAY, { date: TODAY, time: '06:00' }))).toEqual(['NP-H4T7C', 'NP-2MW8D', 'NP-5TB9L'])
  })

  it('treats a clock that is on another day as all past or all to come', () => {
    expect(upcomingToday(day, TODAY, { date: TOMORROW, time: '00:01' })).toEqual([])
    expect(upcomingToday(day, TODAY, { date: '2026-10-16', time: '23:59' })).toHaveLength(3)
  })
})

describe('hoursOn', () => {
  const week: DayHours[] = [0, 1, 2, 3, 4, 5, 6].map(weekday => ({ weekday, closed: false, open: '10:00', close: '22:00', lastBooking: '20:30' }))

  it('gives the hours of the day of the week', () => {
    expect(hoursOn(TODAY, week, [])).toEqual({ closed: false, open: '10:00', close: '22:00' })
  })

  it('is closed on a closed day of the week and on a special closed day', () => {
    // 2026-10-17 is a Saturday (weekday 6).
    expect(hoursOn(TODAY, week.map(item => (item.weekday === 6 ? { ...item, closed: true } : item)), [])).toEqual({ closed: true })
    expect(hoursOn(TODAY, week, [TODAY])).toEqual({ closed: true })
    expect(hoursOn(TOMORROW, week, [TODAY])).toEqual({ closed: false, open: '10:00', close: '22:00' })
  })
})

describe('Thai time and the long date', () => {
  it('reads the clock in Thai time (UTC+7)', () => {
    expect(thaiTime(Date.parse('2026-10-16T23:06:00Z'))).toBe('06:06')
    expect(thaiToday(Date.parse('2026-10-16T23:06:00Z'))).toBe(TODAY)
    expect(thaiTime(Date.parse('2026-10-17T16:59:00Z'))).toBe('23:59')
  })

  it('writes the day in full with the Buddhist year (spec section 7)', () => {
    expect(fullDate(TODAY)).toBe('เสาร์ 17 ตุลาคม 2569')
    expect(fullDate('2027-01-01')).toBe('ศุกร์ 1 มกราคม 2570')
  })
})
