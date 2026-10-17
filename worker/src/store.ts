import { ApiError } from './errors'
import { ipHash } from './ids'
import { utcDate } from './time'

/**
 * Rows that adding to one daily count costs: the one row of write_budget, or of ip_write_budget, that it
 * updates. Checked against D1's own `rows_written` by the tests (test/budget.test.ts).
 */
export const BUDGET_UPDATE_ROWS = 1

/** Runs one batch of writes and returns D1's results. Every write of a request goes through one of these. */
export type Write = (statements: D1PreparedStatement[]) => Promise<D1Result[]>

/** A constraint error (e.g. a booking number already in use) is a fact about the data, not a failure of D1. */
export function isConstraintError(error: unknown): boolean {
  return error instanceof Error && /constraint/i.test(error.message)
}

/**
 * Runs a D1 call, and once more if it fails (D-008 ง): D1 answers "overloaded" when its queue is full,
 * and a connection can drop. A second failure becomes 503 backend_unavailable. Constraint errors are
 * passed on at once.
 */
async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  }
  catch (error) {
    if (error instanceof ApiError || isConstraintError(error)) throw error
    try {
      return await run()
    }
    catch (second) {
      if (second instanceof ApiError || isConstraintError(second)) throw second
      console.error('D1 failed twice:', second instanceof Error ? second.message : String(second))
      throw new ApiError('backend_unavailable')
    }
  }
}

function rowsWritten(results: D1Result[]): number {
  return results.reduce((sum, result) => sum + (result.meta?.rows_written ?? 0), 0)
}

export interface StoreOptions {
  /** D1_WRITE_BUDGET: rows the API may write per UTC day, everyone together. */
  writeBudget: number
  /**
   * Who a request's writes count against (the IP key of src/ids.ts) and how many rows that IP address may
   * write per UTC day. The daily purge has none: it only writes through unguardedWrite().
   */
  ip?: { key: string, budget: number }
  /** The time of the request, ms since 1970: picks the UTC day. */
  now: number
}

/**
 * The Worker's only door to D1. Reads go straight through (with one retry). Writes go through
 * `guardedWrite()`, which keeps every request inside the daily write budgets, or `unguardedWrite()` for the
 * Worker's own housekeeping (purge, starting data), which is counted but never refused.
 */
export class Store {
  private readonly day: string
  private ipKeyHash: Promise<string> | null = null

  constructor(private readonly db: D1Database, private readonly options: StoreOptions) {
    this.day = utcDate(options.now)
  }

  prepare(sql: string): D1PreparedStatement {
    return this.db.prepare(sql)
  }

  first<T>(statement: D1PreparedStatement): Promise<T | null> {
    return withRetry(() => statement.first<T>())
  }

  async all<T>(statement: D1PreparedStatement): Promise<T[]> {
    const { results } = await withRetry(() => statement.all<T>())
    return results
  }

  /** Rows written today (UTC), as counted so far. */
  async rowsWrittenToday(): Promise<number> {
    const row = await this.first<{ rows: number }>(this.prepare('SELECT rows FROM write_budget WHERE day = ?1').bind(this.day))
    return row?.rows ?? 0
  }

  /** The request's IP key as stored: hashed like sandboxes.ip_key. */
  private hashedIpKey(key: string): Promise<string> {
    this.ipKeyHash ??= ipHash(key)
    return this.ipKeyHash
  }

  /**
   * The daily write budgets (D-008 ก, D-011 M1). Refuses, before anything is written, when the rows written
   * today plus `estimate` would go over the budget of everyone (503 demo_full) or over the share of the
   * request's IP address (429 rate_limited). Otherwise runs `work`, which writes through the `write`
   * function it is given, and adds the rows D1 reports to both counts, also when `work` ends with an error
   * after writing.
   */
  async guardedWrite<T>(estimate: number, work: (write: Write) => Promise<T>): Promise<T> {
    const { ip, writeBudget } = this.options
    if (!ip) throw new Error('guardedWrite() needs the IP key of the request')
    const ipKeyHash = await this.hashedIpKey(ip.key)
    const used = await this.first<{ total: number | null, ip: number | null }>(this.prepare(
      `SELECT (SELECT rows FROM write_budget WHERE day = ?1) AS total,
        (SELECT rows FROM ip_write_budget WHERE day = ?1 AND ip_key = ?2) AS ip`,
    ).bind(this.day, ipKeyHash))
    if ((used?.total ?? 0) + estimate > writeBudget) throw new ApiError('demo_full')
    if ((used?.ip ?? 0) + estimate > ip.budget) throw new ApiError('rate_limited')
    return this.countedWrite(work, ipKeyHash)
  }

  /** Writes that must happen even when the budget is used up (the daily purge); still counted. */
  unguardedWrite<T>(work: (write: Write) => Promise<T>): Promise<T> {
    return this.countedWrite(work, null)
  }

  private async countedWrite<T>(work: (write: Write) => Promise<T>, ipKeyHash: string | null): Promise<T> {
    let rows = 0
    const write: Write = async (statements) => {
      const results = await withRetry(() => this.db.batch(statements))
      rows += rowsWritten(results)
      return results
    }
    try {
      return await work(write)
    }
    finally {
      if (rows > 0) await this.addToBudgets(rows, ipKeyHash)
    }
  }

  /** Adds `rows`, and what updating the counts costs, to today's count and to the IP address's count. */
  private async addToBudgets(rows: number, ipKeyHash: string | null): Promise<void> {
    const total = rows + (ipKeyHash ? 2 : 1) * BUDGET_UPDATE_ROWS
    const statements = [this.prepare(
      'INSERT INTO write_budget (day, rows) VALUES (?1, ?2) ON CONFLICT (day) DO UPDATE SET rows = rows + excluded.rows',
    ).bind(this.day, total)]
    if (ipKeyHash) {
      statements.push(this.prepare(
        `INSERT INTO ip_write_budget (day, ip_key, rows) VALUES (?1, ?2, ?3)
         ON CONFLICT (day, ip_key) DO UPDATE SET rows = rows + excluded.rows`,
      ).bind(this.day, ipKeyHash, total))
    }
    try {
      await withRetry(() => this.db.batch(statements))
    }
    catch (error) {
      // The write itself succeeded; losing one count is better than failing the request.
      console.error('Could not count rows written:', error instanceof Error ? error.message : String(error))
    }
  }
}
