import type { Booking, Therapist } from '../types/api'
import { isIsoDate, minutesFromTime, timeFromMinutes, weekdayOf } from './bookingRules'
import type { HoursOfDay } from './todaySummary'

/**
 * "ปฏิทิน" of the back office (spec section 7, BK-009), as plain functions so the unit tests can check them:
 * one day at a time, a column per therapist plus one for bookings nobody is assigned to yet, rows of 30 minutes
 * from the shop's opening to its closing time. Below 1024px the same bookings are a list instead.
 *
 * Dates are 'YYYY-MM-DD' and times 'HH:MM', both in Thai time.
 */

/** A row of 30 minutes is 24px high (spec section 7), so one minute is 0.8px and one hour 48px. */
export const PIXELS_PER_MINUTE = 24 / 30

/** The key of the column of bookings without a therapist ("ยังไม่จัดคน"). */
export const UNASSIGNED = 'none'

export interface CalendarColumn {
  /** The therapist's id, or UNASSIGNED. */
  key: string
  /** null: the column of bookings nobody is assigned to yet. */
  therapist: Therapist | null
  label: string
}

/** The day the calendar opens on: ?date=YYYY-MM-DD when it is a real date, else today. Past days are fine. */
export function readCalendarDate(value: unknown, today: string): string {
  return typeof value === 'string' && isIsoDate(value) ? value : today
}

/** "ยังไม่จัดคน" first, then the therapists in the shop's order (spec section 7). */
export function calendarColumns(therapists: readonly Therapist[]): CalendarColumn[] {
  return [
    { key: UNASSIGNED, therapist: null, label: 'ยังไม่จัดคน' },
    ...therapists.map(therapist => ({ key: therapist.id, therapist, label: therapist.name })),
  ]
}

/** The column a booking goes in: its therapist's, or "ยังไม่จัดคน" (also for a therapist the shop no longer has). */
export function columnKeyOf(booking: Booking, therapists: readonly Therapist[]): string {
  const known = booking.therapistId !== null && therapists.some(therapist => therapist.id === booking.therapistId)
  return known ? booking.therapistId! : UNASSIGNED
}

/** true when the therapist does not work that day: a regular day off or a leave day (as the API decides). */
export function isDayOff(therapist: Therapist, date: string): boolean {
  return !therapist.workDays.includes(weekdayOf(date)) || therapist.leaveDates.includes(date)
}

function byTime(a: Booking, b: Booking): number {
  return a.start.localeCompare(b.start) || a.code.localeCompare(b.code)
}

/** The bookings of one day, earliest first, cancelled ones included (they show struck through). */
export function bookingsOn(bookings: readonly Booking[], date: string): Booking[] {
  return bookings.filter(booking => booking.date === date).sort(byTime)
}

function startOf(booking: Booking): number {
  return minutesFromTime(booking.start) ?? 0
}

function endOf(booking: Booking): number {
  return startOf(booking) + booking.minutes
}

/** The hours the grid shows, in minutes after midnight, always on the hour. */
export interface GridRange {
  from: number
  to: number
}

/**
 * From the opening to the closing time (spec section 7), widened to whole hours and to any booking outside
 * them: the hours may have changed after a booking was made, or the day may be closed now. null when the shop
 * is closed and there is nothing to show.
 */
export function gridRange(hours: HoursOfDay, bookings: readonly Booking[]): GridRange | null {
  const starts = bookings.map(startOf)
  const ends = bookings.map(endOf)
  if (!hours.closed) {
    starts.push(minutesFromTime(hours.open) ?? 0)
    ends.push(minutesFromTime(hours.close) ?? 0)
  }
  if (starts.length === 0) return null
  return {
    from: Math.floor(Math.min(...starts) / 60) * 60,
    to: Math.ceil(Math.max(...ends) / 60) * 60,
  }
}

/** The height of a column, in px. */
export function rangeHeight(range: GridRange): number {
  return (range.to - range.from) * PIXELS_PER_MINUTE
}

/** The hours written down the left of the grid: '10:00' at 0px, '11:00' at 48px, … (the last hour is the end). */
export function hourMarks(range: GridRange): { time: string, top: number }[] {
  const marks = []
  for (let minutes = range.from; minutes < range.to; minutes += 60) {
    marks.push({ time: timeFromMinutes(minutes), top: (minutes - range.from) * PIXELS_PER_MINUTE })
  }
  return marks
}

/** A booking placed in its column: from the top, how high, and side by side with the bookings it overlaps. */
export interface PlacedBooking {
  booking: Booking
  /** px from the top of the column. */
  top: number
  /** px. */
  height: number
  /** Which of `lanes` side-by-side places it takes, from 0. */
  lane: number
  lanes: number
}

/**
 * Places the bookings of one column. Bookings that overlap (a cancelled one and a new one at the same time,
 * or several bookings nobody is assigned to yet) share the width: each group that overlaps gets as many lanes
 * as it needs at once, and each booking takes the first lane that is free when it starts.
 */
export function placeBookings(bookings: readonly Booking[], range: GridRange): PlacedBooking[] {
  const placed: PlacedBooking[] = []
  let group: PlacedBooking[] = []
  let groupEnd = -1
  let laneEnds: number[] = []

  const closeGroup = () => {
    for (const item of group) item.lanes = laneEnds.length
    group = []
    laneEnds = []
  }

  for (const booking of [...bookings].sort(byTime)) {
    const start = startOf(booking)
    const end = endOf(booking)
    if (start >= groupEnd) closeGroup()

    let lane = laneEnds.findIndex(laneEnd => laneEnd <= start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(end)
    }
    else {
      laneEnds[lane] = end
    }

    const item = {
      booking,
      top: (start - range.from) * PIXELS_PER_MINUTE,
      height: booking.minutes * PIXELS_PER_MINUTE,
      lane,
      lanes: 1,
    }
    group.push(item)
    placed.push(item)
    groupEnd = Math.max(groupEnd, end)
  }
  closeGroup()
  return placed
}

/**
 * The short name of a service in a narrow column (spec section 7, "บริการย่อ"): without the leading "นวด"
 * every massage shares. 'นวดคอ บ่า ไหล่' gives 'คอ บ่า ไหล่'; 'สปาหน้าสมุนไพรไทย' stays as it is.
 */
export function shortServiceName(name: string): string {
  const rest = name.replace(/^นวด/, '').trim()
  return rest.length >= 2 ? rest : name
}
