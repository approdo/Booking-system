import type { DayHours, Weekday } from '../types/content'

// Opening hours, Thai time (Asia/Bangkok): open every day 10:00–22:00, last booking at 20:30, as on
// Business-site (app/data/contact.ts). One entry per day of the week, Sunday first, so the back office
// can change each day on its own. Bookings start on the half hour.
//
// Like site.ts, this file is also read outside Nuxt (tests, the back end's seed), so it only imports types.
const weekdays: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6]

export const openingHours: readonly DayHours[] = weekdays.map(weekday => ({
  weekday,
  open: '10:00',
  close: '22:00',
  lastBooking: '20:30',
}))
