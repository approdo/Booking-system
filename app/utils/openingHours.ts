import type { DayHours } from '../types/api'
import { weekdayName } from './bookingFormat'
import { EARLIEST_OPENING_MINUTES, LATEST_CLOSING_MINUTES, SLOT_STEP_MINUTES, timeFromMinutes } from './bookingRules'

/**
 * The back office's form of the opening hours (spec section 7, "เวลาเปิดปิดร้าน"), as plain functions so the
 * unit tests can check them. The API keeps seven days, Sunday first (weekday 0); the form lists them Monday
 * first, as people in Thailand read a week.
 */

/** Monday to Sunday. */
export const WEEK_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 0]

/** The times the selects offer: every 30 minutes from 06:00 to 23:30. */
export function hourChoices(): string[] {
  const times: string[] = []
  for (let minutes = EARLIEST_OPENING_MINUTES; minutes <= LATEST_CLOSING_MINUTES; minutes += SLOT_STEP_MINUTES) {
    times.push(timeFromMinutes(minutes))
  }
  return times
}

export type DayTimes = Pick<DayHours, 'open' | 'close' | 'lastBooking'>

function sameTimes(a: DayTimes, b: DayTimes): boolean {
  return a.open === b.open && a.close === b.close && a.lastBooking === b.lastBooking
}

/** true when the shop opens every day at the same times: the form then starts with "ใช้เวลาเดียวกันทุกวัน" on. */
export function isSameEveryDay(hours: readonly DayHours[]): boolean {
  const first = hours[0]
  return first !== undefined && hours.every(day => !day.closed && sameTimes(day, first))
}

/** Seven open days with the same times, Sunday first: what "ใช้เวลาเดียวกันทุกวัน" saves. */
export function everyDay(times: DayTimes): DayHours[] {
  return [0, 1, 2, 3, 4, 5, 6].map(weekday => ({ weekday, closed: false, ...times }))
}

/**
 * The week in a few lines (spec section 7, the summary under the times): days next to each other, Monday
 * first, with the same hours share a line.
 *
 *   ['จันทร์ – อาทิตย์ · 10:00–22:00 น.']
 *   ['จันทร์ – ศุกร์ · 10:00–22:00 น.', 'เสาร์ – อาทิตย์ · 09:00–23:00 น.']
 *   ['จันทร์ – อังคาร · 10:00–22:00 น.', 'พุธ · ปิดทั้งวัน', ...]
 */
export function weekSummary(hours: readonly DayHours[]): string[] {
  const byWeekday = new Map(hours.map(day => [day.weekday, day]))
  const runs: { first: number, last: number, day: DayHours }[] = []
  for (const weekday of WEEK_ORDER) {
    const day = byWeekday.get(weekday)
    if (!day) continue
    const run = runs.at(-1)
    const same = run && (run.day.closed ? day.closed : !day.closed && sameTimes(run.day, day))
    if (run && same) run.last = weekday
    else runs.push({ first: weekday, last: weekday, day })
  }
  return runs.map(({ first, last, day }) => {
    const days = first === last ? weekdayName(first) : `${weekdayName(first)} – ${weekdayName(last)}`
    return `${days} · ${day.closed ? 'ปิดทั้งวัน' : `${day.open}–${day.close} น.`}`
  })
}
