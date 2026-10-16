/**
 * The five screens of the booking (spec sections 2 and 6), in order. One list for the header's
 * "ขั้น N จาก 5" and progress bar, the page titles and the pages that `nuxt generate` writes.
 *
 * Plain TypeScript: nuxt.config.ts reads it too.
 */
export interface BookingStep {
  /** Route path without the base URL, ending with '/'. */
  path: string
  /** The screen's name: the page title and the header on small screens. */
  title: string
  /** The short name under the progress bar (768px and wider). */
  label: string
}

export const BOOKING_STEPS: readonly BookingStep[] = [
  { path: '/', title: 'เลือกบริการ', label: 'บริการ' },
  { path: '/therapist/', title: 'เลือกหมอนวด', label: 'หมอนวด' },
  { path: '/time/', title: 'วันและเวลา', label: 'วันและเวลา' },
  { path: '/details/', title: 'ชื่อและเบอร์', label: 'ชื่อและเบอร์' },
  { path: '/done/', title: 'ยืนยัน', label: 'ยืนยัน' },
]

/** The paths of the booking screens, for `nitro.prerender.routes`. */
export const BOOKING_STEP_PATHS = BOOKING_STEPS.map(step => step.path)

/** The step of a route path, 1 to 5, or null for a page that is not a booking screen. */
export function bookingStepNumber(path: string): number | null {
  const withSlash = path.endsWith('/') ? path : `${path}/`
  const index = BOOKING_STEPS.findIndex(step => step.path === withSlash)
  return index === -1 ? null : index + 1
}

/** The step with this number (1 to 5). */
export function bookingStep(number: number): BookingStep {
  const step = BOOKING_STEPS[number - 1]
  if (!step) throw new RangeError(`there is no booking step ${number}`)
  return step
}
