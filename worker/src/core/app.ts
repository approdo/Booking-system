import type { Context, Handler, Params } from './context'
import { ApiError } from './errors'
import { corsHeaders, errorResponse, json, withHeaders } from './http'
import { ipKey, randomBytes } from './ids'
import type { RandomBytes } from './ids'
import type { Config, Db } from './ports'
import { purge } from './purge'
import * as admin from './routes/admin'
import * as customer from './routes/public'
import type { SeedCache } from './seed'
import { parseSettings } from './settings'
import { Store } from './store'
import { bangkokDate, bangkokMinutes } from './time'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** The API: method, path (":name" = a part of the path passed to the handler) and handler. */
const routes: [Method, string, Handler][] = [
  ['GET', '/health', customer.health],
  ['GET', '/api/shop', customer.getShop],
  ['GET', '/api/availability', customer.getAvailability],
  ['POST', '/api/bookings', customer.createBooking],
  ['POST', '/api/admin/login', admin.login],
  ['POST', '/api/admin/logout', admin.logout],
  ['GET', '/api/admin/bookings', admin.listBookings],
  ['PATCH', '/api/admin/bookings/:code', admin.changeBookingStatus],
  ['GET', '/api/admin/shop', admin.getAdminShop],
  ['POST', '/api/admin/services', admin.createService],
  ['PATCH', '/api/admin/services/:id', admin.updateService],
  ['PUT', '/api/admin/hours', admin.updateHours],
  ['POST', '/api/admin/closed-dates', admin.addClosedDate],
  ['DELETE', '/api/admin/closed-dates/:date', admin.removeClosedDate],
  ['PATCH', '/api/admin/therapists/:id', admin.updateTherapist],
  ['POST', '/api/admin/therapists/:id/leave-dates', admin.addLeaveDate],
  ['DELETE', '/api/admin/therapists/:id/leave-dates/:date', admin.removeLeaveDate],
]

const compiledRoutes = routes.map(([method, path, handler]) => ({
  method,
  pattern: new RegExp(`^${path.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`),
  handler,
}))

function findRoute(method: string, pathname: string): { handler: Handler, params: Params } | ApiError {
  const matches = compiledRoutes.filter(route => route.pattern.test(pathname))
  if (matches.length === 0) return new ApiError('not_found')
  const route = matches.find(item => item.method === method)
  if (!route) return new ApiError('method_not_allowed')
  const groups = route.pattern.exec(pathname)?.groups ?? {}
  const params = Object.fromEntries(Object.entries(groups).map(([name, value]) => [name, decodeURIComponent(value)]))
  return { handler: route.handler, params }
}

export interface CoreOptions {
  /** The current time in ms; tests move it forward. */
  now?: () => number
  random?: RandomBytes
}

/** What the platform hands the core on every call: the database and the settings by name. */
export interface Platform {
  db: Db
  config: Config
}

/**
 * The booking API without any platform: `handle` answers one request, `runDailyPurge` runs the daily purge.
 * A platform (src/platform/cloudflare/) turns its own requests, database and schedule into these calls.
 * Tests create their own core with a clock they control.
 */
export function createCore(options: CoreOptions = {}) {
  const now = options.now ?? (() => Date.now())
  const random = options.random ?? randomBytes
  const seedCache: SeedCache = { installed: null }

  return {
    /**
     * Answers one API request. `clientIp` is the caller's IP address as the platform knows it (never a
     * header a client could set itself), or null when it does not know.
     */
    async handle(request: Request, clientIp: string | null, platform: Platform): Promise<Response> {
      const settings = parseSettings(platform.config)
      const cors = corsHeaders(request, settings.allowedOrigins)
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

      const url = new URL(request.url)
      const time = now()
      const callerIpKey = ipKey(clientIp)
      const context: Context = {
        request,
        url,
        settings,
        store: new Store(platform.db, {
          writeBudget: settings.writeBudget,
          ip: { key: callerIpKey, budget: settings.writeBudgetPerIp },
          now: time,
        }),
        now: time,
        today: bangkokDate(time),
        nowMinutes: bangkokMinutes(time),
        ipKey: callerIpKey,
        random,
        seedCache,
      }

      let response: Response
      try {
        const route = findRoute(request.method, url.pathname)
        if (route instanceof ApiError) throw route
        response = await route.handler(context, route.params)
      }
      catch (error) {
        if (error instanceof ApiError) {
          response = errorResponse(error)
        }
        else {
          // Log what failed, never the request body (names and phone numbers) or tokens.
          console.error(`${request.method} ${url.pathname} failed:`, error instanceof Error ? error.message : String(error))
          response = json({ error: 'internal_error' }, 500)
        }
      }
      return withHeaders(response, cors)
    },

    /**
     * The daily purge (src/core/purge.ts). The platform calls it once a day, soon after 00:00 UTC, on its
     * own schedule; calling it twice, or after a missed day, is safe.
     */
    async runDailyPurge(platform: Platform): Promise<{ rowsWritten: number }> {
      const settings = parseSettings(platform.config)
      const time = now()
      return purge(new Store(platform.db, { writeBudget: settings.writeBudget, now: time }), time, settings.sandboxTtlMs)
    },
  }
}
