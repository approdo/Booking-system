import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { BrowserContext, Locator, Page, Route } from '@playwright/test'
import { sampleCustomer } from '../../app/data/sampleCustomer'
import { site } from '../../app/data/site'
import { stateMessages } from '../../app/utils/bookingRepository'
import type { BookingDraft } from '../../app/utils/bookingDraft'
import { DRAFT_STORAGE_KEYS } from '../../app/utils/bookingDraft'
import { longDate, thaiToday, timeRange } from '../../app/utils/bookingFormat'
import { addDays, BOOKING_CODE_PATTERN, customerFieldMessages } from '../../app/utils/bookingRules'
import { BOOKING_STEPS } from '../../app/utils/bookingSteps'
import { joinPhrases } from '../../app/utils/phrases'
import { readColor } from '../../scripts/lib/tokens'

// The customer's booking in five screens (BK-006, spec sections 2, 5, 6 and 11) against the booking API on this
// machine: playwright.config.ts starts the Worker with a fresh local D1 next to the preview. Every test has its
// own browser context, so its own sandbox. Answers of the API that are hard to cause for real (429, demo_full,
// a dead network) are faked with page.route (lesson G-045).

const sitePath = new URL(site.url).pathname
const tokensCss = readFileSync(new URL('../../app/assets/css/tokens.css', import.meta.url), 'utf8')

/** A complete draft for screens that are opened directly (tomorrow, so the time is never in the past). */
function draftFor(step: 'time' | 'details'): BookingDraft {
  const draft: BookingDraft = {
    service: { id: 'thai-traditional', name: 'นวดแผนไทย', minutes: 90, price: 550 },
    therapist: { id: null, name: 'ไม่ระบุ' },
  }
  return step === 'time' ? draft : { ...draft, date: addDays(thaiToday(), 1), time: { start: '14:00', end: '15:30' } }
}

const lastBooking = {
  code: 'NP-2MW8D',
  serviceId: 'thai-traditional',
  serviceName: 'นวดไทย + ประคบสมุนไพร',
  minutes: 120,
  price: 1100,
  therapistId: 'nuanchan',
  date: '2026-10-18',
  start: '14:00',
  end: '16:00',
  customerName: sampleCustomer.name,
  phone: '020000000',
  status: 'pending',
  isNew: true,
  createdAt: '2026-10-17T00:00:00.000Z',
}

/** Puts a value into sessionStorage before the page's scripts run, unless the page has already set it. */
async function seedSession(context: BrowserContext, key: string, value: unknown) {
  await context.addInitScript(({ key, value }) => {
    if (sessionStorage.getItem(key) === null) sessionStorage.setItem(key, value)
  }, { key, value: JSON.stringify(value) })
}

/** Opens a page and waits until Vue has taken over the pre-rendered HTML (lesson G-057). */
async function openPage(page: Page, path: string) {
  await page.goto(path)
  await page.waitForFunction(() => {
    const root = document.querySelector('#__nuxt')
    return root !== null && '__vue_app__' in root
  })
}

/** The label (tile or card) a hidden radio button sits in: what the visitor actually taps. */
function tileOf(radio: Locator) {
  return radio.locator('xpath=ancestor::label[1]')
}

function nextButton(page: Page) {
  return page.getByRole('button', { name: 'ถัดไป', exact: true })
}

async function expectStep(page: Page, step: number) {
  await expect(page).toHaveURL(new RegExp(`${BOOKING_STEPS[step - 1]!.path.replace(/\//g, '\\/')}$`))
}

/** Counts the requests that write (POST) to the API. */
function countWrites(page: Page) {
  const writes: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().startsWith(site.apiUrl)) writes.push(request.url())
  })
  return writes
}

/** Answers an API request with a made-up status and JSON body, with the CORS headers the page needs. */
async function fakeAnswer(route: Route, status: number, body: unknown) {
  const origin = route.request().headers().origin ?? 'http://localhost:4176'
  const cors = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  }
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
  await route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) })
}

/** Text that is really on the screen (lesson G-028): checkVisibility() of the element that holds it. */
async function expectVisibleText(page: Page, text: string) {
  const element = page.getByText(text, { exact: true }).first()
  await expect(element).toBeVisible()
  expect(await element.evaluate(node => node.checkVisibility())).toBe(true)
}

interface Booked { service: string, minutes: string, price: string, therapist: string, date: string, time: string, end: string }

/**
 * Walks screens 1 to 4 the way a visitor does: the first length of the first service, the given therapist,
 * the first free time of the first free day, then "เติมข้อมูลตัวอย่าง". Stops before "ยืนยันการจอง".
 */
async function fillBooking(page: Page, therapist: string): Promise<Booked> {
  await openPage(page, './')
  const firstOption = page.locator('input[name="option"]').first()
  const [service, minutes, price] = /^(.+) (\d+) นาที ([\d,]+) บาท$/.exec(await firstOption.getAttribute('aria-label') ?? '')!.slice(1) as [string, string, string]
  await tileOf(firstOption).click()
  await nextButton(page).click()

  await expectStep(page, 2)
  await tileOf(page.getByRole('radio', { name: therapist, exact: true })).click()
  await nextButton(page).click()

  await expectStep(page, 3)
  const freeTime = page.locator('input[name="time"]:not([disabled])').first()
  await expect(freeTime).toBeAttached()
  const date = await page.locator('input[name="date"]:checked').inputValue()
  const [time, end] = (await freeTime.getAttribute('aria-label'))!.split(' ถึง ') as [string, string]
  await tileOf(freeTime).click()
  await nextButton(page).click()

  await expectStep(page, 4)
  await page.getByRole('button', { name: 'เติมข้อมูลตัวอย่าง' }).click()
  return { service, minutes, price, therapist, date, time, end }
}

test.describe('the whole booking against the local API', () => {
  test('AC1: five screens with "เติมข้อมูลตัวอย่าง" give a booking number and the chosen details; only the confirmation writes', async ({ page }) => {
    const writes = countWrites(page)
    const booked = await fillBooking(page, 'มาลัย')
    expect(writes, 'screens 1 to 4 only read').toEqual([])

    // The summary of screen 4 repeats every answer.
    const summary = page.locator('main dl').first()
    await expect(summary).toContainText(`${booked.service} · ${booked.minutes} นาที`)
    await expect(summary).toContainText(booked.therapist)
    await expect(summary).toContainText(`${longDate(booked.date)} · ${timeRange(booked.time, booked.end)}`)

    // The first write of this browser creates its sandbox: the button says so while it waits (spec section 5).
    let release!: () => void
    const held = new Promise<void>(resolve => (release = resolve))
    await page.route(`${site.apiUrl}/api/bookings`, async (route) => {
      await held
      await route.continue()
    })
    await page.getByRole('button', { name: 'ยืนยันการจอง' }).click()
    await expect(page.locator('.action-bar button')).toHaveText(stateMessages.preparing.text)
    release()
    await expectStep(page, 5)
    await page.unroute(`${site.apiUrl}/api/bookings`)
    expect(writes).toHaveLength(1)

    await expect(page.locator('#booking-code')).toHaveText(BOOKING_CODE_PATTERN)
    await expect(page.getByText('รอยืนยัน', { exact: true })).toBeVisible()
    const ticket = page.locator('main dl')
    await expect(ticket).toContainText(`${booked.service} · ${booked.minutes} นาที`)
    await expect(ticket).toContainText(booked.therapist)
    await expect(ticket).toContainText(longDate(booked.date))
    await expect(ticket).toContainText(timeRange(booked.time, booked.end))
    await expect(ticket).toContainText(sampleCustomer.name)
    await expect(ticket).toContainText(sampleCustomer.phone)
    await expect(ticket).toContainText(`${booked.price} บาท`)

    // G-035: nothing of the form went into the URL.
    const url = new URL(page.url())
    expect(url.search).toBe('')
    expect(decodeURIComponent(page.url())).not.toContain(sampleCustomer.name)

    // The way into the back office carries where to go after the login, and the ticket survives a reload.
    await expect(page.getByRole('link', { name: 'ดูคิวนี้ในหลังบ้าน (ทดลอง)' }))
      .toHaveAttribute('href', `${sitePath}admin/login/?next=${encodeURIComponent('/admin/bookings/?day=all')}`)
    const code = await page.locator('#booking-code').textContent()
    await page.reload()
    await expect(page.locator('#booking-code')).toHaveText(code ?? '')
  })

  test('AC2: "ไม่ระบุ" can be booked, and a time just booked is no longer offered, also after a reload', async ({ page }) => {
    await fillBooking(page, 'ไม่ระบุ')
    await page.getByRole('button', { name: 'ยืนยันการจอง' }).click()
    await expectStep(page, 5)
    await expect(page.locator('main dl')).toContainText('ไม่ระบุ')

    // Second booking from the same browser, with one therapist: the sandbox exists, so no "preparing".
    await page.getByRole('link', { name: 'จองคิวอีกครั้ง' }).click()
    const booked = await fillBooking(page, 'ปรีชา')
    await page.getByRole('button', { name: 'ยืนยันการจอง' }).click()
    await expect(page.locator('.action-bar button')).not.toHaveText(stateMessages.preparing.text)
    await expectStep(page, 5)

    // The same service and therapist again: that day's time is now "เต็ม" and cannot be chosen.
    await openPage(page, './')
    await tileOf(page.locator('input[name="option"]').first()).click()
    await nextButton(page).click()
    await tileOf(page.getByRole('radio', { name: 'ปรีชา', exact: true })).click()
    await nextButton(page).click()
    await expectStep(page, 3)
    for (const pass of ['before', 'after a reload']) {
      const day = page.locator(`input[name="date"][value="${booked.date}"]`)
      await expect(day, pass).toBeAttached()
      if (!await day.isChecked()) await tileOf(day).click()
      const taken = page.locator(`input[name="time"][value="${booked.time}"]`)
      await expect(taken, pass).toBeDisabled()
      await expect(taken, pass).toHaveAttribute('aria-label', `${booked.time} เต็ม`)
      await page.reload()
      await page.waitForFunction(() => '__vue_app__' in (document.querySelector('#__nuxt') ?? {}))
    }
  })

  test('the keyboard alone books all five screens, with the gold focus ring on the tiles (spec D4)', async ({ page }) => {
    const goldInk = readColor(tokensCss, 'gold-ink')
    const ring = `rgb(${[1, 3, 5].map(start => Number.parseInt(goldInk.slice(start, start + 2), 16)).join(', ')})`

    await openPage(page, './')
    const firstOption = page.locator('input[name="option"]').first()
    await tabTo(page, firstOption)
    expect(await tileOf(firstOption).evaluate(label => getComputedStyle(label).outlineColor)).toBe(ring)
    await page.keyboard.press('Space')
    await tabTo(page, nextButton(page))
    await page.keyboard.press('Enter')

    await expectStep(page, 2)
    await expect(page.locator('h1')).toBeFocused()
    await tabTo(page, page.locator('input[name="therapist"]').first())
    await page.keyboard.press('Space')
    await tabTo(page, nextButton(page))
    await page.keyboard.press('Enter')

    await expectStep(page, 3)
    const freeTime = page.locator('input[name="time"]:not([disabled])').first()
    await expect(freeTime).toBeAttached()
    await tabTo(page, freeTime)
    await page.keyboard.press('Space')
    await expect(freeTime).toBeChecked()
    await tabTo(page, nextButton(page))
    await page.keyboard.press('Enter')

    await expectStep(page, 4)
    await tabTo(page, page.getByRole('button', { name: 'เติมข้อมูลตัวอย่าง' }))
    await page.keyboard.press('Enter')
    await tabTo(page, page.getByRole('button', { name: 'ยืนยันการจอง' }))
    await page.keyboard.press('Enter')
    await expectStep(page, 5)
    await expect(page.locator('#booking-code')).toHaveText(BOOKING_CODE_PATTERN)
  })
})

/** Presses Tab until the target has the focus, as a keyboard user would reach it. */
async function tabTo(page: Page, target: Locator) {
  for (let step = 0; step < 40; step++) {
    await page.keyboard.press('Tab')
    if (await target.evaluate(element => element === document.activeElement)) return
  }
  throw new Error('Tab did not reach the element')
}

test.describe('screens opened directly', () => {
  test('screens 2 to 5 without the earlier answers go back to the first screen that needs one (spec section 2)', async ({ page, context }) => {
    for (const step of BOOKING_STEPS.slice(1)) {
      await page.goto(`.${step.path}`)
      await expectStep(page, 1)
    }
    await seedSession(context, DRAFT_STORAGE_KEYS.draft, { service: draftFor('time').service })
    await page.goto('./details/')
    await expectStep(page, 2)
  })

  test('every screen has its title, one heading and the step in the header (spec D1)', async ({ page, context }) => {
    await seedSession(context, DRAFT_STORAGE_KEYS.draft, draftFor('details'))
    await seedSession(context, DRAFT_STORAGE_KEYS.lastBooking, lastBooking)
    for (const [index, step] of BOOKING_STEPS.entries()) {
      await openPage(page, `.${step.path}`)
      await expect(page).toHaveTitle(`${step.title} · จองคิว${site.name.th}`)
      await expect(page.locator('h1')).toHaveCount(1)
      await expect(page.locator('#site-header')).toContainText(`ขั้น ${index + 1} จาก 5`)
      await expect(page.locator('[aria-current="step"]')).toHaveCount(1)
    }
  })
})

test.describe('the form of screen 4', () => {
  test.beforeEach(async ({ context }) => {
    await seedSession(context, DRAFT_STORAGE_KEYS.draft, draftFor('details'))
  })

  test('AC4: the warning is seen before the fields, and "เติมข้อมูลตัวอย่าง" fills reserved values that pass', async ({ page }) => {
    await openPage(page, './details/')
    const warning = page.locator('#demo-warning')
    await expectVisibleText(page, 'ห้ามกรอกข้อมูลจริง')
    await expect(warning).toContainText('เว็บนี้เป็นตัวอย่างผลงาน ไม่มีการจองจริง — ใช้ชื่อสมมติและเบอร์ 02-000-0000 หรือกดปุ่มด้านล่าง')
    const name = page.getByLabel('ชื่อ')
    const phone = page.getByLabel('เบอร์โทร')
    // Before the fields in the page's order, and above them on the screen.
    expect(await warning.evaluate((box, field) => Boolean(box.compareDocumentPosition(field!) & Node.DOCUMENT_POSITION_FOLLOWING), await name.elementHandle())).toBe(true)
    expect((await warning.boundingBox())!.y).toBeLessThan((await name.boundingBox())!.y)

    await page.getByRole('button', { name: 'เติมข้อมูลตัวอย่าง' }).click()
    await expect(name).toHaveValue(sampleCustomer.name)
    await expect(phone).toHaveValue(sampleCustomer.phone)

    let sent: Record<string, unknown> | null = null
    await page.route(`${site.apiUrl}/api/bookings`, async (route) => {
      if (route.request().method() === 'POST') sent = route.request().postDataJSON()
      await fakeAnswer(route, 201, { booking: lastBooking, sandbox: { token: 'test-token', expiresAt: '2026-10-18T00:00:00.000Z' } })
    })
    await page.getByRole('button', { name: 'ยืนยันการจอง' }).click()
    await expectStep(page, 5)
    expect(sent).toMatchObject({ name: sampleCustomer.name, phone: '020000000' })
  })

  test('AC3: a wrong name or phone shows the error at its field and sends nothing; the URL never holds them', async ({ page }) => {
    const writes = countWrites(page)
    await openPage(page, './details/')
    const name = page.getByLabel('ชื่อ')
    const phone = page.getByLabel('เบอร์โทร')
    await name.fill('ก')
    await phone.fill('12345')
    await page.getByRole('button', { name: 'ยืนยันการจอง' }).click()

    await expectVisibleText(page, customerFieldMessages.name.too_short)
    await expect(page.locator('#customer-phone-error')).toHaveText(joinPhrases(customerFieldMessages.phone.invalid))
    await expect(page.locator('#customer-phone-error')).toContainText('+66')
    await expect(name).toHaveAttribute('aria-invalid', 'true')
    await expect(phone).toHaveAttribute('aria-invalid', 'true')
    await expect(name).toBeFocused()

    // Enter in a field submits the form the browser's way: still nothing in the URL, nothing sent.
    await name.fill('')
    await name.press('Enter')
    await expectVisibleText(page, customerFieldMessages.name.required)
    expect(new URL(page.url()).search).toBe('')
    expect(new URL(page.url()).pathname).toBe(`${sitePath}details/`)
    expect(writes).toEqual([])
  })
})

test.describe('AC7: answers of the back end become the spec\'s messages (spec section 5)', () => {
  test.beforeEach(async ({ context }) => {
    await seedSession(context, DRAFT_STORAGE_KEYS.draft, draftFor('details'))
  })

  async function confirmWith(page: Page, answer: (route: Route) => Promise<void>) {
    let attempts = 0
    await page.route(`${site.apiUrl}/api/bookings`, async (route) => {
      if (route.request().method() === 'POST') attempts += 1
      await answer(route)
    })
    await openPage(page, './details/')
    await page.getByRole('button', { name: 'เติมข้อมูลตัวอย่าง' }).click()
    await page.getByRole('button', { name: 'ยืนยันการจอง' }).click()
    return () => attempts
  }

  async function expectNoRawError(page: Page) {
    await expect(page.locator('h1')).toBeVisible()
    await expect(page.locator('body')).not.toContainText('"error"')
    await expect(page.locator('body')).not.toContainText('internal_error')
  }

  test('429: "ส่งคำขอถี่เกินไป …", with no extra button', async ({ page }) => {
    await confirmWith(page, route => fakeAnswer(route, 429, { error: 'rate_limited' }))
    await expectVisibleText(page, stateMessages.rate_limited.text)
    await expect(page.getByRole('alert')).toBeFocused()
    await expect(page.getByRole('button', { name: 'ลองใหม่' })).toHaveCount(0)
    await expectNoRawError(page)
  })

  test('503 demo_full: "เดโมเต็มชั่วคราว" and when to try again', async ({ page }) => {
    await confirmWith(page, route => fakeAnswer(route, 503, { error: 'demo_full' }))
    await expectVisibleText(page, stateMessages.demo_full.title)
    await expectVisibleText(page, stateMessages.demo_full.text)
    await expectNoRawError(page)
  })

  test('a dead network: "เชื่อมต่อระบบจองไม่ได้", and "ลองใหม่" sends the booking again', async ({ page }) => {
    const attempts = await confirmWith(page, route => route.abort('failed'))
    await expectVisibleText(page, stateMessages.unavailable.title)
    await expectVisibleText(page, stateMessages.unavailable.text)
    await page.getByRole('button', { name: 'ลองใหม่' }).click()
    await expect.poll(attempts).toBe(2)
    await expectVisibleText(page, stateMessages.unavailable.title)
    await expectNoRawError(page)
  })

  test('410 sandbox_expired: the 24-hour message, and the draft stays', async ({ page }) => {
    await confirmWith(page, route => fakeAnswer(route, 410, { error: 'sandbox_expired' }))
    await expectVisibleText(page, stateMessages.sandbox_expired.text)
    await expect(page.getByLabel('ชื่อ')).toHaveValue(sampleCustomer.name)
    await expect(page.locator('main dl')).toContainText('นวดแผนไทย')
  })

  test('409 slot_taken: back to the times with "ช่วงเวลานี้เพิ่งมีคนจองไป …"', async ({ page }) => {
    await confirmWith(page, route => fakeAnswer(route, 409, { error: 'slot_taken' }))
    await expectStep(page, 3)
    await expectVisibleText(page, 'ช่วงเวลานี้เพิ่งมีคนจองไป เลือกเวลาใหม่อีกครั้ง')
  })

  test('the times cannot be read: the error replaces the list, and "ลองใหม่" loads them', async ({ page }) => {
    const writes = countWrites(page)
    await page.route(`${site.apiUrl}/api/availability**`, route => route.abort('failed'))
    await openPage(page, './time/')
    await expectVisibleText(page, stateMessages.unavailable.title)
    await expect(page.locator('input[name="date"]')).toHaveCount(0)
    await expect(page.locator('h1')).toBeVisible()

    await page.unroute(`${site.apiUrl}/api/availability**`)
    await page.getByRole('button', { name: 'ลองใหม่' }).click()
    await expect(page.locator('input[name="date"]')).toHaveCount(7)
    expect(writes).toEqual([])
  })
})

test.describe('AC5: sizes on phones, tablets and desktops (N6, N7)', () => {
  test.beforeEach(async ({ context }) => {
    await seedSession(context, DRAFT_STORAGE_KEYS.draft, draftFor('details'))
    await seedSession(context, DRAFT_STORAGE_KEYS.lastBooking, lastBooking)
  })

  for (const step of BOOKING_STEPS) {
    test(`${step.path}: no sideways scrolling at 375, 768 and 1440; at 375 every control is at least 44px high and fields use 16px text`, async ({ page }) => {
      for (const width of [375, 768, 1440]) {
        await page.setViewportSize({ width, height: 800 })
        await openPage(page, `.${step.path}`)
        await page.locator('main .skeleton').first().waitFor({ state: 'detached' })
        await page.evaluate(() => document.fonts.ready)
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }))
        expect(scrollWidth, `${width}px`).toBeLessThanOrEqual(clientWidth)
      }

      await page.setViewportSize({ width: 375, height: 800 })
      await openPage(page, `.${step.path}`)
      await page.locator('main .skeleton').first().waitFor({ state: 'detached' })
      const controls = await page.evaluate(() => [...document.querySelectorAll('main a, main button, main label.choice-tile, main label.choice-card, main input:not(.sr-only), footer a')]
        .filter(element => element.checkVisibility())
        .map(element => ({ text: (element.textContent ?? '').trim().slice(0, 30), height: element.getBoundingClientRect().height })))
      expect(controls.length).toBeGreaterThan(0)
      for (const control of controls) expect(control.height, control.text).toBeGreaterThanOrEqual(44)
      const fieldSizes = await page.locator('main input:not(.sr-only)').evaluateAll(inputs => inputs.map(input => getComputedStyle(input).fontSize))
      for (const size of fieldSizes) expect(size).toBe('16px')
    })
  }

  test('at 375 the keyboard focus never hides under the bar at the bottom, going forward or back (spec D3, G-023)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 640 })
    for (const path of ['./', './details/']) {
      await openPage(page, path)
      for (const key of ['Tab', 'Shift+Tab']) {
        for (let step = 0; step < 12; step++) {
          await page.keyboard.press(key)
          const covered = await page.evaluate(() => {
            const focused = document.activeElement as HTMLElement | null
            if (!focused || focused === document.body || focused.closest('.action-bar, #site-footer, .sr-only:not(input)')) return null
            const target = focused.matches('input.sr-only') ? focused.closest('label')! : focused
            const box = target.getBoundingClientRect()
            const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
            return hit && (target === hit || target.contains(hit)) ? null : `${target.tagName} ${target.textContent?.trim().slice(0, 30)}`
          })
          expect(covered, `${path} ${key}`).toBeNull()
        }
      }
    }
  })
})
