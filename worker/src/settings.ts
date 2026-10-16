/** Bindings and variables of the Worker, as declared in wrangler.toml. */
export interface Env {
  DB: D1Database
  D1_WRITE_BUDGET: string
  SANDBOX_TTL_HOURS: string
  BOOKINGS_PER_10_MINUTES: string
  ADMIN_CHANGES_PER_MINUTE: string
  LOGIN_FAILURES_PER_10_MINUTES: string
  SANDBOXES_PER_10_MINUTES_PER_IP: string
  ALLOWED_ORIGINS: string
}

/** The variables of wrangler.toml as numbers and lists. */
export interface Settings {
  writeBudget: number
  sandboxTtlMs: number
  bookingsPer10Minutes: number
  adminChangesPerMinute: number
  loginFailuresPer10Minutes: number
  sandboxesPer10MinutesPerIp: number
  allowedOrigins: readonly string[]
}

function positiveNumber(value: string | undefined, name: string): number {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) throw new Error(`wrangler.toml [vars]: ${name} must be a positive number`)
  return number
}

export function readSettings(env: Env): Settings {
  return {
    writeBudget: positiveNumber(env.D1_WRITE_BUDGET, 'D1_WRITE_BUDGET'),
    sandboxTtlMs: positiveNumber(env.SANDBOX_TTL_HOURS, 'SANDBOX_TTL_HOURS') * 60 * 60 * 1000,
    bookingsPer10Minutes: positiveNumber(env.BOOKINGS_PER_10_MINUTES, 'BOOKINGS_PER_10_MINUTES'),
    adminChangesPerMinute: positiveNumber(env.ADMIN_CHANGES_PER_MINUTE, 'ADMIN_CHANGES_PER_MINUTE'),
    loginFailuresPer10Minutes: positiveNumber(env.LOGIN_FAILURES_PER_10_MINUTES, 'LOGIN_FAILURES_PER_10_MINUTES'),
    sandboxesPer10MinutesPerIp: positiveNumber(env.SANDBOXES_PER_10_MINUTES_PER_IP, 'SANDBOXES_PER_10_MINUTES_PER_IP'),
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '').split(',').map(origin => origin.trim()).filter(Boolean),
  }
}
