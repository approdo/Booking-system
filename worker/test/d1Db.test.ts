import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { sql } from '../src/core/sql'
import { D1Db } from '../src/platform/cloudflare/d1'

/**
 * D1 keeps the promises of the database port (src/core/ports.ts) that the API's guards rely on (D-013):
 * a transaction is all or nothing, runs in order, and reports what each statement changed; numbers come
 * back as numbers. Another database adapter would need the same tests.
 */
describe('D1Db: the database port on D1', () => {
  const db = new D1Db(env.DB)
  const metaCount = async () => (await db.first<{ count: number }>(sql('SELECT COUNT(*) AS count FROM meta')))?.count

  it('reports the rows each statement changed, and what D1 counts as written', async () => {
    const results = await db.transaction([
      sql('INSERT INTO meta (key, value) VALUES (?1, ?2)', 'a', '1'),
      sql('INSERT INTO meta (key, value) SELECT ?1, ?2 WHERE 1 = 0', 'b', '2'),
      sql('UPDATE meta SET value = ?2 WHERE key = ?1', 'a', '3'),
    ])
    expect(results.map(result => result.changes)).toEqual([1, 0, 1])
    expect(results.every(result => typeof result.rowsWritten === 'number')).toBe(true)
  })

  it('runs the statements in order: each one sees what the ones before it wrote', async () => {
    const results = await db.transaction([
      sql('INSERT INTO meta (key, value) VALUES (?1, ?2)', 'first', '1'),
      sql('INSERT INTO meta (key, value) SELECT ?1, ?2 WHERE EXISTS (SELECT 1 FROM meta WHERE key = ?3)', 'second', '2', 'first'),
    ])
    expect(results.map(result => result.changes)).toEqual([1, 1])
  })

  it('writes nothing when one statement fails, and calls a duplicate key a constraint error', async () => {
    await db.transaction([sql('INSERT INTO meta (key, value) VALUES (?1, ?2)', 'taken', '1')])
    const failure = await db.transaction([
      sql('INSERT INTO meta (key, value) VALUES (?1, ?2)', 'new', '1'),
      sql('INSERT INTO meta (key, value) VALUES (?1, ?2)', 'taken', '2'),
    ]).catch((error: unknown) => error)
    expect(db.isConstraintError(failure)).toBe(true)
    expect(db.isRetryable(failure)).toBe(false)
    expect(await metaCount()).toBe(1)
    expect(db.isRetryable(new Error('D1_ERROR: Database is overloaded.'))).toBe(true)
  })

  it('returns numbers as numbers, ms timestamps and COUNT(*) included, and NULL as null', async () => {
    const now = Date.parse('2026-10-17T02:00:00Z')
    await db.transaction([sql('INSERT INTO sandboxes (id, ip_key, created_at) VALUES (?1, ?2, ?3)', 'box', 'ip', now)])
    const row = await db.first<{ created_at: unknown, count: unknown, none: unknown }>(
      sql('SELECT created_at, (SELECT COUNT(*) FROM sandboxes) AS count, NULL AS none FROM sandboxes WHERE id = ?1', 'box'),
    )
    expect(row).toEqual({ created_at: now, count: 1, none: null })
    expect(await db.all(sql('SELECT id FROM sandboxes WHERE id = ?1', 'nothing'))).toEqual([])
  })

  it('binds as many parameters as maxParams says', async () => {
    const values = Array.from({ length: db.maxParams }, (_, index) => index)
    const placeholders = values.map((_, index) => `?${index + 1}`).join(' + ')
    const row = await db.first<{ total: number }>(sql(`SELECT ${placeholders} AS total`, ...values))
    expect(row?.total).toBe(values.reduce((sum, value) => sum + value, 0))
  })
})
