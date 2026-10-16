import { describe, expect, it } from 'vitest'
import type { Booking } from '../../app/types/api'
import {
  DEFAULT_FILTERS,
  dayRange,
  filterBookings,
  groupByDay,
  matchesSearch,
  NO_PREFERENCE,
  pendingCount,
  readDayFilter,
  readStatusFilter,
  statusCounts,
} from '../../app/utils/bookingFilters'
import type { BookingFilters } from '../../app/utils/bookingFilters'

// The search and filters of the back office's booking list (spec section 7). Phone numbers are reserved values
// only (D-010): 02-000-0000 and the longer runs of zeros.

const TODAY = '2026-10-17'

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

const list: Booking[] = [
  booking('NP-3F8KW', { status: 'done', customerName: 'คุณกานดา' }),
  booking('NP-H4T7C', { status: 'confirmed', customerName: 'Emma Example', start: '13:00', end: '14:30' }),
  booking('NP-2MW8D', { status: 'pending', customerName: 'คุณวิทยา', therapistId: null, start: '15:00', end: '16:00', phone: '0200000000' }),
  booking('NP-C8N4F', { status: 'confirmed', customerName: 'คุณพิมพ์ชนก', date: '2026-10-18', phone: '+6620000000' }),
  booking('NP-9QX2M', { status: 'pending', customerName: 'คุณมานพ', date: '2026-10-30' }),
  booking('NP-5TB9L', { status: 'pending', customerName: 'คุณเอมมา', date: '2026-10-31' }),
  booking('NP-R6J3V', { status: 'pending', customerName: 'คุณศิริพร', date: '2026-10-16' }),
]

function codes(bookings: Booking[]) {
  return bookings.map(item => item.code)
}

function filters(changes: Partial<BookingFilters>): BookingFilters {
  return { ...DEFAULT_FILTERS, ...changes }
}

describe('query values', () => {
  it('reads known values and falls back to "ทุกวัน" / "ทั้งหมด"', () => {
    expect(readDayFilter('today')).toBe('today')
    expect(readDayFilter('tomorrow')).toBe('tomorrow')
    expect(readDayFilter('yesterday')).toBe('all')
    expect(readDayFilter(undefined)).toBe('all')
    expect(readStatusFilter('cancelled')).toBe('cancelled')
    expect(readStatusFilter(['pending'])).toBe('all')
  })
})

describe('dayRange', () => {
  it('is today, tomorrow, or today and the 13 days after it', () => {
    expect(dayRange('today', TODAY)).toEqual({ from: TODAY, to: TODAY })
    expect(dayRange('tomorrow', TODAY)).toEqual({ from: '2026-10-18', to: '2026-10-18' })
    expect(dayRange('all', TODAY)).toEqual({ from: TODAY, to: '2026-10-30' })
  })
})

describe('matchesSearch', () => {
  const [kanda, emma, witthaya, pimchanok] = list as [Booking, Booking, Booking, Booking]

  it('finds a booking number however it is typed', () => {
    for (const text of ['NP-H4T7C', 'np-h4t7c', 'np h4t7c', 'H4T7C', ' h4t7c ', 'H4T']) expect(matchesSearch(emma, text), text).toBe(true)
    expect(matchesSearch(kanda, 'NP-H4T7C')).toBe(false)
  })

  it('finds a part of the name, ignoring upper and lower case', () => {
    expect(matchesSearch(witthaya, 'วิทยา')).toBe(true)
    expect(matchesSearch(emma, 'emma')).toBe(true)
    expect(matchesSearch(emma, 'EXAMPLE')).toBe(true)
    expect(matchesSearch(kanda, 'วิทยา')).toBe(false)
  })

  it('compares phone numbers by their digits, from 3 digits, also with +66', () => {
    expect(matchesSearch(kanda, '02-000-0000')).toBe(true)
    expect(matchesSearch(witthaya, '020-000-0000')).toBe(true)
    expect(matchesSearch(kanda, '020-000-0000')).toBe(false)
    expect(matchesSearch(pimchanok, '02 000 0000')).toBe(true)
    expect(matchesSearch(kanda, '+66 2 000 0000')).toBe(true)
    expect(matchesSearch(kanda, '000')).toBe(true)
  })

  it('lets everything through for an empty search', () => {
    expect(matchesSearch(kanda, '   ')).toBe(true)
  })
})

describe('filterBookings', () => {
  it('shows today to 13 days ahead by default, never the past', () => {
    expect(codes(filterBookings(list, DEFAULT_FILTERS, TODAY))).toEqual(['NP-3F8KW', 'NP-H4T7C', 'NP-2MW8D', 'NP-C8N4F', 'NP-9QX2M'])
  })

  it('filters by day, status, therapist and search together', () => {
    expect(codes(filterBookings(list, filters({ day: 'today' }), TODAY))).toEqual(['NP-3F8KW', 'NP-H4T7C', 'NP-2MW8D'])
    expect(codes(filterBookings(list, filters({ day: 'tomorrow' }), TODAY))).toEqual(['NP-C8N4F'])
    expect(codes(filterBookings(list, filters({ status: 'pending' }), TODAY))).toEqual(['NP-2MW8D', 'NP-9QX2M'])
    expect(codes(filterBookings(list, filters({ therapist: NO_PREFERENCE }), TODAY))).toEqual(['NP-2MW8D'])
    expect(codes(filterBookings(list, filters({ therapist: 'malai', status: 'confirmed' }), TODAY))).toEqual(['NP-H4T7C', 'NP-C8N4F'])
    expect(codes(filterBookings(list, filters({ day: 'today', search: 'กานดา' }), TODAY))).toEqual(['NP-3F8KW'])
  })

  it('keeps a booking that was just changed even when it no longer matches, within the day range', () => {
    const kept = new Set(['NP-H4T7C', 'NP-R6J3V'])
    expect(codes(filterBookings(list, filters({ status: 'pending' }), TODAY, kept))).toEqual(['NP-H4T7C', 'NP-2MW8D', 'NP-9QX2M'])
  })
})

describe('counts', () => {
  it('counts each status under the other filters', () => {
    expect(statusCounts(list, filters({ status: 'pending' }), TODAY)).toEqual({ all: 5, pending: 2, confirmed: 2, done: 1, cancelled: 0 })
    expect(statusCounts(list, filters({ day: 'today' }), TODAY)).toEqual({ all: 3, pending: 1, confirmed: 1, done: 1, cancelled: 0 })
  })

  it('counts the bookings waiting for an answer from today on (the number on the tab)', () => {
    expect(pendingCount(list, TODAY)).toBe(2)
  })
})

describe('groupByDay', () => {
  it('puts the bookings under their day, in order', () => {
    const days = groupByDay(filterBookings(list, DEFAULT_FILTERS, TODAY))
    expect(days.map(day => [day.date, codes(day.bookings)])).toEqual([
      [TODAY, ['NP-3F8KW', 'NP-H4T7C', 'NP-2MW8D']],
      ['2026-10-18', ['NP-C8N4F']],
      ['2026-10-30', ['NP-9QX2M']],
    ])
  })
})
