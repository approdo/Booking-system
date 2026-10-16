/**
 * Shapes of the site data in app/data/.
 *
 * Every data file is checked against these types, so a missing or misspelled field fails
 * `npm run typecheck` before it can reach the page.
 */

/** Codes of the site's languages. Thai is the default; English is switched off in site.ts (Thai only, N3). */
export type LocaleCode = 'th' | 'en'

/**
 * Text written once per language: `{ th: 'นวลไพล', en: 'Nuanplai' }`.
 * Show it with useLocalized() (app/composables/useLocalized.ts), which picks the current language.
 */
export type Localized<T = string> = Record<LocaleCode, T>

/**
 * Thai text whose line breaks are controlled (lesson G-007).
 *
 * - A string: the browser may break the line anywhere its Thai dictionary allows.
 * - A list of phrases: the line may break only between two phrases, never inside one.
 *   The phrases are joined exactly as written, so a space between two phrases goes at
 *   the end of the first one: ['เปิดทุกวัน ', '10:00–22:00 น.'].
 *
 * Show it with the <PhraseText> component. Where plain text is needed (<title>, meta tags,
 * aria-label), use joinPhrases() from app/utils/phrases.ts.
 */
export type ThaiText = string | readonly string[]

/** A short line in both languages: Thai as phrases (G-007), English as a plain string. */
export type LocalizedPhrases = Localized<ThaiText>

export interface ContactInfo {
  /** The phone number as people write it, e.g. '02-000-0000'. The tel: link is made from it. */
  phone: string
  email: string
}

export interface Site {
  /** Shop name: header, footer, page titles and the brand images. */
  name: Localized
  /** One or two sentences for search results and link previews (meta description). */
  description: Localized
  /**
   * Absolute URL of the live site, ending with '/'. Its path becomes the Nuxt base URL
   * ('/Booking-system/' here; '/' for a site at the root of its own domain).
   */
  url: string
  /** Address of the booking API (worker/), without a trailing '/'. Public: the browser calls it. */
  apiUrl: string
  /** true: Thai pages plus English pages under /en/. false: Thai only (no /en/). */
  english: boolean
  /** true: the footer shows `demoNoticeText`, the line that says this is a demo website. */
  demoNotice: boolean
  demoNoticeText: LocalizedPhrases
  /** Weights of the body font (--font-body) that are downloaded. The heading font is set in nuxt.config.ts. */
  fontWeights: readonly number[]
  contact: ContactInfo
}

/** An image file in public/images/, with its size in pixels (it keeps its space while it loads). */
export interface ImageFile {
  /** Path inside public/images/, e.g. 'svc-thai.webp'. Every file has a row in CREDITS.md. */
  file: string
  width: number
  height: number
}

// ---------------------------------------------------------------------------------------------
// The shop: services, therapists and opening hours. Thai only (N3). This is the starting data of the
// booking system: the customer pages show it, and the back end copies it into every sandbox.
// ---------------------------------------------------------------------------------------------

/** One length of a service and its price. */
export interface ServiceOption {
  /** One of the lengths the back office offers: 30, 45, 60, 90, 120, 150 or 180 minutes. */
  minutes: number
  /** In Thai baht, everything included: a whole number from 1 to 100,000. */
  price: number
}

export interface ServiceItem {
  /** Unique across all categories, in kebab-case. */
  id: string
  name: string
  /** At most 200 characters. */
  description: string
  /** One to four lengths, shortest first, no length twice. */
  options: readonly ServiceOption[]
  /** Packages: what the package is made of, e.g. 'นวดแผนไทย 60 นาที + นวดน้ำมันอโรมา 60 นาที'. */
  includes?: string
}

export interface ServiceCategory {
  /** Unique, in kebab-case. */
  id: string
  name: string
  description: string
  /** The small arched photo next to the category heading (shown 52 × 64). */
  image: ImageFile
  items: readonly ServiceItem[]
}

/** A day of the week as JavaScript's Date#getDay() counts it: 0 = Sunday, 1 = Monday, ... 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** A therapist. Made up, and shown with a letter avatar instead of a photo. */
export interface Therapist {
  /** Unique, in kebab-case. */
  id: string
  name: string
  /** The letter in the round avatar. Thai names can start with a vowel sign, so it is written out. */
  initial: string
  role: string
  /** Years of experience. */
  years: number
  /** What the therapist is best at, as phrases (G-007). */
  specialty: readonly string[]
  /** The therapist's regular days off. */
  daysOff: readonly Weekday[]
}

/** Opening hours of one day of the week. Times are 'HH:MM' in Thai time (Asia/Bangkok), on the half hour. */
export interface DayHours {
  weekday: Weekday
  /** true: the shop is closed all day on this day of the week. Leave it out for a day the shop is open. */
  closed?: boolean
  open: string
  close: string
  /** The latest start time of a booking. */
  lastBooking: string
}

/**
 * One of the example bookings every visitor starts with (spec section 10). The day is counted from
 * today in Thai time, so the examples always fall on today and tomorrow.
 */
export interface SampleBooking {
  /** 0 = today, 1 = tomorrow. */
  dayOffset: number
  /** 'HH:MM', Thai time. The end is the start plus the length of the service option. */
  start: string
  customerName: string
  /** A reserved number (D-010), as people write it; it is stored as digits only. */
  phone: string
  serviceId: string
  minutes: number
  /** null: no preference ("ไม่ระบุ"). */
  therapistId: string | null
  status: 'pending' | 'confirmed' | 'done' | 'cancelled'
  /** A booking number in the format of spec section 4. */
  code: string
}
