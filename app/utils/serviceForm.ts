import { SERVICE_MINUTES } from './bookingRules'

/**
 * Small helpers of the back office's service form (spec section 7, the dialog of "บริการและราคา"). The form
 * itself is checked with validateService() in bookingRules.ts, the same function the API uses.
 */

/**
 * The price typed into the form as a number of baht: '1,100', ' 450 ' and '1 100' give 1100 and 450. Anything
 * that is not a whole number gives NaN, which validateService() reports as "ราคาต้องเป็นตัวเลข 1–100,000".
 */
export function parsePrice(text: string): number {
  const compact = text.replace(/[\s,]/g, '')
  return /^\d{1,7}$/.test(compact) ? Number(compact) : Number.NaN
}

/** The length a new option row starts with: the shortest one the service does not offer yet. */
export function nextFreeMinutes(used: readonly number[]): number {
  return SERVICE_MINUTES.find(minutes => !used.includes(minutes)) ?? SERVICE_MINUTES[0]!
}

/** The choices of the length select: '30 นาที' ... '180 นาที'. */
export const MINUTES_CHOICES: readonly { value: string, label: string }[] = SERVICE_MINUTES.map(minutes => ({ value: String(minutes), label: `${minutes} นาที` }))
