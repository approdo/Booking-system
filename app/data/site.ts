import type { Site } from '../types/content'

/**
 * Everything about the shop's site in one place: its name, the address of the site, contact details and
 * the two switches. Colours and fonts are in app/assets/css/tokens.css; services, therapists and opening
 * hours in the other files of app/data/.
 *
 * Nuanplai (นวลไพล) is the made-up brand of Business-site. Phone and e-mail use reserved values
 * (02-000-0000 and the .example domain), so the demo never points at a real shop (lesson G-005); the two
 * URLs are the demo's own addresses.
 *
 * Besides the pages, this file is loaded by nuxt.config.ts, the Playwright configs and the scripts
 * in scripts/ (plain Node). Keep it free of runtime imports so that all of them can read it as it is.
 */

/**
 * The booking API on this machine: `npm run dev:api`, and the server the end-to-end tests start
 * (worker/scripts/e2e-server.mjs). Builds that run here call it instead of site.apiUrl, because the live
 * API answers only the live site (CORS): the dev server and `npm run generate:local` (nuxt.config.ts).
 */
export const localApiUrl = 'http://localhost:8787'

export const site: Site = {
  name: { th: 'นวลไพล', en: 'Nuanplai' },
  description: {
    th: 'ตัวอย่างระบบจองคิวร้านนวดนวลไพล เลือกบริการ หมอนวด วันและเวลาได้เองใน 5 ขั้น — เว็บไซต์ตัวอย่าง แบรนด์สมมติ',
    en: 'A sample booking system for the Nuanplai massage shop: choose a service, a therapist, a day and a time in 5 steps (demo website, fictional brand).',
  },

  // The one place for the site URL: its path becomes the Nuxt base URL, and the canonical,
  // og:url and og:image links start with it. GitHub Pages serves the repository approdo/Booking-system
  // here; `npm run check:site-url` (also run by the deploy workflow) stops a deploy from any other
  // repository until this is changed. The origin of this URL is also the only origin the live API
  // accepts: [env.production.vars] ALLOWED_ORIGINS in worker/wrangler.toml (a unit test keeps them equal).
  url: 'https://approdo.github.io/Booking-system/',

  // The live booking API (worker/, D-006) that the deployed pages call: public, not a secret. It is the
  // Worker "booking-system-api" on the account's workers.dev subdomain; renaming the Worker changes it.
  // `npm run generate` builds with it; builds that run on this machine call localApiUrl (above).
  // NUXT_PUBLIC_API_BASE overrides both for one build.
  apiUrl: 'https://booking-system-api.approdo.workers.dev',

  // Switches. Thai only (N3); the footer always says this is a demo (N9).
  english: false,
  demoNotice: true,
  demoNoticeText: {
    th: ['เว็บไซต์ตัวอย่าง', 'เพื่อแสดงผลงาน · ', 'แบรนด์และข้อมูล', 'เป็นสมมติ'],
    en: 'Demo website for a portfolio · The brand and all details are fictional.',
  },

  // Body text 400 and 600; the headings (Noto Serif Thai) use 600 only (spec section 1).
  fontWeights: [400, 600],

  contact: {
    phone: '02-000-0000',
    email: 'hello@nuanplai.example',
  },
}
