import { createScheduledController, env } from 'cloudflare:test'
import { createApp } from '../src/app'
import type { AppOptions } from '../src/app'
import type { Env } from '../src/settings'

/**
 * A test client for the Worker: calls the app directly with the local D1 of 'cloudflare:test', on a
 * clock the test controls. Times are UTC; Thai time is 7 hours ahead.
 *
 * Example values follow the project's rules (G-005, D-010): phone 02-000-0000, documentation IP
 * addresses (203.0.113.0/24, 2001:db8::/32), made-up names.
 */

/** Saturday 17 October 2026, 09:00 in Thailand: before opening, so every time of the day is still ahead. */
export const SATURDAY_9AM = Date.parse('2026-10-17T02:00:00Z')
export const TODAY = '2026-10-17'
export const MINUTE = 60 * 1000
export const HOUR = 60 * MINUTE

export const SAMPLE_CUSTOMER = { name: 'ทดลอง ตัวอย่าง', phone: '02-000-0000' }

export interface TestResponse {
  status: number
  body: any // eslint-disable-line @typescript-eslint/no-explicit-any -- JSON of any shape, read by the test
  headers: Headers
}

export interface RequestOptions {
  body?: unknown
  token?: string | null
  ip?: string
  origin?: string
}

export function testApi(options: { start?: number, env?: Partial<Env>, random?: AppOptions['random'] } = {}) {
  let time = options.start ?? SATURDAY_9AM
  const app = createApp({ now: () => time, random: options.random })
  const testEnv = { ...env, ...options.env } as Env

  async function request(method: string, path: string, requestOptions: RequestOptions = {}): Promise<TestResponse> {
    const headers = new Headers({ 'CF-Connecting-IP': requestOptions.ip ?? '203.0.113.10' })
    if (requestOptions.body !== undefined) headers.set('Content-Type', 'application/json')
    if (requestOptions.token) headers.set('Authorization', `Bearer ${requestOptions.token}`)
    if (requestOptions.origin) headers.set('Origin', requestOptions.origin)
    const response = await app.fetch(new Request(`https://api.test${path}`, {
      method,
      headers,
      body: requestOptions.body === undefined ? undefined : JSON.stringify(requestOptions.body),
    }), testEnv)
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers }
  }

  return {
    request,
    get now() {
      return time
    },
    advance(ms: number) {
      time += ms
    },
    /** A booking with sensible defaults: Thai massage, 60 minutes, today. */
    book(booking: Partial<{ serviceId: string, minutes: number, therapistId: string | null, date: string, time: string, name: string, phone: string }>, requestOptions: RequestOptions = {}) {
      return request('POST', '/api/bookings', {
        ...requestOptions,
        body: { serviceId: 'thai-traditional', minutes: 60, therapistId: null, date: TODAY, time: '10:00', ...SAMPLE_CUSTOMER, ...booking },
      })
    },
    /** Signs in with the demo account; returns the session token and the sandbox token (when new). */
    async login(requestOptions: RequestOptions = {}) {
      const response = await request('POST', '/api/admin/login', {
        ...requestOptions,
        body: { email: 'demo@nuanplai.example', password: 'nuanplai-demo' },
      })
      if (response.status !== 200) throw new Error(`login failed: ${response.status} ${JSON.stringify(response.body)}`)
      return { session: response.body.session.token as string, sandbox: response.body.sandbox.token as string | undefined }
    },
    scheduled() {
      return app.scheduled(createScheduledController({ scheduledTime: time, cron: '10 0 * * *' }), testEnv)
    },
  }
}

export const TABLES = ['sandboxes', 'services', 'therapists', 'shop_settings', 'bookings', 'sessions', 'login_failures', 'write_budget', 'meta'] as const

/** Rows per table, to check that a refused request changed nothing. */
export async function tableCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const table of TABLES) {
    const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>()
    counts[table] = row?.count ?? 0
  }
  return counts
}

const SANDBOX_TABLES = ['services', 'therapists', 'shop_settings', 'bookings', 'sessions'] as const
type SandboxRowCounts = Record<typeof SANDBOX_TABLES[number] | 'sandboxes', number>

/** Rows of one sandbox in every table that holds sandbox data. */
export async function sandboxRowCounts(sandboxId: string): Promise<SandboxRowCounts> {
  const counts = { sandboxes: 0 } as SandboxRowCounts
  for (const table of SANDBOX_TABLES) {
    const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE sandbox_id = ?1`).bind(sandboxId).first<{ count: number }>()
    counts[table] = row?.count ?? 0
  }
  const sandbox = await env.DB.prepare('SELECT COUNT(*) AS count FROM sandboxes WHERE id = ?1').bind(sandboxId).first<{ count: number }>()
  counts.sandboxes = sandbox?.count ?? 0
  return counts
}

/** Rows written today (UTC) according to the write budget. */
export async function budgetUsed(day: string): Promise<number> {
  const row = await env.DB.prepare('SELECT rows FROM write_budget WHERE day = ?1').bind(day).first<{ rows: number }>()
  return row?.rows ?? 0
}
