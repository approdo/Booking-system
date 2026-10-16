import type {
  ApiErrorBody,
  AvailabilityResponse,
  Booking,
  BookingCreatedResponse,
  DayHours,
  LoginResponse,
  Service,
  ServiceOption,
  ShopResponse,
  Therapist,
} from '../types/api'
import type { BookingStatus } from './bookingRules'

/**
 * The one layer between the pages and the booking API (BK-005 scope 9). Pages call these methods and get
 * either data or one of the states of the design spec (section 5); they never see HTTP. To connect the
 * booking pages to another back end (a real shop's), only this file changes.
 *
 * Tokens (D-006): the visitor's sandbox token and the back office session live in localStorage under keys
 * that start with 'booking-system:' (the github.io origin is shared with other projects: never clear()
 * the storage) and travel as `Authorization: Bearer`. A missing or blocked storage just means no token.
 *
 * Plain TypeScript (no Nuxt): app/composables/useBookingRepository.ts gives the pages an instance, and the
 * unit tests build one with a fake fetch.
 */

export const STORAGE_KEYS = {
  sandbox: 'booking-system:sandbox',
  session: 'booking-system:session',
} as const

/**
 * Why a request did not give data. `preparing` is not an answer of the API: it is the state of the button
 * while the first write creates the visitor's sandbox (ask willPrepareSandbox() before writing).
 */
export type RepositoryState
  = | 'rate_limited' | 'demo_full' | 'unavailable' | 'sandbox_expired' // spec section 5
    | 'unauthorized' | 'invalid_credentials' | 'invalid_input' | 'slot_taken' | 'invalid_transition' | 'not_found'

export type Result<T>
  = | { ok: true, data: T }
    | { ok: false, state: RepositoryState, fields?: Record<string, string> }

/** The messages of the design spec, section 5, word for word. */
export const stateMessages = {
  preparing: { title: null, text: 'กำลังเตรียมข้อมูลตัวอย่าง…' },
  rate_limited: { title: null, text: 'ส่งคำขอถี่เกินไป กรุณารอสักครู่แล้วลองใหม่' },
  demo_full: { title: 'เดโมเต็มชั่วคราว', text: 'ยังดูข้อมูลได้ตามปกติ ลองจองหรือแก้ไขใหม่ได้หลัง 07:00 น.' },
  unavailable: { title: 'เชื่อมต่อระบบจองไม่ได้', text: 'ตรวจสอบอินเทอร์เน็ตแล้วกด “ลองใหม่”' },
  sandbox_expired: { title: null, text: 'ข้อมูลทดลองของคุณเกิน 24 ชั่วโมงและถูกลบแล้ว — เริ่มใหม่จากข้อมูลตัวอย่าง' },
} as const

/** Where the tokens are kept: localStorage in the browser, a Map in tests. */
export interface TokenStorage {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

/** localStorage, with every access guarded: private windows and blocked storage throw. */
export function browserTokenStorage(): TokenStorage {
  const storage = () => (typeof window === 'undefined' ? null : window.localStorage)
  return {
    get(key) {
      try {
        return storage()?.getItem(key) ?? null
      }
      catch {
        return null
      }
    },
    set(key, value) {
      try {
        storage()?.setItem(key, value)
      }
      catch {
        // Without storage the visitor simply gets a new sandbox next time.
      }
    },
    remove(key) {
      try {
        storage()?.removeItem(key)
      }
      catch {
        // Nothing to remove.
      }
    },
  }
}

export interface NewBookingInput {
  serviceId: string
  minutes: number
  /** null: no preference. */
  therapistId: string | null
  date: string
  time: string
  name: string
  phone: string
}

export interface ServiceFields {
  categoryId: string
  name: string
  description: string
  options: ServiceOption[]
  enabled: boolean
}

type Auth = 'sandbox' | 'session'

export function createBookingRepository(options: { baseUrl: string, storage: TokenStorage, fetch?: typeof fetch }) {
  const baseUrl = options.baseUrl.replace(/\/+$/, '')
  const { storage } = options
  const send = options.fetch ?? ((input, init) => globalThis.fetch(input, init))

  function forgetSandbox() {
    storage.remove(STORAGE_KEYS.sandbox)
    storage.remove(STORAGE_KEYS.session)
  }

  function keepSandbox(body: { sandbox?: { token?: string } } | null) {
    if (body?.sandbox?.token) storage.set(STORAGE_KEYS.sandbox, body.sandbox.token)
  }

  /** Turns an error answer into a state, and drops tokens the API no longer knows. */
  function failure(status: number, body: ApiErrorBody | null): Result<never> {
    keepSandbox(body)
    switch (body?.error) {
      case 'rate_limited': return { ok: false, state: 'rate_limited' }
      case 'demo_full': return { ok: false, state: 'demo_full' }
      case 'sandbox_expired':
        forgetSandbox()
        return { ok: false, state: 'sandbox_expired' }
      case 'unauthorized':
        storage.remove(STORAGE_KEYS.session)
        return { ok: false, state: 'unauthorized' }
      case 'invalid_credentials': return { ok: false, state: 'invalid_credentials' }
      case 'invalid_input': return { ok: false, state: 'invalid_input', fields: body.fields ?? {} }
      case 'slot_taken': return { ok: false, state: 'slot_taken' }
      case 'invalid_transition': return { ok: false, state: 'invalid_transition' }
      case 'not_found': return { ok: false, state: 'not_found' }
      default:
        // backend_unavailable, 5xx, an answer that is not ours: "เชื่อมต่อระบบจองไม่ได้".
        return { ok: false, state: status === 429 ? 'rate_limited' : 'unavailable' }
    }
  }

  async function request<T>(method: string, path: string, auth: Auth, body?: unknown): Promise<Result<T>> {
    const headers: Record<string, string> = {}
    const token = storage.get(auth === 'session' ? STORAGE_KEYS.session : STORAGE_KEYS.sandbox)
    if (token) headers.Authorization = `Bearer ${token}`
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    let response: Response
    let data: unknown
    try {
      response = await send(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
      const text = await response.text()
      data = text ? JSON.parse(text) : null
    }
    catch {
      return { ok: false, state: 'unavailable' }
    }
    if (!response.ok) return failure(response.status, data as ApiErrorBody | null)
    keepSandbox(data as { sandbox?: { token?: string } } | null)
    return { ok: true, data: data as T }
  }

  return {
    /** true when the next write will create the visitor's sandbox: show "กำลังเตรียมข้อมูลตัวอย่าง…". */
    willPrepareSandbox: () => storage.get(STORAGE_KEYS.sandbox) === null,
    hasSession: () => storage.get(STORAGE_KEYS.session) !== null,

    // The booking pages. Reading never creates a sandbox (D-008 ข).
    getShop: () => request<ShopResponse>('GET', '/api/shop', 'sandbox'),
    getAvailability: (minutes: number, therapistId: string | null) =>
      request<AvailabilityResponse>('GET', `/api/availability?minutes=${minutes}&therapist=${encodeURIComponent(therapistId ?? 'any')}`, 'sandbox'),
    createBooking: (booking: NewBookingInput) => request<BookingCreatedResponse>('POST', '/api/bookings', 'sandbox', booking),

    // The back office.
    async login(email: string, password: string): Promise<Result<LoginResponse>> {
      const result = await request<LoginResponse>('POST', '/api/admin/login', 'sandbox', { email, password })
      if (result.ok) storage.set(STORAGE_KEYS.session, result.data.session.token)
      return result
    },
    async logout(): Promise<Result<null>> {
      const result = await request<null>('POST', '/api/admin/logout', 'session')
      storage.remove(STORAGE_KEYS.session)
      return result
    },
    listBookings: () => request<{ today: string, bookings: Booking[] }>('GET', '/api/admin/bookings', 'session'),
    changeStatus: (code: string, status: BookingStatus) =>
      request<{ booking: Booking }>('PATCH', `/api/admin/bookings/${encodeURIComponent(code)}`, 'session', { status }),
    getAdminShop: () => request<ShopResponse>('GET', '/api/admin/shop', 'session'),
    createService: (service: ServiceFields) => request<{ service: Service }>('POST', '/api/admin/services', 'session', service),
    updateService: (id: string, changes: Partial<ServiceFields>) =>
      request<{ service: Service }>('PATCH', `/api/admin/services/${encodeURIComponent(id)}`, 'session', changes),
    updateHours: (hours: DayHours[]) => request<{ hours: DayHours[] }>('PUT', '/api/admin/hours', 'session', { hours }),
    addClosedDate: (date: string) => request<{ closedDates: string[] }>('POST', '/api/admin/closed-dates', 'session', { date }),
    removeClosedDate: (date: string) =>
      request<{ closedDates: string[] }>('DELETE', `/api/admin/closed-dates/${encodeURIComponent(date)}`, 'session'),
    updateWorkDays: (therapistId: string, workDays: number[]) =>
      request<{ therapist: Therapist }>('PATCH', `/api/admin/therapists/${encodeURIComponent(therapistId)}`, 'session', { workDays }),
    addLeaveDate: (therapistId: string, date: string) =>
      request<{ therapist: Therapist }>('POST', `/api/admin/therapists/${encodeURIComponent(therapistId)}/leave-dates`, 'session', { date }),
    removeLeaveDate: (therapistId: string, date: string) =>
      request<{ therapist: Therapist }>('DELETE', `/api/admin/therapists/${encodeURIComponent(therapistId)}/leave-dates/${encodeURIComponent(date)}`, 'session'),
  }
}

export type BookingRepository = ReturnType<typeof createBookingRepository>
