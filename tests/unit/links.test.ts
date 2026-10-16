import { describe, expect, it } from 'vitest'
import { phoneHref } from '../../app/utils/links'

// Reserved numbers only (D-010): 02 followed by zeros, 9 or 10 digits long.

describe('phoneHref', () => {
  it('turns a Thai number into an international tel: link', () => {
    expect(phoneHref('02-000-0000')).toBe('tel:+6620000000')
    expect(phoneHref('020-000-0000')).toBe('tel:+66200000000')
    expect(phoneHref('02 000 0000')).toBe('tel:+6620000000')
  })

  it('keeps a country code that is already there, and a short hotline number as it is', () => {
    expect(phoneHref('+66 2 000 0000')).toBe('tel:+6620000000')
    expect(phoneHref('1234')).toBe('tel:1234')
  })
})
