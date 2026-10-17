import { ApiError } from './errors'
import { ipHash, newToken, sha256 } from './ids'
import type { RandomBytes } from './ids'
import type { RunResult, Statement } from './ports'
import { SEED_SANDBOX } from './shop'
import { sql } from './sql'
import type { Store } from './store'
import { MINUTE_MS } from './time'

/**
 * Sandboxes (D-004, D-006, D-008 ข / ค): each visitor who writes something gets a private copy of the
 * starting data, reached with a random token that the browser keeps in localStorage and sends as
 * `Authorization: Bearer <token>`. Reading needs no token and never creates a sandbox; the first write
 * (a booking, or the back office login) does. A sandbox lives SANDBOX_TTL_HOURS: after that the API
 * answers 410 sandbox_expired, and the daily purge deletes it.
 */

export interface Sandbox {
  id: string
  createdAt: number
  expiresAt: number
}

/** The bearer token of a request, or null. */
export function bearerToken(request: Request): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization') ?? '')
  return match?.[1] ?? null
}

/**
 * The sandbox of a token. A token that is unknown (already purged) or older than the time to live gives
 * 410 sandbox_expired: tokens are 256-bit random values, so an unknown one is an old one.
 */
export async function findSandbox(store: Store, token: string, now: number, ttlMs: number): Promise<Sandbox> {
  const id = await sha256(token)
  const row = await store.first<{ created_at: number }>(sql('SELECT created_at FROM sandboxes WHERE id = ?1', id))
  if (!row || now - row.created_at >= ttlMs) throw new ApiError('sandbox_expired')
  return { id, createdAt: row.created_at, expiresAt: row.created_at + ttlMs }
}

/** The tables a sandbox copies from the starting data, with their columns. */
const COPIED_TABLES = {
  services: 'id, category_id, name, description, includes, options, enabled, position',
  therapists: 'id, name, initial, role, years, specialty, work_days, leave_dates, position',
  shop_settings: 'hours, closed_dates',
  bookings: 'code, service_id, service_name, minutes, price, therapist_id, date, start_min, end_min, customer_name, phone, status, is_seed, created_at',
} as const

export interface NewSandbox {
  token: string
  id: string
  /** Run these first in the transaction that writes for the new sandbox. */
  statements: Statement[]
}

/**
 * Statements that create a sandbox and copy the starting data into it, for one transaction.
 *
 * The sandbox row is inserted only while its IP address (IPv6: its /64) has created fewer than `limit`
 * sandboxes in the last 10 minutes, counted from the sandbox rows themselves: no separate counter table
 * (D-008 ค). Every copy checks that the row exists, so a refused sandbox copies nothing; the caller reads
 * `changes` of the first result to tell (0 = refused, 429).
 */
export async function newSandbox(options: { ipKey: string, now: number, limit: number, random: RandomBytes }): Promise<NewSandbox> {
  const token = newToken(options.random)
  const id = await sha256(token)
  const ipKeyHash = await ipHash(options.ipKey)
  const exists = 'EXISTS (SELECT 1 FROM sandboxes WHERE id = ?1)'
  const statements = [
    // created_at is cast: PostgreSQL reads a parameter that is only in the SELECT list as text.
    sql(
      `INSERT INTO sandboxes (id, ip_key, created_at) SELECT ?1, ?2, CAST(?3 AS BIGINT)
       WHERE (SELECT COUNT(*) FROM sandboxes WHERE ip_key = ?2 AND created_at > ?4) < ?5`,
      id,
      ipKeyHash,
      options.now,
      options.now - 10 * MINUTE_MS,
      options.limit,
    ),
    ...Object.entries(COPIED_TABLES).map(([table, columns]) => sql(
      `INSERT INTO ${table} (sandbox_id, ${columns}) SELECT ?1, ${columns} FROM ${table} WHERE sandbox_id = ?2 AND ${exists}`,
      id,
      SEED_SANDBOX,
    )),
  ]
  return { token, id, statements }
}

/** Whether the transaction created the sandbox: the first statement inserted its row. */
export function sandboxCreated(results: readonly RunResult[]): boolean {
  return (results[0]?.changes ?? 0) === 1
}
