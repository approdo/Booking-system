import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { testApi } from './helpers'

describe('GET /health', () => {
  it('answers only { ok, last_purge_at }, through the Worker\'s real entry point', async () => {
    const response = await SELF.fetch('https://api.test/health')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, last_purge_at: null })
  })

  it('reports the time of the last purge', async () => {
    const api = testApi()
    await api.scheduled()
    const { body } = await api.request('GET', '/health')
    expect(Object.keys(body).sort()).toEqual(['last_purge_at', 'ok'])
    expect(body.last_purge_at).toBe(new Date(api.now).toISOString())
  })
})

describe('routing and CORS', () => {
  it('answers 404 and 405 with an error code', async () => {
    const api = testApi()
    expect(await api.request('GET', '/nothing-here')).toMatchObject({ status: 404, body: { error: 'not_found' } })
    expect(await api.request('DELETE', '/api/shop')).toMatchObject({ status: 405, body: { error: 'method_not_allowed' } })
  })

  it('lets only the allowed origins read answers (the local preview here)', async () => {
    const api = testApi()
    const allowed = await api.request('GET', '/api/shop', { origin: 'http://localhost:4176' })
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:4176')
    const other = await api.request('GET', '/api/shop', { origin: 'https://elsewhere.example' })
    expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull()

    const preflight = await api.request('OPTIONS', '/api/bookings', { origin: 'http://localhost:4176' })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('Access-Control-Allow-Headers')).toContain('Authorization')
  })
})
