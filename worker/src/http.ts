import type { ApiError } from './errors'
import { invalidInput } from './errors'

/** Request bodies are small forms; anything larger is refused before it is parsed. */
const MAX_BODY_BYTES = 10_000

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Every answer depends on the visitor's sandbox: never cache it.
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export function noContent(): Response {
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}

export function errorResponse(error: ApiError): Response {
  const response = json({ error: error.code, ...error.details }, error.status)
  if (error.code === 'rate_limited') response.headers.set('Retry-After', '60')
  return response
}

/** The JSON object of a request body; 400 invalid_input when there is none. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) throw invalidInput({ body: 'too_large' })
  try {
    const value: unknown = JSON.parse(text)
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  }
  catch {
    // Falls through to the error below.
  }
  throw invalidInput({ body: 'invalid_json' })
}

/**
 * CORS headers for a request from one of the allowed origins (the booking pages on GitHub Pages and the
 * local preview). Tokens travel in the Authorization header, not in cookies, because github.io and
 * workers.dev are different sites (D-006).
 */
export function corsHeaders(request: Request, allowedOrigins: readonly string[]): Record<string, string> {
  const origin = request.headers.get('Origin')
  const headers: Record<string, string> = { Vary: 'Origin' }
  if (origin && allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type'
    headers['Access-Control-Expose-Headers'] = 'Retry-After'
    headers['Access-Control-Max-Age'] = '86400'
  }
  return headers
}

export function withHeaders(response: Response, headers: Record<string, string>): Response {
  const result = new Response(response.body, response)
  for (const [name, value] of Object.entries(headers)) result.headers.set(name, value)
  return result
}
