import { bookingCodeFromBytes } from '../../app/utils/bookingRules'

/** Random bytes from the Workers runtime's cryptographic generator. Tests can pass their own. */
export type RandomBytes = (length: number) => Uint8Array

export const randomBytes: RandomBytes = length => crypto.getRandomValues(new Uint8Array(length))

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** A new sandbox or session token: 32 random bytes (256 bits), base64url. Only its hash is stored. */
export function newToken(random: RandomBytes): string {
  return base64Url(random(32))
}

/** SHA-256 of a text, base64url: how tokens and IP addresses are stored. */
export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return base64Url(new Uint8Array(digest))
}

/** How an IP key (see ipKey below) is stored: hashed, and deleted with its sandbox or within a day. */
export function ipHash(key: string): Promise<string> {
  return sha256(`booking-system:${key}`)
}

/** A booking number such as 'NP-3F8KW' (spec section 4). */
export function newBookingCode(random: RandomBytes): string {
  return bookingCodeFromBytes(random(5))
}

/** An id for a service added in the back office, e.g. 'svc-k3x9q2m7'. */
export function newServiceId(random: RandomBytes): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  return `svc-${[...random(8)].map(byte => alphabet[byte & 31]).join('')}`
}

/** The eight 16-bit groups of an IPv6 address, or null when it is not one. */
function ipv6Groups(address: string): number[] | null {
  const halves = address.split('::')
  if (halves.length > 2) return null
  const parse = (part: string) => (part === '' ? [] : part.split(':'))
  const head = parse(halves[0] ?? '')
  const tail = halves.length === 2 ? parse(halves[1] ?? '') : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null
  const groups = [...head, ...Array.from({ length: halves.length === 2 ? missing : 0 }, () => '0'), ...tail]
  if (!groups.every(group => /^[0-9a-f]{1,4}$/i.test(group))) return null
  return groups.map(group => Number.parseInt(group, 16))
}

/**
 * Who a request counts against for per-IP limits (D-008 ค), from the CF-Connecting-IP header that
 * Cloudflare sets: an IPv4 address on its own, an IPv6 address by its /64 network (one home or phone
 * usually gets a whole /64), an IPv4 address written as IPv6 (::ffff:a.b.c.d) as IPv4.
 */
export function ipKey(connectingIp: string | null): string {
  const address = (connectingIp ?? '').trim().toLowerCase()
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address)
  if (mapped) return `v4:${mapped[1]}`
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(address)) return `v4:${address}`
  const groups = ipv6Groups(address)
  if (groups) return `v6:${groups.slice(0, 4).map(group => group.toString(16)).join(':')}::/64`
  return 'unknown'
}
