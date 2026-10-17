import type { ApiErrorCode } from '../../../app/types/api'

/**
 * Error codes of the API (spec sections 4 and 5). The booking pages turn them into the messages of the
 * design spec with app/utils/bookingRepository.ts.
 */
export type ErrorCode = ApiErrorCode

// invalid_input: a field is missing or wrong (`fields` names each one) · unauthorized: a back office request
// without a valid session · slot_taken: the time is no longer free · invalid_transition: a status change
// outside spec section 4 · sandbox_expired: the sandbox is older than 24 hours · demo_full: today's write
// budget is used up (D-008), reads still work · backend_unavailable: the database failed twice in a row.
const STATUS: Record<ErrorCode, number> = {
  invalid_input: 400,
  unauthorized: 401,
  invalid_credentials: 401,
  not_found: 404,
  method_not_allowed: 405,
  slot_taken: 409,
  invalid_transition: 409,
  sandbox_expired: 410,
  rate_limited: 429,
  demo_full: 503,
  backend_unavailable: 503,
  internal_error: 500,
}

/** An error the API answers with on purpose, as `{ error: code, ...details }`. */
export class ApiError extends Error {
  readonly status: number

  constructor(readonly code: ErrorCode, readonly details: Record<string, unknown> = {}) {
    super(code)
    this.status = STATUS[code]
  }
}

/** 400 with an error code per field, e.g. `{ phone: 'invalid' }`. */
export function invalidInput(fields: Record<string, string>): ApiError {
  return new ApiError('invalid_input', { fields })
}
