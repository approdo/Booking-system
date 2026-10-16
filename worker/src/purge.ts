import { addDays } from '../../app/utils/bookingRules'
import { SEED_SANDBOX } from './shop'
import type { Store } from './store'
import { utcDate } from './time'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The daily purge (Cron Trigger "10 0 * * *", 07:10 Thai time — D-006): deletes every sandbox older than
 * the time to live with all its rows, the wrong-password records older than a day and the write counts
 * older than a week, then records last_purge_at.
 *
 * One batch of nine statements, each deleting a whole set of rows (the free plan allows 50 queries per
 * run; there is no loop per sandbox). Rows of a sandbox that is not alive any more are deleted whatever
 * the reason, so running it twice, or after a missed day, is safe. Its writes are counted in the daily
 * budget but never refused (D-008 ก).
 */
export async function purge(store: Store, now: number, ttlMs: number): Promise<{ rowsWritten: number }> {
  const liveSandboxes = 'SELECT id FROM sandboxes WHERE created_at > ?1'
  const cutoff = now - ttlMs
  const statements = [
    ...['bookings', 'services', 'therapists', 'shop_settings'].map(table => store.prepare(
      `DELETE FROM ${table} WHERE sandbox_id <> ?2 AND sandbox_id NOT IN (${liveSandboxes})`,
    ).bind(cutoff, SEED_SANDBOX)),
    store.prepare(`DELETE FROM sessions WHERE sandbox_id NOT IN (${liveSandboxes})`).bind(cutoff),
    store.prepare('DELETE FROM sandboxes WHERE created_at <= ?1').bind(cutoff),
    store.prepare('DELETE FROM login_failures WHERE at <= ?1').bind(now - DAY_MS),
    store.prepare('DELETE FROM write_budget WHERE day < ?1').bind(addDays(utcDate(now), -7)),
    store.prepare('INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
      .bind('last_purge_at', new Date(now).toISOString()),
  ]
  let rowsWritten = 0
  await store.unguardedWrite(async (write) => {
    const results = await write(statements)
    rowsWritten = results.reduce((sum, result) => sum + (result.meta.rows_written ?? 0), 0)
  })
  return { rowsWritten }
}
