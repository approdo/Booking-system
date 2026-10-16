import { ApiError } from './errors'
import { utcDate } from './time'

/**
 * Rows that adding to today's write count costs: the one row of write_budget it updates. Checked against
 * D1's own `rows_written` by the tests (test/budget.test.ts).
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

/**
 * The Worker's only door to D1. Reads go straight through (with one retry). Writes go through
 * `guardedWrite()`, which keeps every request inside the daily write budget, or `unguardedWrite()` for the
 * Worker's own housekeeping (purge, starting data), which is counted but never refused.
 */
export class Store {
  constructor(
    private readonly db: D1Database,
    private readonly writeBudget: number,
    private readonly now: number,
  ) {}

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
    const row = await this.first<{ rows: number }>(
      this.prepare('SELECT rows FROM write_budget WHERE day = ?1').bind(utcDate(this.now)),
    )
    return row?.rows ?? 0
  }

  /**
   * The daily write budget (D-008 ก). Refuses with 503 demo_full, before anything is written, when the
   * rows written today plus `estimate` would go over the budget. Otherwise runs `work`, which writes
   * through the `write` function it is given, and adds the rows D1 reports to today's count, also when
   * `work` ends with an error after writing.
   */
  async guardedWrite<T>(estimate: number, work: (write: Write) => Promise<T>): Promise<T> {
    const used = await this.rowsWrittenToday()
    if (used + estimate > this.writeBudget) throw new ApiError('demo_full')
    return this.countedWrite(work)
  }

  /** Writes that must happen even when the budget is used up (the daily purge); still counted. */
  unguardedWrite<T>(work: (write: Write) => Promise<T>): Promise<T> {
    return this.countedWrite(work)
  }

  private async countedWrite<T>(work: (write: Write) => Promise<T>): Promise<T> {
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
      if (rows > 0) await this.addToBudget(rows)
    }
  }

  private async addToBudget(rows: number): Promise<void> {
    try {
      await withRetry(() => this.prepare(
        'INSERT INTO write_budget (day, rows) VALUES (?1, ?2) ON CONFLICT (day) DO UPDATE SET rows = rows + excluded.rows',
      ).bind(utcDate(this.now), rows + BUDGET_UPDATE_ROWS).run())
    }
    catch (error) {
      // The write itself succeeded; losing one count is better than failing the request.
      console.error('Could not count rows written:', error instanceof Error ? error.message : String(error))
    }
  }
}
