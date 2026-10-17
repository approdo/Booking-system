import { seed } from '../../app/data/seed'
import { addDays, minutesFromTime, normalizePhone } from '../../app/utils/bookingRules'
import { maskFromWorkDays, SEED_SANDBOX } from './shop'
import type { Store } from './store'

/**
 * The starting data in D1, under the sandbox 'seed'. It comes from app/data/seed.ts, the same file the
 * booking pages are generated from, so the two never disagree (BK-005 scope 12).
 *
 * The example bookings are dated from today (Thai time), so the starting data is written again on the
 * first request of each Thai day, and whenever seed.ts changes (a new deploy). That is one batch of about
 * 30 rows a day, written by the Worker for itself: counted in the write budget but never refused, like
 * the purge. Visitors only read it, and a new sandbox copies it with INSERT ... SELECT.
 */

/** A short fingerprint of seed.ts (FNV-1a), to notice a changed seed after a deploy. */
function fingerprint(text: string): string {
  let hash = 0x811C9DC5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

const SEED_VERSION = fingerprint(JSON.stringify(seed))
const SEED_META_KEY = 'seed'

/** Remembers, per Worker instance, which day's starting data is known to be in D1. */
export interface SeedCache {
  installed: string | null
}

function seedRows(today: string) {
  const services = seed.serviceCategories.flatMap(category => category.items.map(item => ({
    id: item.id,
    categoryId: category.id,
    name: item.name,
    description: item.description,
    includes: item.includes ?? null,
    options: JSON.stringify(item.options),
  })))
  const allDays = [0, 1, 2, 3, 4, 5, 6]
  const therapists = seed.therapists.map(therapist => ({
    id: therapist.id,
    name: therapist.name,
    initial: therapist.initial,
    role: therapist.role,
    years: therapist.years,
    specialty: JSON.stringify(therapist.specialty),
    workDays: maskFromWorkDays(allDays.filter(day => !(therapist.daysOff as readonly number[]).includes(day))),
  }))
  const hours = seed.openingHours.map(day => ({
    weekday: day.weekday,
    closed: day.closed ?? false,
    open: day.open,
    close: day.close,
    lastBooking: day.lastBooking,
  }))
  const bookings = seed.sampleBookings.map((booking) => {
    const service = services.find(item => item.id === booking.serviceId)
    const option = seed.serviceCategories.flatMap(category => category.items)
      .find(item => item.id === booking.serviceId)?.options.find(item => item.minutes === booking.minutes)
    const start = minutesFromTime(booking.start)
    if (!service || !option || start === null) throw new Error(`seed booking ${booking.code} does not match the services`)
    return {
      code: booking.code,
      serviceId: booking.serviceId,
      serviceName: service.name,
      minutes: booking.minutes,
      price: option.price,
      therapistId: booking.therapistId,
      date: addDays(today, booking.dayOffset),
      start,
      end: start + booking.minutes,
      customerName: booking.customerName,
      phone: normalizePhone(booking.phone),
      status: booking.status,
    }
  })
  return { services, therapists, hours, closedDates: [...seed.closedDates], bookings }
}

/**
 * Statements that replace the 'seed' sandbox with the starting data dated from `today`, for one batch.
 *
 * Each statement writes only while this version of the starting data is not recorded in meta, and the
 * last one records it. D1 runs the batches of requests sent at the same moment one after another, so when
 * the first requests of a day all find the data missing, the first batch writes it and every later batch
 * writes nothing (D-011 M2): the Worker's own writes stay one installation a day.
 */
function installStatements(store: Store, today: string, now: number): D1PreparedStatement[] {
  const rows = seedRows(today)
  const version = `${SEED_VERSION}:${today}`
  const field = (name: string) => `json_extract(value, '$.${name}')`
  /** The condition of every statement; `parameter` is where the statement binds `version`. */
  const notInstalled = (parameter: string) =>
    `NOT EXISTS (SELECT 1 FROM meta WHERE key = '${SEED_META_KEY}' AND value = ${parameter})`
  return [
    ...['services', 'therapists', 'shop_settings', 'bookings'].map(table =>
      store.prepare(`DELETE FROM ${table} WHERE sandbox_id = ?1 AND ${notInstalled('?2')}`).bind(SEED_SANDBOX, version)),
    // One statement per table, the rows passed as one JSON parameter (D1 allows at most 100 per query).
    store.prepare(`INSERT INTO services (sandbox_id, id, category_id, name, description, includes, options, enabled, position)
      SELECT ?1, ${field('id')}, ${field('categoryId')}, ${field('name')}, ${field('description')}, ${field('includes')},
        ${field('options')}, 1, key FROM json_each(?2) WHERE ${notInstalled('?3')}`)
      .bind(SEED_SANDBOX, JSON.stringify(rows.services), version),
    store.prepare(`INSERT INTO therapists (sandbox_id, id, name, initial, role, years, specialty, work_days, leave_dates, position)
      SELECT ?1, ${field('id')}, ${field('name')}, ${field('initial')}, ${field('role')}, ${field('years')},
        ${field('specialty')}, ${field('workDays')}, '[]', key FROM json_each(?2) WHERE ${notInstalled('?3')}`)
      .bind(SEED_SANDBOX, JSON.stringify(rows.therapists), version),
    store.prepare(`INSERT INTO shop_settings (sandbox_id, hours, closed_dates) SELECT ?1, ?2, ?3 WHERE ${notInstalled('?4')}`)
      .bind(SEED_SANDBOX, JSON.stringify(rows.hours), JSON.stringify(rows.closedDates), version),
    store.prepare(`INSERT INTO bookings (sandbox_id, code, service_id, service_name, minutes, price, therapist_id, date,
        start_min, end_min, customer_name, phone, status, is_seed, created_at)
      SELECT ?1, ${field('code')}, ${field('serviceId')}, ${field('serviceName')}, ${field('minutes')}, ${field('price')},
        ${field('therapistId')}, ${field('date')}, ${field('start')}, ${field('end')}, ${field('customerName')},
        ${field('phone')}, ${field('status')}, 1, ?3 FROM json_each(?2) WHERE ${notInstalled('?4')}`)
      .bind(SEED_SANDBOX, JSON.stringify(rows.bookings), now, version),
    // Last: records the version, which turns every statement above into "write nothing".
    store.prepare(`INSERT INTO meta (key, value) SELECT ?1, ?2 WHERE ${notInstalled('?2')}
      ON CONFLICT (key) DO UPDATE SET value = excluded.value`)
      .bind(SEED_META_KEY, version),
  ]
}

/** Makes sure the 'seed' sandbox holds today's starting data; writes it when it does not. */
export async function ensureSeed(store: Store, cache: SeedCache, today: string, now: number): Promise<void> {
  const wanted = `${SEED_VERSION}:${today}`
  if (cache.installed === wanted) return
  const row = await store.first<{ value: string }>(store.prepare('SELECT value FROM meta WHERE key = ?1').bind(SEED_META_KEY))
  if (row?.value !== wanted) await store.unguardedWrite(write => write(installStatements(store, today, now)))
  cache.installed = wanted
}
