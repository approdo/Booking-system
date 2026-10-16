/**
 * Booking rules shared by the booking pages and the back end (worker/): what a name, a phone number and a
 * booking number look like, which status a booking may move to, and the Thai error messages of the forms.
 * Both sides check input with these functions, so the browser and the API never disagree (N8).
 *
 * Plain TypeScript with no Nuxt or Workers imports: Nuxt, the Worker and the unit tests all load it as it is.
 */

// ---------------------------------------------------------------------------------------------
// Statuses (spec section 4)
// ---------------------------------------------------------------------------------------------

export const BOOKING_STATUSES = ['pending', 'confirmed', 'done', 'cancelled'] as const
export type BookingStatus = typeof BOOKING_STATUSES[number]

/**
 * The only status changes the back office can make (spec section 4). Every new booking starts as
 * 'pending'. 'done' and 'cancelled' can be undone, so there is no confirmation pop-up.
 */
export const STATUS_TRANSITIONS: Readonly<Record<BookingStatus, readonly BookingStatus[]>> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['done', 'cancelled'],
  done: ['confirmed'],
  cancelled: ['pending'],
}

/** Statuses that hold a therapist's time. A cancelled booking frees its slot. */
export const ACTIVE_STATUSES: readonly BookingStatus[] = ['pending', 'confirmed', 'done']

export function isBookingStatus(value: unknown): value is BookingStatus {
  return typeof value === 'string' && (BOOKING_STATUSES as readonly string[]).includes(value)
}

export function canChangeStatus(from: BookingStatus, to: BookingStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to)
}

// ---------------------------------------------------------------------------------------------
// Booking numbers (spec section 4): 'NP-' and five characters out of 32, without 0, O, 1 and I
// ---------------------------------------------------------------------------------------------

export const BOOKING_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
export const BOOKING_CODE_PATTERN = /^NP-[2-9A-HJ-NP-Z]{5}$/

/**
 * A booking number from five random bytes. The alphabet has exactly 32 characters, so `byte & 31`
 * picks each one with the same chance (no modulo bias).
 */
export function bookingCodeFromBytes(bytes: Uint8Array): string {
  if (bytes.length !== 5) throw new RangeError('a booking number needs exactly 5 random bytes')
  return `NP-${[...bytes].map(byte => BOOKING_CODE_ALPHABET[byte & 31]).join('')}`
}

/**
 * A booking number as people type it into a search box: 'np 3f8kw', '3F8KW' and 'NP-3F8KW' all give
 * 'NP-3F8KW'. Returns null when the text cannot be a booking number.
 */
export function normalizeBookingCode(text: string): string | null {
  const compact = text.toUpperCase().replace(/[\s-]/g, '')
  const body = compact.startsWith('NP') && compact.length === 7 ? compact.slice(2) : compact
  const code = `NP-${body}`
  return BOOKING_CODE_PATTERN.test(code) ? code : null
}

// ---------------------------------------------------------------------------------------------
// Customer name and phone number (N8)
// ---------------------------------------------------------------------------------------------

export const NAME_MIN_LENGTH = 2
export const NAME_MAX_LENGTH = 100

export type NameError = 'required' | 'too_short' | 'too_long'
export type PhoneError = 'required' | 'invalid'

export interface CustomerFieldErrors {
  name?: NameError
  phone?: PhoneError
}

/** Spaces at the ends removed, and every run of spaces inside turned into one space. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

/**
 * The phone number as it is stored: spaces and dashes removed, digits only, except a leading '+' of
 * the country code. '02-000-0000' gives '020000000'; '+66 2 000 0000' gives '+6620000000'.
 */
export function normalizePhone(phone: string): string {
  return phone.trim().replace(/[\s-]/g, '')
}

const PHONE_PATTERN = /^(0\d{8,9}|\+66\d{8,9})$/

/** Characters as people count them: a Thai vowel sign or tone mark is one character too. */
function characterCount(text: string): number {
  return [...text].length
}

export function nameError(name: string): NameError | undefined {
  const value = normalizeName(name)
  if (value === '') return 'required'
  if (characterCount(value) < NAME_MIN_LENGTH) return 'too_short'
  if (characterCount(value) > NAME_MAX_LENGTH) return 'too_long'
  return undefined
}

export function phoneError(phone: string): PhoneError | undefined {
  const value = normalizePhone(phone)
  if (value === '') return 'required'
  return PHONE_PATTERN.test(value) ? undefined : 'invalid'
}

/** Checks the customer's details (N8). `errors` is empty when both are valid. */
export function validateCustomer(input: { name: string, phone: string }) {
  const errors: CustomerFieldErrors = {}
  const name = nameError(input.name)
  const phone = phoneError(input.phone)
  if (name) errors.name = name
  if (phone) errors.phone = phone
  return { name: normalizeName(input.name), phone: normalizePhone(input.phone), errors }
}

/**
 * Error messages of the booking form, word for word (spec section 10). The invalid phone message is a
 * list of phrases (lesson G-007), so the line breaks only between them.
 */
export const customerFieldMessages = {
  name: {
    required: 'กรุณากรอกชื่อ',
    too_short: 'ชื่อต้องมีอย่างน้อย 2 ตัวอักษร',
    too_long: 'ชื่อต้องไม่เกิน 100 ตัวอักษร',
  },
  phone: {
    required: 'กรุณากรอกเบอร์โทร',
    invalid: ['กรุณากรอกเบอร์โทรให้ถูกต้อง ', 'ขึ้นต้นด้วย 0 หรือ +66 ', 'เช่น 02-000-0000 ', 'หรือ +66 2 000 0000'],
  },
} as const satisfies {
  name: Record<NameError, string>
  phone: Record<PhoneError, string | readonly string[]>
}

// ---------------------------------------------------------------------------------------------
// Days, times and lengths
// ---------------------------------------------------------------------------------------------

/** Customers can book today and the 13 days after it, in Thai time (spec section 6). */
export const BOOKING_WINDOW_DAYS = 14

/** The back office can add a day off up to 60 days ahead (spec section 7). */
export const DAY_OFF_WINDOW_DAYS = 61

/** The lengths a service option can have, in minutes (spec section 7). */
export const SERVICE_MINUTES: readonly number[] = [30, 45, 60, 90, 120, 150, 180]

/** Bookings start on the hour or the half hour. */
export const SLOT_STEP_MINUTES = 30

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** '10:30' gives 630 (minutes after midnight); anything else gives null. */
export function minutesFromTime(time: string): number | null {
  const match = TIME_PATTERN.exec(time)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

/** 630 gives '10:30'. */
export function timeFromMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/** A real calendar date written 'YYYY-MM-DD'. */
export function isIsoDate(text: string): boolean {
  if (!DATE_PATTERN.test(text)) return false
  const date = new Date(`${text}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(text)
}

/** The date `days` after 'YYYY-MM-DD' (negative: before). */
export function addDays(date: string, days: number): string {
  const time = new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000
  return new Date(time).toISOString().slice(0, 10)
}

/** The day of the week of 'YYYY-MM-DD': 0 = Sunday ... 6 = Saturday. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

// ---------------------------------------------------------------------------------------------
// Back office forms: services and opening hours (spec section 7)
// ---------------------------------------------------------------------------------------------

export const SERVICE_NAME_MIN_LENGTH = 2
export const SERVICE_NAME_MAX_LENGTH = 60
export const SERVICE_DESCRIPTION_MAX_LENGTH = 200
export const SERVICE_MAX_OPTIONS = 4
export const PRICE_MIN = 1
export const PRICE_MAX = 100_000

export type ServiceFieldError
  = | 'name_required' | 'name_length' | 'description_too_long' | 'category_unknown'
    | 'options_required' | 'options_too_many' | 'minutes_invalid' | 'minutes_repeated' | 'price_invalid'

export const serviceFieldMessages: Readonly<Record<ServiceFieldError, string>> = {
  name_required: 'กรุณากรอกชื่อบริการ',
  name_length: 'ชื่อบริการต้องยาว 2–60 ตัวอักษร',
  description_too_long: 'คำอธิบายต้องไม่เกิน 200 ตัวอักษร',
  category_unknown: 'กรุณาเลือกหมวด',
  options_required: 'ต้องมีอย่างน้อย 1 ตัวเลือก',
  options_too_many: 'มีตัวเลือกได้ไม่เกิน 4 แบบ',
  minutes_invalid: 'กรุณาเลือกระยะเวลา',
  minutes_repeated: 'ระยะเวลาซ้ำกัน',
  price_invalid: 'ราคาต้องเป็นตัวเลข 1–100,000',
}

export interface ServiceOptionInput {
  minutes: number
  price: number
}

export interface ServiceInput {
  categoryId: string
  name: string
  description: string
  options: readonly ServiceOptionInput[]
}

/**
 * Checks a service from the back office. Returns the cleaned service (options shortest first) and an
 * error code per field: 'name', 'description', 'categoryId' and 'options'.
 */
export function validateService(input: ServiceInput, categoryIds: readonly string[]) {
  const errors: Partial<Record<'name' | 'description' | 'categoryId' | 'options', ServiceFieldError>> = {}
  const name = normalizeName(input.name)
  const description = input.description.trim()

  if (name === '') errors.name = 'name_required'
  else if (characterCount(name) < SERVICE_NAME_MIN_LENGTH || characterCount(name) > SERVICE_NAME_MAX_LENGTH) errors.name = 'name_length'
  if (characterCount(description) > SERVICE_DESCRIPTION_MAX_LENGTH) errors.description = 'description_too_long'
  if (!categoryIds.includes(input.categoryId)) errors.categoryId = 'category_unknown'

  const options = [...input.options].sort((a, b) => a.minutes - b.minutes)
  if (options.length === 0) errors.options = 'options_required'
  else if (options.length > SERVICE_MAX_OPTIONS) errors.options = 'options_too_many'
  else if (options.some(option => !SERVICE_MINUTES.includes(option.minutes))) errors.options = 'minutes_invalid'
  else if (new Set(options.map(option => option.minutes)).size !== options.length) errors.options = 'minutes_repeated'
  else if (options.some(option => !Number.isInteger(option.price) || option.price < PRICE_MIN || option.price > PRICE_MAX)) errors.options = 'price_invalid'

  return { service: { categoryId: input.categoryId, name, description, options }, errors }
}

export type HoursFieldError = 'time_invalid' | 'close_before_open' | 'last_booking_outside'

export const hoursFieldMessages: Readonly<Record<HoursFieldError, string>> = {
  time_invalid: 'กรุณาเลือกเวลา',
  close_before_open: 'เวลาปิดต้องหลังเวลาเปิด',
  last_booking_outside: 'คิวสุดท้ายต้องอยู่ระหว่างเวลาเปิดและเวลาปิด',
}

/** Times the back office offers: every 30 minutes from 06:00 to 23:30 (spec section 7). */
export const EARLIEST_OPENING_MINUTES = 6 * 60
export const LATEST_CLOSING_MINUTES = 23 * 60 + 30

export interface DayHoursInput {
  weekday: number
  closed: boolean
  open: string
  close: string
  lastBooking: string
}

/** Checks one day of the opening hours. A closed day keeps its times but they are not checked. */
export function dayHoursError(day: DayHoursInput): HoursFieldError | undefined {
  if (day.closed) return undefined
  const open = minutesFromTime(day.open)
  const close = minutesFromTime(day.close)
  const last = minutesFromTime(day.lastBooking)
  const onTheGrid = (value: number | null): value is number =>
    value !== null && value % SLOT_STEP_MINUTES === 0 && value >= EARLIEST_OPENING_MINUTES && value <= LATEST_CLOSING_MINUTES
  if (!onTheGrid(open) || !onTheGrid(close) || !onTheGrid(last)) return 'time_invalid'
  if (close <= open) return 'close_before_open'
  if (last < open || last >= close) return 'last_booking_outside'
  return undefined
}
