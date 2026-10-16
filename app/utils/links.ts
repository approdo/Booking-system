/**
 * The tel: link of a phone number as people write it in Thailand, in the international format:
 *
 *   phoneHref('02-000-0000')     returns 'tel:+6620000000'
 *   phoneHref('020-000-0000')    returns 'tel:+66200000000'
 *   phoneHref('+66 2 000 0000')  returns 'tel:+6620000000'  (a country code is kept)
 *   phoneHref('1234')            returns 'tel:1234'         (a short hotline number stays as it is)
 *
 * Examples and tests use reserved numbers only (02-000-0000 and longer runs of zeros, D-010).
 */
export function phoneHref(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (phone.trim().startsWith('+')) return `tel:+${digits}`
  if (digits.startsWith('0')) return `tel:+66${digits.slice(1)}`
  return `tel:${digits}`
}
