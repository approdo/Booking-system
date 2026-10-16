import { weekdayOf } from '../../app/utils/bookingRules'
import type { BookingStatus } from '../../app/utils/bookingRules'
import type { Store } from './store'

/**
 * The free-therapist rule of src/availability.ts, in SQL, for the statement that takes the time.
 * D1 runs one statement at a time per database, so when two people book the last free place at the same
 * moment, the second INSERT already sees the first booking and inserts nothing (BK-005 scope 4).
 *
 * Parameters: ?1 sandbox, ?2 date, ?3 start and ?4 end (minutes), ?5 weekday, ?6 therapist (NULL = no
 * preference).
 */
const FREE_THERAPIST_CTE = `
  WITH busy AS (
    SELECT therapist_id FROM bookings
    WHERE sandbox_id = ?1 AND date = ?2 AND status <> 'cancelled' AND start_min < ?4 AND end_min > ?3
  ),
  free AS (
    SELECT t.id FROM therapists t
    WHERE t.sandbox_id = ?1
      AND (t.work_days >> ?5) & 1 = 1
      AND NOT EXISTS (SELECT 1 FROM json_each(t.leave_dates) WHERE json_each.value = ?2)
      AND NOT EXISTS (SELECT 1 FROM busy WHERE busy.therapist_id = t.id)
  )`

const SOMEONE_IS_FREE = `
  (SELECT COUNT(*) FROM free) - (SELECT COUNT(*) FROM busy WHERE therapist_id IS NULL) >= 1
  AND (?6 IS NULL OR ?6 IN (SELECT id FROM free))`

export interface NewBooking {
  sandboxId: string
  code: string
  serviceId: string
  serviceName: string
  minutes: number
  price: number
  therapistId: string | null
  date: string
  start: number
  customerName: string
  phone: string
  createdAt: number
}

/** Inserts a 'pending' booking only if the time is still free; `changes` is 0 when it was taken. */
export function insertBookingStatement(store: Store, booking: NewBooking): D1PreparedStatement {
  return store.prepare(`${FREE_THERAPIST_CTE}
    INSERT INTO bookings (sandbox_id, code, service_id, service_name, minutes, price, therapist_id, date, start_min, end_min,
      customer_name, phone, status, is_seed, created_at)
    SELECT ?1, ?7, ?8, ?9, ?10, ?11, ?6, ?2, ?3, ?4, ?12, ?13, 'pending', 0, ?14
    WHERE ${SOMEONE_IS_FREE}`).bind(
    booking.sandboxId,
    booking.date,
    booking.start,
    booking.start + booking.minutes,
    weekdayOf(booking.date),
    booking.therapistId,
    booking.code,
    booking.serviceId,
    booking.serviceName,
    booking.minutes,
    booking.price,
    booking.customerName,
    booking.phone,
    booking.createdAt,
  )
}

/**
 * Moves a cancelled booking back to 'pending' ("คืนคิว") only if its time is still free; `changes` is 0
 * when another booking took the time meanwhile (409 slot_taken).
 */
export function restoreBookingStatement(store: Store, booking: { sandboxId: string, code: string, date: string, start: number, end: number, therapistId: string | null }): D1PreparedStatement {
  return store.prepare(`${FREE_THERAPIST_CTE}
    UPDATE bookings SET status = 'pending'
    WHERE sandbox_id = ?1 AND code = ?7 AND status = 'cancelled' AND ${SOMEONE_IS_FREE}`).bind(
    booking.sandboxId,
    booking.date,
    booking.start,
    booking.end,
    weekdayOf(booking.date),
    booking.therapistId,
    booking.code,
  )
}

/** Any other status change, only from the status the back office saw (another tab may have changed it). */
export function changeStatusStatement(store: Store, change: { sandboxId: string, code: string, from: BookingStatus, to: BookingStatus }): D1PreparedStatement {
  return store.prepare('UPDATE bookings SET status = ?4 WHERE sandbox_id = ?1 AND code = ?2 AND status = ?3')
    .bind(change.sandboxId, change.code, change.from, change.to)
}
