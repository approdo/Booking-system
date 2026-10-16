import { expect, test } from '@playwright/test'
import type { APIRequestContext, BrowserContext, Locator, Page, Route } from '@playwright/test'
import { demoAccount } from '../../app/data/demoAccount'
import { sampleBookings } from '../../app/data/sampleBookings'
import { site } from '../../app/data/site'
import { therapists } from '../../app/data/team'
import type { AvailabilityResponse, BookingCreatedResponse } from '../../app/types/api'
import { ADMIN_PAGE_PATHS, ADMIN_TABS, LOGIN_PATH } from '../../app/utils/adminNav'
import type { BookingDraft } from '../../app/utils/bookingDraft'
import { DRAFT_STORAGE_KEYS } from '../../app/utils/bookingDraft'
import { fullDate, shortDateWithYear, spokenDate, thaiToday, weekdayName } from '../../app/utils/bookingFormat'
import { addDays, weekdayOf } from '../../app/utils/bookingRules'
import { STORAGE_KEYS } from '../../app/utils/bookingRepository'
import { UNASSIGNED } from '../../app/utils/calendarDay'
import { joinPhrases } from '../../app/utils/phrases'
import { stateBanners } from '../../app/utils/statusBanners'

// The back office (BK-007 to BK-010, spec sections 2, 3, 5, 7, 8 and 11; design B): signing in with the demo
// account shown on the page, "วันนี้", the booking list, the calendar, services and prices, the opening hours and
// the therapists' working days, against the booking API on this
// machine (playwright.config.ts starts the Worker with a fresh local D1). Every test has its own browser
// context, so its own sandbox: what one test changes no other test sees (D-004). Answers that are hard to cause
// for real (429, demo_full, a dead network, an expired sandbox) are faked with page.route (lesson G-045).

const sitePath = new URL(site.url).pathname

/** The line under the demo account, word for word (spec section 5). */
const SANDBOX_LINE = 'สิ่งที่คุณแก้เห็นเฉพาะใน browser นี้ และถูกลบภายใน 24 ชั่วโมง'

/** The path of a page on the server: '/admin/bookings/' gives '/Booking-system/admin/bookings/'. */
function serverPath(path: string) {
  return `${sitePath}${path.replace(/^\//, '')}`
}

function urlOf(path: string) {
  return new RegExp(`${serverPath(path).replace(/[/?.]/g, '\\$&')}$`)
}

/** The login page, with `next` (the router writes it unencoded) or without it. */
function loginUrl(next?: string) {
  return (url: URL) => url.pathname === serverPath(LOGIN_PATH) && url.searchParams.get('next') === (next ?? null)
}

/** Opens a page and waits until Vue has taken over the pre-rendered HTML (lesson G-057). */
async function openPage(page: Page, path: string) {
  await page.goto(`.${path}`)
  await page.waitForFunction(() => {
    const root = document.querySelector('#__nuxt')
    return root !== null && '__vue_app__' in root
  })
}

function demoButton(page: Page) {
  return page.getByRole('button', { name: 'เข้าด้วยบัญชีทดลอง' })
}

/** Signs in with "เข้าด้วยบัญชีทดลอง" and waits for the page it leads to: `next`, or the first tab. */
async function signIn(page: Page, next?: string) {
  await openPage(page, next ? `${LOGIN_PATH}?next=${encodeURIComponent(next)}` : LOGIN_PATH)
  await demoButton(page).click()
  await expect(page).toHaveURL(urlOf(next ?? ADMIN_TABS[0]!.path))
}

/** Text that is really on the screen (lesson G-028): checkVisibility() of the element that holds it. */
async function expectVisibleText(scope: Page | Locator, text: string) {
  const element = scope.getByText(text, { exact: true }).first()
  await expect(element).toBeVisible()
  expect(await element.evaluate(node => node.checkVisibility())).toBe(true)
}

/** Answers an API request with a made-up status and JSON body, with the CORS headers the page needs. */
async function fakeAnswer(route: Route, status: number, body: unknown) {
  const origin = route.request().headers().origin ?? 'http://localhost:4176'
  const cors = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  }
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
  await route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) })
}

/** The card of a booking in the list. */
function card(page: Page, code: string) {
  return page.locator(`li[data-code="${code}"]`)
}

function cards(page: Page) {
  return page.locator('main li[data-code]')
}

/** Types into the search box and waits out its 200 ms pause. */
async function search(page: Page, text: string) {
  await page.getByRole('searchbox', { name: 'ค้นหา' }).fill(text)
  await page.waitForTimeout(400)
}

/** Puts a value into sessionStorage before the page's scripts run, unless the page has already set it. */
async function seedSession(context: BrowserContext, key: string, value: unknown) {
  await context.addInitScript(({ key, value }) => {
    if (sessionStorage.getItem(key) === null) sessionStorage.setItem(key, value)
  }, { key, value: JSON.stringify(value) })
}

test.describe('AC1: signing in and out', () => {
  test('a page without a session leads to the login page, which shows the demo account and comes back afterwards', async ({ page }) => {
    await openPage(page, '/admin/services/')
    await expect(page).toHaveURL(loginUrl('/admin/services/'))
    await expect(page.locator('h1')).toHaveText('เข้าสู่ระบบ')

    // The demo account is on the page on purpose (D-004), with the two lines under the button (spec section 7).
    const account = page.locator('#demo-account')
    await expectVisibleText(account, demoAccount.email)
    await expectVisibleText(account, demoAccount.password)
    await expectVisibleText(account, SANDBOX_LINE)
    await expectVisibleText(account, 'ห้ามกรอกข้อมูลจริงในหลังบ้านทดลอง')

    await demoButton(page).click()
    await expect(page).toHaveURL(urlOf('/admin/services/'))
    await expect(page.locator('h1')).toHaveText('บริการและราคา')
    await expectVisibleText(page.locator('#site-header'), 'บัญชีทดลอง')

    // The session survives a reload, and /admin/ leads to the first tab.
    await page.reload()
    await expect(page.locator('h1')).toHaveText('บริการและราคา')
    await openPage(page, '/admin/')
    await expect(page).toHaveURL(urlOf(ADMIN_TABS[0]!.path))

    // "ออกจากระบบ" ends the session; the pages lead to the login page again.
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click()
    await expect(page).toHaveURL(urlOf(LOGIN_PATH))
    expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEYS.session)).toBeNull()
    await openPage(page, '/admin/hours/')
    await expect(page).toHaveURL(loginUrl('/admin/hours/'))
  })

  test('the form: empty fields and a wrong password show their errors; the right one signs in; nothing goes into the URL', async ({ page }) => {
    await openPage(page, LOGIN_PATH)
    const submit = page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true })

    await submit.click()
    await expectVisibleText(page, 'กรุณากรอกอีเมล')
    await expectVisibleText(page, 'กรุณากรอกรหัสผ่าน')
    await expect(page.getByLabel('อีเมล')).toBeFocused()

    await page.getByLabel('อีเมล').fill(demoAccount.email)
    await page.getByLabel('รหัสผ่าน').fill('not-the-password')
    await submit.click()
    await expectVisibleText(page, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง')
    await expect(page).toHaveURL(urlOf(LOGIN_PATH))

    await page.getByLabel('รหัสผ่าน').fill(demoAccount.password)
    await submit.click()
    await expect(page).toHaveURL(urlOf(ADMIN_TABS[0]!.path))
    expect(page.url()).not.toContain('password')
  })

  test('the first sign-in of a browser says "กำลังเตรียมข้อมูลตัวอย่าง…" on the button while the sandbox is made (spec section 5)', async ({ page }) => {
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(`${site.apiUrl}/api/admin/login`, async (route) => {
      await held
      await route.continue()
    })
    await openPage(page, LOGIN_PATH)
    await demoButton(page).click()
    await expect(page.locator('#demo-account button')).toHaveText('กำลังเตรียมข้อมูลตัวอย่าง…')
    await expect(page.locator('#demo-account button')).toHaveAttribute('aria-disabled', 'true')
    release()
    await expect(page).toHaveURL(urlOf(ADMIN_TABS[0]!.path))
    await page.unroute(`${site.apiUrl}/api/admin/login`)
  })

  test('`next` leads only to a page of the back office (no open redirect)', async ({ page }) => {
    await openPage(page, `${LOGIN_PATH}?next=${encodeURIComponent('https://example.com/')}`)
    await demoButton(page).click()
    await expect(page).toHaveURL(urlOf(ADMIN_TABS[0]!.path))

    await openPage(page, `${LOGIN_PATH}?next=${encodeURIComponent('/admin/hours/')}`)
    // Signed in already: the login page sends the visitor straight on.
    await expect(page).toHaveURL(urlOf('/admin/hours/'))
  })

  test('an expired sandbox and an ended session go back to the login page and say why (spec section 5)', async ({ page }) => {
    // The first page ("วันนี้") reads /api/admin/shop too: let it finish before that answer is faked.
    await signIn(page)
    await expect(todayCount(page, 'pending')).toBeVisible()
    await page.route(`${site.apiUrl}/api/admin/shop`, route => fakeAnswer(route, 410, { error: 'sandbox_expired' }))
    await page.getByRole('link', { name: 'บริการ', exact: true }).first().click()
    await expect(page).toHaveURL(urlOf(LOGIN_PATH))
    await expectVisibleText(page, joinPhrases(stateBanners.sandbox_expired.text))
    // The message stands above the demo account, and the old tokens are gone.
    const banner = page.getByText(joinPhrases(stateBanners.sandbox_expired.text)).first()
    const account = page.locator('#demo-account')
    expect((await banner.boundingBox())!.y).toBeLessThan((await account.boundingBox())!.y)
    expect(await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [STORAGE_KEYS.sandbox, STORAGE_KEYS.session])).toEqual([null, null])
    await page.unroute(`${site.apiUrl}/api/admin/shop`)

    await demoButton(page).click()
    await expect(page).toHaveURL(urlOf(ADMIN_TABS[0]!.path))
    await expect(todayCount(page, 'pending')).toBeVisible()
    await page.route(`${site.apiUrl}/api/admin/shop`, route => fakeAnswer(route, 401, { error: 'unauthorized' }))
    await page.getByRole('link', { name: 'ตั้งค่าร้าน', exact: true }).first().click()
    await expect(page).toHaveURL(loginUrl('/admin/hours/'))
    await expectVisibleText(page, 'กรุณาเข้าสู่ระบบอีกครั้ง')
    await page.unroute(`${site.apiUrl}/api/admin/shop`)
  })
})

test.describe('AC2: the booking list', () => {
  test('search by booking number, name and phone; filter by status and day; the filters stay after a reload', async ({ page, context, request }) => {
    // One booking of this visitor, made through the API, with a phone number of its own (reserved, D-010).
    const tomorrow = addDays(thaiToday(), 1)
    const response = await request.post(`${site.apiUrl}/api/bookings`, {
      data: { serviceId: 'thai-traditional', minutes: 60, therapistId: null, date: tomorrow, time: '14:00', name: 'ทดลอง ค้นหา', phone: '020-000-0000' },
    })
    expect(response.status()).toBe(201)
    const created = await response.json() as { booking: { code: string }, sandbox: { token: string } }
    await context.addInitScript(({ key, token }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, token)
    }, { key: STORAGE_KEYS.sandbox, token: created.sandbox.token })

    await signIn(page, '/admin/bookings/')
    await expect(cards(page)).toHaveCount(8)
    await expect(page.getByText('8 รายการ')).toBeVisible()
    await expect(card(page, created.booking.code).getByText('ใหม่', { exact: true })).toBeVisible()

    await search(page, 'np h4t7c')
    await expect(cards(page)).toHaveCount(1)
    await expect(card(page, 'NP-H4T7C')).toBeVisible()

    await search(page, 'เอมมา')
    await expect(cards(page)).toHaveCount(1)
    await expect(card(page, 'NP-H4T7C')).toBeVisible()

    await search(page, '020-000-0000')
    await expect(cards(page)).toHaveCount(1)
    await expect(card(page, created.booking.code)).toBeVisible()

    await search(page, 'ไม่มีชื่อนี้')
    await expectVisibleText(page, 'ไม่พบการจองที่ตรงกับตัวกรอง')
    await page.getByRole('button', { name: 'ล้างตัวกรอง' }).click()
    await expect(cards(page)).toHaveCount(8)

    const statusGroup = page.getByRole('group', { name: 'สถานะ' })
    await statusGroup.getByRole('button', { name: /^รอยืนยัน/ }).click()
    await expect(cards(page)).toHaveCount(2)
    for (const item of await cards(page).all()) await expect(item.getByText('รอยืนยัน', { exact: true })).toBeVisible()

    await page.getByRole('group', { name: 'ช่วงวัน' }).getByRole('button', { name: 'วันนี้' }).click()
    await expect(cards(page)).toHaveCount(1)
    await expect(card(page, 'NP-2MW8D')).toBeVisible()
    await expect(page).toHaveURL(/[?&]day=today(&|$)/)
    await expect(page).toHaveURL(/[?&]status=pending(&|$)/)

    await page.reload()
    await expect(cards(page)).toHaveCount(1)
    await expect(page.getByRole('group', { name: 'สถานะ' }).getByRole('button', { name: /^รอยืนยัน/ })).toHaveAttribute('aria-pressed', 'true')

    await page.getByRole('group', { name: 'ช่วงวัน' }).getByRole('button', { name: 'พรุ่งนี้' }).click()
    await expect(cards(page)).toHaveCount(1)
    await expect(card(page, created.booking.code)).toBeVisible()

    await page.getByRole('group', { name: 'ช่วงวัน' }).getByRole('button', { name: 'ทุกวัน' }).click()
    await statusGroup.getByRole('button', { name: /^ทั้งหมด/ }).click()
    await page.getByLabel('หมอนวด').selectOption({ label: 'ไม่ระบุ' })
    await expect(cards(page)).toHaveCount(2)
  })

  test('one tap changes the status in place, the card stays until the filter changes, and a reload keeps it (spec section 4)', async ({ page }) => {
    await signIn(page, '/admin/bookings/?status=pending')
    const pendingTab = page.getByRole('navigation', { name: 'เมนูหลังบ้าน' }).getByRole('link', { name: /การจอง/ }).first()
    await expect(pendingTab).toHaveAccessibleName(/รอยืนยัน 1/)

    const pending = card(page, 'NP-2MW8D')
    await pending.getByRole('button', { name: 'ยืนยัน', exact: true }).click()
    await expect(pending.getByText('ยืนยันแล้ว', { exact: true })).toBeVisible()
    await expect(pending.getByRole('button', { name: 'เสร็จแล้ว' })).toBeVisible()
    await expect(page.locator('.nuxt-announcer [aria-live="polite"]')).toHaveText('NP-2MW8D เปลี่ยนเป็น ยืนยันแล้ว แล้ว')
    await expect(pendingTab).not.toHaveAccessibleName(/รอยืนยัน/)

    await page.reload()
    await expect(page.locator('main li[data-code]')).toHaveCount(0)
    await expectVisibleText(page, 'ไม่พบการจองที่ตรงกับตัวกรอง')
    await page.getByRole('group', { name: 'สถานะ' }).getByRole('button', { name: /^ทั้งหมด/ }).click()
    await expect(card(page, 'NP-2MW8D').getByText('ยืนยันแล้ว', { exact: true })).toBeVisible()

    // The buttons of "เสร็จแล้ว" and "ยกเลิก" undo a wrong press.
    await card(page, 'NP-R6J3V').getByRole('button', { name: 'คืนคิว' }).click()
    await expect(card(page, 'NP-R6J3V').getByText('รอยืนยัน', { exact: true })).toBeVisible()
    await card(page, 'NP-3F8KW').getByRole('button', { name: 'ย้อนเป็นยืนยันแล้ว' }).click()
    await expect(card(page, 'NP-3F8KW').getByText('ยืนยันแล้ว', { exact: true })).toBeVisible()
    await card(page, 'NP-H4T7C').getByRole('button', { name: 'ยกเลิก' }).click()
    await expect(card(page, 'NP-H4T7C').getByText('ยกเลิก', { exact: true }).first()).toBeVisible()

    await page.reload()
    await expect(card(page, 'NP-R6J3V').getByText('รอยืนยัน', { exact: true })).toBeVisible()
    await expect(card(page, 'NP-3F8KW').getByText('ยืนยันแล้ว', { exact: true })).toBeVisible()
    await expect(card(page, 'NP-H4T7C').getByRole('button', { name: 'คืนคิว' })).toBeVisible()
  })

  test('a failed change shows the spec\'s message inside the card; "ลองใหม่" sends it again (spec section 5)', async ({ page }) => {
    await signIn(page, '/admin/bookings/')
    const target = card(page, 'NP-2MW8D')
    const patch = `${site.apiUrl}/api/admin/bookings/NP-2MW8D`

    await page.route(patch, route => fakeAnswer(route, 429, { error: 'rate_limited' }))
    await target.getByRole('button', { name: 'ยืนยัน', exact: true }).click()
    await expectVisibleText(target, joinPhrases(stateBanners.rate_limited.text))
    await page.unroute(patch)

    await page.route(patch, route => fakeAnswer(route, 503, { error: 'demo_full' }))
    await target.getByRole('button', { name: 'ยืนยัน', exact: true }).click()
    await expectVisibleText(target, 'เดโมเต็มชั่วคราว')
    await page.unroute(patch)

    await page.route(patch, route => route.abort())
    await target.getByRole('button', { name: 'ยืนยัน', exact: true }).click()
    await expectVisibleText(target, 'เชื่อมต่อระบบจองไม่ได้')
    await page.unroute(patch)
    await target.getByRole('button', { name: 'ลองใหม่' }).click()
    await expect(target.getByText('ยืนยันแล้ว', { exact: true })).toBeVisible()
    await expect(target.getByText('เชื่อมต่อระบบจองไม่ได้')).toHaveCount(0)
  })
})

test.describe('AC3: services and prices, seen by the customer', () => {
  test('a new price shows on the first booking screen, a closed service is no longer offered, a new one is', async ({ page }) => {
    await signIn(page, '/admin/services/')

    // Edit the price of "นวดแผนไทย 60 นาที" in the dialog.
    await page.getByRole('button', { name: 'แก้ไข นวดแผนไทย', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'แก้ไขบริการ' })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('ราคา ตัวเลือกที่ 1 (บาท)').fill('450')
    await dialog.getByRole('button', { name: 'บันทึก' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('60 นาที · 450 บาท').first()).toBeVisible()

    // Close "นวดหินร้อน" for bookings: saved at once.
    await page.getByRole('switch', { name: 'รับจอง นวดหินร้อน' }).click()
    await expect(page.getByText('ปิดชั่วคราว')).toBeVisible()

    // Add a service.
    await page.getByRole('button', { name: 'เพิ่มบริการ' }).click()
    const addDialog = page.getByRole('dialog', { name: 'เพิ่มบริการ' })
    await addDialog.getByLabel('ชื่อบริการ').fill('นวดทดลองเพิ่มใหม่')
    await addDialog.getByLabel('ราคา ตัวเลือกที่ 1 (บาท)').fill('321')
    await addDialog.getByRole('button', { name: 'บันทึก' }).click()
    await expect(addDialog).toBeHidden()
    await expect(page.getByRole('heading', { name: 'นวดทดลองเพิ่มใหม่' })).toBeVisible()

    // The customer's first screen in the same browser (the same sandbox).
    await openPage(page, '/')
    await page.locator('main .skeleton').first().waitFor({ state: 'detached' })
    await expect(page.getByRole('radio', { name: 'นวดแผนไทย 60 นาที 450 บาท' })).toHaveCount(1)
    await expect(page.getByRole('radio', { name: 'นวดแผนไทย 60 นาที 400 บาท' })).toHaveCount(0)
    await expect(page.locator('main').getByText('นวดหินร้อน')).toHaveCount(0)
    await expect(page.getByRole('radio', { name: 'นวดทดลองเพิ่มใหม่ 60 นาที 321 บาท' })).toHaveCount(1)
  })

  test('the form checks its fields like the API, and Esc closes it with the focus back on its button (spec D4)', async ({ page }) => {
    await signIn(page, '/admin/services/')
    const add = page.getByRole('button', { name: 'เพิ่มบริการ' })
    await add.click()
    const dialog = page.getByRole('dialog', { name: 'เพิ่มบริการ' })
    await expect(dialog.getByLabel('หมวด')).toBeFocused()

    await dialog.getByRole('button', { name: 'บันทึก' }).click()
    await expectVisibleText(dialog, 'กรุณากรอกชื่อบริการ')
    await expect(dialog.getByLabel('ชื่อบริการ')).toBeFocused()

    await dialog.getByLabel('ชื่อบริการ').fill('ก')
    await dialog.getByRole('button', { name: 'บันทึก' }).click()
    await expectVisibleText(dialog, 'ชื่อบริการต้องยาว 2–60 ตัวอักษร')

    await dialog.getByLabel('ชื่อบริการ').fill('นวดทดลอง')
    await dialog.getByRole('button', { name: 'บันทึก' }).click()
    await expectVisibleText(dialog, 'ราคาต้องเป็นตัวเลข 1–100,000')

    await dialog.getByLabel('ราคา ตัวเลือกที่ 1 (บาท)').fill('300')
    await dialog.getByRole('button', { name: 'เพิ่มตัวเลือก' }).click()
    await dialog.getByLabel('ระยะเวลา ตัวเลือกที่ 2').selectOption('60')
    await dialog.getByLabel('ราคา ตัวเลือกที่ 2 (บาท)').fill('500')
    await dialog.getByRole('button', { name: 'บันทึก' }).click()
    await expectVisibleText(dialog, 'ระยะเวลาซ้ำกัน')

    await dialog.getByRole('button', { name: 'ลบตัวเลือกที่ 2' }).click()
    await dialog.getByRole('button', { name: 'ลบตัวเลือกที่ 1' }).click()
    await dialog.getByRole('button', { name: 'บันทึก' }).click()
    await expectVisibleText(dialog, 'ต้องมีอย่างน้อย 1 ตัวเลือก')

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(add).toBeFocused()
  })
})

test.describe('AC4: opening hours, seen by the customer', () => {
  test('hours per day of the week and a special closed day change the customer\'s days and times', async ({ page, context }) => {
    const today = thaiToday()
    const tomorrow = addDays(today, 1)
    const inTwoDays = addDays(today, 2)
    const inThreeDays = addDays(today, 3)
    const draft: BookingDraft = {
      service: { id: 'thai-traditional', name: 'นวดแผนไทย', minutes: 60, price: 400 },
      therapist: { id: null, name: 'ไม่ระบุ' },
    }
    await seedSession(context, DRAFT_STORAGE_KEYS.draft, draft)

    await signIn(page, '/admin/hours/')
    await expectVisibleText(page, 'จันทร์ – อาทิตย์ · 10:00–22:00 น.')

    // Day by day: the day after tomorrow closes at 18:00 (last booking 17:00), the day after that is closed.
    await page.getByRole('switch', { name: 'ใช้เวลาเดียวกันทุกวัน' }).click()
    const shorter = weekdayOf(inTwoDays)
    const closed = weekdayOf(inThreeDays)
    await page.locator(`#hours-${shorter}-close`).selectOption('18:00')
    await page.locator(`#hours-${shorter}-lastBooking`).selectOption('18:00')
    await page.getByRole('button', { name: 'บันทึก', exact: true }).click()
    await expectVisibleText(page, 'คิวสุดท้ายต้องอยู่ระหว่างเวลาเปิดและเวลาปิด')
    await expect(page.locator(`#hours-${shorter}-open`)).toBeFocused()

    await page.locator(`#hours-${shorter}-lastBooking`).selectOption('17:00')
    await page.locator(`#hours-${closed}-switch`).click()
    await page.getByRole('button', { name: 'บันทึก', exact: true }).click()
    await expectVisibleText(page, 'บันทึกเวลาร้านแล้ว')

    // A special closed day: tomorrow.
    await page.getByRole('button', { name: 'เพิ่มวันหยุด' }).click()
    await page.getByLabel('วันที่').fill(tomorrow)
    await page.getByRole('button', { name: 'เพิ่ม', exact: true }).click()
    await expectVisibleText(page, shortDateWithYear(tomorrow))

    // A reload shows what was saved.
    await page.reload()
    await expect(page.getByRole('switch', { name: 'ใช้เวลาเดียวกันทุกวัน' })).not.toBeChecked()
    await expect(page.locator(`#hours-${shorter}-lastBooking`)).toHaveValue('17:00')
    await expect(page.locator(`#hours-${closed}-switch`)).not.toBeChecked()

    // The customer's times in the same browser.
    await openPage(page, '/time/')
    await expect(page.getByRole('radio', { name: `${spokenDate(tomorrow)} หยุด` })).toBeDisabled()
    await expect(page.getByRole('radio', { name: `${spokenDate(inThreeDays)} หยุด` })).toBeDisabled()
    await page.getByRole('radio', { name: `${spokenDate(inTwoDays)} ว่าง` }).locator('xpath=ancestor::label[1]').click()
    await expect(page.getByRole('radio', { name: '17:00 ถึง 18:00' })).toHaveCount(1)
    await expect(page.getByRole('radio', { name: /^17:30/ })).toHaveCount(0)
    await expect(page.getByRole('radio', { name: /^20:30/ })).toHaveCount(0)
  })
})

test.describe('AC5: noindex, sizes and the tab bar', () => {
  test('every page of the back office is noindex in the generated HTML (N11)', async ({ request }) => {
    for (const path of ADMIN_PAGE_PATHS) {
      const html = await (await request.get(`.${path}`)).text()
      expect(html, path).toMatch(/<meta name="robots" content="noindex">/)
    }
  })

  test('no sideways scrolling at 375, 768 and 1440; the cards have 1, 2 and 3 columns; the tab bar shows below 1024 (N6, spec D2)', async ({ page }) => {
    await signIn(page)
    const pages = ['/admin/today/', '/admin/bookings/', '/admin/calendar/', '/admin/services/', '/admin/hours/', '/admin/therapists/']
    for (const [width, columns] of [[375, 1], [768, 2], [1440, 3]] as const) {
      await page.setViewportSize({ width, height: 800 })
      for (const path of pages) {
        await openPage(page, path)
        await page.locator('main .skeleton').first().waitFor({ state: 'detached' })
        await page.evaluate(() => document.fonts.ready)
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }))
        expect(scrollWidth, `${path} ${width}px`).toBeLessThanOrEqual(clientWidth)
      }
      await openPage(page, '/admin/bookings/')
      await page.locator('main .skeleton').first().waitFor({ state: 'detached' })
      const lefts = await cards(page).evaluateAll(items => new Set(items.map(item => Math.round(item.getBoundingClientRect().left))).size)
      expect(lefts, `${width}px`).toBe(columns)
      await expect(page.locator('nav.tab-bar')).toBeVisible({ visible: width < 1024 })
      await expect(page.locator('#site-header nav')).toBeVisible({ visible: width >= 1024 })
    }
  })

  test('at 375 every control is at least 44px high with 16px fields, and the tab bar never covers the last card or the keyboard focus (spec D3, G-014)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 640 })
    await signIn(page)
    for (const path of ['/admin/today/', '/admin/bookings/', '/admin/calendar/', '/admin/services/', '/admin/hours/', '/admin/therapists/']) {
      await openPage(page, path)
      await page.locator('main .skeleton').first().waitFor({ state: 'detached' })
      const small = await page.evaluate(() => [...document.querySelectorAll('main a, main button, main input:not(.switch), main select, nav a, header button')]
        .filter(element => element.checkVisibility())
        .map(element => ({ text: (element.textContent ?? '').trim().slice(0, 30), height: element.getBoundingClientRect().height }))
        .filter(control => control.height < 44))
      expect(small, path).toEqual([])
      const fontSizes = await page.locator('main input:not(.switch), main select').evaluateAll(fields => fields.map(field => getComputedStyle(field).fontSize))
      for (const size of fontSizes) expect(size, path).toBe('16px')

      // Scrolled to the end, the last thing in <main> ends above the tab bar.
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }))
      const gap = await page.evaluate(() => {
        const bar = document.querySelector('nav.tab-bar')!.getBoundingClientRect()
        const last = [...document.querySelectorAll('main button, main a, main li, main select, main input')].filter(element => element.checkVisibility()).at(-1)!
        return bar.top - last.getBoundingClientRect().bottom
      })
      expect(gap, path).toBeGreaterThanOrEqual(0)
    }

    // Tab and Shift+Tab through the list: the focused element is never under the tab bar (WCAG 2.4.11, G-023).
    await openPage(page, '/admin/bookings/')
    await page.locator('main .skeleton').first().waitFor({ state: 'detached' })
    await page.locator('#booking-search').focus()
    for (const key of ['Tab', 'Shift+Tab']) {
      for (let step = 0; step < 25; step++) {
        await page.keyboard.press(key)
        const covered = await page.evaluate(() => {
          const focused = document.activeElement as HTMLElement | null
          if (!focused || focused === document.body || focused.closest('nav.tab-bar, #site-header')) return null
          const box = focused.getBoundingClientRect()
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
          return hit && (focused === hit || focused.contains(hit)) ? null : `${focused.tagName} ${focused.textContent?.trim().slice(0, 30)}`
        })
        expect(covered, key).toBeNull()
      }
    }
  })
})

/** A moment in Thai time for the browser's clock: ('2026-10-17', '12:00') is 2026-10-17T05:00:00Z. */
function thaiClock(date: string, time: string) {
  return new Date(`${date}T${time}:00+07:00`)
}

/** The number of one status at the top of "วันนี้". */
function todayCount(page: Page, status: string) {
  return page.locator(`main a[data-status="${status}"] span`)
}

/** The bookings listed under "คิวถัดไป". */
function followingCodes(page: Page) {
  return page.getByRole('list', { name: 'คิวต่อจากนั้น' }).locator('li[data-code]')
}

/** The booking list with exactly this query, e.g. '?day=today&status=pending'. */
function bookingListUrl(search: string) {
  return (url: URL) => url.pathname === serverPath('/admin/bookings/') && url.search === search
}

test.describe('BK-008: today', () => {
  test('today\'s bookings per status, the next one and those after it, and links to the list of today (AC2)', async ({ page }) => {
    // The browser's clock stands at 12:00 Thai time today: the next booking of the starting data is 13:00.
    const today = thaiToday()
    await page.clock.setFixedTime(thaiClock(today, '12:00'))
    await signIn(page)
    await expect(page).toHaveURL(urlOf('/admin/today/'))
    await expect(page.locator('h1')).toHaveText('วันนี้')
    await expect(page.locator('h1 + p')).toHaveText(`${fullDate(today)} · ร้านเปิด 10:00–22:00 น.`)

    for (const [status, count] of [['pending', 1], ['confirmed', 2], ['done', 2], ['cancelled', 1]] as const) {
      await expect(todayCount(page, status), status).toHaveText(String(count))
    }
    const next = page.locator('#next-booking')
    await expect(next.getByRole('heading')).toHaveText('13:00–14:30 · คุณเอมมา')
    await expect(next).toContainText('นวดน้ำมันอโรมา 90 นาที · มาลัย')
    await expect(followingCodes(page)).toHaveCount(2)
    expect(await followingCodes(page).evaluateAll(items => items.map(item => item.getAttribute('data-code')))).toEqual(['NP-2MW8D', 'NP-5TB9L'])
    await expect(followingCodes(page).first().getByText('รอยืนยัน', { exact: true })).toBeVisible()

    // A number leads to the list of today with that status.
    await page.locator('main a[data-status="pending"]').click()
    await expect(page).toHaveURL(bookingListUrl('?day=today&status=pending'))
    await expect(cards(page)).toHaveCount(1)
    await expect(card(page, 'NP-2MW8D')).toBeVisible()

    // "ดูการจองวันนี้ทั้งหมด": every booking of today, with the day filter on "วันนี้".
    await openPage(page, '/admin/today/')
    await page.getByRole('link', { name: 'ดูการจองวันนี้ทั้งหมด' }).click()
    await expect(page).toHaveURL(bookingListUrl('?day=today'))
    await expect(cards(page)).toHaveCount(sampleBookings.filter(item => item.dayOffset === 0).length)
    await expect(page.getByRole('group', { name: 'ช่วงวัน' }).getByRole('button', { name: 'วันนี้' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('a new booking for today adds one to its status and is "คิวถัดไป" when it really is next (AC1)', async ({ page, request }) => {
    // The first start time still free today (Thai time) that no booking of the starting data has.
    const availability = await (await request.get(`${site.apiUrl}/api/availability?minutes=60&therapist=any`)).json() as AvailabilityResponse
    const today = availability.days[0]!
    const startingTimes = new Set(sampleBookings.filter(item => item.dayOffset === 0).map(item => item.start))
    const slot = today.slots.find(item => item.available && !startingTimes.has(item.time))
    test.skip(!slot, 'No start time is free any more today in Thai time: run this test before the last booking time (20:30).')
    const start = thaiClock(today.date, slot!.time)

    // The browser's clock stands at that start time, so no other booking can come before the new one.
    await page.clock.setFixedTime(start)
    await signIn(page)
    await expect(todayCount(page, 'pending')).toHaveText(/^\d+$/)
    const before = Number(await todayCount(page, 'pending').textContent())

    // Book in the visitor's own sandbox (the token the sign-in left in localStorage); new bookings wait as "รอยืนยัน".
    const token = await page.evaluate(key => localStorage.getItem(key), STORAGE_KEYS.sandbox)
    const response = await request.post(`${site.apiUrl}/api/bookings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { serviceId: 'thai-traditional', minutes: 60, therapistId: null, date: today.date, time: slot!.time, name: 'ทดลอง วันนี้', phone: '02-000-0000' },
    })
    expect(response.status()).toBe(201)
    const { booking } = await response.json() as BookingCreatedResponse
    expect(booking.status).toBe('pending')

    await page.reload()
    await expect(todayCount(page, 'pending')).toHaveText(String(before + 1))
    await expect(page.locator('#next-booking h2')).toHaveText(`${booking.start}–${booking.end} · ทดลอง วันนี้`)

    // A minute after it started it is no longer next, and the count stays.
    await page.clock.setFixedTime(new Date(start.getTime() + 60_000))
    await page.reload()
    await expect(todayCount(page, 'pending')).toHaveText(String(before + 1))
    await expect(page.locator('main').getByText('ทดลอง วันนี้')).toHaveCount(0)
  })

  test('the numbers are 2 × 2 at 375 and in one row from 768 (spec section 8)', async ({ page }) => {
    await signIn(page)
    for (const [width, columns] of [[375, 2], [768, 4], [1440, 4]] as const) {
      await page.setViewportSize({ width, height: 800 })
      await openPage(page, '/admin/today/')
      await expect(todayCount(page, 'pending')).toBeVisible()
      const lefts = await page.locator('main a[data-status]').evaluateAll(items => new Set(items.map(item => Math.round(item.getBoundingClientRect().left))).size)
      expect(lefts, `${width}px`).toBe(columns)
    }
  })
})

/** A booking in the calendar, in whichever view the width shows (grid from 1024px, list below). */
function calendarEvent(page: Page, code: string) {
  return page.locator(`main button[data-code="${code}"]`).filter({ visible: true })
}

/** The calendar on this day: the URL has ?date=…, or no date at all for today. */
function calendarUrl(date: string | null) {
  return (url: URL) => url.pathname === serverPath('/admin/calendar/') && url.searchParams.get('date') === date
}

/** Waits until the calendar has its bookings (the skeleton is gone). */
async function calendarLoaded(page: Page) {
  await expect(page.locator('h1')).toHaveText('ปฏิทิน')
  await page.locator('main .skeleton').first().waitFor({ state: 'detached' })
}

/**
 * Where a booking sits in the grid: in the column of `column`, and its top on the line of `time` at the left
 * (rows of 30 minutes are 24px high, so a booking of 60 minutes is 48px less the 2px between blocks).
 */
async function expectInGrid(page: Page, code: string, column: string, time: string, minutes: number) {
  const block = page.locator(`section[data-column="${column}"] button[data-code="${code}"]`)
  await expect(block).toBeVisible()
  const box = (await block.boundingBox())!
  const mark = (await page.locator(`[data-time="${time}"]`).boundingBox())!
  expect(Math.abs(box.y - 1 - mark.y), `${code} at ${time}`).toBeLessThanOrEqual(1)
  expect(Math.abs(box.height - (minutes * 0.8 - 2)), `${code} ${minutes} minutes`).toBeLessThanOrEqual(1)
}

/** A therapist of the starting data who works on that day (spec section 10), other than `except`. */
function workingOn(date: string, except: string) {
  return therapists.find(person => person.id !== except && !(person.daysOff as readonly number[]).includes(weekdayOf(date)))!
}

/**
 * Books through the API in a new sandbox, at 14:00 for an hour, and gives the browser that sandbox before its
 * first page, so signing in shows it. Returns the booking number.
 */
async function bookInNewSandbox(context: BrowserContext, request: APIRequestContext, date: string, therapistId: string) {
  const response = await request.post(`${site.apiUrl}/api/bookings`, {
    data: { serviceId: 'thai-traditional', minutes: 60, therapistId, date, time: '14:00', name: 'ทดลอง ปฏิทิน', phone: '02-000-0000' },
  })
  expect(response.status()).toBe(201)
  const created = await response.json() as BookingCreatedResponse & { sandbox: { token: string } }
  await context.addInitScript(({ key, token }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, token)
  }, { key: STORAGE_KEYS.sandbox, token: created.sandbox.token })
  return created.booking.code
}

test.describe('BK-009: calendar', () => {
  test('a booking made in the test shows in its day, therapist and time; next day, previous day and "วันนี้" move and come back (AC1)', async ({ page, context, request }) => {
    // A booking of this visitor for tomorrow at 14:00, with a therapist who works tomorrow (not มาลัย, who has
    // the starting data's booking tomorrow).
    const today = thaiToday()
    const tomorrow = addDays(today, 1)
    const person = workingOn(tomorrow, 'malai')
    const code = await bookInNewSandbox(context, request, tomorrow, person.id)

    // From 1024px: today's grid, a column for "ยังไม่จัดคน" and one per therapist.
    await page.setViewportSize({ width: 1440, height: 900 })
    await signIn(page, '/admin/calendar/')
    await calendarLoaded(page)
    await expect(page.locator('h1 + p')).toHaveText(`${fullDate(today)} · ร้านเปิด 10:00–22:00 น.`)
    await expect(page.locator('section[data-column]')).toHaveCount(1 + therapists.length)
    await expectInGrid(page, 'NP-H4T7C', 'malai', '13:00', 90)
    await expectInGrid(page, 'NP-2MW8D', UNASSIGNED, '15:00', 60)
    await expect(calendarEvent(page, code)).toHaveCount(0)

    // "วันถัดไป": tomorrow, with the new booking in its therapist's column at 14:00.
    await page.getByRole('button', { name: 'วันถัดไป' }).click()
    await expect(page).toHaveURL(calendarUrl(tomorrow))
    await expect(page.locator('h1 + p')).toHaveText(`${fullDate(tomorrow)} · ร้านเปิด 10:00–22:00 น.`)
    await expectInGrid(page, code, person.id, '14:00', 60)
    await expect(calendarEvent(page, code)).toContainText('14:00 ทดลอง ปฏิทิน')
    await expect(calendarEvent(page, code)).toContainText('รอยืนยัน')
    await expect(calendarEvent(page, 'NP-H4T7C')).toHaveCount(0)

    // "วันก่อน" comes back to today.
    await page.getByRole('button', { name: 'วันก่อน' }).click()
    await expect(page).toHaveURL(calendarUrl(null))
    await expect(page.locator('h1 + p')).toHaveText(`${fullDate(today)} · ร้านเปิด 10:00–22:00 น.`)
    await expect(calendarEvent(page, code)).toHaveCount(0)
    await expect(calendarEvent(page, 'NP-H4T7C')).toBeVisible()

    // The day stays after a reload (lesson L-010), and "วันนี้" comes back from any day.
    await page.getByRole('button', { name: 'วันถัดไป' }).click()
    await page.getByRole('button', { name: 'วันถัดไป' }).click()
    await expect(page).toHaveURL(calendarUrl(addDays(today, 2)))
    await page.reload()
    await calendarLoaded(page)
    await expect(page.locator('h1 + p')).toContainText(fullDate(addDays(today, 2)))
    await page.getByRole('button', { name: 'วันนี้', exact: true }).click()
    await expect(page).toHaveURL(calendarUrl(null))
    await expect(calendarEvent(page, 'NP-H4T7C')).toBeVisible()

    // Below 1024px the same day is a list in time order, with a filter per therapist.
    await page.setViewportSize({ width: 375, height: 800 })
    await openPage(page, `/admin/calendar/?date=${tomorrow}`)
    await calendarLoaded(page)
    await expect(page.locator('section[data-column]').first()).toBeHidden()
    await expect(calendarEvent(page, code)).toContainText('14:00–15:00 · ทดลอง ปฏิทิน')
    await expect(calendarEvent(page, code)).toContainText(`${person.name} · รอยืนยัน`)
    const listed = await page.locator('main ol button[data-code]').filter({ visible: true }).evaluateAll(items => items.map(item => item.getAttribute('data-code')))
    expect(listed).toEqual(['NP-C8N4F', code]) // 11:00, then 14:00
    const filter = page.getByRole('group', { name: 'หมอนวด' })
    await filter.getByRole('button', { name: 'มาลัย' }).click()
    await expect(calendarEvent(page, code)).toHaveCount(0)
    await expect(calendarEvent(page, 'NP-C8N4F')).toBeVisible()
    await filter.getByRole('button', { name: person.name }).click()
    await expect(calendarEvent(page, code)).toBeVisible()
    await expect(calendarEvent(page, 'NP-C8N4F')).toHaveCount(0)
  })

  test('pressing a booking shows its number and status in a dialog, where the status can change; Esc gives the focus back (AC2)', async ({ page }) => {
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: 800 })
      if (width === 1440) await signIn(page, '/admin/calendar/')
      else await openPage(page, '/admin/calendar/')
      await calendarLoaded(page)

      const event = calendarEvent(page, 'NP-2MW8D')
      await event.click()
      const dialog = page.getByRole('dialog', { name: 'รายละเอียดการจอง' })
      await expect(dialog).toBeVisible()
      await expectVisibleText(dialog, 'NP-2MW8D')
      await expect(dialog.locator('li[data-code="NP-2MW8D"]')).toBeVisible()

      // At 1440 the status changes in the dialog, and the block in the calendar changes with it.
      if (width === 1440) {
        await expectVisibleText(dialog, 'รอยืนยัน')
        await dialog.getByRole('button', { name: 'ยืนยัน', exact: true }).click()
        await expectVisibleText(dialog, 'ยืนยันแล้ว')
        await expect(event).toHaveAttribute('data-status', 'confirmed')
        await expect(event).toContainText('ยืนยันแล้ว')
      }
      else {
        await expectVisibleText(dialog, 'ยืนยันแล้ว')
      }

      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(event).toBeFocused()

      // No sideways scrolling (N6, spec D2).
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(scrollWidth, `${width}px`).toBeLessThanOrEqual(clientWidth)
    }
  })

  test('a therapist\'s day off is striped in the grid and named above the list; an empty day says so', async ({ page, context, request }) => {
    // The next Thursday after today, นวลจันทร์'s regular day off (spec section 10), with a booking so the grid shows.
    const today = thaiToday()
    const thursday = addDays(today, ((4 - weekdayOf(today) + 6) % 7) + 1)
    const off = therapists.find(person => (person.daysOff as readonly number[]).includes(4))!
    const code = await bookInNewSandbox(context, request, thursday, workingOn(thursday, off.id).id)

    await page.setViewportSize({ width: 1440, height: 800 })
    await signIn(page, `/admin/calendar/?date=${thursday}`)
    await calendarLoaded(page)
    await expect(calendarEvent(page, code)).toBeVisible()
    const striped = await page.locator('section[data-column] .calendar-day-off').evaluateAll(items =>
      items.map(item => [item.closest('section')!.getAttribute('data-column'), item.textContent!.trim()]))
    expect(striped).toEqual([[off.id, 'หยุด']])

    // Below 1024px the list says who is off.
    await page.setViewportSize({ width: 375, height: 800 })
    await openPage(page, `/admin/calendar/?date=${thursday}`)
    await calendarLoaded(page)
    await expectVisibleText(page, `หมอนวดที่หยุด: ${off.name}`)

    // A day without any booking (15 days ahead is past the booking window of 14 days).
    await openPage(page, `/admin/calendar/?date=${addDays(today, 15)}`)
    await calendarLoaded(page)
    await expectVisibleText(page, 'ไม่มีการจองในวันนี้')
  })
})

/** The card of a therapist in "ตารางงานหมอนวด". */
function therapistCard(page: Page, id: string) {
  return page.locator(`li[data-therapist="${id}"]`)
}

/** The regular days off of a therapist in the starting data (spec section 10). */
function daysOffOf(person: typeof therapists[number]) {
  return person.daysOff as readonly number[]
}

/** Puts a 60-minute Thai massage with this therapist (null = "ไม่ระบุ") in the draft, then opens "วันและเวลา". */
async function openTimesFor(page: Page, person: { id: string, name: string } | null) {
  const draft: BookingDraft = {
    service: { id: 'thai-traditional', name: 'นวดแผนไทย', minutes: 60, price: 400 },
    therapist: person ? { id: person.id, name: person.name } : { id: null, name: 'ไม่ระบุ' },
  }
  await page.evaluate(({ key, value }) => sessionStorage.setItem(key, value), { key: DRAFT_STORAGE_KEYS.draft, value: JSON.stringify(draft) })
  await openPage(page, '/time/')
}

/** Waits for the answer of the API to a change of a therapist's days. */
function therapistSaved(page: Page) {
  return page.waitForResponse(response => /\/api\/admin\/therapists\//.test(response.url()) && response.request().method() !== 'OPTIONS')
}

test.describe('BK-010: therapists\' working days', () => {
  test('a regular day off and a leave date take those days away from that therapist only; "ไม่ระบุ" still has times (AC1)', async ({ page }) => {
    // Two days in the first week of the booking window on which two therapists both work (each has one day off).
    const today = thaiToday()
    const leaveDay = addDays(today, 2)
    const dayOff = addDays(today, 3)
    const worksBoth = (person: typeof therapists[number]) => [leaveDay, dayOff].every(date => !daysOffOf(person).includes(weekdayOf(date)))
    const person = therapists.find(worksBoth)!
    const other = therapists.find(candidate => candidate.id !== person.id && worksBoth(candidate))!

    await signIn(page, '/admin/therapists/')
    const subMenu = page.getByRole('navigation', { name: 'หัวข้อตั้งค่าร้าน' })
    await expect(subMenu.getByRole('link', { name: 'ตารางงานหมอนวด' })).toHaveAttribute('aria-current', 'page')
    await expect(subMenu.getByRole('link', { name: 'เวลาเปิดปิดร้าน' })).not.toHaveAttribute('aria-current')
    await expect(page.locator('main li[data-therapist]')).toHaveCount(therapists.length)

    const card = therapistCard(page, person.id)
    const summary = card.locator('[data-work-summary]')
    await expect(summary).toHaveText(`ทำงาน 6 วัน · หยุด${daysOffOf(person).map(weekdayName).join('')}`)
    await expectVisibleText(card, 'ยังไม่มีวันลา')

    // A regular day off: the day of the week of `dayOff`. The button turns white and the line under the name follows.
    const dayButton = card.getByRole('group', { name: `วันทำงานของ${person.name}` })
      .getByRole('button', { name: weekdayName(weekdayOf(dayOff)), exact: true })
    await expect(dayButton).toHaveAttribute('aria-pressed', 'true')
    const savedDays = therapistSaved(page)
    await dayButton.click()
    expect((await savedDays).status()).toBe(200)
    await expect(dayButton).toHaveAttribute('aria-pressed', 'false')
    await expect(summary).toHaveText(/^ทำงาน 5 วัน · หยุด/)

    // A leave date on `leaveDay`: an empty date is an error, then the date is listed and the focus goes back.
    const addLeave = card.getByRole('button', { name: `เพิ่มวันลา ของ${person.name}` })
    await addLeave.click()
    const dateField = card.getByLabel('วันที่')
    await expect(dateField).toBeFocused()
    await card.getByRole('button', { name: 'เพิ่ม', exact: true }).click()
    await expect(dateField).toHaveAttribute('aria-invalid', 'true')
    await dateField.fill(leaveDay)
    const savedLeave = therapistSaved(page)
    await card.getByRole('button', { name: 'เพิ่ม', exact: true }).click()
    expect((await savedLeave).status()).toBe(200)
    await expectVisibleText(card, shortDateWithYear(leaveDay))
    await expect(addLeave).toBeFocused()

    // A reload shows what was saved.
    await page.reload()
    await expect(dayButton).toHaveAttribute('aria-pressed', 'false')
    await expectVisibleText(card, shortDateWithYear(leaveDay))

    // The customer, in the same browser: with this therapist both days are "หยุด" and cannot be chosen.
    await openTimesFor(page, person)
    for (const date of [leaveDay, dayOff]) await expect(page.getByRole('radio', { name: `${spokenDate(date)} หยุด` })).toBeDisabled()

    // With another therapist who works then, and with "ไม่ระบุ", both days still have every time of the day.
    for (const choice of [other, null]) {
      await openTimesFor(page, choice)
      for (const date of [leaveDay, dayOff]) {
        await page.getByRole('radio', { name: `${spokenDate(date)} ว่าง` }).locator('xpath=ancestor::label[1]').click()
        await expect(page.locator('input[name="time"]:enabled'), `${choice?.id ?? 'any'} ${date}`).toHaveCount(22)
      }
    }

    // Removing the leave date gives the day back.
    await openPage(page, '/admin/therapists/')
    const removed = therapistSaved(page)
    await card.getByRole('button', { name: `ลบ วันลาของ${person.name} ${shortDateWithYear(leaveDay)}` }).click()
    expect((await removed).status()).toBe(200)
    await expectVisibleText(card, 'ยังไม่มีวันลา')
    await openTimesFor(page, person)
    await expect(page.getByRole('radio', { name: `${spokenDate(leaveDay)} ว่าง` })).toBeEnabled()
  })

  test('cards in 1, 2 and 2 columns at 375, 768 and 1440, seven day buttons inside each card; the sub-menu leads to the opening hours', async ({ page }) => {
    await signIn(page, '/admin/therapists/')
    for (const [width, columns] of [[375, 1], [768, 2], [1440, 2]] as const) {
      await page.setViewportSize({ width, height: 800 })
      await page.locator('main li[data-therapist]').first().waitFor()
      const lefts = await page.locator('main li[data-therapist]').evaluateAll(items => new Set(items.map(item => Math.round(item.getBoundingClientRect().left))).size)
      expect(lefts, `${width}px`).toBe(columns)
      const outside = await page.locator('main li[data-therapist]').evaluateAll(items => items.flatMap((item) => {
        const box = item.getBoundingClientRect()
        const buttons = [...item.querySelectorAll('[role="group"] button')]
        return buttons.length === 7 && buttons.every(button => button.getBoundingClientRect().right <= box.right) ? [] : [item.getAttribute('data-therapist')]
      }))
      expect(outside, `${width}px`).toEqual([])
    }

    await page.getByRole('navigation', { name: 'หัวข้อตั้งค่าร้าน' }).getByRole('link', { name: 'เวลาเปิดปิดร้าน' }).click()
    await expect(page).toHaveURL(urlOf('/admin/hours/'))
    await expect(page.getByRole('navigation', { name: 'หัวข้อตั้งค่าร้าน' }).getByRole('link', { name: 'เวลาเปิดปิดร้าน' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('ตั้งค่าร้าน')
  })
})
