import { weekdayOf } from './bookingRules'
import { formatNumber } from './numbers'

/**
 * How the booking pages write days, times, prices and phone numbers (spec section 10): Thai time,
 * Buddhist years, "14:00–15:30 น." with an en dash. The names are written out here instead of coming
 * from Intl, so the server, every browser and the tests give exactly the same text.
 *
 * Dates are 'YYYY-MM-DD' strings that are already in Thai time.
 */

const WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const WEEKDAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']
const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

/** Thailand is UTC+7 all year (no daylight saving time). */
const THAI_OFFSET_MS = 7 * 60 * 60 * 1000

function parts(date: string) {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return { buddhistYear: year + 543, month: month - 1, day, weekday: weekdayOf(date) }
}

/** Today in Thai time, 'YYYY-MM-DD'. */
export function thaiToday(now: number = Date.now()): string {
  return new Date(now + THAI_OFFSET_MS).toISOString().slice(0, 10)
}

/** 'อาทิตย์ 18 ต.ค. 2569': the booking summary and the ticket. */
export function longDate(date: string): string {
  const { buddhistYear, month, day, weekday } = parts(date)
  return `${WEEKDAYS[weekday]} ${day} ${MONTHS_SHORT[month]} ${buddhistYear}`
}

/** 'อา. 18 ต.ค.': the bar at the bottom of the screen. */
export function shortDate(date: string): string {
  const { month, day, weekday } = parts(date)
  return `${WEEKDAYS_SHORT[weekday]} ${day} ${MONTHS_SHORT[month]}`
}

/** 'พฤ. 31 ธ.ค. 2569': a special closed day in the back office. */
export function shortDateWithYear(date: string): string {
  const { buddhistYear, month, day, weekday } = parts(date)
  return `${WEEKDAYS_SHORT[weekday]} ${day} ${MONTHS_SHORT[month]} ${buddhistYear}`
}

/** 'จันทร์' for 1: the name of a day of the week (0 = Sunday). */
export function weekdayName(weekday: number): string {
  return WEEKDAYS[weekday] ?? ''
}

/** 'อาทิตย์ 18 ต.ค.': next to the times of a day. */
export function dayWithMonth(date: string): string {
  const { month, day, weekday } = parts(date)
  return `${WEEKDAYS[weekday]} ${day} ${MONTHS_SHORT[month]}`
}

/** 'อาทิตย์ 18 ตุลาคม': what a screen reader says for a day. */
export function spokenDate(date: string): string {
  const { month, day, weekday } = parts(date)
  return `${WEEKDAYS[weekday]} ${day} ${MONTHS[month]}`
}

/** 'อา.': the day of the week on a day button. */
export function shortWeekday(date: string): string {
  return WEEKDAYS_SHORT[weekdayOf(date)]!
}

/** The day of the month, 1 to 31. */
export function dayOfMonth(date: string): number {
  return parts(date).day
}

/**
 * The month above a week of days: 'ตุลาคม 2569', or both months when the week spans two:
 * 'ตุลาคม – พฤศจิกายน 2569', 'ธันวาคม 2569 – มกราคม 2570'.
 */
export function monthHeading(dates: readonly string[]): string {
  const first = dates[0]
  const last = dates.at(-1)
  if (!first || !last) return ''
  const a = parts(first)
  const b = parts(last)
  if (a.month === b.month && a.buddhistYear === b.buddhistYear) return `${MONTHS[a.month]} ${a.buddhistYear}`
  if (a.buddhistYear === b.buddhistYear) return `${MONTHS[a.month]} – ${MONTHS[b.month]} ${b.buddhistYear}`
  return `${MONTHS[a.month]} ${a.buddhistYear} – ${MONTHS[b.month]} ${b.buddhistYear}`
}

/** '14:00–15:30 น.' */
export function timeRange(start: string, end: string): string {
  return `${start}–${end} น.`
}

/** '550 บาท', '1,100 บาท'. */
export function formatPrice(price: number): string {
  return `${formatNumber(price)} บาท`
}

/**
 * A stored phone number (digits only, '+66' kept) as people read it: nine digits '02-000-0000',
 * ten digits '020-000-0000', anything else as it is stored.
 */
export function formatPhone(phone: string): string {
  if (/^0\d{8}$/.test(phone)) return `${phone.slice(0, 2)}-${phone.slice(2, 5)}-${phone.slice(5)}`
  if (/^0\d{9}$/.test(phone)) return `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`
  return phone
}

export type DayPeriod = 'morning' | 'afternoon' | 'evening'

/** The part of the day a start time belongs to (spec section 6): before 12:00, until 16:59, from 17:00. */
export function dayPeriod(time: string): DayPeriod {
  if (time < '12:00') return 'morning'
  if (time < '17:00') return 'afternoon'
  return 'evening'
}

export const DAY_PERIOD_NAMES: Readonly<Record<DayPeriod, string>> = {
  morning: 'ช่วงเช้า',
  afternoon: 'ช่วงบ่าย',
  evening: 'ช่วงเย็น',
}
