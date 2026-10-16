import type { Site } from '../types/content'

/**
 * Everything about the shop's site in one place: its name, the address of the site, contact details and
 * the two switches. Colours and fonts are in app/assets/css/tokens.css; services, therapists and opening
 * hours in the other files of app/data/.
 *
 * Nuanplai (นวลไพล) is the made-up brand of Business-site. Phone, e-mail and URL use reserved values
 * (02-000-0000 and the .example domain), so the demo never points at a real shop (lesson G-005).
 *
 * Besides the pages, this file is loaded by nuxt.config.ts, the Playwright configs and the scripts
 * in scripts/ (plain Node). Keep it free of runtime imports so that all of them can read it as it is.
 */
export const site: Site = {
  name: { th: 'นวลไพล', en: 'Nuanplai' },
  description: {
    th: 'ตัวอย่างระบบจองคิวร้านนวดนวลไพล เลือกบริการ หมอนวด วันและเวลาได้เองใน 5 ขั้น — เว็บไซต์ตัวอย่าง แบรนด์สมมติ',
    en: 'A sample booking system for the Nuanplai massage shop: choose a service, a therapist, a day and a time in 5 steps (demo website, fictional brand).',
  },

  // The one place for the site URL: its path becomes the Nuxt base URL, and the canonical,
  // og:url and og:image links start with it. The owner of the GitHub repository is not known yet,
  // so the host is a reserved example name; `npm run check:site-url` (also run by the deploy
  // workflow) stops a deploy until it is the real https://<owner>.github.io/Booking-system/ (BK-011).
  url: 'https://demo.example/Booking-system/',

  // The booking API (worker/, D-006): public, not a secret. Here the local `wrangler dev` of the Worker
  // (README: "Back end on your machine"); BK-011 sets https://booking-system-api.<subdomain>.workers.dev.
  // NUXT_PUBLIC_API_BASE overrides it for one build, e.g. a local preview after the real URL is in.
  apiUrl: 'http://localhost:8787',

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
