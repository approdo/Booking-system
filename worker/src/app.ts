import type { Context, Handler, Params } from './context'
import { ApiError } from './errors'
import { corsHeaders, errorResponse, json, withHeaders } from './http'
import { ipKey, randomBytes } from './ids'
import type { RandomBytes } from './ids'
import { purge } from './purge'
import * as admin from './routes/admin'
import * as customer from './routes/public'
import type { SeedCache } from './seed'
import { readSettings } from './settings'
import type { Env } from './settings'
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

export interface AppOptions {
  /** The current time in ms; tests move it forward. */
  now?: () => number
  random?: RandomBytes
}

/**
 * The Worker: `fetch` answers the API, `scheduled` runs the daily purge. Tests create their own app
 * with a clock they control; src/index.ts exports the real one.
 */
export function createApp(options: AppOptions = {}) {
  const now = options.now ?? (() => Date.now())
  const random = options.random ?? randomBytes
  const seedCache: SeedCache = { installed: null }

  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const settings = readSettings(env)
      const cors = corsHeaders(request, settings.allowedOrigins)
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

      const url = new URL(request.url)
      const time = now()
      const context: Context = {
        request,
        url,
        env,
        settings,
        store: new Store(env.DB, settings.writeBudget, time),
        now: time,
        today: bangkokDate(time),
        nowMinutes: bangkokMinutes(time),
        ipKey: ipKey(request.headers.get('CF-Connecting-IP')),
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

    async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
      const settings = readSettings(env)
      const time = now()
      await purge(new Store(env.DB, settings.writeBudget, time), time, settings.sandboxTtlMs)
    },
  }
}
