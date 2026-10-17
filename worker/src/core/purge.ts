import { addDays } from '../../../app/utils/bookingRules'
import { SEED_SANDBOX } from './shop'
import { sql } from './sql'
import type { Store } from './store'
import { utcDate } from './time'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The daily purge (D-006): deletes every sandbox older than the time to live with all its rows, the
 * wrong-password records older than a day, the write counts per IP address of past days and the daily
 * write counts older than a week, then records last_purge_at. The platform runs it once a day, just after
 * the daily write budgets start again at 00:00 UTC (on Cloudflare: a Cron Trigger at 00:10 UTC, 07:10 Thai
 * time).
 *
 * One transaction of ten statements, each deleting a whole set of rows (D1's free plan allows 50 queries
 * per run; there is no loop per sandbox). Rows of a sandbox that is not alive any more are deleted whatever
 * the reason, so running it twice, or after a missed day, is safe. Its writes are counted in the daily
 * budget but never refused (D-008 ก).
 */
export async function purge(store: Store, now: number, ttlMs: number): Promise<{ rowsWritten: number }> {
  const liveSandboxes = 'SELECT id FROM sandboxes WHERE created_at > ?1'
  const cutoff = now - ttlMs
  const statements = [
    ...['bookings', 'services', 'therapists', 'shop_settings'].map(table => sql(
      `DELETE FROM ${table} WHERE sandbox_id <> ?2 AND sandbox_id NOT IN (${liveSandboxes})`,
      cutoff,
      SEED_SANDBOX,
    )),
    sql(`DELETE FROM sessions WHERE sandbox_id NOT IN (${liveSandboxes})`, cutoff),
    sql('DELETE FROM sandboxes WHERE created_at <= ?1', cutoff),
    sql('DELETE FROM login_failures WHERE at <= ?1', now - DAY_MS),
    sql('DELETE FROM ip_write_budget WHERE day < ?1', utcDate(now)),
    sql('DELETE FROM write_budget WHERE day < ?1', addDays(utcDate(now), -7)),
    sql('INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = excluded.value', 'last_purge_at', new Date(now).toISOString()),
  ]
  let rowsWritten = 0
  await store.unguardedWrite(async (write) => {
    const results = await write(statements)
    rowsWritten = results.reduce((sum, result) => sum + (result.rowsWritten ?? result.changes), 0)
  })
  return { rowsWritten }
}
