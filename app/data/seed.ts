import { openingHours } from './hours'
import { sampleBookings } from './sampleBookings'
import { serviceCategories } from './services'
import { therapists } from './team'

/**
 * The starting data of the booking system, in one place: services and prices, therapists, opening hours,
 * special closed days and the example bookings. Two readers use this very file (BK-005, spec section 6):
 *
 * - the booking pages, which draw the services into the generated HTML without waiting for the API;
 * - the back end (worker/src/core/seed.ts), which writes it into D1 as the starting data of every sandbox.
 *
 * Change the shop's data in the files it collects (services.ts, team.ts, hours.ts, sampleBookings.ts).
 */
export const seed = {
  serviceCategories,
  therapists,
  openingHours,
  /** Special days the shop is closed all day, 'YYYY-MM-DD'. None to start with. */
  closedDates: [] as readonly string[],
  sampleBookings,
}

export type Seed = typeof seed
