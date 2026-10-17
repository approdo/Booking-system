/**
 * The most rows each kind of write can cost in D1, rows and index entries together, including the updates
 * of today's two counts (everyone's and the IP address's). The write budgets refuse a request whose
 * estimate would take a count over its budget, before anything is written (D-008 ก, D-011 M1); afterwards
 * they count what D1 really reports.
 *
 * Measured with local D1 by test/budget.test.ts, which fails if a real write costs more than this
 * (2026-10-17: new sandbox with its first booking 36, booking 4, sign-in 5 (6 when it ends the oldest
 * session), wrong password 4, change 4, sign-out 4).
 */
export const ROWS_ESTIMATE = {
  /** A new sandbox: its row and the copy of the starting data (about 30 rows today). */
  newSandbox: 45,
  /** One booking. */
  booking: 4,
  /** One back office sign-in: its session, the end of the oldest one, and its count as a change. */
  session: 7,
  /** One wrong password, remembered for the rate limit. */
  loginFailure: 4,
  /** One back office change (sign-out included), with its rate limit count. */
  adminChange: 6,
} as const
