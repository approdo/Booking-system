import type { RandomBytes } from './ids'
import type { SeedCache } from './seed'
import type { Settings } from './settings'
import type { Store } from './store'

/** Everything a route handler needs about one request. `now` is fixed when the request arrives. */
export interface Context {
  request: Request
  url: URL
  settings: Settings
  store: Store
  /** ms since 1970; today and the time of day in Thailand. */
  now: number
  today: string
  nowMinutes: number
  /** For per-IP limits: the IPv4 address or IPv6 /64 of the caller (src/core/ids.ts). */
  ipKey: string
  random: RandomBytes
  seedCache: SeedCache
}

export type Params = Record<string, string>
export type Handler = (context: Context, params: Params) => Promise<Response>
