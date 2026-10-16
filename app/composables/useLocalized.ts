import type { LocaleCode, Localized } from '~/types/content'

/**
 * Returns a function that picks the current language's text from `{ th, en }` data:
 *
 *   const localized = useLocalized()
 *   localized(site.name) // 'นวลไพล' on Thai pages, 'Nuanplai' on English pages
 *
 * The two languages may hold different types, e.g. Thai phrases (string[]) and an English string.
 */
export function useLocalized() {
  const { locale } = useI18n()
  return <T extends Localized<unknown>>(text: T): T[LocaleCode] => text[locale.value as LocaleCode]
}
