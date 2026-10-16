import type { Booking, DayHours } from '../types/api'
import type { BookingStatus } from './bookingRules'
import { BOOKING_STATUSES, weekdayOf } from './bookingRules'

/**
 * "วันนี้" of the back office (spec section 7, BK-008), as plain functions so the unit tests can check them:
 * how many of today's bookings have each status, the next booking and the ones after it, and today's hours.
 *
 * Dates are 'YYYY-MM-DD' and times 'HH:MM', both in Thai time. `today` comes from the API, like on the booking
 * list, so "วันนี้" here and the list's "วันนี้" filter always mean the same day.
 */

/** How many bookings the list under "คิวถัดไป" shows at most (spec section 7). */
export const FOLLOWING_LIMIT = 4

/** A moment in Thai time: what "now" is compared with. */
export interface ThaiMoment {
  date: string
  time: string
}

/** How many of today's bookings have each status: the four numbers at the top of the page. */
export function todayCounts(bookings: readonly Booking[], today: string): Record<BookingStatus, number> {
  const counts = Object.fromEntries(BOOKING_STATUSES.map(status => [status, 0])) as Record<BookingStatus, number>
  for (const booking of bookings) {
    if (booking.date === today) counts[booking.status] += 1
  }
  return counts
}

/** Bookings the shop still has ahead of it: waiting for an answer or confirmed, not done or cancelled. */
function isAhead(booking: Booking): boolean {
  return booking.status === 'pending' || booking.status === 'confirmed'
}

/**
 * Today's bookings still to come, earliest first: "รอยืนยัน" or "ยืนยันแล้ว", starting now or later. The first
 * one is "คิวถัดไป"; a booking that has already started is no longer "next".
 *
 * `now` is the visitor's clock in Thai time. When it is on another day than `today` (a clock that is off),
 * today's bookings are all past (now is later) or all to come (now is earlier).
 */
export function upcomingToday(bookings: readonly Booking[], today: string, now: ThaiMoment): Booking[] {
  const nowKey = `${now.date} ${now.time}`
  return bookings
    .filter(booking => booking.date === today && isAhead(booking) && `${booking.date} ${booking.start}` >= nowKey)
    .sort((a, b) => a.start.localeCompare(b.start) || a.code.localeCompare(b.code))
}

/** The shop's hours on one day: closed (by day of the week or a special closed day), or open from-to. */
export type HoursOfDay = { closed: true } | { closed: false, open: string, close: string }

export function hoursOn(date: string, hours: readonly DayHours[], closedDates: readonly string[]): HoursOfDay {
  const day = hours.find(item => item.weekday === weekdayOf(date))
  if (!day || day.closed || closedDates.includes(date)) return { closed: true }
  return { closed: false, open: day.open, close: day.close }
}
