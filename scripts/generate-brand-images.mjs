// Makes the site's icons and link-preview image (lesson G-020):
//
//   public/favicon.svg           browser tab icon: a small shop front on the primary colour
//   public/apple-touch-icon.png  180×180 home-screen icon for iPhone and iPad: the same shop front, fully opaque
//   public/og-image.png          1200×630 preview shown when a link to the site is shared
//
// Colours and the font come from app/assets/css/tokens.css; the shop name and the font weights from
// app/data/site.ts. After changing them, run `npm run brand-images`, look at the three files and
// commit them. If the client has a logo, replace these files with images made from it instead.
//
// The favicon has no letters: a tab icon cannot load web fonts. The PNG files are rendered by the
// Chromium that the e2e tests use (@playwright/test; install it once with
// `npx playwright install chromium`). Rendering needs internet: the page loads the site's web font
// from Google Fonts. Only this script does that; the site itself serves its own copy of the font.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
// Node 22.18+ strips TypeScript types on import, so this reads the same data as the site.
import { site } from '../app/data/site.ts'
import { readColor, readFontFamilies } from './lib/tokens.ts'

const publicDir = new URL('../public/', import.meta.url)
const tokensCss = await readFile(new URL('../app/assets/css/tokens.css', import.meta.url), 'utf8')

const color = {
  page: readColor(tokensCss, 'page'),
  subtle: readColor(tokensCss, 'subtle'),
  fg: readColor(tokensCss, 'fg'),
  fgMuted: readColor(tokensCss, 'fg-muted'),
  primary: readColor(tokensCss, 'primary'),
  onPrimary: readColor(tokensCss, 'on-primary'),
}

// The web font is the first family of --font-sans; the PNG files use its boldest loaded weight.
const fontFamily = readFontFamilies(tokensCss)[0]
const boldWeight = Math.max(...site.fontWeights)

// Google Fonts' CSS API, asked for the same family and weights as the site.
const GOOGLE_FONTS_CSS_API = 'https://fonts.googleapis.com/css2'
const fontStylesheet = `${GOOGLE_FONTS_CSS_API}?family=${encodeURIComponent(fontFamily).replaceAll('%20', '+')}`
  + `:wght@${[...site.fontWeights].sort((a, b) => a - b).join(';')}&display=block`

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// A small shop front: an awning over a wall with a door. Plain shapes, so it stays sharp at 16px.
const SHOP_FRONT_PATHS = (fill, door) => `
  <path d="M7 9h18l-2 5H9z" fill="${fill}"/>
  <path d="M9 16h14v8H9z" fill="${fill}"/>
  <path d="M14 19h4v5h-4z" fill="${door}"/>`

// ---------------------------------------------------------------------------------------------
// favicon.svg — the shop front in the on-primary colour on a rounded primary square.
// ---------------------------------------------------------------------------------------------
function faviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <!-- ${escapeHtml(site.name.en)} icon. Made by scripts/generate-brand-images.mjs: change the script or the tokens, not this file. -->
  <rect width="32" height="32" rx="7" fill="${color.primary}"/>${SHOP_FRONT_PATHS(color.onPrimary, color.primary)}
</svg>
`
}

// ---------------------------------------------------------------------------------------------
// PNG files: small HTML pages rendered by Chromium, with the site's font.
// ---------------------------------------------------------------------------------------------
function htmlPage(styles, body) {
  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="${fontStylesheet}">
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 100%; height: 100%; }
  body { font-family: "${fontFamily}", sans-serif; font-weight: ${boldWeight}; }
  ${styles}
</style>
</head>
<body>${body}</body>
</html>`
}

// iOS rounds the corners of home-screen icons itself, and fills transparent pixels with black.
// So the icon is a full primary square with the shop front of the favicon, a little smaller.
const appleTouchIcon = {
  file: 'apple-touch-icon.png',
  width: 180,
  height: 180,
  fitText: null,
  html: htmlPage(`
    body { display: grid; place-items: center; background: ${color.primary}; }
    .mark { width: 150px; height: 150px; }
  `, `<svg class="mark" viewBox="0 0 32 32" aria-hidden="true">${SHOP_FRONT_PATHS(color.onPrimary, color.primary)}
    </svg>`),
}

// Link preview: the shop front, the Thai name and (when the site has English pages) the English name,
// in the middle, because some apps crop the preview to a square. A bar of the primary colour at the bottom.
const ogImage = {
  file: 'og-image.png',
  width: 1200,
  height: 630,
  maxBytes: 300 * 1024,
  // A long shop name is made smaller until it fits in 1080px.
  fitText: '.name',
  html: htmlPage(`
    body {
      display: grid; place-content: center; justify-items: center; gap: 12px;
      background: ${color.subtle}; text-align: center; border-bottom: 24px solid ${color.primary};
    }
    .mark { width: 120px; height: 120px; margin-bottom: 20px; }
    .name { color: ${color.fg}; font-size: 112px; line-height: 1.3; white-space: nowrap; }
    .name-en { color: ${color.fgMuted}; font-size: 40px; line-height: 1.3; }
  `, `
    <svg class="mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="${color.primary}"/>${SHOP_FRONT_PATHS(color.onPrimary, color.primary)}
    </svg>
    <h1 class="name">${escapeHtml(site.name.th)}</h1>
    ${site.english ? `<p class="name-en">${escapeHtml(site.name.en)}</p>` : ''}
  `),
}

/** Throws if the font did not load, instead of saving an image in a fallback font. */
async function waitForFont(page) {
  const loaded = await page.evaluate(async ({ font, text }) => {
    await document.fonts.ready
    const faces = await document.fonts.load(font, text)
    return faces.length > 0 && faces.every(face => face.status === 'loaded')
  }, { font: `${boldWeight} 16px "${fontFamily}"`, text: `${site.name.th} ${site.name.en}` })
  if (!loaded) {
    throw new Error(`The font "${fontFamily}" did not load from Google Fonts. Check the internet connection, `
      + 'and that the first family of --font-sans in tokens.css is a Google font.')
  }
}

/** Makes the text smaller, 2px at a time, until it is at most 1080px wide. */
async function fitWidth(page, selector) {
  await page.evaluate((selector) => {
    const element = document.querySelector(selector)
    let size = Number.parseFloat(getComputedStyle(element).fontSize)
    while (element.scrollWidth > 1080 && size > 24) {
      size -= 2
      element.style.fontSize = `${size}px`
    }
  }, selector)
}

async function renderPng(browser, image) {
  const page = await browser.newPage({ viewport: { width: image.width, height: image.height }, deviceScaleFactor: 1 })
  await page.setContent(image.html, { waitUntil: 'load' })
  await waitForFont(page)
  if (image.fitText) await fitWidth(page, image.fitText)
  const png = await page.screenshot({ type: 'png' })
  await page.close()

  // A PNG of colour type 2 (RGB) has no alpha channel, so no pixel can be transparent.
  const colorType = png[25]
  if (colorType !== 2) throw new Error(`${image.file}: expected an RGB PNG without alpha (colour type 2), got ${colorType}`)
  if (image.maxBytes && png.length > image.maxBytes) throw new Error(`${image.file}: ${png.length} bytes, more than ${image.maxBytes}`)
  return png
}

async function save(file, content) {
  const url = new URL(file, publicDir)
  await writeFile(url, content)
  const { size } = await stat(url)
  console.log(`public/${file}  ${(size / 1024).toFixed(1)} kB`)
}

await mkdir(publicDir, { recursive: true })
await save('favicon.svg', faviconSvg())

const browser = await chromium.launch()
try {
  for (const image of [appleTouchIcon, ogImage]) {
    await save(image.file, await renderPng(browser, image))
  }
}
finally {
  await browser.close()
}
