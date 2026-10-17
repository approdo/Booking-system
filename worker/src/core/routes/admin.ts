import { demoAccount } from '../../../../app/data/demoAccount'
import { seed } from '../../../../app/data/seed'
import {
  addDays,
  BOOKING_WINDOW_DAYS,
  canChangeStatus,
  DAY_OFF_WINDOW_DAYS,
  dayHoursError,
  isBookingStatus,
  isIsoDate,
  minutesFromTime,
  normalizeBookingCode,
  SERVICE_MAX_COUNT,
  validateService,
} from '../../../../app/utils/bookingRules'
import type { DayHoursInput, ServiceOptionInput } from '../../../../app/utils/bookingRules'
import { changeStatusStatement, restoreBookingStatement } from '../bookings'
import type { Context, Handler } from '../context'
import { ApiError, invalidInput } from '../errors'
import { ROWS_ESTIMATE } from '../estimates'
import { json, noContent, readJsonObject } from '../http'
import { ipHash, newServiceId, newToken, sha256 } from '../ids'
import { bearerToken, findSandbox, newSandbox, sandboxCreated } from '../sandbox'
import type { NewSandbox, Sandbox } from '../sandbox'
import { ensureSeed } from '../seed'
import type { BookingRow, DayHours, Service, Therapist } from '../shop'
import { BOOKING_COLUMNS, bookingFromRow, loadBooking, loadShop, maskFromWorkDays } from '../shop'
import { sql } from '../sql'
import type { Write } from '../store'
import { MINUTE_MS } from '../time'

/**
 * Routes of the back office. Every route except login needs a session: `Authorization: Bearer <session
 * token>` from the login answer. A session belongs to one sandbox and ends with it.
 */

const CATEGORY_IDS = seed.serviceCategories.map(category => category.id)

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** The session of the request: 401 unauthorized without a valid one, 410 when its sandbox is too old. */
async function requireSession(context: Context): Promise<{ sessionId: string, sandbox: Sandbox }> {
  const token = bearerToken(context.request)
  if (!token) throw new ApiError('unauthorized')
  const sessionId = await sha256(token)
  const row = await context.store.first<{ sandbox_id: string, created_at: number | null }>(sql(
    'SELECT s.sandbox_id, b.created_at FROM sessions s LEFT JOIN sandboxes b ON b.id = s.sandbox_id WHERE s.id = ?1',
    sessionId,
  ))
  if (!row) throw new ApiError('unauthorized')
  const ttl = context.settings.sandboxTtlMs
  if (row.created_at === null || context.now - row.created_at >= ttl) throw new ApiError('sandbox_expired')
  return { sessionId, sandbox: { id: row.sandbox_id, createdAt: row.created_at, expiresAt: row.created_at + ttl } }
}

/**
 * Counts one back office change of a sandbox, or answers 429 rate_limited: at most ADMIN_CHANGES_PER_MINUTE
 * per sandbox, counted on the sandbox row itself (no counter table). SQL computes every SET from the old
 * values, and write transactions run one at a time (Db.transaction), so requests sent at the same moment
 * cannot pass it together.
 */
async function countChange(context: Context, write: Write, sandboxId: string): Promise<void> {
  const { now, settings } = context
  const [count] = await write([sql(
    `UPDATE sandboxes SET
      change_count = CASE WHEN change_window_start > ?2 THEN change_count + 1 ELSE 1 END,
      change_window_start = CASE WHEN change_window_start > ?2 THEN change_window_start ELSE ?3 END
    WHERE id = ?1 AND NOT (change_window_start > ?2 AND change_count >= ?4)`,
    sandboxId,
    now - MINUTE_MS,
    now,
    settings.adminChangesPerMinute,
  )])
  if (count?.changes !== 1) throw new ApiError('rate_limited')
}

/** A back office change: inside the write budgets, and counted by countChange(). */
function adminChange<T>(context: Context, sandbox: Sandbox, work: (write: Write) => Promise<T>): Promise<T> {
  return context.store.guardedWrite(ROWS_ESTIMATE.adminChange, async (write) => {
    await countChange(context, write, sandbox.id)
    return work(write)
  })
}

/**
 * Whether two byte strings are equal, in a time that does not depend on where they first differ: every
 * byte is compared, and the differences are only added up.
 */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let difference = 0
  for (let index = 0; index < a.length; index++) difference |= (a[index] ?? 0) ^ (b[index] ?? 0)
  return difference === 0
}

/**
 * Compares the password without leaking, through timing, how much of it was right: the SHA-256 digests of
 * the two passwords are compared, always 32 bytes, in constant time.
 */
async function credentialsMatch(email: string, password: string): Promise<boolean> {
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
  const [given, expected] = await Promise.all([digest(password), digest(demoAccount.password)])
  return sameBytes(given, expected) && email.trim().toLowerCase() === demoAccount.email
}

/**
 * POST /api/admin/login with { email, password }. Signs in to the visitor's sandbox (the token of the
 * booking pages, if any, as `Authorization: Bearer`), or creates one. Answers { session: { token },
 * sandbox: { token (only when new), expiresAt } }. Wrong password: 401 invalid_credentials; after
 * LOGIN_FAILURES_PER_10_MINUTES wrong passwords from one IP address in 10 minutes: 429 for every further
 * wrong password, while the right one still signs in (D-011 L2).
 *
 * Signing in to an existing sandbox counts as a back office change (ADMIN_CHANGES_PER_MINUTE), and a
 * sandbox keeps at most SESSIONS_PER_SANDBOX sessions: signing in once more ends the oldest (D-011 M1).
 */
export const login: Handler = async (context) => {
  const body = await readJsonObject(context.request)
  const email = text(body.email)
  const password = text(body.password)
  const fields: Record<string, string> = {}
  if (email.trim() === '') fields.email = 'required'
  if (password === '') fields.password = 'required'
  if (Object.keys(fields).length > 0) throw invalidInput(fields)

  const { store, now, settings } = context
  const ipKeyHash = await ipHash(context.ipKey)
  const windowStart = now - 10 * MINUTE_MS
  const estimate = ROWS_ESTIMATE.loginFailure + ROWS_ESTIMATE.newSandbox + ROWS_ESTIMATE.session
  return store.guardedWrite(estimate, async (write) => {
    // The password first: only wrong passwords are counted and limited. On an address that many people
    // share (mobile networks), other people's typos must not lock out a visitor with the right password.
    if (!(await credentialsMatch(email, password))) {
      // Remembered only while this address has fewer than the limit in the last 10 minutes. The INSERT
      // counts itself, and write transactions run one at a time (Db.transaction), so wrong passwords sent
      // at the same moment cannot pass the limit together.
      const [remembered] = await write([sql(
        `INSERT INTO login_failures (ip_key, at) SELECT ?1, ?2
         WHERE (SELECT COUNT(*) FROM login_failures WHERE ip_key = ?1 AND at > ?3) < ?4`,
        ipKeyHash,
        now,
        windowStart,
        settings.loginFailuresPer10Minutes,
      )])
      throw new ApiError(remembered?.changes === 1 ? 'invalid_credentials' : 'rate_limited')
    }

    // The visitor's sandbox while it is still valid; a new one otherwise (the old one is gone or going).
    let sandbox: Sandbox | null = null
    const sandboxToken = bearerToken(context.request)
    if (sandboxToken) {
      sandbox = await findSandbox(store, sandboxToken, now, settings.sandboxTtlMs).catch((error: unknown) => {
        if (error instanceof ApiError && error.code === 'sandbox_expired') return null
        throw error
      })
    }
    let created: NewSandbox | null = null
    let sandboxId: string
    if (sandbox) {
      // Signing in again and again would add sessions without end: it counts as a back office change.
      await countChange(context, write, sandbox.id)
      sandboxId = sandbox.id
    }
    else {
      // A new sandbox copies today's starting data, so make sure it is in the database first.
      await ensureSeed(store, context.seedCache, context.today, now)
      created = await newSandbox({ ipKey: context.ipKey, now, limit: settings.sandboxesPer10MinutesPerIp, random: context.random })
      sandboxId = created.id
    }

    const sessionToken = newToken(context.random)
    const results = await write([
      ...(created?.statements ?? []),
      // Room for the new session: the sandbox keeps only its newest SESSIONS_PER_SANDBOX - 1 others. In the
      // same transaction as the INSERT, so sign-ins sent at the same moment cannot add more together.
      ...(created
        ? []
        : [sql(
            `DELETE FROM sessions WHERE sandbox_id = ?1 AND id NOT IN (
              SELECT id FROM sessions WHERE sandbox_id = ?1 ORDER BY created_at DESC LIMIT ?2)`,
            sandboxId,
            settings.sessionsPerSandbox - 1,
          )]),
      sql(
        'INSERT INTO sessions (id, sandbox_id, created_at) SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM sandboxes WHERE id = ?2)',
        await sha256(sessionToken),
        sandboxId,
        now,
      ),
    ])
    if (created && !sandboxCreated(results)) throw new ApiError('rate_limited')

    const createdAt = sandbox?.createdAt ?? now
    return json({
      session: { token: sessionToken },
      sandbox: { ...(created ? { token: created.token } : {}), expiresAt: new Date(createdAt + settings.sandboxTtlMs).toISOString() },
    })
  })
}

/**
 * POST /api/admin/logout: ends the session; the sandbox and its data stay (spec section 7). Counts as a
 * back office change, like signing in.
 */
export const logout: Handler = async (context) => {
  const { sessionId, sandbox } = await requireSession(context)
  await adminChange(context, sandbox, write =>
    write([sql('DELETE FROM sessions WHERE id = ?1', sessionId)]))
  return noContent()
}

/** GET /api/admin/bookings: every booking of the sandbox, by date and time. */
export const listBookings: Handler = async (context) => {
  const { sandbox } = await requireSession(context)
  const rows = await context.store.all<BookingRow>(sql(
    `SELECT ${BOOKING_COLUMNS} FROM bookings WHERE sandbox_id = ?1 ORDER BY date, start_min, code`,
    sandbox.id,
  ))
  return json({ today: context.today, bookings: rows.map(bookingFromRow) })
}

/**
 * PATCH /api/admin/bookings/:code with { status }: only the changes of spec section 4. Any other change
 * is 409 invalid_transition and changes nothing; restoring a cancelled booking whose time has been taken
 * is 409 slot_taken.
 */
export const changeBookingStatus: Handler = async (context, params) => {
  const { sandbox } = await requireSession(context)
  const body = await readJsonObject(context.request)
  if (!isBookingStatus(body.status)) throw invalidInput({ status: 'invalid' })
  const to = body.status
  const code = normalizeBookingCode(params.code ?? '')
  const booking = code ? await loadBooking(context.store, sandbox.id, code) : null
  if (!code || !booking) throw new ApiError('not_found')
  if (!canChangeStatus(booking.status, to)) throw new ApiError('invalid_transition', { status: booking.status })

  await adminChange(context, sandbox, async (write) => {
    const restoring = booking.status === 'cancelled'
    const statement = restoring
      ? restoreBookingStatement({
          sandboxId: sandbox.id,
          code,
          date: booking.date,
          start: minutesFromTime(booking.start) ?? 0,
          end: minutesFromTime(booking.end) ?? 0,
          therapistId: booking.therapistId,
        })
      : changeStatusStatement({ sandboxId: sandbox.id, code, from: booking.status, to })
    const [result] = await write([statement])
    if (result?.changes !== 1) throw new ApiError(restoring ? 'slot_taken' : 'invalid_transition')
  })
  return json({ booking: { ...booking, status: to } })
}

/** GET /api/admin/shop: like GET /api/shop, with the services that are closed for bookings too. */
export const getAdminShop: Handler = async (context) => {
  const { sandbox } = await requireSession(context)
  const shop = await loadShop(context.store, sandbox.id)
  return json({
    today: context.today,
    bookingWindow: { from: context.today, to: addDays(context.today, BOOKING_WINDOW_DAYS - 1) },
    ...shop,
  })
}

function serviceOptions(value: unknown): ServiceOptionInput[] | null {
  if (!Array.isArray(value)) return null
  const options = value.map(item => (item !== null && typeof item === 'object' ? item as Record<string, unknown> : {}))
  if (options.some(option => typeof option.minutes !== 'number' || typeof option.price !== 'number')) return null
  return options.map(option => ({ minutes: option.minutes as number, price: option.price as number }))
}

/** Checks a service from the back office: 400 with an error code per field (spec section 7). */
function checkedService(input: { categoryId: unknown, name: unknown, description: unknown, options: unknown, enabled: unknown }) {
  const options = serviceOptions(input.options)
  const { service, errors } = validateService({
    categoryId: text(input.categoryId),
    name: text(input.name),
    description: text(input.description),
    options: options ?? [],
  }, CATEGORY_IDS)
  const fields: Record<string, string> = { ...errors }
  if (options === null) fields.options = 'options_required'
  if (typeof input.enabled !== 'boolean') fields.enabled = 'invalid'
  if (Object.keys(fields).length > 0) throw invalidInput(fields)
  return { ...service, enabled: input.enabled as boolean }
}

/**
 * POST /api/admin/services with { categoryId, name, description, options, enabled }: a new service at the
 * end of the list. A sandbox has at most SERVICE_MAX_COUNT services, so that every read of the shop stays
 * small (D-008): one more is 400 with { services: 'services_too_many' }.
 */
export const createService: Handler = async (context) => {
  const { sandbox } = await requireSession(context)
  const body = await readJsonObject(context.request)
  const input = checkedService({
    categoryId: body.categoryId,
    name: body.name,
    description: body.description ?? '',
    options: body.options,
    enabled: body.enabled ?? true,
  })
  const id = newServiceId(context.random)
  await adminChange(context, sandbox, async (write) => {
    // Counted inside the INSERT, so requests sent at the same moment cannot pass the limit together.
    // Services are never deleted (spec section 7): their count is also the next position in the list.
    const [inserted] = await write([sql(
      `INSERT INTO services (sandbox_id, id, category_id, name, description, includes, options, enabled, position)
       SELECT ?1, ?2, ?3, ?4, ?5, NULL, ?6, ?7, service_count
       FROM (SELECT COUNT(*) AS service_count FROM services WHERE sandbox_id = ?1)
       WHERE service_count < ?8`,
      sandbox.id,
      id,
      input.categoryId,
      input.name,
      input.description,
      JSON.stringify(input.options),
      input.enabled ? 1 : 0,
      SERVICE_MAX_COUNT,
    )])
    if (inserted?.changes !== 1) throw invalidInput({ services: 'services_too_many' })
  })
  const service: Service = { id, includes: null, ...input }
  return json({ service }, 201)
}

/**
 * PATCH /api/admin/services/:id with any of { categoryId, name, description, options, enabled }: e.g.
 * { enabled: false } closes a service for bookings without deleting it. There is no delete (spec section 7).
 */
export const updateService: Handler = async (context, params) => {
  const { sandbox } = await requireSession(context)
  const body = await readJsonObject(context.request)
  const shop = await loadShop(context.store, sandbox.id)
  const current = shop.services.find(service => service.id === params.id)
  if (!current) throw new ApiError('not_found')
  const input = checkedService({ ...current, ...body })
  await adminChange(context, sandbox, write => write([sql(
    'UPDATE services SET category_id = ?3, name = ?4, description = ?5, options = ?6, enabled = ?7 WHERE sandbox_id = ?1 AND id = ?2',
    sandbox.id,
    current.id,
    input.categoryId,
    input.name,
    input.description,
    JSON.stringify(input.options),
    input.enabled ? 1 : 0,
  )]))
  const service: Service = { ...current, ...input }
  return json({ service })
}

/** PUT /api/admin/hours with { hours: [7 days, { weekday, closed, open, close, lastBooking }] }. */
export const updateHours: Handler = async (context) => {
  const { sandbox } = await requireSession(context)
  const body = await readJsonObject(context.request)
  const days = Array.isArray(body.hours) ? body.hours as Record<string, unknown>[] : []
  const hours: DayHours[] = days.map(day => ({
    weekday: typeof day?.weekday === 'number' ? day.weekday : -1,
    closed: day?.closed === true,
    open: text(day?.open),
    close: text(day?.close),
    lastBooking: text(day?.lastBooking),
  })).sort((a, b) => a.weekday - b.weekday)
  if (hours.map(day => day.weekday).join() !== '0,1,2,3,4,5,6') throw invalidInput({ hours: 'seven_days' })
  const fields: Record<string, string> = {}
  for (const day of hours) {
    const error = dayHoursError(day satisfies DayHoursInput)
    if (error) fields[`hours.${day.weekday}`] = error
  }
  if (Object.keys(fields).length > 0) throw invalidInput(fields)

  await adminChange(context, sandbox, write => write([sql('UPDATE shop_settings SET hours = ?2 WHERE sandbox_id = ?1', sandbox.id, JSON.stringify(hours))]))
  return json({ hours })
}

/** A date the back office can add as a closed day or a day off: today to 60 days ahead (spec section 7). */
function checkedDayOff(context: Context, value: unknown): string {
  const date = text(value)
  if (!isIsoDate(date)) throw invalidInput({ date: 'invalid' })
  if (date < context.today || date > addDays(context.today, DAY_OFF_WINDOW_DAYS - 1)) throw invalidInput({ date: 'out_of_range' })
  return date
}

async function saveClosedDates(context: Context, sandbox: Sandbox, change: (dates: Set<string>) => void): Promise<Response> {
  const shop = await loadShop(context.store, sandbox.id)
  const dates = new Set(shop.closedDates)
  change(dates)
  const closedDates = [...dates].sort()
  await adminChange(context, sandbox, write => write([sql('UPDATE shop_settings SET closed_dates = ?2 WHERE sandbox_id = ?1', sandbox.id, JSON.stringify(closedDates))]))
  return json({ closedDates })
}

/** POST /api/admin/closed-dates with { date }: the shop is closed all day on that date. */
export const addClosedDate: Handler = async (context) => {
  const { sandbox } = await requireSession(context)
  const date = checkedDayOff(context, (await readJsonObject(context.request)).date)
  return saveClosedDates(context, sandbox, dates => dates.add(date))
}

/** DELETE /api/admin/closed-dates/:date */
export const removeClosedDate: Handler = async (context, params) => {
  const { sandbox } = await requireSession(context)
  return saveClosedDates(context, sandbox, dates => dates.delete(params.date ?? ''))
}

async function saveTherapist(context: Context, sandbox: Sandbox, id: string, change: (therapist: Therapist) => Therapist): Promise<Response> {
  const shop = await loadShop(context.store, sandbox.id)
  const current = shop.therapists.find(therapist => therapist.id === id)
  if (!current) throw new ApiError('not_found')
  const therapist = change(current)
  therapist.leaveDates = [...new Set(therapist.leaveDates)].sort()
  await adminChange(context, sandbox, write => write([sql(
    'UPDATE therapists SET work_days = ?3, leave_dates = ?4 WHERE sandbox_id = ?1 AND id = ?2',
    sandbox.id,
    id,
    maskFromWorkDays(therapist.workDays),
    JSON.stringify(therapist.leaveDates),
  )]))
  return json({ therapist })
}

/** PATCH /api/admin/therapists/:id with { workDays: [1, 2, ...] } (0 = Sunday). */
export const updateTherapist: Handler = async (context, params) => {
  const { sandbox } = await requireSession(context)
  const { workDays } = await readJsonObject(context.request)
  const valid = Array.isArray(workDays) && workDays.every(day => Number.isInteger(day) && day >= 0 && day <= 6)
    && new Set(workDays).size === workDays.length
  if (!valid) throw invalidInput({ workDays: 'invalid' })
  const days = [...(workDays as number[])].sort()
  return saveTherapist(context, sandbox, params.id ?? '', therapist => ({ ...therapist, workDays: days }))
}

/** POST /api/admin/therapists/:id/leave-dates with { date }: a day off for one therapist. */
export const addLeaveDate: Handler = async (context, params) => {
  const { sandbox } = await requireSession(context)
  const date = checkedDayOff(context, (await readJsonObject(context.request)).date)
  return saveTherapist(context, sandbox, params.id ?? '', therapist => ({ ...therapist, leaveDates: [...therapist.leaveDates, date] }))
}

/** DELETE /api/admin/therapists/:id/leave-dates/:date */
export const removeLeaveDate: Handler = async (context, params) => {
  const { sandbox } = await requireSession(context)
  return saveTherapist(context, sandbox, params.id ?? '', therapist =>
    ({ ...therapist, leaveDates: therapist.leaveDates.filter(date => date !== params.date) }))
}
