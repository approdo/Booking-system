import type { BookingStatus } from '../../../../app/utils/bookingRules'
import {
  addDays,
  BOOKING_WINDOW_DAYS,
  isIsoDate,
  minutesFromTime,
  SERVICE_MINUTES,
  timeFromMinutes,
  validateCustomer,
} from '../../../../app/utils/bookingRules'
import { bookingWindow, dayAvailability, isAvailable } from '../availability'
import { bookingLimitReached, insertBookingStatement } from '../bookings'
import type { BookingLimits } from '../bookings'
import type { Context, Handler } from '../context'
import { ApiError, invalidInput } from '../errors'
import { ROWS_ESTIMATE } from '../estimates'
import { json, readJsonObject } from '../http'
import { newBookingCode } from '../ids'
import type { RunResult } from '../ports'
import { bearerToken, findSandbox, newSandbox, sandboxCreated } from '../sandbox'
import type { NewSandbox, Sandbox } from '../sandbox'
import { ensureSeed } from '../seed'
import type { Booking, Shop } from '../shop'
import { loadBusyTimes, loadShop, SEED_SANDBOX } from '../shop'
import { sql } from '../sql'
import { MINUTE_MS } from '../time'

/**
 * Routes for the booking pages. Reading works with or without a sandbox token: without one it shows the
 * starting data and writes nothing (D-008 ข). The first booking creates the visitor's sandbox.
 */

/** The visitor's sandbox, or null for a visitor who has not written anything yet. */
export async function optionalSandbox(context: Context): Promise<Sandbox | null> {
  const token = bearerToken(context.request)
  return token ? findSandbox(context.store, token, context.now, context.settings.sandboxTtlMs) : null
}

/** The data the visitor sees: their sandbox's, or the starting data (written for today if needed). */
export async function shopOf(context: Context, sandbox: Sandbox | null): Promise<Shop> {
  if (!sandbox) await ensureSeed(context.store, context.seedCache, context.today, context.now)
  return loadShop(context.store, sandbox?.id ?? SEED_SANDBOX)
}

function bookableDates(context: Context) {
  return { from: context.today, to: addDays(context.today, BOOKING_WINDOW_DAYS - 1) }
}

/** GET /health: only whether the Worker answers and when the last purge ran. */
export const health: Handler = async ({ store }) => {
  const row = await store.first<{ value: string }>(sql('SELECT value FROM meta WHERE key = ?1', 'last_purge_at'))
  return json({ ok: true, last_purge_at: row?.value ?? null })
}

/** GET /api/shop: the services that take bookings, the therapists, the opening hours and closed days. */
export const getShop: Handler = async (context) => {
  const shop = await shopOf(context, await optionalSandbox(context))
  return json({
    today: context.today,
    bookingWindow: bookableDates(context),
    services: shop.services.filter(service => service.enabled),
    therapists: shop.therapists,
    hours: shop.hours,
    closedDates: shop.closedDates,
  })
}

/**
 * GET /api/availability?minutes=60&therapist=malai (or therapist=any): the 14 bookable days, each with
 * its status and start times (spec section 6).
 */
export const getAvailability: Handler = async (context) => {
  const minutes = Number(context.url.searchParams.get('minutes'))
  const therapistParam = context.url.searchParams.get('therapist') ?? 'any'
  const therapistId = therapistParam === 'any' || therapistParam === '' ? null : therapistParam
  if (!SERVICE_MINUTES.includes(minutes)) throw invalidInput({ minutes: 'invalid' })

  const sandbox = await optionalSandbox(context)
  const shop = await shopOf(context, sandbox)
  if (therapistId !== null && !shop.therapists.some(therapist => therapist.id === therapistId)) throw invalidInput({ therapist: 'unknown' })

  const { from, to } = bookableDates(context)
  const busy = await loadBusyTimes(context.store, sandbox?.id ?? SEED_SANDBOX, from, to)
  const availabilityContext = { shop, busy, today: context.today, nowMinutes: context.nowMinutes }
  return json({
    today: context.today,
    now: timeFromMinutes(context.nowMinutes),
    days: bookingWindow(context.today).map(date => dayAvailability(availabilityContext, date, minutes, therapistId)),
  })
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * POST /api/bookings with { serviceId, minutes, therapistId (null = no preference), date, time, name,
 * phone }. Answers 201 with the booking, plus `sandbox: { token, expiresAt }` when this booking created the
 * visitor's sandbox. The token also comes with a 409 slot_taken that happens after the sandbox was made.
 */
export const createBooking: Handler = async (context) => {
  const body = await readJsonObject(context.request)
  const { settings, store, now } = context

  // 1. Check every field before anything else (N8: the API checks what the browser checked).
  const customer = validateCustomer({ name: text(body.name), phone: text(body.phone) })
  const fields: Record<string, string> = { ...customer.errors }
  const minutes = typeof body.minutes === 'number' ? body.minutes : Number.NaN
  const therapistId = body.therapistId === null || body.therapistId === undefined ? null : text(body.therapistId)
  const date = text(body.date)
  const start = minutesFromTime(text(body.time))
  const { from, to } = bookableDates(context)
  if (!SERVICE_MINUTES.includes(minutes)) fields.minutes = 'invalid'
  if (!isIsoDate(date)) fields.date = 'invalid'
  else if (date < from || date > to) fields.date = 'out_of_range'
  if (start === null) fields.time = 'invalid'

  const sandbox = await optionalSandbox(context)
  const shop = await shopOf(context, sandbox)
  const service = shop.services.find(item => item.id === text(body.serviceId) && item.enabled)
  const option = service?.options.find(item => item.minutes === minutes)
  if (!service) fields.serviceId = 'unknown'
  else if (!option && !fields.minutes) fields.minutes = 'invalid'
  if (therapistId !== null && !shop.therapists.some(therapist => therapist.id === therapistId)) fields.therapistId = 'unknown'
  if (Object.keys(fields).length > 0 || !service || !option || start === null) throw invalidInput(fields)

  // 2. At most BOOKINGS_PER_10_MINUTES new bookings per sandbox, and BOOKINGS_PER_SANDBOX in all. Checked
  // here to answer early, and again by the INSERT itself (requests sent at the same moment).
  const limits: BookingLimits = {
    windowStart: now - 10 * MINUTE_MS,
    perWindow: settings.bookingsPer10Minutes,
    perSandbox: settings.bookingsPerSandbox,
  }
  if (sandbox && await bookingLimitReached(store, sandbox.id, limits)) throw new ApiError('rate_limited')

  // 3. Is the time free (opening hours, today's past times, therapists)? Checked again inside the INSERT.
  const busy = await loadBusyTimes(store, sandbox?.id ?? SEED_SANDBOX, date, date)
  if (!isAvailable({ shop, busy, today: context.today, nowMinutes: context.nowMinutes }, { date, start, minutes, therapistId })) {
    throw new ApiError('slot_taken')
  }

  // 4. Write: the new sandbox (on the first booking) and the booking, in one transaction.
  const estimate = ROWS_ESTIMATE.booking + (sandbox ? 0 : ROWS_ESTIMATE.newSandbox)
  return store.guardedWrite(estimate, async (write) => {
    // A booking number already used in this sandbox breaks the transaction's unique key: try another one.
    for (let attempt = 1; ; attempt++) {
      let created: NewSandbox | null = null
      let sandboxId: string
      if (sandbox) {
        sandboxId = sandbox.id
      }
      else {
        created = await newSandbox({ ipKey: context.ipKey, now, limit: settings.sandboxesPer10MinutesPerIp, random: context.random })
        sandboxId = created.id
      }
      const code = newBookingCode(context.random)
      const statements = [...(created?.statements ?? []), insertBookingStatement({
        sandboxId, code, serviceId: service.id, serviceName: service.name, minutes, price: option.price,
        therapistId, date, start, customerName: customer.name, phone: customer.phone, createdAt: now,
      }, limits)]

      let results: RunResult[]
      try {
        results = await write(statements)
      }
      catch (error) {
        if (store.isConstraintError(error) && attempt < 3) continue
        throw error
      }

      if (created && !sandboxCreated(results)) throw new ApiError('rate_limited')
      const newSandboxDetails = created ? { sandbox: { token: created.token, expiresAt: new Date(now + settings.sandboxTtlMs).toISOString() } } : {}
      if (results.at(-1)?.changes !== 1) {
        // The INSERT refused: either the time was taken meanwhile, or other requests used up the limit.
        if (sandbox && await bookingLimitReached(store, sandbox.id, limits)) throw new ApiError('rate_limited')
        throw new ApiError('slot_taken', newSandboxDetails)
      }

      const booking: Booking = {
        code,
        serviceId: service.id,
        serviceName: service.name,
        minutes,
        price: option.price,
        therapistId,
        date,
        start: timeFromMinutes(start),
        end: timeFromMinutes(start + minutes),
        customerName: customer.name,
        phone: customer.phone,
        status: 'pending' satisfies BookingStatus,
        isNew: true,
        createdAt: new Date(now).toISOString(),
      }
      return json({ booking, ...newSandboxDetails }, 201)
    }
  })
}
