import {
  addDays,
  BOOKING_WINDOW_DAYS,
  minutesFromTime,
  SLOT_STEP_MINUTES,
  timeFromMinutes,
  weekdayOf,
} from '../../../app/utils/bookingRules'
import type { DayAvailability, DayStatus, Slot } from '../../../app/types/api'
import type { BusyTime, Shop, Therapist } from './shop'

/**
 * Which times can be booked (BK-005 scope 4). The rules, in order:
 *
 * 1. The shop is open that day: its day of the week is not closed and the date is not a special closed day.
 * 2. The booking starts on the hour or half hour, between opening and the last booking time, and ends by
 *    closing time; today, it starts after the current time. The day is today or one of the next 13 days.
 * 3. Someone is free. A therapist is free when they work that day (not a regular day off, not on leave)
 *    and have no booking that overlaps. Bookings with no preferred therapist need someone too, so:
 *    - with no preference, the time is free when free therapists outnumber those bookings;
 *    - with a chosen therapist, that therapist must be free, and the others must still cover them.
 *    Both come to the same test, so "no preference" is free exactly when some therapist could be chosen.
 *
 * The same rule guards the database write (src/bookings.ts), so two people who book the last free
 * place at the same moment cannot both get it.
 */

export interface AvailabilityContext {
  shop: Pick<Shop, 'therapists' | 'hours' | 'closedDates'>
  /** Bookings that hold time (not cancelled) on the days asked about. */
  busy: readonly BusyTime[]
  /** Today in Thai time, 'YYYY-MM-DD', and the minutes after midnight now. */
  today: string
  nowMinutes: number
}

export interface Opening {
  open: number
  close: number
  lastBooking: number
}

/** Opening hours of a date in minutes, or null when the shop is closed all day. */
export function openingOn(shop: AvailabilityContext['shop'], date: string): Opening | null {
  if (shop.closedDates.includes(date)) return null
  const day = shop.hours.find(hours => hours.weekday === weekdayOf(date))
  if (!day || day.closed) return null
  const open = minutesFromTime(day.open)
  const close = minutesFromTime(day.close)
  const lastBooking = minutesFromTime(day.lastBooking)
  if (open === null || close === null || lastBooking === null) return null
  return { open, close, lastBooking }
}

export function worksOn(therapist: Therapist, date: string): boolean {
  return therapist.workDays.includes(weekdayOf(date)) && !therapist.leaveDates.includes(date)
}

/** Rule 3 for the time from `start` to `end` (minutes) on `date`. `therapistId` null = no preference. */
export function hasFreeTherapist(context: AvailabilityContext, date: string, start: number, end: number, therapistId: string | null): boolean {
  const overlapping = context.busy.filter(busy => busy.date === date && busy.start < end && busy.end > start)
  const free = context.shop.therapists.filter(therapist =>
    worksOn(therapist, date) && !overlapping.some(busy => busy.therapistId === therapist.id))
  const withoutPreference = overlapping.filter(busy => busy.therapistId === null).length
  if (therapistId !== null && !free.some(therapist => therapist.id === therapistId)) return false
  return free.length - withoutPreference >= 1
}

/** Rule 2: the booking window and the start and end times, before anyone's bookings are looked at. */
export function isBookableTime(context: AvailabilityContext, date: string, start: number, minutes: number): boolean {
  if (date < context.today || date > addDays(context.today, BOOKING_WINDOW_DAYS - 1)) return false
  const opening = openingOn(context.shop, date)
  if (!opening) return false
  if (start % SLOT_STEP_MINUTES !== 0 || start < opening.open || start > opening.lastBooking) return false
  if (start + minutes > opening.close) return false
  return date !== context.today || start > context.nowMinutes
}

/** All three rules: can this service length start at this time with this therapist (or anyone)? */
export function isAvailable(context: AvailabilityContext, booking: { date: string, start: number, minutes: number, therapistId: string | null }): boolean {
  return isBookableTime(context, booking.date, booking.start, booking.minutes)
    && hasFreeTherapist(context, booking.date, booking.start, booking.start + booking.minutes, booking.therapistId)
}

/**
 * One day of the booking calendar (spec section 6): 'closed' ("หยุด") when the shop is closed or the
 * chosen therapist is off, 'full' ("เต็ม") when no time is free, otherwise 'available' ("ว่าง"), with
 * every start time of the day; today's times that have passed are left out.
 */
export function dayAvailability(context: AvailabilityContext, date: string, minutes: number, therapistId: string | null): DayAvailability {
  const weekday = weekdayOf(date)
  const opening = openingOn(context.shop, date)
  const working = context.shop.therapists.filter(therapist =>
    (therapistId === null || therapist.id === therapistId) && worksOn(therapist, date))
  if (!opening || working.length === 0) return { date, weekday, status: 'closed', lastBooking: null, slots: [] }

  const slots: Slot[] = []
  for (let start = opening.open; start <= opening.lastBooking; start += SLOT_STEP_MINUTES) {
    if (start + minutes > opening.close) break
    if (date === context.today && start <= context.nowMinutes) continue
    slots.push({
      time: timeFromMinutes(start),
      end: timeFromMinutes(start + minutes),
      available: hasFreeTherapist(context, date, start, start + minutes, therapistId),
    })
  }
  const status: DayStatus = slots.some(slot => slot.available) ? 'available' : 'full'
  return { date, weekday, status, lastBooking: timeFromMinutes(opening.lastBooking), slots }
}

/** The 14 bookable days from today (spec section 6). */
export function bookingWindow(today: string): string[] {
  return Array.from({ length: BOOKING_WINDOW_DAYS }, (_, day) => addDays(today, day))
}
