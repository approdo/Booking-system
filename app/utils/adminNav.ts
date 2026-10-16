import type { IconName } from './icons'

/**
 * The back office's pages and tabs (spec sections 2 and 7), in one place: the tabs at the top (1024px and
 * wider), the tab bar at the bottom (narrower), the page /admin/ opens, the login page's `next` and the pages
 * `nuxt generate` writes. Paths are without the base URL and end with '/'.
 *
 * A tab is in ADMIN_TABS only once its page exists, so no tab ever leads to a missing page (spec D1):
 *
 * - BK-008 adds "วันนี้" { key: 'today', icon 'home', path '/admin/today/' } first, and /admin/ then opens it;
 * - BK-009 adds "ปฏิทิน" { key: 'calendar', icon 'cal', path '/admin/calendar/' } after "การจอง";
 * - BK-010 adds "ตารางงานหมอนวด" to SETTINGS_PAGES, which shows the sub-menu of "ตั้งค่าร้าน".
 *
 * A screen that is cut (D-002) is simply never added. The tab bar has as many columns as there are tabs.
 *
 * Plain TypeScript: nuxt.config.ts and the unit tests read it too.
 */

export interface AdminTab {
  key: string
  /** The label of the tab (13px in the tab bar, 15px at the top). */
  label: string
  icon: IconName
  /** Where the tab leads. */
  path: string
  /** Every page that belongs to the tab (the tab is the current one there). */
  pages: readonly string[]
  /** true: the tab shows how many bookings wait for the shop's answer ("รอยืนยัน"). */
  showsPending?: boolean
}

export interface AdminPage {
  path: string
  label: string
}

/** The pages under "ตั้งค่าร้าน". The tab always leads to the first one, the opening hours (spec C10). */
export const SETTINGS_PAGES: readonly AdminPage[] = [
  { path: '/admin/hours/', label: 'เวลาเปิดปิดร้าน' },
]

export const ADMIN_TABS: readonly AdminTab[] = [
  { key: 'bookings', label: 'การจอง', icon: 'list', path: '/admin/bookings/', pages: ['/admin/bookings/'], showsPending: true },
  { key: 'services', label: 'บริการ', icon: 'tag', path: '/admin/services/', pages: ['/admin/services/'] },
  { key: 'settings', label: 'ตั้งค่าร้าน', icon: 'set', path: SETTINGS_PAGES[0]!.path, pages: SETTINGS_PAGES.map(page => page.path) },
]

export const ADMIN_ROOT_PATH = '/admin/'
export const LOGIN_PATH = '/admin/login/'

/** The first tab's page: where /admin/ and a login without `next` lead. */
export const ADMIN_HOME_PATH = ADMIN_TABS[0]!.path

/** Every page of the back office, for `nitro.prerender.routes`. */
export const ADMIN_PAGE_PATHS: readonly string[] = [
  ADMIN_ROOT_PATH,
  LOGIN_PATH,
  ...new Set(ADMIN_TABS.flatMap(tab => tab.pages)),
]

function withSlash(path: string): string {
  return path.endsWith('/') ? path : `${path}/`
}

/** The tab a page belongs to, or null (the login page, /admin/ itself). */
export function currentTab(path: string): AdminTab | null {
  const page = withSlash(path)
  return ADMIN_TABS.find(tab => tab.pages.includes(page)) ?? null
}

/**
 * Where the login page may send the visitor afterwards: only a page of the back office, so that a link
 * such as ?next=https://… cannot send anyone to another site (spec section 2). Returns null for anything
 * else, and for the login page itself.
 *
 *   safeNextPath('/admin/bookings/?day=all')  returns '/admin/bookings/?day=all'
 *   safeNextPath('https://example.com/')       returns null
 *   safeNextPath('/admin/../elsewhere/')        returns null
 */
export function safeNextPath(next: unknown): string | null {
  if (typeof next !== 'string' || next.length > 200) return null
  if (!next.startsWith(ADMIN_ROOT_PATH)) return null
  // No way out of /admin/: no dot segments, no backslashes (some browsers read them as '/'), and nothing but
  // printable ASCII without spaces (the back office's paths and queries are plain ASCII).
  if (/\.\.|\\|[^\x21-\x7E]/.test(next)) return null
  const path = next.split(/[?#]/, 1)[0]!
  if (withSlash(path) === LOGIN_PATH) return null
  return next
}

/** The login page, with the page to come back to after signing in. */
export function loginPathFor(next: string): string {
  const back = safeNextPath(next)
  return back && back !== ADMIN_ROOT_PATH ? `${LOGIN_PATH}?next=${encodeURIComponent(back)}` : LOGIN_PATH
}
