/**
 * The caller's IP address, for the per-IP limits: Cloudflare sets the CF-Connecting-IP header itself, and
 * a client cannot set it in its place. Null only when the header is missing (not on Cloudflare).
 */
export function clientIp(request: Request): string | null {
  return request.headers.get('CF-Connecting-IP')
}
