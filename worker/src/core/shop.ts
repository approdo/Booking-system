import type { Booking, DayHours, Service, ServiceOption, Shop, Therapist } from '../../../app/types/api'
import type { BookingStatus } from '../../../app/utils/bookingRules'
import { timeFromMinutes } from '../../../app/utils/bookingRules'
import { sql } from './sql'
import type { Store } from './store'

/** The sandbox that holds the starting data. Visitors without a token read it; nobody writes to it. */
export const SEED_SANDBOX = 'seed'

// The shapes the API sends are shared with the booking pages (app/types/api.ts).
export type { Booking, DayHours, Service, ServiceOption, Shop, Therapist } from '../../../app/types/api'

/** What availability needs to know about a booking: who, which day, from when to when. */
export interface BusyTime {
  therapistId: string | null
  date: string
  start: number
  end: number
}

interface ServiceRow {
  id: string
  category_id: string
  name: string
  description: string
  includes: string | null
  options: string
  enabled: number
}

interface TherapistRow {
  id: string
  name: string
  initial: string
  role: string
  years: number
  specialty: string
  work_days: number
  leave_dates: string
}

interface SettingsRow {
  hours: string
  closed_dates: string
}

export interface BookingRow {
  code: string
  service_id: string
  service_name: string
  minutes: number
  price: number
  therapist_id: string | null
  date: string
  start_min: number
  end_min: number
  customer_name: string
  phone: string
  status: BookingStatus
  is_seed: number
  created_at: number
}

/** Bit n set = works on weekday n. */
export function workDaysFromMask(mask: number): number[] {
  return [0, 1, 2, 3, 4, 5, 6].filter(day => (mask >> day) & 1)
}

export function maskFromWorkDays(days: readonly number[]): number {
  return days.reduce((mask, day) => mask | (1 << day), 0)
}

export function serviceFromRow(row: ServiceRow): Service {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description,
    includes: row.includes,
    options: JSON.parse(row.options) as ServiceOption[],
    enabled: row.enabled === 1,
  }
}

export function therapistFromRow(row: TherapistRow): Therapist {
  return {
    id: row.id,
    name: row.name,
    initial: row.initial,
    role: row.role,
    years: row.years,
    specialty: JSON.parse(row.specialty) as string[],
    workDays: workDaysFromMask(row.work_days),
    leaveDates: JSON.parse(row.leave_dates) as string[],
  }
}

export function bookingFromRow(row: BookingRow): Booking {
  return {
    code: row.code,
    serviceId: row.service_id,
    serviceName: row.service_name,
    minutes: row.minutes,
    price: row.price,
    therapistId: row.therapist_id,
    date: row.date,
    start: timeFromMinutes(row.start_min),
    end: timeFromMinutes(row.end_min),
    customerName: row.customer_name,
    phone: row.phone,
    status: row.status,
    isNew: row.is_seed === 0,
    createdAt: new Date(row.created_at).toISOString(),
  }
}

export const BOOKING_COLUMNS = 'code, service_id, service_name, minutes, price, therapist_id, date, start_min, end_min, customer_name, phone, status, is_seed, created_at'

/** Services (in their order), therapists, opening hours and closed days of a sandbox. */
export async function loadShop(store: Store, sandboxId: string): Promise<Shop> {
  const [services, therapists, settings] = await Promise.all([
    store.all<ServiceRow>(sql(
      'SELECT id, category_id, name, description, includes, options, enabled FROM services WHERE sandbox_id = ?1 ORDER BY position',
      sandboxId,
    )),
    store.all<TherapistRow>(sql(
      'SELECT id, name, initial, role, years, specialty, work_days, leave_dates FROM therapists WHERE sandbox_id = ?1 ORDER BY position',
      sandboxId,
    )),
    store.first<SettingsRow>(sql('SELECT hours, closed_dates FROM shop_settings WHERE sandbox_id = ?1', sandboxId)),
  ])
  return {
    services: services.map(serviceFromRow),
    therapists: therapists.map(therapistFromRow),
    hours: settings ? JSON.parse(settings.hours) as DayHours[] : [],
    closedDates: settings ? JSON.parse(settings.closed_dates) as string[] : [],
  }
}

/** Bookings that hold a therapist's time (not cancelled) from one date to another. */
export async function loadBusyTimes(store: Store, sandboxId: string, from: string, to: string): Promise<BusyTime[]> {
  const rows = await store.all<{ therapist_id: string | null, date: string, start_min: number, end_min: number }>(sql(
    `SELECT therapist_id, date, start_min, end_min FROM bookings
     WHERE sandbox_id = ?1 AND date BETWEEN ?2 AND ?3 AND status <> 'cancelled'`,
    sandboxId,
    from,
    to,
  ))
  return rows.map(row => ({ therapistId: row.therapist_id, date: row.date, start: row.start_min, end: row.end_min }))
}

export async function loadBooking(store: Store, sandboxId: string, code: string): Promise<Booking | null> {
  const row = await store.first<BookingRow>(sql(`SELECT ${BOOKING_COLUMNS} FROM bookings WHERE sandbox_id = ?1 AND code = ?2`, sandboxId, code))
  return row ? bookingFromRow(row) : null
}
