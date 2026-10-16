import type { Booking } from '../types/api'
import { BOOKING_CODE_PATTERN, isIsoDate, minutesFromTime } from './bookingRules'
import { bookingStep } from './bookingSteps'

/**
 * What the visitor has chosen so far (spec section 2). It lives in sessionStorage, so a reload or the
 * Back button keeps it, and closing the tab forgets it. Keys start with 'booking-system:' because the
 * github.io origin is shared with other projects (never clear() the storage).
 *
 * Plain TypeScript; the booking pages read and write it with readDraft() and writeDraft().
 */

export const DRAFT_STORAGE_KEYS = {
  draft: 'booking-system:draft',
  lastBooking: 'booking-system:last-booking',
} as const

export interface DraftService {
  id: string
  name: string
  minutes: number
  /** Baht, as shown on the first screen. The booking keeps the price the API answers with. */
  price: number
}

export interface DraftTherapist {
  /** null: no preference ("ไม่ระบุ"). */
  id: string | null
  name: string
}

export interface DraftTime {
  /** 'HH:MM', Thai time. */
  start: string
  end: string
}

export interface BookingDraft {
  service?: DraftService
  therapist?: DraftTherapist
  /** 'YYYY-MM-DD', Thai time. */
  date?: string
  time?: DraftTime
  name?: string
  phone?: string
}

/** A new service (or a new length of it) clears the day and the time: they depend on the length. */
export function withService(draft: BookingDraft, service: DraftService): BookingDraft {
  const same = draft.service?.id === service.id && draft.service.minutes === service.minutes
  return same ? { ...draft, service } : { ...draft, service, date: undefined, time: undefined }
}

/** Another therapist clears the time (the day stays: the screen picks it again if it is still free). */
export function withTherapist(draft: BookingDraft, therapist: DraftTherapist): BookingDraft {
  return draft.therapist?.id === therapist.id ? { ...draft, therapist } : { ...draft, therapist, time: undefined }
}

export function withDate(draft: BookingDraft, date: string): BookingDraft {
  return draft.date === date ? draft : { ...draft, date, time: undefined }
}

/**
 * The path of the first screen whose answer is missing: '/' without a service, then '/therapist/',
 * '/time/' and finally '/details/' when everything up to the time is chosen.
 */
export function firstIncompletePath(draft: BookingDraft): string {
  if (!draft.service) return bookingStep(1).path
  if (!draft.therapist) return bookingStep(2).path
  if (!draft.date || !draft.time) return bookingStep(3).path
  return bookingStep(4).path
}

/** Whether the screen with this number (2 to 4) can open: every earlier screen has its answer. */
export function canOpenStep(draft: BookingDraft, step: number): boolean {
  const done = [true, Boolean(draft.service), Boolean(draft.therapist), Boolean(draft.date && draft.time)]
  return done.slice(0, step).every(Boolean)
}

// ---------------------------------------------------------------------------------------------
// Reading and writing. Whatever is in the storage is checked, so a broken or old value gives an
// empty draft instead of a broken page.
// ---------------------------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isTime(value: unknown): value is string {
  return typeof value === 'string' && minutesFromTime(value) !== null
}

function parseService(value: unknown): DraftService | undefined {
  if (!isObject(value)) return undefined
  const { id, name, minutes, price } = value
  if (typeof id !== 'string' || typeof name !== 'string' || typeof minutes !== 'number' || typeof price !== 'number') return undefined
  return { id, name, minutes, price }
}

function parseTherapist(value: unknown): DraftTherapist | undefined {
  if (!isObject(value)) return undefined
  const { id, name } = value
  if ((id !== null && typeof id !== 'string') || typeof name !== 'string') return undefined
  return { id, name }
}

function parseTime(value: unknown): DraftTime | undefined {
  if (!isObject(value) || !isTime(value.start) || !isTime(value.end)) return undefined
  return { start: value.start, end: value.end }
}

/** The draft in a stored JSON text; anything that does not fit is left out. */
export function parseDraft(text: string | null): BookingDraft {
  let value: unknown
  try {
    value = text ? JSON.parse(text) : null
  }
  catch {
    return {}
  }
  if (!isObject(value)) return {}
  const draft: BookingDraft = {
    service: parseService(value.service),
    therapist: parseTherapist(value.therapist),
    date: typeof value.date === 'string' && isIsoDate(value.date) ? value.date : undefined,
    time: parseTime(value.time),
    name: typeof value.name === 'string' ? value.name : undefined,
    phone: typeof value.phone === 'string' ? value.phone : undefined,
  }
  // A later answer means nothing without the earlier ones.
  if (!draft.service) return {}
  if (!draft.date) draft.time = undefined
  return draft
}

/** The booking stored after the last confirmed booking, or null. */
export function parseLastBooking(text: string | null): Booking | null {
  let value: unknown
  try {
    value = text ? JSON.parse(text) : null
  }
  catch {
    return null
  }
  if (!isObject(value) || typeof value.code !== 'string' || !BOOKING_CODE_PATTERN.test(value.code)) return null
  const strings = ['serviceName', 'date', 'start', 'end', 'customerName', 'phone'] as const
  if (strings.some(key => typeof value[key] !== 'string')) return null
  if (typeof value.minutes !== 'number' || typeof value.price !== 'number') return null
  return value as unknown as Booking
}

/** sessionStorage, with every access guarded: private windows and blocked storage throw. */
function session(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  }
  catch {
    return null
  }
}

function read(key: string): string | null {
  try {
    return session()?.getItem(key) ?? null
  }
  catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) session()?.removeItem(key)
    else session()?.setItem(key, value)
  }
  catch {
    // Without storage the draft lasts until the page is left.
  }
}

export function readDraft(): BookingDraft {
  return parseDraft(read(DRAFT_STORAGE_KEYS.draft))
}

export function writeDraft(draft: BookingDraft) {
  write(DRAFT_STORAGE_KEYS.draft, JSON.stringify(draft))
}

export function clearDraft() {
  write(DRAFT_STORAGE_KEYS.draft, null)
}

export function readLastBooking(): Booking | null {
  return parseLastBooking(read(DRAFT_STORAGE_KEYS.lastBooking))
}

export function writeLastBooking(booking: Booking) {
  write(DRAFT_STORAGE_KEYS.lastBooking, JSON.stringify(booking))
}
