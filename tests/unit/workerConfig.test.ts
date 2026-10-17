import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { site } from '../../app/data/site'

// The Worker's wrangler.toml (BK-005 AC2, AC6, AC11): no account and no token in it, the daily purge at
// 00:10 UTC, the settings the code reads, and the production settings the deploy uses. Read as text: it
// is a short TOML file of flat tables.

const config = readFileSync(new URL('../../worker/wrangler.toml', import.meta.url), 'utf8')
const lines = config.split('\n').filter(line => !line.trim().startsWith('#'))
/** The settings without the comments (which explain where the account and token come from). */
const settings = lines.join('\n')

/** The `key = value` lines of each table, by table name ('' = the top level, before any table). */
function tables(): Map<string, Map<string, string>> {
  const result = new Map<string, Map<string, string>>([['', new Map()]])
  let current = ''
  for (const line of lines.map(item => item.trim()).filter(Boolean)) {
    const header = /^\[\[?([^\]]+)\]\]?$/.exec(line)
    if (header) {
      current = header[1]!.trim()
      if (!result.has(current)) result.set(current, new Map())
      continue
    }
    const [key = '', ...rest] = line.split('=')
    result.get(current)!.set(key.trim(), rest.join('=').trim())
  }
  return result
}

const table = (name: string) => tables().get(name) ?? new Map<string, string>()
const origins = (value: string | undefined) => (value ?? '').replaceAll('"', '').split(',').map(item => item.trim()).filter(Boolean)

/** The top-level value of a setting (the local one, for settings that production repeats). */
function value(name: string): string | undefined {
  for (const tableName of ['', 'd1_databases', 'triggers', 'vars']) {
    const found = table(tableName).get(name)
    if (found !== undefined) return found
  }
  return undefined
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
    for (const name of ['BOOKINGS_PER_10_MINUTES', 'BOOKINGS_PER_SANDBOX', 'ADMIN_CHANGES_PER_MINUTE', 'LOGIN_FAILURES_PER_10_MINUTES', 'SANDBOXES_PER_10_MINUTES_PER_IP']) {
      expect(Number(value(name)?.replaceAll('"', '')), name).toBeGreaterThan(0)
    }
    // D-011 M1: one IP address writes at most 5% of the budget a day; a sandbox keeps at most 5 sessions.
    expect(value('D1_WRITE_BUDGET_PER_IP_PERCENT')).toBe('"5"')
    expect(value('SESSIONS_PER_SANDBOX')).toBe('"5"')
  })
})

// D-011 L3: the local settings let the preview on this machine call the API; the production settings,
// which the deploy job uses (`--env production`), allow only the live site.
describe('worker/wrangler.toml: local and production settings', () => {
  it('allows the local preview (http://localhost:4176) only in the local settings', () => {
    expect(origins(table('vars').get('ALLOWED_ORIGINS'))).toEqual(['http://localhost:4176'])
  })

  it('allows only the origin of site.url in production: no localhost, nothing else', () => {
    const production = table('env.production.vars').get('ALLOWED_ORIGINS')
    expect(production, '[env.production.vars] ALLOWED_ORIGINS').toBeDefined()
    expect(production).not.toMatch(/localhost|127\.0\.0\.1/)
    // The pages and the origin change together (BK-011): site.url decides where the pages are served.
    expect(origins(production)).toEqual([new URL(site.url).origin])
  })

  it('deploys the same Worker, database and settings as the local ones, apart from the allowed origins', () => {
    expect(table('env.production').get('name')).toBe(value('name'))
    expect(table('env.production.d1_databases')).toEqual(table('d1_databases'))
    const local = new Map(table('vars'))
    const production = new Map(table('env.production.vars'))
    local.delete('ALLOWED_ORIGINS')
    production.delete('ALLOWED_ORIGINS')
    expect(production).toEqual(local)
  })
})
