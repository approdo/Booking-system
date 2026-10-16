import { describe, expect, it } from 'vitest'
import { site } from '../../app/data/site'
import { isAdminPath, pageTitle } from '../../app/utils/pageTitle'

describe('pageTitle', () => {
  it('names the screen, then the side of the site (spec section 2)', () => {
    expect(pageTitle('customer', 'เลือกบริการ')).toBe(`เลือกบริการ · จองคิว${site.name.th}`)
    expect(pageTitle('admin', 'เข้าสู่ระบบ')).toBe(`เข้าสู่ระบบ · หลังบ้าน${site.name.th}`)
  })

  it('is the side alone without a screen', () => {
    expect(pageTitle('admin')).toBe(`หลังบ้าน${site.name.th}`)
  })
})

describe('isAdminPath', () => {
  it.each(['/admin', '/admin/', '/admin/login/', '/admin/bookings/?day=all'])('%j is in the back office', (path) => {
    expect(isAdminPath(path)).toBe(true)
  })

  it.each(['/', '/details/', '/administrator/', '/done/?from=/admin/'])('%j is not', (path) => {
    expect(isAdminPath(path)).toBe(false)
  })
})
