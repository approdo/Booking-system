# Booking-system (demo)

An online booking system for **Nuanplai** (นวลไพล), a fictional Thai massage & spa shop — the same brand
as [Business-site](https://approdo.github.io/Business-site/). Customers book a service, a therapist, a day
and a time in five steps on their phone; the shop manages bookings, services and opening hours in a back
office. Thai only. This is a portfolio demo: the brand, the shop and every detail are made up.

Status: **customer booking ready, back office next**. The five booking screens, the shop's starting data and
the booking API (Cloudflare Workers + D1, tested locally) are in place; the back office comes next.

## Stack

- [Nuxt 4](https://nuxt.com) with static generation, [Tailwind CSS 4](https://tailwindcss.com),
  `@nuxt/fonts` (Noto Sans Thai and Noto Serif Thai, served by the site itself) and `@nuxtjs/i18n` (Thai only)
- Published as static files on GitHub Pages under `/Booking-system/`
- The booking API in [`worker/`](worker/): a [Cloudflare Worker](https://developers.cloudflare.com/workers/)
  with a [D1](https://developers.cloudflare.com/d1/) (SQLite) database, on the free plan
- Started from the author's Site-starter template; the look is design A of Business-site

## Run it

Needs Node 22.19 or newer (`.nvmrc`).

| Command | What it does |
|---|---|
| `npm ci` | Install the dependencies from `package-lock.json` |
| `npm ci --prefix worker` | Install the API's dependencies (`worker/package-lock.json`) |
| `npx playwright install chromium` | Once: the browser for the end-to-end tests and `brand-images` |
| `npm run dev` | Development server with hot reload |
| `npm run generate` | Build the static site into `.output/public` (needs internet: it downloads the fonts) |
| `npm run preview` | Serve that build at http://localhost:4176/Booking-system/ |
| `npm run lint` / `npm run typecheck` | Code style / types (the site and the API) |
| `npm run test:unit` | Unit tests (Vitest): data rules, token contrast, helpers, then the API's tests (`test:worker`) |
| `npm run test:worker` | The API's tests only, inside the Workers runtime with a local D1 |
| `npm run dev:api` | The API at http://localhost:8787 with a local D1 (see below) |
| `npm run check:worker` | Bundle the API without deploying it (`wrangler deploy --dry-run`, no account) |
| `npm run test:e2e` | End-to-end tests (Playwright) against the preview on port 4176 and the API on port 8787, which it starts with an empty local D1 (`npm run e2e:api`) — run `npm run generate` first |
| `LIVE_URL=<url> npm run test:live` | The same end-to-end tests against a deployed site |
| `npm run brand-images` | Make `public/favicon.svg`, `apple-touch-icon.png` and `og-image.png` from `site.ts` and `tokens.css` |
| `npm run check:site-url` | Check `site.url` before a deploy (still a reserved `.example` address = not ready) |
| `npm run psi -- <url>` | Measure a live page with PageSpeed Insights (mobile, 5 runs, median) |

## Where things are

| Path | What |
|---|---|
| `app/data/site.ts` | Shop name, site URL (its path is the base path), contact details, the demo-notice switch |
| `app/data/seed.ts` | The shop's starting data in one place (from `services.ts`, `team.ts`, `hours.ts`, `sampleBookings.ts`): the booking pages are generated from it and the API copies it into every sandbox |
| `app/data/demoAccount.ts` | The back office's demo account, public on purpose |
| `app/utils/bookingRules.ts` | Rules both sides check: name and phone, booking numbers, status changes, back office forms |
| `app/utils/bookingRepository.ts` | The pages' only way to the API; turns answers into the states of the design spec |
| `app/types/api.ts` | The shapes of the API's answers, shared by the pages and the Worker |
| `worker/` | The booking API: `src/` code, `migrations/` D1 schema, `test/` tests, `wrangler.toml` settings |
| `app/assets/css/tokens.css` | Colours, fonts, radii, shadows (design A); the Site-starter names stay as aliases |
| `app/pages/` | The booking in five screens (`/`, `/therapist/`, `/time/`, `/details/`, `/done/`), `/admin/` the back office (never indexed by search engines) |
| `app/components/ui/`, `app/components/booking/` | The design's building blocks (buttons, fields, banners, tiles) and the booking's own parts |
| `app/utils/bookingDraft.ts` | What the visitor has chosen so far, kept in `sessionStorage` so a reload or Back keeps it |
| `i18n/locales/` | Labels of the header, footer and skip link |

Every phone number, e-mail address and URL in the code and the tests is a reserved example value
(`02-000-0000`, `*.example`), so the demo never points at a real person or shop.

## Back end on your machine (หลังบ้านในเครื่อง)

The API runs locally without a Cloudflare account: wrangler keeps the D1 database in `worker/.wrangler/state`
(ignored by git). Nobody needs `wrangler login` or a token for any of this.

```sh
npm ci --prefix worker
npm run dev:api        # applies the migrations to the local D1, then serves http://localhost:8787
npm run test:worker    # the API's tests (Vitest inside workerd, a fresh local D1 per test)
npm run check:worker   # bundles the Worker as a deploy would, without deploying
```

`curl http://localhost:8787/health` answers `{"ok":true,"last_purge_at":null}`. The site reads the API's
address from `site.apiUrl` in `app/data/site.ts` (`http://localhost:8787` until the real one is known);
`NUXT_PUBLIC_API_BASE` overrides it for one `npm run generate`. The API accepts calls from the local preview
(`http://localhost:4176`) and, once deployed, from the live site (`ALLOWED_ORIGINS` in `worker/wrangler.toml`).
To run the daily purge by hand, start the API with `npx wrangler dev --test-scheduled` in `worker/` and open
`http://localhost:8787/__scheduled?cron=10+0+*+*+*`.

How the demo keeps visitors apart and stays inside the free plan:

- **A sandbox per browser.** Reading needs nothing and writes nothing. The first write (a booking, or signing
  in to the back office) creates the visitor's sandbox: a copy of the starting data (`INSERT … SELECT`, one
  batch) reached with a random token that the browser keeps in `localStorage` (`booking-system:sandbox`) and
  sends as `Authorization: Bearer`. Other visitors never see it.
- **24 hours.** After 24 hours the API answers `410 sandbox_expired`, and the Cron Trigger at 00:10 UTC
  (07:10 in Thailand) deletes every older sandbox with all its rows.
- **Limits in the Worker**: 5 bookings per sandbox per 10 minutes, 60 back office changes per sandbox per
  minute, 10 wrong passwords per IP address per 10 minutes, 5 new sandboxes per IP address (IPv6: per /64)
  per 10 minutes. Above a limit: `429 rate_limited`. Each limit is counted inside the SQL statement that
  writes, so requests sent at the same moment cannot pass it together.
- **Reads stay small.** D1's free plan also caps rows read (5,000,000 a day for everyone), so a sandbox holds
  at most 30 new bookings (`BOOKINGS_PER_SANDBOX`, then `429`) and 30 services (`SERVICE_MAX_COUNT`, then
  `400`). In a sandbox filled to both limits, a read or a refused write reads at most about 110 rows
  (`worker/test/limits.test.ts`), whatever one visitor wrote before.
- **A daily write budget.** D1's free plan writes 100,000 rows a day, and every index entry and `DELETE`
  counts. Every write goes through one guard that keeps the day under `D1_WRITE_BUDGET` (60,000) using D1's
  own `rows_written`; above it, writes answer `503 demo_full` ("เดโมเต็มชั่วคราว") until 00:00 UTC while
  reading keeps working. The purge is counted but never refused. A failed D1 call is tried once more, then
  answers `503 backend_unavailable`.

Rows written, measured with the local D1 (`npx vitest run test/budget.test.ts --silent=false` in `worker/`):

| What | `rows_written` |
|---|---|
| A visitor's sandbox with its first booking | 35 |
| Deleting that sandbox in the daily purge | 27 |
| **One visitor, from first booking to purge** | **62** |
| Today's starting data, written once a day for everyone | 32 |

So the 60,000-row budget holds about 60,000 ÷ 62 ≈ **960 visitors a day**; each further booking costs 3
rows and each back office change 3.

Demo account of the back office: `demo@nuanplai.example` / `nuanplai-demo`. It is shown on the login page
on purpose: what anyone changes stays in their own sandbox and is deleted within 24 hours.

## From demo to a real shop (ต่อยอดเป็นของลูกค้าจริง)

What changes to run this for a real shop (estimates from the back end comparison of 2026-10-17, at 33.75
baht to the dollar; VAT and card fees not included):

- **One shop's data instead of sandboxes.** Keep one fixed sandbox id, drop the copy on first write, the
  24-hour expiry and the purge, and keep the D1 schema, the availability rules and the API as they are.
- **Real staff accounts** instead of the public demo account: one account per person, passwords stored with
  a slow password hash (the paid plan's CPU limit allows it), and a way to reset them.
- **Cost per month: $0 to $5 (about 0–169 baht).** The free plan covers a shop with about 20 bookings a day;
  Workers Paid at $5 (about 169 baht) is recommended: no daily request cap, more CPU time per request and
  30 days of D1 point-in-time recovery instead of 7.
- **Move the pages off GitHub Pages.** GitHub Pages must not host an online business or pages that send
  passwords. The demo may use it because it sells nothing and its only account is public on purpose. A
  real shop's pages go to Cloudflare (static assets, free) next to the API, ideally on the shop's own
  domain (recommended for production; the domain's yearly fee is extra).
- Not included in the demo: SMS, LINE or e-mail notifications, payments, more than one branch.

## Photos and credits

Photos are from Unsplash and Pexels, under their own free licenses, copied from Business-site. Every file,
its photographer and its source are listed in [CREDITS.md](CREDITS.md). Fonts: Noto Sans Thai and Noto
Serif Thai (SIL Open Font License 1.1), downloaded by `@nuxt/fonts` at build time.

## Licence

© 2026 0984043505Frong. All rights reserved.

There is no LICENSE file in this repository, on purpose: you are welcome to read the code, but
using, copying or selling it needs the author's permission. The photos and fonts keep their own licences.
