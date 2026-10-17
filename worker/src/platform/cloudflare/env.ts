/**
 * Bindings and variables of the Worker, as declared in wrangler.toml: the D1 database, and the settings
 * that src/core/settings.ts reads by the same names.
 */
export interface Env {
  DB: D1Database
  D1_WRITE_BUDGET: string
  D1_WRITE_BUDGET_PER_IP_PERCENT: string
  SANDBOX_TTL_HOURS: string
  BOOKINGS_PER_10_MINUTES: string
  BOOKINGS_PER_SANDBOX: string
  ADMIN_CHANGES_PER_MINUTE: string
  SESSIONS_PER_SANDBOX: string
  LOGIN_FAILURES_PER_10_MINUTES: string
  SANDBOXES_PER_10_MINUTES_PER_IP: string
  ALLOWED_ORIGINS: string
}
