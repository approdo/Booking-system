import { describe, expect, it } from 'vitest'
import {
  ADMIN_HOME_PATH,
  ADMIN_PAGE_PATHS,
  ADMIN_TABS,
  currentTab,
  LOGIN_PATH,
  loginPathFor,
  safeNextPath,
  SETTINGS_PAGES,
} from '../../app/utils/adminNav'
import { ICON_PATHS } from '../../app/utils/icons'

// The back office's tabs and the login page's `next` (spec sections 2 and 7). The rules of the list are checked,
// not its length, so BK-008 to BK-010 can add their tabs (lesson G-018).

describe('ADMIN_TABS', () => {
  it('has unique keys, existing icons, and paths under /admin/ that end with "/"', () => {
    expect(ADMIN_TABS.length).toBeGreaterThanOrEqual(3)
    expect(new Set(ADMIN_TABS.map(tab => tab.key)).size).toBe(ADMIN_TABS.length)
    for (const tab of ADMIN_TABS) {
      expect(Object.keys(ICON_PATHS)).toContain(tab.icon)
      for (const path of [tab.path, ...tab.pages]) expect(path).toMatch(/^\/admin\/[a-z-]+\/$/)
      expect(tab.pages).toContain(tab.path)
    }
  })

  it('always has "การจอง", "บริการ" and "ตั้งค่าร้าน", which leads to the opening hours (spec C10)', () => {
    expect(ADMIN_TABS.map(tab => tab.label)).toEqual(expect.arrayContaining(['การจอง', 'บริการ', 'ตั้งค่าร้าน']))
    expect(ADMIN_TABS.find(tab => tab.key === 'settings')?.path).toBe('/admin/hours/')
    expect(SETTINGS_PAGES[0]?.path).toBe('/admin/hours/')
  })

  it('has "ตารางงานหมอนวด" (BK-010) as a page of "ตั้งค่าร้าน", after the opening hours (spec C10)', () => {
    expect(SETTINGS_PAGES.map(page => page.label)).toEqual(['เวลาเปิดปิดร้าน', 'ตารางงานหมอนวด'])
    expect(ADMIN_TABS.find(tab => tab.key === 'settings')?.pages).toEqual(SETTINGS_PAGES.map(page => page.path))
    expect(ADMIN_PAGE_PATHS).toContain('/admin/therapists/')
  })

  it('opens the first tab from /admin/, and generates every page with the login page', () => {
    expect(ADMIN_HOME_PATH).toBe(ADMIN_TABS[0]?.path)
    // "วันนี้" (BK-008) is the first page after signing in (spec section 2).
    expect(ADMIN_HOME_PATH).toBe('/admin/today/')
    expect(ADMIN_PAGE_PATHS).toEqual(expect.arrayContaining(['/admin/', LOGIN_PATH, ...ADMIN_TABS.map(tab => tab.path)]))
    expect(new Set(ADMIN_PAGE_PATHS).size).toBe(ADMIN_PAGE_PATHS.length)
  })
})

describe('currentTab', () => {
  it('finds the tab of a page, with or without the last "/"', () => {
    expect(currentTab('/admin/today/')?.key).toBe('today')
    expect(currentTab('/admin/bookings/')?.key).toBe('bookings')
    expect(currentTab('/admin/calendar/')?.key).toBe('calendar')
    expect(currentTab('/admin/services')?.key).toBe('services')
    expect(currentTab('/admin/hours/')?.key).toBe('settings')
    expect(currentTab('/admin/therapists/')?.key).toBe('settings')
    expect(currentTab('/admin/login/')).toBeNull()
  })
})

describe('safeNextPath', () => {
  it('accepts a page of the back office, with its query', () => {
    expect(safeNextPath('/admin/bookings/?day=all')).toBe('/admin/bookings/?day=all')
    expect(safeNextPath('/admin/')).toBe('/admin/')
  })

  it('refuses anything that could lead out of the back office (no open redirect)', () => {
    for (const next of [
      'https://example.com/',
      '//example.com/admin/',
      '/elsewhere/',
      '/admin/../time/',
      '/admin/\\example.com',
      '/admin/ bookings/',
      '/admin/login/',
      '/admin/login/?next=/admin/',
      undefined,
      ['/admin/bookings/'],
    ]) expect(safeNextPath(next), String(next)).toBeNull()
  })
})

describe('loginPathFor', () => {
  it('adds the page to come back to, encoded', () => {
    expect(loginPathFor('/admin/bookings/?day=all')).toBe(`${LOGIN_PATH}?next=${encodeURIComponent('/admin/bookings/?day=all')}`)
  })

  it('leaves `next` out for /admin/ itself and for anything unsafe', () => {
    expect(loginPathFor('/admin/')).toBe(LOGIN_PATH)
    expect(loginPathFor('https://example.com/')).toBe(LOGIN_PATH)
  })
})
