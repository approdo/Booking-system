import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { serviceCategories } from '../../app/data/services'
import { site } from '../../app/data/site'
import { joinPhrases } from '../../app/utils/phrases'
import { readColor } from '../../scripts/lib/tokens'

// The pages of the site under the site path, in Thai, with the footer, assets and focus ring of the design.
// Texts and counts come from app/data/ and tokens.css (lesson G-018), so the tests keep passing when the
// shop's details change.

const sitePath = new URL(site.url).pathname
const tokensCss = readFileSync(new URL('../../app/assets/css/tokens.css', import.meta.url), 'utf8')

/** The demo line of the footer, word for word (N9). */
const DEMO_NOTICE = 'เว็บไซต์ตัวอย่างเพื่อแสดงผลงาน · แบรนด์และข้อมูลเป็นสมมติ'

// Paths relative to the site path: the booking pages (with the footer) and the back office's login page. The
// other back-office pages lead to the login page without a session: tests/e2e/admin.spec.ts covers them.
const customerPages = ['./']
const adminPages = ['./admin/login/']

/** The path of a page on the server: './admin/' gives '/Booking-system/admin/'. */
function pathOf(relativePath: string) {
  return new URL(relativePath, `http://localhost${sitePath}`).pathname
}

/** The URL on the test server of a file the page refers to, also for absolute site URLs (og:image). */
function serverUrl(page: Page, href: string) {
  return new URL(href.replace(site.url, sitePath), page.url()).href
}

/** Collects console errors, uncaught page errors and failed responses while the page loads (lesson G-011). */
function watchForErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  page.on('pageerror', error => errors.push(`page error: ${error.message}`))
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`)
  })
  return errors
}

/** Opens the page and waits for Vue to take over the pre-rendered HTML (lesson G-057). */
async function openPage(page: Page, relativePath: string) {
  await page.goto(relativePath)
  await page.waitForFunction(() => {
    const root = document.querySelector('#__nuxt')
    return root !== null && '__vue_app__' in root
  })
}

/** 'rgb(r, g, b)', the way getComputedStyle writes a #rrggbb colour. */
function rgb(hex: string) {
  const [r, g, b] = [1, 3, 5].map(start => Number.parseInt(hex.slice(start, start + 2), 16))
  return `rgb(${r}, ${g}, ${b})`
}

/** Presses Tab until the target has the focus (at most 20 times), as a keyboard user would reach it. */
async function tabTo(page: Page, target: Locator) {
  for (let step = 0; step < 20; step++) {
    await page.keyboard.press('Tab')
    if (await target.evaluate(element => element === document.activeElement)) return
  }
  throw new Error('Tab did not reach the element')
}

function focusRing(target: Locator) {
  return target.evaluate((element) => {
    const style = getComputedStyle(element)
    return { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor }
  })
}

for (const relativePath of [...customerPages, ...adminPages]) {
  test(`${relativePath}: loads under the site path in Thai, with no error and no failed request`, async ({ page }) => {
    const errors = watchForErrors(page)
    const response = await page.goto(relativePath, { waitUntil: 'networkidle' })

    expect(response?.status()).toBe(200)
    expect(new URL(page.url()).pathname).toBe(pathOf(relativePath))
    await expect(page.locator('html')).toHaveAttribute('lang', 'th')
    await expect(page.locator('h1')).toHaveCount(1)
    await expect(page).toHaveTitle(new RegExp(`${site.name.th}$`))
    expect(errors).toEqual([])
  })

  for (const width of [375, 768, 1440]) {
    test(`${relativePath}: nothing is wider than a ${width}px window (N6)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await openPage(page, relativePath)
      await page.evaluate(() => document.fonts.ready)
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
    })
  }
}

for (const relativePath of customerPages) {
  test(`${relativePath}: the footer has the demo line word for word (N9) and leads to the back office's login`, async ({ page }) => {
    await openPage(page, relativePath)
    expect(joinPhrases(site.demoNoticeText.th)).toBe(DEMO_NOTICE)
    await expect(page.locator('#site-demo-notice')).toHaveText(DEMO_NOTICE)
    await expect(page.locator('#site-footer a')).toHaveAttribute('href', `${sitePath}admin/login/`)
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
  })
}

for (const relativePath of adminPages) {
  test(`${relativePath}: is noindex (N11)`, async ({ page }) => {
    await page.goto(relativePath)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
  })
}

test('the generated home page has the heading and every service category before any script runs (spec D8)', async ({ request }) => {
  const response = await request.get('./')
  expect(response.status()).toBe(200)
  const html = await response.text()
  expect(html).toMatch(/<h1[^>]*>.*เลือกบริการ.*<\/h1>/s)
  for (const category of serviceCategories) expect(html, category.id).toContain(category.name)
})

test('every file that <head> refers to is under the site path and is served (lesson G-020)', async ({ page, request }) => {
  await page.goto('./')
  const hrefs = await page.locator('head').evaluate(head => [
    ...[...head.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="stylesheet"], link[rel="modulepreload"], link[rel="preload"]')]
      .map(link => link.getAttribute('href') ?? ''),
    ...[...head.querySelectorAll('script[src]')].map(script => script.getAttribute('src') ?? ''),
    head.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? '',
  ])

  // At least the icon, the home-screen icon, the link preview, one stylesheet and one script.
  expect(hrefs.length).toBeGreaterThanOrEqual(5)
  for (const href of hrefs) {
    expect(href.startsWith(sitePath) || href.startsWith(site.url), href).toBe(true)
    const response = await request.get(serverUrl(page, href))
    expect(response.status(), href).toBe(200)
  }
})

test('every photo of the home page is under the site path and is served', async ({ page, request }) => {
  await page.goto('./')
  const sources = await page.locator('main img').evaluateAll(images => images.map(image => image.getAttribute('src') ?? ''))
  expect(sources).toHaveLength(serviceCategories.length)
  for (const src of sources) {
    expect(src.startsWith(`${sitePath}images/`), src).toBe(true)
    expect((await request.get(serverUrl(page, src))).status(), src).toBe(200)
  }
})

test('the canonical link and og:url start with the site URL', async ({ page }) => {
  await page.goto('./')
  const canonical = await page.locator('head link[rel="canonical"]').getAttribute('href')
  expect(canonical?.startsWith(site.url)).toBe(true)
  await expect(page.locator('head meta[property="og:url"]')).toHaveAttribute('content', canonical ?? '')
})

test('Thai only: no English pages, and the language links name Thai only (N3)', async ({ page, request }) => {
  expect(site.english).toBe(false)
  // Relative to the base URL of the config, which ends with the site path.
  expect((await request.get('./en/')).status()).toBe(404)
  await page.goto('./')
  // @nuxtjs/i18n links the page to itself for Thai and as the default (x-default).
  const hreflangs = await page.locator('head link[rel="alternate"][hreflang]').evaluateAll(links => links.map(link => link.getAttribute('hreflang')))
  expect(hreflangs.sort()).toEqual(['th', 'x-default'])
})

test('the keyboard focus ring is gold-ink, and light gold on the dark footer (spec section 1)', async ({ page }) => {
  await openPage(page, './')
  const logo = page.locator('#site-header a')
  await tabTo(page, logo)
  expect(await focusRing(logo)).toEqual({ style: 'solid', width: '3px', color: rgb(readColor(tokensCss, 'gold-ink')) })

  const footerLink = page.locator('#site-footer a')
  await tabTo(page, footerLink)
  expect(await focusRing(footerLink)).toEqual({ style: 'solid', width: '3px', color: rgb(readColor(tokensCss, 'gold-light')) })
})

test('an in-page link and Back keep the URL under the site path, never doubled (lesson G-008)', async ({ page }) => {
  await openPage(page, './')
  const pageUrl = page.url()

  // A hash change goes through the router like a click on an in-page link.
  await page.evaluate(() => {
    location.hash = 'site-footer'
  })
  await expect(page).toHaveURL(`${pageUrl}#site-footer`)

  await page.goBack()
  await expect(page).toHaveURL(pageUrl)
  expect(new URL(page.url()).pathname).toBe(sitePath)
})
