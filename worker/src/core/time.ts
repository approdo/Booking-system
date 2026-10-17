/**
 * Thai time. Thailand has no daylight saving time, so Asia/Bangkok is always UTC+7 and plain arithmetic
 * is enough (no Intl time zone data needed on the server).
 */
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000

export const MINUTE_MS = 60 * 1000

/** Today's date in Thailand, 'YYYY-MM-DD'. */
export function bangkokDate(now: number): string {
  return new Date(now + BANGKOK_OFFSET_MS).toISOString().slice(0, 10)
}

/** Minutes after midnight in Thailand. */
export function bangkokMinutes(now: number): number {
  const time = new Date(now + BANGKOK_OFFSET_MS)
  return time.getUTCHours() * 60 + time.getUTCMinutes()
}

/** Today's date in UTC, 'YYYY-MM-DD': the day of the write budgets (D1's free plan resets its quotas at 00:00 UTC). */
export function utcDate(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}
