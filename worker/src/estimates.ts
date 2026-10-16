/**
 * The most rows each kind of write can cost in D1, rows and index entries together, including the update
 * of today's count. The write budget refuses a request whose estimate would take today's total over the
 * budget, before anything is written (D-008 ก); afterwards it counts what D1 really reports.
 *
 * Measured with local D1 by test/budget.test.ts, which fails if a real write costs more than this
 * (2026-10-17: new sandbox with its first booking 35, booking 3, session 2, wrong password 3, change 3).
 */
export const ROWS_ESTIMATE = {
  /** A new sandbox: its row and the copy of the starting data (about 30 rows today). */
  newSandbox: 45,
  /** One booking. */
  booking: 4,
  /** One back office session. */
  session: 3,
  /** One wrong password, remembered for the rate limit. */
  loginFailure: 4,
  /** One back office change, with its rate limit count. */
  adminChange: 6,
} as const
