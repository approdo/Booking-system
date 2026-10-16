import { describe, expect, it } from 'vitest'
import { site } from '../../app/data/site'
import { checkSiteUrl } from '../../scripts/lib/siteUrl'

describe('checkSiteUrl (run before every deploy)', () => {
  it('stops the template\'s example URL, with the Thai hint to fix site.ts', () => {
    const problems = checkSiteUrl(site.url)
    // The template itself keeps the example URL; a client site replaces it.
    if (new URL(site.url).hostname.endsWith('.example')) {
      expect(problems.join('\n')).toContain('แก้ `site.url` ใน `app/data/site.ts` ก่อน deploy')
    }
  })

  it.each([
    'https://demo.example/Booking-system/',
    'https://www.shop.example/',
    'https://example/',
  ])('stops %j, a reserved .example address', (url) => {
    expect(checkSiteUrl(url)).not.toEqual([])
  })

  it.each([
    ['https://approdo.github.io/Client-demo/', 'approdo/Client-demo'],
    ['https://owner.github.io/', 'Owner/owner.github.io'],
    ['https://www.client-shop.co.th/', 'approdo/Client-demo'],
    ['https://www.client-shop.co.th/shop/', undefined],
  ])('lets %j through (repository %j)', (url, repository) => {
    expect(checkSiteUrl(url, { repository })).toEqual([])
  })

  it.each([
    ['https://approdo.github.io/Other-repo/', 'approdo/Client-demo'],
    ['https://someone.github.io/Client-demo/', 'approdo/Client-demo'],
    ['https://approdo.github.io/', 'approdo/Client-demo'],
  ])('stops %j, which is not where GitHub Pages serves %j', (url, repository) => {
    expect(checkSiteUrl(url, { repository })).not.toEqual([])
  })

  it.each([
    'http://www.client-shop.co.th/',
    'https://www.client-shop.co.th/shop',
    'https://www.client-shop.co.th/?ref=1',
    'www.client-shop.co.th/',
  ])('stops %j: not https, no trailing slash, a query or not absolute', (url) => {
    expect(checkSiteUrl(url)).not.toEqual([])
  })
})
