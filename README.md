# Booking-system (demo)

An online booking system for **Nuanplai** (นวลไพล), a fictional Thai massage & spa shop — the same brand
as [Business-site](https://approdo.github.io/Business-site/). Customers book a service, a therapist, a day
and a time in five steps on their phone; the shop manages bookings, services and opening hours in a back
office. Thai only. This is a portfolio demo: the brand, the shop and every detail are made up.

Status: **scaffold**. The site structure, the design tokens, the shop's starting data (services, prices,
four therapists, opening hours) and the tests are in place; the booking screens, the back office and the
back end (Cloudflare Workers + D1) come next.

## Stack

- [Nuxt 4](https://nuxt.com) with static generation, [Tailwind CSS 4](https://tailwindcss.com),
  `@nuxt/fonts` (Noto Sans Thai and Noto Serif Thai, served by the site itself) and `@nuxtjs/i18n` (Thai only)
- Published as static files on GitHub Pages under `/Booking-system/`
- Started from the author's Site-starter template; the look is design A of Business-site

## Run it

Needs Node 22.19 or newer (`.nvmrc`).

| Command | What it does |
|---|---|
| `npm ci` | Install the dependencies from `package-lock.json` |
| `npx playwright install chromium` | Once: the browser for the end-to-end tests and `brand-images` |
| `npm run dev` | Development server with hot reload |
| `npm run generate` | Build the static site into `.output/public` (needs internet: it downloads the fonts) |
| `npm run preview` | Serve that build at http://localhost:4176/Booking-system/ |
| `npm run lint` / `npm run typecheck` | Code style / types |
| `npm run test:unit` | Unit tests (Vitest): data rules, token contrast, helpers |
| `npm run test:e2e` | End-to-end tests (Playwright) against the preview on port 4176 — run `npm run generate` first |
| `LIVE_URL=<url> npm run test:live` | The same end-to-end tests against a deployed site |
| `npm run brand-images` | Make `public/favicon.svg`, `apple-touch-icon.png` and `og-image.png` from `site.ts` and `tokens.css` |
| `npm run check:site-url` | Check `site.url` before a deploy (still a reserved `.example` address = not ready) |
| `npm run psi -- <url>` | Measure a live page with PageSpeed Insights (mobile, 5 runs, median) |

## Where things are

| Path | What |
|---|---|
| `app/data/site.ts` | Shop name, site URL (its path is the base path), contact details, the demo-notice switch |
| `app/data/services.ts`, `team.ts`, `hours.ts` | The shop's starting data: services and prices, therapists, opening hours |
| `app/assets/css/tokens.css` | Colours, fonts, radii, shadows (design A); the Site-starter names stay as aliases |
| `app/pages/` | `/` the booking, `/admin/` the back office (never indexed by search engines) |
| `i18n/locales/` | Labels of the header, footer and skip link |

Every phone number, e-mail address and URL in the code and the tests is a reserved example value
(`02-000-0000`, `*.example`), so the demo never points at a real person or shop.

## Photos and credits

Photos are from Unsplash and Pexels, under their own free licenses, copied from Business-site. Every file,
its photographer and its source are listed in [CREDITS.md](CREDITS.md). Fonts: Noto Sans Thai and Noto
Serif Thai (SIL Open Font License 1.1), downloaded by `@nuxt/fonts` at build time.

## Licence

© 2026 0984043505Frong. All rights reserved.

There is no LICENSE file in this repository, on purpose: you are welcome to read the code, but
using, copying or selling it needs the author's permission. The photos and fonts keep their own licences.
