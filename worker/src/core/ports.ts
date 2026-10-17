/**
 * What the core of the API needs from the platform it runs on, and nothing more (D-013). The core never
 * talks to a database driver, an HTTP server or a scheduler directly: src/platform/cloudflare/ gives it
 * these on Cloudflare Workers + D1, and another platform would give it the same (README.md, "Moving the
 * back end to your own server").
 */

/** A value bound to a statement's placeholder. Booleans are stored as 0 / 1 (INTEGER columns). */
export type SqlValue = string | number | null

/**
 * One SQL statement and its parameters. Placeholders are numbered, ?1 to ?N, and a number may appear more
 * than once; a database that numbers them differently (PostgreSQL: $1) rewrites them in its adapter.
 * Make one with sql() in src/core/sql.ts.
 */
export interface Statement {
  readonly sql: string
  readonly params: readonly SqlValue[]
}

/** What one statement of a transaction did. */
export interface RunResult {
  /** Rows it inserted, updated or deleted: 0 when its WHERE refused, which the API's limits rely on. */
  changes: number
  /**
   * Rows written as the database bills them: on D1, rows plus index entries, the unit of the free plan's
   * daily quota. Null when the database does not report it; the write budgets then count `changes`.
   */
  rowsWritten: number | null
}

/**
 * The database. Numbers come back as JavaScript numbers, including COUNT(*) and the ms timestamps of
 * BIGINT columns; text as strings; NULL as null.
 */
export interface Db {
  /** The first row of a query, or null when there is none. */
  first<T>(statement: Statement): Promise<T | null>
  /** Every row of a query. */
  all<T>(statement: Statement): Promise<T[]>
  /**
   * Runs the statements as one transaction, with one result per statement, and must promise three things:
   *
   * - all or nothing: if one statement fails, none of them has written anything;
   * - in order: each statement sees what the ones before it wrote (a new sandbox's copies check that its
   *   row exists);
   * - one at a time: no other write of the database comes between them or runs at the same moment, as if
   *   every transaction ran after the previous one had finished (serializable).
   *
   * The API's guards depend on the third: a booking checks that its time is free, and the limits count
   * bookings, sandboxes, wrong passwords and services, inside the very statement that writes (D-011). Two
   * requests sent at the same moment must not both pass such a check.
   */
  transaction(statements: readonly Statement[]): Promise<RunResult[]>
  /** Whether an error is a broken constraint, such as a primary key that is already used: a fact about the data. */
  isConstraintError(error: unknown): boolean
  /** Whether a failed call may work if it is tried once more (e.g. the database was busy or a connection dropped). */
  isRetryable(error: unknown): boolean
  /** The most parameters one statement may bind; long lists of rows are split to stay under it. */
  readonly maxParams: number
}

/**
 * The settings of the API by name, as text (e.g. D1_WRITE_BUDGET = '60000'): environment variables or
 * whatever the platform keeps them in. src/core/settings.ts checks and parses them.
 */
export type Config = Readonly<Record<string, string | undefined>>
