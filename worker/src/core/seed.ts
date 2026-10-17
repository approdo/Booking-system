import { seed } from '../../../app/data/seed'
import { addDays, minutesFromTime, normalizePhone } from '../../../app/utils/bookingRules'
import type { SqlValue, Statement } from './ports'
import { maskFromWorkDays, SEED_SANDBOX } from './shop'
import { sql } from './sql'
import type { Store } from './store'

/**
 * The starting data in the database, under the sandbox 'seed'. It comes from app/data/seed.ts, the same
 * file the booking pages are generated from, so the two never disagree (BK-005 scope 12).
 *
 * The example bookings are dated from today (Thai time), so the starting data is written again on the
 * first request of each Thai day, and whenever seed.ts changes (a new deploy). That is one transaction of
 * about 30 rows a day, written by the API for itself: counted in the write budget but never refused, like
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

/** Remembers, per running instance of the API, which day's starting data is known to be in the database. */
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

/** The condition of every statement of the installation; `parameter` is where the statement binds the version. */
function notInstalled(parameter: string): string {
  return `NOT EXISTS (SELECT 1 FROM meta WHERE key = '${SEED_META_KEY}' AND value = ${parameter})`
}

/** How a column's parameters are cast: numbers must be, or PostgreSQL reads them as text. */
type ColumnType = 'TEXT' | 'INTEGER' | 'BIGINT'

/**
 * Statements that insert `rows` into `table` for the 'seed' sandbox, each only while `version` is not
 * installed. The rows go in as a VALUES list, whose columns SQLite and PostgreSQL both name column1,
 * column2, ... (plain SQL: no JSON functions), split so that no statement binds more than `maxParams`
 * parameters. `columns` names the table's columns in the order of each row's values.
 */
function insertRows(table: string, columns: Record<string, ColumnType>, rows: SqlValue[][], version: string, maxParams: number): Statement[] {
  const names = Object.keys(columns)
  const types = Object.values(columns)
  // ?1 is the sandbox and ?2 the version; every row adds one parameter per column.
  const rowsPerStatement = Math.floor((maxParams - 2) / names.length)
  if (rowsPerStatement < 1) throw new Error(`${table}: one row needs more than ${maxParams} parameters`)
  const statements: Statement[] = []
  for (let first = 0; first < rows.length; first += rowsPerStatement) {
    const params: SqlValue[] = [SEED_SANDBOX, version]
    const tuples = rows.slice(first, first + rowsPerStatement).map(row => `(${row.map((value, index) => {
      params.push(value)
      const type = types[index] ?? 'TEXT'
      return type === 'TEXT' ? `?${params.length}` : `CAST(?${params.length} AS ${type})`
    }).join(', ')})`)
    statements.push(sql(
      `INSERT INTO ${table} (sandbox_id, ${names.join(', ')})
       SELECT ?1, ${names.map((_, index) => `v.column${index + 1}`).join(', ')}
       FROM (VALUES ${tuples.join(', ')}) AS v
       WHERE ${notInstalled('?2')}`,
      ...params,
    ))
  }
  return statements
}

/**
 * Statements that replace the 'seed' sandbox with the starting data dated from `today`, for one transaction.
 *
 * Each statement writes only while this version of the starting data is not recorded in meta, and the
 * last one records it. The database runs the transactions of requests sent at the same moment one after
 * another (Db.transaction), so when the first requests of a day all find the data missing, the first
 * transaction writes it and every later one writes nothing (D-011 M2): the API's own writes stay one
 * installation a day. Exported for the tests.
 */
export function installStatements(today: string, now: number, maxParams: number): Statement[] {
  const rows = seedRows(today)
  const version = `${SEED_VERSION}:${today}`
  return [
    ...['services', 'therapists', 'shop_settings', 'bookings'].map(table =>
      sql(`DELETE FROM ${table} WHERE sandbox_id = ?1 AND ${notInstalled('?2')}`, SEED_SANDBOX, version)),
    // position: the order of the starting data, from 0.
    ...insertRows('services', {
      id: 'TEXT', category_id: 'TEXT', name: 'TEXT', description: 'TEXT', includes: 'TEXT', options: 'TEXT',
      enabled: 'INTEGER', position: 'INTEGER',
    }, rows.services.map((service, position) => [
      service.id, service.categoryId, service.name, service.description, service.includes, service.options, 1, position,
    ]), version, maxParams),
    ...insertRows('therapists', {
      id: 'TEXT', name: 'TEXT', initial: 'TEXT', role: 'TEXT', years: 'INTEGER', specialty: 'TEXT',
      work_days: 'INTEGER', leave_dates: 'TEXT', position: 'INTEGER',
    }, rows.therapists.map((therapist, position) => [
      therapist.id, therapist.name, therapist.initial, therapist.role, therapist.years, therapist.specialty,
      therapist.workDays, '[]', position,
    ]), version, maxParams),
    sql(
      `INSERT INTO shop_settings (sandbox_id, hours, closed_dates) SELECT ?1, ?2, ?3 WHERE ${notInstalled('?4')}`,
      SEED_SANDBOX,
      JSON.stringify(rows.hours),
      JSON.stringify(rows.closedDates),
      version,
    ),
    ...insertRows('bookings', {
      code: 'TEXT', service_id: 'TEXT', service_name: 'TEXT', minutes: 'INTEGER', price: 'INTEGER',
      therapist_id: 'TEXT', date: 'TEXT', start_min: 'INTEGER', end_min: 'INTEGER', customer_name: 'TEXT',
      phone: 'TEXT', status: 'TEXT', is_seed: 'INTEGER', created_at: 'BIGINT',
    }, rows.bookings.map(booking => [
      booking.code, booking.serviceId, booking.serviceName, booking.minutes, booking.price, booking.therapistId,
      booking.date, booking.start, booking.end, booking.customerName, booking.phone, booking.status, 1, now,
    ]), version, maxParams),
    // Last: records the version, which turns every statement above into "write nothing".
    sql(
      `INSERT INTO meta (key, value) SELECT ?1, ?2 WHERE ${notInstalled('?2')}
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      SEED_META_KEY,
      version,
    ),
  ]
}

/** Makes sure the 'seed' sandbox holds today's starting data; writes it when it does not. */
export async function ensureSeed(store: Store, cache: SeedCache, today: string, now: number): Promise<void> {
  const wanted = `${SEED_VERSION}:${today}`
  if (cache.installed === wanted) return
  const row = await store.first<{ value: string }>(sql('SELECT value FROM meta WHERE key = ?1', SEED_META_KEY))
  if (row?.value !== wanted) await store.unguardedWrite(write => write(installStatements(today, now, store.maxParams)))
  cache.installed = wanted
}
