import { describe, expect, it } from 'vitest'
import { localApiUrl, site } from '../../app/data/site'
import type { Localized } from '../../app/types/content'
import { joinPhrases } from '../../app/utils/phrases'

// Rules of app/data/site.ts, not its example values (lesson G-018): they keep passing when a client's
// details go in, and fail when one is missing or malformed.

function expectBothLanguages(text: Localized<unknown>, label: string) {
  for (const value of [text.th, text.en]) {
    const plain = typeof value === 'string' ? value : joinPhrases(value as string[])
    expect(plain.trim(), label).not.toBe('')
  }
}

describe('site.ts', () => {
  it('has the shop name, description and demo line in Thai and English', () => {
    expectBothLanguages(site.name, 'name')
    expectBothLanguages(site.description, 'description')
    expectBothLanguages(site.demoNoticeText, 'demoNoticeText')
  })

  it('has an absolute https site URL that ends with \'/\', whose path becomes the base URL', () => {
    const url = new URL(site.url)
    expect(url.protocol).toBe('https:')
    expect(url.pathname.endsWith('/')).toBe(true)
    expect(url.search + url.hash).toBe('')
  })

  it('downloads at least one font weight, each a whole hundred from 100 to 900, without repeats', () => {
    expect(site.fontWeights.length).toBeGreaterThan(0)
    expect(new Set(site.fontWeights).size).toBe(site.fontWeights.length)
    for (const weight of site.fontWeights) expect([100, 200, 300, 400, 500, 600, 700, 800, 900]).toContain(weight)
  })

  it('has the live booking API address: https (the live pages are https), no path, no trailing slash', () => {
    const url = new URL(site.apiUrl)
    // An http API would be blocked as mixed content on the https pages.
    expect(url.protocol).toBe('https:')
    expect(site.apiUrl).toBe(url.origin)
  })

  it('has a separate local API address on this machine, for the dev server, the preview and the e2e tests', () => {
    const url = new URL(localApiUrl)
    expect(url.hostname).toBe('localhost')
    expect(localApiUrl).toBe(url.origin)
    expect(localApiUrl).not.toBe(site.apiUrl)
  })

  it('has a phone number of digits and dashes, and an e-mail address', () => {
    expect(site.contact.phone).toMatch(/^\+?[0-9][0-9 -]*[0-9]$/)
    expect(site.contact.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
  })
})
