import type { Therapist } from '../types/api'
import { weekdayName } from './bookingFormat'
import { WEEK_ORDER } from './openingHours'

/**
 * The therapists' working days in the back office (spec section 7, "ตารางงานหมอนวด" — BK-010), as plain
 * functions so the unit tests can check them. The API keeps the days of the week a therapist works (0 =
 * Sunday) and their leave dates; whether a customer can book them on a day is decided by the Worker
 * (worker/src/core/availability.ts, `worksOn`).
 */

/**
 * The working days after one day button is pressed: the day is added when it was a day off, taken away
 * when it was a working day. Sorted, as the API keeps them.
 */
export function toggleWorkDay(workDays: readonly number[], weekday: number): number[] {
  const days = workDays.includes(weekday) ? workDays.filter(day => day !== weekday) : [...workDays, weekday]
  return [...days].sort((a, b) => a - b)
}

/** Names in a Thai list: 'จันทร์', 'จันทร์และพุธ', 'จันทร์ อังคาร และพุธ'. */
function thaiList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]}และ${names[1]}`
  return `${names.slice(0, -1).join(' ')} และ${names.at(-1)}`
}

/**
 * The line under a therapist's name (spec section 7), from the regular week only (leave dates are listed
 * on their own), the days off Monday first:
 *
 *   'ทำงาน 6 วัน · หยุดพฤหัสบดี'
 *   'ทำงาน 5 วัน · หยุดจันทร์และพฤหัสบดี'
 *   'ทำงานทุกวัน'
 *   'หยุดทุกวัน'
 */
export function workSummary(therapist: Pick<Therapist, 'workDays'>): string {
  const works = WEEK_ORDER.filter(day => therapist.workDays.includes(day))
  if (works.length === WEEK_ORDER.length) return 'ทำงานทุกวัน'
  if (works.length === 0) return 'หยุดทุกวัน'
  const daysOff = WEEK_ORDER.filter(day => !works.includes(day)).map(weekdayName)
  return `ทำงาน ${works.length} วัน · หยุด${thaiList(daysOff)}`
}
