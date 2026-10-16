import type { Booking } from '../types/api'
import type { BookingStatus } from './bookingRules'
import { addDays, BOOKING_STATUSES, BOOKING_WINDOW_DAYS, normalizeBookingCode } from './bookingRules'

/**
 * The search and filters of the back office's booking list (spec section 7, "การจอง"), as plain functions so
 * the unit tests can check them. The list is filtered in the browser: the API sends every booking of the
 * visitor's sandbox, at most a few dozen (BK-005).
 *
 * Dates are 'YYYY-MM-DD' in Thai time; `today` comes from the API.
 */

export type DayFilter = 'today' | 'tomorrow' | 'all'
export type StatusFilter = 'all' | BookingStatus

/** The therapist filter: everyone, a therapist's id, or the bookings without a preference ("ไม่ระบุ"). */
export const ANY_THERAPIST = 'all'
export const NO_PREFERENCE = 'none'

export interface BookingFilters {
  day: DayFilter
  status: StatusFilter
  therapist: string
  search: string
}

export const DEFAULT_FILTERS: BookingFilters = { day: 'all', status: 'all', therapist: ANY_THERAPIST, search: '' }

/** "ทุกวัน" is today and the 13 days after it, the days customers can book (spec section 7). */
export const DAY_FILTERS: readonly { value: DayFilter, label: string }[] = [
  { value: 'today', label: 'วันนี้' },
  { value: 'tomorrow', label: 'พรุ่งนี้' },
  { value: 'all', label: 'ทุกวัน' },
]

/** The words of the status labels (spec section 4, C2). */
export const STATUS_NAMES: Readonly<Record<BookingStatus, string>> = {
  pending: 'รอยืนยัน',
  confirmed: 'ยืนยันแล้ว',
  done: 'เสร็จแล้ว',
  cancelled: 'ยกเลิก',
}

export const STATUS_FILTERS: readonly { value: StatusFilter, label: string }[] = [
  { value: 'all', label: 'ทั้งหมด' },
  ...BOOKING_STATUSES.map(status => ({ value: status, label: STATUS_NAMES[status] })),
]

/** The day filter of a query value (?day=today); anything else is "ทุกวัน". */
export function readDayFilter(value: unknown): DayFilter {
  return DAY_FILTERS.some(filter => filter.value === value) ? value as DayFilter : 'all'
}

/** The status filter of a query value (?status=pending); anything else is "ทั้งหมด". */
export function readStatusFilter(value: unknown): StatusFilter {
  return STATUS_FILTERS.some(filter => filter.value === value) ? value as StatusFilter : 'all'
}

/** The first and last day a day filter shows. */
export function dayRange(day: DayFilter, today: string): { from: string, to: string } {
  if (day === 'today') return { from: today, to: today }
  if (day === 'tomorrow') return { from: addDays(today, 1), to: addDays(today, 1) }
  return { from: today, to: addDays(today, BOOKING_WINDOW_DAYS - 1) }
}

/** A phone number as national digits: '+66 2 000 0000' and '02-000-0000' both give '020000000'. */
function nationalDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return phone.trim().startsWith('+66') ? `0${digits.slice(2)}` : digits
}

/**
 * Whether a booking matches what was typed into the search box (spec section 7):
 *
 * - a phone number, when the text is only digits, spaces, '-' and '+' with at least 3 digits: the digits
 *   appear in the booking's phone number ('000-0000', '+66 2 000');
 * - a booking number in any form people type it: 'np-h4t7c', 'NP H4T7C', 'H4T7C', or a part of it such as 'H4T';
 * - otherwise a part of the customer's name, ignoring upper and lower case.
 */
export function matchesSearch(booking: Booking, search: string): boolean {
  const text = search.trim()
  if (text === '') return true

  if (/^[\d\s+-]+$/.test(text) && text.replace(/\D/g, '').length >= 3) {
    return nationalDigits(booking.phone).includes(nationalDigits(text))
  }

  const code = normalizeBookingCode(text)
  if (code) return booking.code === code
  const compact = text.toUpperCase().replace(/[\s-]/g, '').replace(/^NP/, '')
  if (compact.length >= 3 && booking.code.slice(3).includes(compact)) return true

  return booking.customerName.toLocaleLowerCase('th').includes(text.toLocaleLowerCase('th'))
}

function matchesTherapist(booking: Booking, therapist: string): boolean {
  if (therapist === ANY_THERAPIST) return true
  if (therapist === NO_PREFERENCE) return booking.therapistId === null
  return booking.therapistId === therapist
}

/** The bookings of the day filter alone: what "ยังไม่มีการจองในช่วงนี้" looks at. */
export function bookingsInRange(bookings: readonly Booking[], day: DayFilter, today: string): Booking[] {
  const { from, to } = dayRange(day, today)
  return bookings.filter(booking => booking.date >= from && booking.date <= to)
}

/**
 * The bookings that every filter lets through, in the order of the API (date, then time). Bookings in `kept`
 * stay even when they no longer match: a card whose status was just changed does not vanish under the
 * pointer (spec section 3, BookingCard); the page empties `kept` when a filter changes.
 */
export function filterBookings(
  bookings: readonly Booking[],
  filters: BookingFilters,
  today: string,
  kept: ReadonlySet<string> = new Set(),
): Booking[] {
  return bookingsInRange(bookings, filters.day, today).filter(booking => kept.has(booking.code) || (
    (filters.status === 'all' || booking.status === filters.status)
    && matchesTherapist(booking, filters.therapist)
    && matchesSearch(booking, filters.search)
  ))
}

/** The numbers next to the status filters: the bookings every other filter lets through, per status. */
export function statusCounts(bookings: readonly Booking[], filters: BookingFilters, today: string): Record<StatusFilter, number> {
  const shown = filterBookings(bookings, { ...filters, status: 'all' }, today)
  const counts: Record<StatusFilter, number> = { all: shown.length, pending: 0, confirmed: 0, done: 0, cancelled: 0 }
  for (const booking of shown) counts[booking.status] += 1
  return counts
}

/** The number on the "การจอง" tab: bookings from today on that still wait for the shop ("รอยืนยัน"). */
export function pendingCount(bookings: readonly Booking[], today: string): number {
  return bookingsInRange(bookings, 'all', today).filter(booking => booking.status === 'pending').length
}

/** The bookings day by day, each day under its own heading. */
export function groupByDay(bookings: readonly Booking[]): { date: string, bookings: Booking[] }[] {
  const days: { date: string, bookings: Booking[] }[] = []
  for (const booking of bookings) {
    const last = days.at(-1)
    if (last?.date === booking.date) last.bookings.push(booking)
    else days.push({ date: booking.date, bookings: [booking] })
  }
  return days
}
