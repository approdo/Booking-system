/** Bindings and variables of the Worker, as declared in wrangler.toml. */
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

/** The variables of wrangler.toml as numbers and lists. */
export interface Settings {
  writeBudget: number
  /** Rows one IP address (IPv6: one /64) may write per UTC day: a share of writeBudget. */
  writeBudgetPerIp: number
  sandboxTtlMs: number
  bookingsPer10Minutes: number
  bookingsPerSandbox: number
  adminChangesPerMinute: number
  sessionsPerSandbox: number
  loginFailuresPer10Minutes: number
  sandboxesPer10MinutesPerIp: number
  allowedOrigins: readonly string[]
}

function positiveNumber(value: string | undefined, name: string): number {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) throw new Error(`wrangler.toml [vars]: ${name} must be a positive number`)
  return number
}

function percent(value: string | undefined, name: string): number {
  const number = positiveNumber(value, name)
  if (number > 100) throw new Error(`wrangler.toml [vars]: ${name} must be at most 100`)
  return number
}

export function readSettings(env: Env): Settings {
  const writeBudget = positiveNumber(env.D1_WRITE_BUDGET, 'D1_WRITE_BUDGET')
  return {
    writeBudget,
    writeBudgetPerIp: Math.floor(writeBudget * percent(env.D1_WRITE_BUDGET_PER_IP_PERCENT, 'D1_WRITE_BUDGET_PER_IP_PERCENT') / 100),
    sandboxTtlMs: positiveNumber(env.SANDBOX_TTL_HOURS, 'SANDBOX_TTL_HOURS') * 60 * 60 * 1000,
    bookingsPer10Minutes: positiveNumber(env.BOOKINGS_PER_10_MINUTES, 'BOOKINGS_PER_10_MINUTES'),
    bookingsPerSandbox: positiveNumber(env.BOOKINGS_PER_SANDBOX, 'BOOKINGS_PER_SANDBOX'),
    adminChangesPerMinute: positiveNumber(env.ADMIN_CHANGES_PER_MINUTE, 'ADMIN_CHANGES_PER_MINUTE'),
    sessionsPerSandbox: positiveNumber(env.SESSIONS_PER_SANDBOX, 'SESSIONS_PER_SANDBOX'),
    loginFailuresPer10Minutes: positiveNumber(env.LOGIN_FAILURES_PER_10_MINUTES, 'LOGIN_FAILURES_PER_10_MINUTES'),
    sandboxesPer10MinutesPerIp: positiveNumber(env.SANDBOXES_PER_10_MINUTES_PER_IP, 'SANDBOXES_PER_10_MINUTES_PER_IP'),
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '').split(',').map(origin => origin.trim()).filter(Boolean),
  }
}
