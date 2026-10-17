import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { insertBookingStatement } from '../src/core/bookings'
import { sha256 } from '../src/core/ids'
import type { Statement } from '../src/core/ports'
import { installStatements } from '../src/core/seed'
import { sql } from '../src/core/sql'
import { D1Db } from '../src/platform/cloudflare/d1'
import { SATURDAY_9AM, testApi, TODAY } from './helpers'

/**
 * The core's SQL written without SQLite's JSON functions so that PostgreSQL runs it too (D-013, BK-015
 * S3 and S4), checked here on D1 for doing exactly what the JSON version did.
 */

const db = new D1Db(env.DB)

describe('a therapist\'s leave dates, matched without JSON functions (S3)', () => {
  it('stops the INSERT itself from booking a therapist on any of their leave dates', async () => {
    const api = testApi()
    const { body } = await api.book({ time: '12:00' })
    const sandboxId = await sha256(body.sandbox.token)
    // Malai works every day but Tuesday; two leave dates, written the way the back office writes them.
    await db.transaction([sql(
      'UPDATE therapists SET leave_dates = ?3 WHERE sandbox_id = ?1 AND id = ?2',
      sandboxId,
      'malai',
      JSON.stringify(['2026-10-22', '2026-10-24']),
    )])
    const booking = (date: string, code: string) => insertBookingStatement({
      sandboxId, code, serviceId: 'thai-traditional', serviceName: 'นวดแผนไทย', minutes: 60, price: 400, therapistId: 'malai',
      date, start: 14 * 60, customerName: 'ทดลอง ตัวอย่าง', phone: '020000000', createdAt: SATURDAY_9AM,
    }, { windowStart: 0, perWindow: 100, perSandbox: 100 })

    const results = await db.transaction([
      booking('2026-10-22', 'NP-AAAA2'),
      booking('2026-10-24', 'NP-AAAA3'),
      booking('2026-10-23', 'NP-AAAA4'),
    ])
    expect(results.map(result => result.changes)).toEqual([0, 0, 1])
  })
})

/** The 'seed' sandbox, table by table, in a fixed order. */
async function seedSnapshot() {
  const rows = (query: string) => db.all(sql(query, 'seed'))
  return {
    services: await rows('SELECT * FROM services WHERE sandbox_id = ?1 ORDER BY position'),
    therapists: await rows('SELECT * FROM therapists WHERE sandbox_id = ?1 ORDER BY position'),
    shopSettings: await rows('SELECT * FROM shop_settings WHERE sandbox_id = ?1'),
    bookings: await rows('SELECT * FROM bookings WHERE sandbox_id = ?1 ORDER BY code'),
  }
}

/** The highest ?N of a statement: what a database counts against its limit of bound parameters. */
const highestPlaceholder = (statement: Statement) => Math.max(0, ...[...statement.sql.matchAll(/\?(\d+)/g)].map(match => Number(match[1])))

describe('the starting data, in VALUES lists split by the parameter limit (S4)', () => {
  it('installs the same rows whether a statement may bind 100 parameters (D1) or only 16', async () => {
    const install = async (maxParams: number) => {
      const statements = installStatements(TODAY, SATURDAY_9AM, maxParams)
      for (const statement of statements) {
        expect(statement.params.length).toBeLessThanOrEqual(maxParams)
        expect(highestPlaceholder(statement)).toBe(statement.params.length)
      }
      await db.transaction(statements)
      return { statements: statements.length, data: await seedSnapshot() }
    }

    const roomy = await install(db.maxParams)
    await db.transaction([sql('DELETE FROM meta')]) // forget the installed version
    const tight = await install(16)

    expect(tight.statements).toBeGreaterThan(roomy.statements)
    expect(tight.data).toEqual(roomy.data)
    expect(roomy.data.bookings).toHaveLength(7)
    expect(roomy.data.services.map(service => (service as { position: number }).position))
      .toEqual(roomy.data.services.map((_, index) => index))
  })
})
