import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The Worker's wrangler.toml (BK-005 AC2, AC6): no account and no token in it, the daily purge at
// 00:10 UTC, and the settings the code reads. Read as text: it is a short, flat TOML file.

const config = readFileSync(new URL('../../worker/wrangler.toml', import.meta.url), 'utf8')
const lines = config.split('\n').filter(line => !line.trim().startsWith('#'))
/** The settings without the comments (which explain where the account and token come from). */
const settings = lines.join('\n')

function value(name: string): string | undefined {
  const line = lines.find(item => item.trim().startsWith(`${name} =`))
  return line?.split('=').slice(1).join('=').trim()
}

describe('worker/wrangler.toml', () => {
  it('names the Worker and its D1 binding, without an account id or a token', () => {
    expect(value('name')).toBe('"booking-system-api"')
    expect(value('binding')).toBe('"DB"')
    expect(settings).not.toMatch(/account_id/)
    expect(settings).not.toMatch(/api_token|CLOUDFLARE_API_TOKEN/i)
    // The database id is a placeholder that the deploy job replaces (never the real one).
    expect(value('database_id')).toBe('"00000000-0000-0000-0000-000000000000"')
  })

  it('runs the purge every day at 00:10 UTC (07:10 Thai time)', () => {
    expect(value('crons')).toBe('["10 0 * * *"]')
  })

  it('sets the write budget to 60,000 rows and the sandbox life to 24 hours (D-008, D-006)', () => {
    expect(value('D1_WRITE_BUDGET')).toBe('"60000"')
    expect(value('SANDBOX_TTL_HOURS')).toBe('"24"')
    for (const name of ['BOOKINGS_PER_10_MINUTES', 'ADMIN_CHANGES_PER_MINUTE', 'LOGIN_FAILURES_PER_10_MINUTES', 'SANDBOXES_PER_10_MINUTES_PER_IP']) {
      expect(Number(value(name)?.replaceAll('"', '')), name).toBeGreaterThan(0)
    }
    expect(value('ALLOWED_ORIGINS')).toContain('http://localhost:4176')
  })
})
