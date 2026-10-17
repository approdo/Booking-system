import type { Config } from './ports'

/**
 * The settings of the API, checked and parsed. Their values, with what each one is for, live where the
 * platform keeps settings (on Cloudflare: the Worker's [vars]). D1_WRITE_BUDGET and
 * D1_WRITE_BUDGET_PER_IP_PERCENT keep their names on any database: they are the daily write budgets of D-008.
 */
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
  if (!Number.isFinite(number) || number <= 0) throw new Error(`Setting ${name} must be a positive number`)
  return number
}

function percent(value: string | undefined, name: string): number {
  const number = positiveNumber(value, name)
  if (number > 100) throw new Error(`Setting ${name} must be at most 100`)
  return number
}

export function parseSettings(config: Config): Settings {
  const writeBudget = positiveNumber(config.D1_WRITE_BUDGET, 'D1_WRITE_BUDGET')
  return {
    writeBudget,
    writeBudgetPerIp: Math.floor(writeBudget * percent(config.D1_WRITE_BUDGET_PER_IP_PERCENT, 'D1_WRITE_BUDGET_PER_IP_PERCENT') / 100),
    sandboxTtlMs: positiveNumber(config.SANDBOX_TTL_HOURS, 'SANDBOX_TTL_HOURS') * 60 * 60 * 1000,
    bookingsPer10Minutes: positiveNumber(config.BOOKINGS_PER_10_MINUTES, 'BOOKINGS_PER_10_MINUTES'),
    bookingsPerSandbox: positiveNumber(config.BOOKINGS_PER_SANDBOX, 'BOOKINGS_PER_SANDBOX'),
    adminChangesPerMinute: positiveNumber(config.ADMIN_CHANGES_PER_MINUTE, 'ADMIN_CHANGES_PER_MINUTE'),
    sessionsPerSandbox: positiveNumber(config.SESSIONS_PER_SANDBOX, 'SESSIONS_PER_SANDBOX'),
    loginFailuresPer10Minutes: positiveNumber(config.LOGIN_FAILURES_PER_10_MINUTES, 'LOGIN_FAILURES_PER_10_MINUTES'),
    sandboxesPer10MinutesPerIp: positiveNumber(config.SANDBOXES_PER_10_MINUTES_PER_IP, 'SANDBOXES_PER_10_MINUTES_PER_IP'),
    allowedOrigins: (config.ALLOWED_ORIGINS ?? '').split(',').map(origin => origin.trim()).filter(Boolean),
  }
}
