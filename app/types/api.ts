/**
 * The shapes of the booking API's answers (worker/), shared by the Worker that sends them and the booking
 * pages that read them (app/utils/bookingRepository.ts), so the two cannot drift apart.
 *
 * Dates are 'YYYY-MM-DD' and times 'HH:MM', both in Thai time (Asia/Bangkok).
 */
import type { BookingStatus } from '../utils/bookingRules'

export interface ServiceOption {
  minutes: number
  /** Baht, everything included. */
  price: number
}

export interface Service {
  id: string
  /** One of the categories in app/data/services.ts (names and photos are drawn from there). */
  categoryId: string
  name: string
  description: string
  /** Packages only: what the package is made of. */
  includes: string | null
  /** One to four, shortest first. */
  options: ServiceOption[]
  /** false: closed for bookings for now (the back office still lists it). */
  enabled: boolean
}

export interface Therapist {
  id: string
  name: string
  initial: string
  role: string
  years: number
  /** Phrases (lesson G-007). */
  specialty: string[]
  /** Days of the week the therapist works, 0 = Sunday. */
  workDays: number[]
  /** Days off besides the regular ones. */
  leaveDates: string[]
}

/** Opening hours of one day of the week. */
export interface DayHours {
  weekday: number
  /** true: closed all day on this day of the week. */
  closed: boolean
  open: string
  close: string
  /** The latest start time of a booking. */
  lastBooking: string
}

export interface Shop {
  services: Service[]
  therapists: Therapist[]
  /** Seven entries, Sunday first. */
  hours: DayHours[]
  /** Special days the shop is closed all day. */
  closedDates: string[]
}

/** GET /api/shop (services that take bookings) and GET /api/admin/shop (all services). */
export interface ShopResponse extends Shop {
  today: string
  /** Today and the 13 days after it. */
  bookingWindow: { from: string, to: string }
}

export interface Booking {
  /** 'NP-' and five characters (spec section 4). */
  code: string
  serviceId: string
  /** As it was when booked. */
  serviceName: string
  minutes: number
  /** Baht, as it was when booked. */
  price: number
  /** null: no preferred therapist ("ไม่ระบุ"). */
  therapistId: string | null
  date: string
  start: string
  end: string
  customerName: string
  /** Digits only, '+' kept before 66: '020000000', '+6620000000'. */
  phone: string
  status: BookingStatus
  /** true: made by this visitor, not starting data: the back office shows the label "ใหม่". */
  isNew: boolean
  /** ISO 8601, UTC. */
  createdAt: string
}

/** 'closed' = "หยุด" (shop closed, or the chosen therapist is off), 'full' = "เต็ม", 'available' = "ว่าง". */
export type DayStatus = 'available' | 'full' | 'closed'

export interface Slot {
  time: string
  end: string
  available: boolean
}

export interface DayAvailability {
  date: string
  /** 0 = Sunday. */
  weekday: number
  status: DayStatus
  /** The day's last start time ("รับคิวสุดท้าย 20:30 น."); null when closed. */
  lastBooking: string | null
  /** Every start time of the day; today's past times are left out. */
  slots: Slot[]
}

/** GET /api/availability?minutes=60&therapist=<id or any> */
export interface AvailabilityResponse {
  today: string
  /** The time now in Thailand. */
  now: string
  /** Today and the 13 days after it. */
  days: DayAvailability[]
}

/** Sent with the answer to the write that created the visitor's sandbox. */
export interface NewSandboxDetails {
  token?: string
  /** ISO 8601: when the sandbox and everything in it is deleted. */
  expiresAt: string
}

/** POST /api/bookings: 201. */
export interface BookingCreatedResponse {
  booking: Booking
  sandbox?: NewSandboxDetails
}

/** POST /api/admin/login: 200. `sandbox.token` only when the login created the sandbox. */
export interface LoginResponse {
  session: { token: string }
  sandbox: NewSandboxDetails
}

/** Error codes of the API (worker/src/errors.ts). */
export type ApiErrorCode
  = | 'invalid_input' | 'unauthorized' | 'invalid_credentials' | 'not_found' | 'method_not_allowed'
    | 'slot_taken' | 'invalid_transition' | 'sandbox_expired' | 'rate_limited' | 'demo_full'
    | 'backend_unavailable' | 'internal_error'

export interface ApiErrorBody {
  error: ApiErrorCode
  /** invalid_input: an error code per field, e.g. { phone: 'invalid' }. */
  fields?: Record<string, string>
  /** slot_taken after the first write: the sandbox the request created anyway. */
  sandbox?: NewSandboxDetails
}
