import type { LocaleCode } from '../types/content'

/**
 * A language of the site, in the shape the @nuxtjs/i18n `locales` option takes. A type alias, not an
 * interface: that option's type has an index signature, which only a type alias satisfies.
 */
export type SiteLocale = {
  code: LocaleCode
  /** The value of <html lang> and of the hreflang links. */
  language: string
  /** Messages in i18n/locales/. */
  file: string
}

/**
 * The site's languages: Thai always, English only when `english` (site.english in site.ts) is true.
 * Without English there are no /en/ pages, no hreflang links and no language switch.
 * Used by nuxt.config.ts; plain TypeScript, so the config and the unit tests can import it.
 */
export function siteLocales(english: boolean): SiteLocale[] {
  return [
    { code: 'th', language: 'th', file: 'th.json' },
    ...(english ? [{ code: 'en' as const, language: 'en', file: 'en.json' }] : []),
  ]
}

/** The path of each language's home page, under the base URL: '/' for Thai (the default), '/en/' for English. */
export function homePaths(locales: readonly SiteLocale[]): string[] {
  return locales.map(({ code }) => (code === 'th' ? '/' : `/${code}/`))
}
