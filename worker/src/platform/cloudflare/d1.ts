import type { Db, RunResult, Statement } from '../../core/ports'

/**
 * The database port (src/core/ports.ts) on Cloudflare D1. D1 is SQLite: it takes the core's ?1 ... ?N
 * placeholders as they are.
 */
export class D1Db implements Db {
  /** D1 binds at most 100 parameters per statement. */
  readonly maxParams = 100

  constructor(private readonly database: D1Database) {}

  private prepare(statement: Statement): D1PreparedStatement {
    return this.database.prepare(statement.sql).bind(...statement.params)
  }

  first<T>(statement: Statement): Promise<T | null> {
    return this.prepare(statement).first<T>()
  }

  async all<T>(statement: Statement): Promise<T[]> {
    const { results } = await this.prepare(statement).all<T>()
    return results
  }

  /**
   * One D1 batch, which keeps every promise of Db.transaction: D1 runs a batch as one transaction (all or
   * nothing), its statements in order, and the database has a single writer, so no other write comes
   * between them. Never split it into several batches: the limits of D-011 depend on it.
   */
  async transaction(statements: readonly Statement[]): Promise<RunResult[]> {
    const results = await this.database.batch(statements.map(statement => this.prepare(statement)))
    // rows_written is what D1's free plan counts: rows and index entries.
    return results.map(result => ({ changes: result.meta?.changes ?? 0, rowsWritten: result.meta?.rows_written ?? 0 }))
  }

  /** D1 reports a broken constraint only in the message ("UNIQUE constraint failed: ..."). */
  isConstraintError(error: unknown): boolean {
    return error instanceof Error && /constraint/i.test(error.message)
  }

  /**
   * D1 says it is overloaded, or that a connection dropped, only in the message, so every failure that is
   * not a broken constraint is tried once more (D-008 ง).
   */
  isRetryable(error: unknown): boolean {
    return !this.isConstraintError(error)
  }
}
