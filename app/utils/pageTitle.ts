import { site } from '../data/site'

/** The two sides of the site: the customer's booking pages and the shop's back office (/admin/). */
export type SiteSide = 'customer' | 'admin'

/**
 * The <title> of a page (spec section 2): '{screen} · จองคิวนวลไพล' on the booking pages,
 * '{screen} · หลังบ้านนวลไพล' in the back office, or the name of the side alone without a screen.
 *
 *   pageTitle('customer', 'เลือกบริการ')  returns 'เลือกบริการ · จองคิวนวลไพล'
 *   pageTitle('admin')                   returns 'หลังบ้านนวลไพล'
 */
export function pageTitle(side: SiteSide, screen?: string): string {
  const sideName = `${side === 'customer' ? 'จองคิว' : 'หลังบ้าน'}${site.name.th}`
  return screen ? `${screen} · ${sideName}` : sideName
}

/** True for the back-office pages, /admin/ and everything under it (paths without the base URL). */
export function isAdminPath(path: string): boolean {
  return path === '/admin' || path.startsWith('/admin/')
}
