# Booking-system (demo)

An online booking system for **Nuanplai** (นวลไพล), a fictional Thai massage & spa shop — the same brand
as [Business-site](https://approdo.github.io/Business-site/). Customers book a service, a therapist, a day
and a time in five steps on their phone; the shop manages bookings, services and opening hours in a back
office. Thai only. This is a portfolio demo: the brand, the shop and every detail are made up.

Status: **customer booking and back office complete**. The five booking screens, the back office (today's
summary, bookings, calendar, services, opening hours and the therapists' working days) and the booking API
(Cloudflare Workers + D1) are all in place and tested.

- Live site: <https://approdo.github.io/Booking-system/> (back office: `admin/login/`)
- Booking API: <https://booking-system-api.approdo.workers.dev/health>
- Repository: <https://github.com/approdo/Booking-system>

## Stack

- [Nuxt 4](https://nuxt.com) with static generation, [Tailwind CSS 4](https://tailwindcss.com),
  `@nuxt/fonts` (Noto Sans Thai and Noto Serif Thai, served by the site itself) and `@nuxtjs/i18n` (Thai only)
- Published as static files on GitHub Pages under `/Booking-system/`
- The booking API in [`worker/`](worker/): a [Cloudflare Worker](https://developers.cloudflare.com/workers/)
  with a [D1](https://developers.cloudflare.com/d1/) (SQLite) database, on the free plan. Its core has no
  Cloudflare code, so it can move to a client's own server (see "Moving the back end to your own server")
- Started from the author's Site-starter template; the look is design A of Business-site

## Run it

Needs Node 22.19 or newer (`.nvmrc`).

| Command | What it does |
|---|---|
| `npm ci` | Install the dependencies from `package-lock.json` |
| `npm ci --prefix worker` | Install the API's dependencies (`worker/package-lock.json`) |
| `npx playwright install chromium` | Once: the browser for the end-to-end tests and `brand-images` |
| `npm run dev` | Development server with hot reload |
| `npm run generate` | Build the static site for GitHub Pages into `.output/public`; its pages call the live API (`site.apiUrl`). Needs internet: it downloads the fonts |
| `npm run generate:local` | The same build, but its pages call the API on this machine (http://localhost:8787): the build for `npm run preview` and `npm run test:e2e` |
| `npm run preview` | Serve the last build at http://localhost:4176/Booking-system/ (the live API refuses pages served from here: preview `generate:local`) |
| `npm run lint` / `npm run typecheck` | Code style / types (the site and the API) |
| `npm run test:unit` | Unit tests (Vitest): data rules, token contrast, helpers, then the API's tests (`test:worker`) |
| `npm run test:worker` | The API's tests only, inside the Workers runtime with a local D1 |
| `npm run dev:api` | The API at http://localhost:8787 with a local D1 (see below) |
| `npm run check:worker` | Bundle the API without deploying it (`wrangler deploy --dry-run`, no account) |
| `npm run test:e2e` | End-to-end tests (Playwright) against the preview on port 4176 and the API on port 8787, which it starts with an empty local D1 (`npm run e2e:api`) — run `npm run generate:local` first |
| `LIVE_URL=<url> npm run test:live` | The same end-to-end tests against a deployed site |
| `npm run brand-images` | Make `public/favicon.svg`, `apple-touch-icon.png` and `og-image.png` from `site.ts` and `tokens.css` |
| `npm run check:site-url` | Check `site.url` before a deploy (a reserved `.example` address, or not where GitHub Pages serves the repository = not ready) |
| `npm run psi -- <url>` | Measure a live page with PageSpeed Insights (mobile, 5 runs, median) |

## Where things are

| Path | What |
|---|---|
| `app/data/site.ts` | Shop name, site URL (its path is the base path), the live and local API addresses, contact details, the demo-notice switch |
| `app/data/seed.ts` | The shop's starting data in one place (from `services.ts`, `team.ts`, `hours.ts`, `sampleBookings.ts`): the booking pages are generated from it and the API copies it into every sandbox |
| `app/data/demoAccount.ts` | The back office's demo account, public on purpose |
| `app/utils/bookingRules.ts` | Rules both sides check: name and phone, booking numbers, status changes, back office forms |
| `app/utils/bookingRepository.ts` | The pages' only way to the API; turns answers into the states of the design spec |
| `app/types/api.ts` | The shapes of the API's answers, shared by the pages and the Worker |
| `worker/` | The booking API: `src/core/` the API itself (routes, rules, limits, SQL; no Cloudflare code), `src/platform/cloudflare/` the Worker around it (entry, D1, caller's IP), `migrations/` D1 schema, `test/` tests, `wrangler.toml` settings |
| `app/assets/css/tokens.css` | Colours, fonts, radii, shadows (design A); the Site-starter names stay as aliases |
| `app/pages/` | The booking in five screens (`/`, `/therapist/`, `/time/`, `/details/`, `/done/`); the back office under `/admin/`: `login/`, `today/` (the first page after signing in), `bookings/`, `calendar/` (one day by therapist and time), `services/`, and the two pages of "ตั้งค่าร้าน": `hours/` (opening hours) and `therapists/` (each therapist's working days and leave dates). None of them is indexed by search engines; without a session every page leads to `login/` |
| `app/components/ui/`, `app/components/booking/`, `app/components/admin/` | The design's building blocks (buttons, fields, banners, tiles, switch, dialog), the booking's own parts and the back office's (tabs, cards, the service form) |
| `app/utils/adminNav.ts` | The back office's tabs in one list: a screen that is not built (or is cut) is simply not in it |
| `app/utils/bookingDraft.ts` | What the visitor has chosen so far, kept in `sessionStorage` so a reload or Back keeps it |
| `i18n/locales/` | Labels of the header, footer and skip link |

Every phone number and e-mail address in the code and the tests is a reserved example value
(`02-000-0000`, `*.example`), so the demo never points at a real person or shop. The only real addresses
are the demo's own: the site on GitHub Pages and its API.

## Back end on your machine (หลังบ้านในเครื่อง)

The API runs locally without a Cloudflare account: wrangler keeps the D1 database in `worker/.wrangler/state`
(ignored by git). Nobody needs `wrangler login` or a token for any of this.

```sh
npm ci --prefix worker
npm run dev:api        # applies the migrations to the local D1, then serves http://localhost:8787
npm run test:worker    # the API's tests (Vitest inside workerd, a fresh local D1 per test)
npm run check:worker   # bundles the Worker as a deploy would, without deploying
```

`curl http://localhost:8787/health` answers `{"ok":true,"last_purge_at":null}`. Where the pages send their
calls depends on the build (`app/data/site.ts`, `nuxt.config.ts`): `npm run generate` uses `site.apiUrl`,
the live API; `npm run dev` and `npm run generate:local` use `localApiUrl`, this API. `NUXT_PUBLIC_API_BASE`
overrides both for one build. Run here, the API accepts calls from the local preview
(`http://localhost:4176`: `ALLOWED_ORIGINS` at the top of `worker/wrangler.toml`). The deployed API accepts
only the live site: the deploy uses the production settings (`--env production`, the
`[env.production.vars]` of the same file), whose only origin is the origin of `site.url`. That is why the
deploy workflow tests a `generate:local` build and then builds again with `npm run generate` for GitHub Pages.
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
  minute (signing in to an existing sandbox and signing out count as changes), 5 back office sessions per
  sandbox (signing in once more ends the oldest), 10 wrong passwords per IP address per 10 minutes (the
  right password always signs in, so other people's typos on a shared address lock no one out), 5 new
  sandboxes per IP address (IPv6: per /64) per 10 minutes. Above a limit: `429 rate_limited`. Each limit is
  counted inside the SQL statement that writes, so requests sent at the same moment cannot pass it together.
- **Reads stay small.** D1's free plan also caps rows read (5,000,000 a day for everyone), so a sandbox holds
  at most 30 new bookings (`BOOKINGS_PER_SANDBOX`, then `429`) and 30 services (`SERVICE_MAX_COUNT`, then
  `400`). In a sandbox filled to both limits, a read or a refused write reads at most about 110 rows
  (`worker/test/limits.test.ts`), whatever one visitor wrote before.
- **A daily write budget.** D1's free plan writes 100,000 rows a day, and every index entry and `DELETE`
  counts. Every write goes through one guard that keeps the day under `D1_WRITE_BUDGET` (60,000) using D1's
  own `rows_written`; above it, writes answer `503 demo_full` ("เดโมเต็มชั่วคราว") until 00:00 UTC while
  reading keeps working. One IP address (IPv6: one /64) may write at most 5% of it a day
  (`D1_WRITE_BUDGET_PER_IP_PERCENT`, 3,000 rows), all its sandboxes together; above that, its writes answer
  `429 rate_limited` until 00:00 UTC, so one address cannot fill the demo for everyone. The purge is counted
  but never refused. A failed D1 call is tried once more, then answers `503 backend_unavailable`.

Rows written, measured with the local D1 (`npx vitest run test/budget.test.ts --silent=false` in `worker/`),
including the two daily counts each write updates:

| What | `rows_written` |
|---|---|
| A visitor's sandbox with its first booking | 36 |
| Deleting that sandbox in the daily purge | 28 |
| **One visitor, from first booking to purge** | **64** |
| Today's starting data, written once a day for everyone (once, even when the day's first requests arrive together) | 32 |

So the 60,000-row budget holds about 60,000 ÷ 64 ≈ **930 visitors a day**; each further booking costs 4
rows, signing in 5 and each back office change 4.

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

## Moving the back end to your own server (ย้ายหลังบ้านไป server ของลูกค้า)

The API can leave Cloudflare for a server the client runs (Node.js on a VPS or in a container) without
rewriting its rules. **This repository does not include a Node server yet**: this section is the list of
what to write, what to change and what stays.

### How the code is split

- `worker/src/core/` is the API itself: the routes and their answers, the availability rules, sandboxes,
  every limit, the write budgets and all the SQL. It uses only standard Web APIs (`Request`, `Response`,
  `crypto.subtle`, all global in Node 19 and later) and reaches the outside only through
  `worker/src/core/ports.ts`: a database (`Db`), the caller's IP address as a string, the settings by name,
  and `runDailyPurge()` for a scheduler. `npm run typecheck` compiles it with no Cloudflare types
  (`worker/tsconfig.core.json`), and `tests/unit/workerLayers.test.ts` keeps Cloudflare names out of it.
- `worker/src/platform/cloudflare/` is the only Cloudflare code, with `worker/wrangler.toml` and the D1
  migrations in `worker/migrations/`.

### What to replace

| On Cloudflare | What it does | On a Node server |
|---|---|---|
| `platform/cloudflare/index.ts` | The Worker's entry: exports `fetch` and `scheduled` | `server.ts`: an HTTP server (`node:http`, or a framework such as Hono or Fastify) that turns each request into a `Request`, calls `core.handle(request, clientIp, platform)` and sends the `Response` back |
| `platform/cloudflare/app.ts` | Creates the core once (`createCore()`) and hands it D1 and the settings on every call; `scheduled` calls `runDailyPurge()` | The same at start-up: `const core = createCore()` and `const platform = { db, config: process.env }` |
| `platform/cloudflare/env.ts` | Types of the D1 binding and the `[vars]` | Not needed: the settings are environment variables with the same names (`D1_WRITE_BUDGET`, `ALLOWED_ORIGINS` …), e.g. from a `.env` file that is never committed |
| `platform/cloudflare/d1.ts` | `D1Db`: the `Db` port on D1 | A `Db` for the database you choose: SQLite or PostgreSQL, below |
| `platform/cloudflare/clientIp.ts` | The caller's IP address from `CF-Connecting-IP`, which Cloudflare sets itself | The socket's address (`request.socket.remoteAddress`). Behind nginx or a load balancer: the address your own proxy adds to `X-Forwarded-For` (the last entry), and only if the server cannot be reached except through that proxy. Never read the header otherwise: anyone can write any address in it and so dodge every per-IP limit |
| Cron Trigger `10 0 * * *` in `wrangler.toml` | Runs the daily purge at 00:10 UTC (07:10 in Thailand) | A systemd timer, a crontab line or `node-cron` that calls `core.runDailyPurge(platform)` once a day after 00:00 UTC. Running it twice, or late, is safe |
| `[vars]` and `[env.production.vars]` in `wrangler.toml` | Settings | Environment variables with the same names; `ALLOWED_ORIGINS` = the origin of the pages |
| `migrations/` + `wrangler d1 migrations apply` | Creates and updates the schema | A small runner that applies each `NNNN_name.sql` once, in order, and records it in a `schema_migrations` table |
| Job `deploy-api` in `.github/workflows/deploy.yml` | Creates D1, applies the migrations, deploys the Worker | Your own deploy (a container image, or copy and restart over SSH), with HTTPS in front (a reverse proxy with a certificate) |

The tools that start or check the API on this machine go through wrangler too, so they change with it:

| Tool | What it does now | With a Node server |
|---|---|---|
| `npm run dev:api` (root `package.json` → `migrate:local` and `dev` in `worker/package.json`) | Applies the migrations to a local D1, then serves the API with `wrangler dev` on port 8787 | Your migration runner on a local database, then the server itself on port 8787 (e.g. `node --watch server.ts`) |
| `worker/scripts/e2e-server.mjs` (`npm run e2e:api`), started by the second `webServer` of `playwright.config.ts` | Creates an empty local D1 under `worker/.wrangler/e2e`, then runs `wrangler dev` on port 8787 with the two per-IP limits raised (`--var`), because every end-to-end test books from 127.0.0.1 | The same steps for your server: an empty database, the migrations, then the server with `SANDBOXES_PER_10_MINUTES_PER_IP` and `D1_WRITE_BUDGET_PER_IP_PERCENT` raised as environment variables. The `webServer` entry stays: it only waits for `/health` |
| `npm run check:worker` (`check:deploy` in `worker/package.json`: `wrangler deploy --env production --dry-run`) | Bundles the Worker with the production settings without deploying it; the deploy workflow runs it too | Your own build check: compile the server, or build its container image |
| `tests/unit/workerConfig.test.ts` | Reads `worker/wrangler.toml`: no account id or token, the purge at 00:10 UTC, the budgets, and production settings that allow only the pages' origin | The same checks on your server's settings, or remove it together with `wrangler.toml` |
| `tests/unit/deployWorkflow.test.ts` | Checks that in `.github/workflows/deploy.yml` only the steps that run wrangler, and the step that checks the secrets are set, get the Cloudflare secrets | The same rule for your own deploy (only the step that deploys reads its secrets), or remove it together with the `deploy-api` job |
| `npm run test:worker` (`worker/vitest.config.ts`) | Runs the API's tests inside workerd with a local D1 | See "Tests" below |

What stays as it is: everything in `worker/src/core/` (the routes, their answers and messages, the rules,
sandboxes, limits); the pages, except `site.apiUrl` in `app/data/site.ts`, which points at the new address;
the Bearer tokens and CORS, as long as the pages and the API stay on different sites.

### What a database adapter must promise

The `Db` interface in `worker/src/core/ports.ts`, and `worker/test/d1Db.test.ts` for how D1 is checked:

- `first` and `all` return plain rows; numbers as JavaScript numbers (BIGINT and `COUNT(*)` included), NULL
  as `null`.
- `transaction(statements)` is all or nothing, runs the statements in order, and runs **one at a time**:
  no other write may come between them (serializable). The API's guards depend on it: a booking checks
  that its time is free, and the caps (bookings per sandbox, 30 services, 5 sessions, new sandboxes and
  wrong passwords per IP address) count inside the very statement that writes, and the day's starting data
  is written once even when the first requests arrive together. D1 gives this for free, because each
  database has a single writer. A database that runs transactions side by side at a weaker isolation level
  would let two requests sent at the same moment both pass a check, for example book the same last free
  time twice.
- Each statement reports `changes` (rows inserted, updated or deleted). `rowsWritten` is D1's billing count;
  other databases return `null`, and the write budgets then count `changes`.
- `isConstraintError`, `isRetryable` (the core tries a failed call once more), `maxParams` (the starting
  data is split into statements that bind at most this many parameters).

### Way 1: Node + SQLite (the smallest move)

- The SQL and the migrations stay exactly as they are: D1 is SQLite (`WITHOUT ROWID` included).
- Driver: `node:sqlite` (built into Node 22, still marked experimental) or `better-sqlite3`. `node:sqlite`
  takes `?2` as a name rather than the second value, so the adapter rewrites `?N` to `:pN` and binds by name.
- `transaction`: `BEGIN IMMEDIATE`, the statements, then `COMMIT`, or `ROLLBACK` on any error, on one
  connection in one process: SQLite then runs every write one after another, like D1. There must be **no
  `await` between `BEGIN IMMEDIATE` and `COMMIT`**. A synchronous driver (`node:sqlite`, `better-sqlite3`)
  gives this by itself. With an asynchronous driver, put the whole transaction behind a mutex, so that only
  one runs at a time; otherwise a request that arrives in the meantime runs its statements on the same
  connection, inside the open transaction, and two requests sent at the same moment can both pass a guard.
- `SQLITE_BUSY` is retryable; "constraint failed" in the message is a constraint error; `changes` comes from
  each run.
- One server process only (the database is a file on its disk), with backups of that file.

### Way 2: Node + PostgreSQL

- Driver `pg`. The adapter rewrites `?N` to `$N` (no SQL text in the core contains a literal `?`).
- Schema: a copy of the migrations for PostgreSQL (e.g. `migrations-postgres/`): remove `WITHOUT ROWID`;
  declare the millisecond timestamps `BIGINT` (`sandboxes.created_at`, `sandboxes.change_window_start`,
  `sessions.created_at`, `bookings.created_at`, `login_failures.at`), because PostgreSQL's `INTEGER` is 32
  bits; keep `enabled` and `is_seed` as `SMALLINT` or `INTEGER` 0 / 1, not `BOOLEAN` (the code compares them
  with 1 and 0).
- Numbers: `pg` returns BIGINT and `COUNT(*)` as strings; parse them with `types.setTypeParser(20, Number)`.
- `transaction`: `BEGIN ISOLATION LEVEL SERIALIZABLE`, the statements, `COMMIT`, and run the whole
  transaction again when PostgreSQL answers SQLSTATE `40001` (a few times: the core itself retries only
  once). Simpler for one shop: start every transaction with `SELECT pg_advisory_xact_lock(1)`, which makes
  writes take turns exactly like D1's single writer.
- SQLSTATE class `23` (e.g. `23505`, a duplicate key) is a constraint error; `changes` is `rowCount`.
- Checked once by hand on 2026-10-17: the core, unchanged, ran on PostgreSQL 18.6 (PGlite) and on SQLite
  3.50 (`node:sqlite`) through throwaway adapters written as above, through every route that writes, the
  purge and the guards inside the booking INSERT. That check is not part of this repository and used one
  connection, so it shows that the SQL runs, not how the database behaves under load.

### The write budgets on your own server

`D1_WRITE_BUDGET` and `D1_WRITE_BUDGET_PER_IP_PERCENT` keep D1's free plan (100,000 rows written a day)
from running out (D-008). Off Cloudflare they count rows changed instead of D1's rows plus index entries.
Keep them as a brake on abuse (the share per IP address especially), raise them, or set them very high;
their names stay the same.

### SQL that is not the same everywhere

The core's SQL runs as it is on SQLite (D1) and PostgreSQL. MySQL is not supported; this is what it would
need.

| In this code | SQLite / D1 | PostgreSQL | MySQL |
|---|---|---|---|
| Placeholders `?1` … `?N`, a number used more than once | As they are | `$N` (adapter) | Anonymous `?` with the values repeated in order |
| `WITHOUT ROWID` on 9 tables (migrations) | Kept: D1's `rows_written`, and the budget figures above, depend on it | Remove | Remove |
| Millisecond timestamps in `INTEGER` columns | 64-bit already | `BIGINT` | `BIGINT` |
| `CAST(?N AS BIGINT)`, `AS INTEGER`, `AS TEXT` | No effect | Needed: a parameter that appears only in a SELECT list is read as text | `CAST(? AS SIGNED)` / `AS CHAR` |
| `INSERT … ON CONFLICT … DO UPDATE` (purge, starting data, budgets) | Yes | Yes | `ON DUPLICATE KEY UPDATE` |
| `LIMIT` inside `IN (…)` (the oldest sessions) | Yes | Yes | Not allowed: wrap it in a derived table |
| `SELECT … WHERE …` without `FROM` (inserts that check a limit) | Yes | Yes | Add `FROM DUAL` |
| `'%"' \|\| ?2 \|\| '"%'` (leave dates) | Yes | Yes | `CONCAT()` |
| `>>` and `&` on `work_days` | Yes | Yes | Yes |
| Booleans as 0 / 1 | `INTEGER` | `SMALLINT` or `INTEGER` | `TINYINT` |
| `login_failures` has no primary key | Hidden rowid | Fine | Fine |
| Columns named `rows`, `key`, `value`, `day`, `date`, `at`, `position` | Fine | Fine | `rows` and `key` are reserved: quote them with backticks or rename them |

### Tests

The API's tests (`npm run test:worker`) run only inside the Workers runtime with a local D1. A Node server
needs its own run of the same tests against its own `Db`, at least the ones that send requests at the same
moment (`rateLimit`, `sessions`, `seedInstall`, `bookings`), since they are what proves the
one-at-a-time promise above.

## Photos and credits

Photos are from Unsplash and Pexels, under their own free licenses, copied from Business-site. Every file,
its photographer and its source are listed in [CREDITS.md](CREDITS.md). Fonts: Noto Sans Thai and Noto
Serif Thai (SIL Open Font License 1.1), downloaded by `@nuxt/fonts` at build time.

## Licence

© 2026 0984043505Frong. All rights reserved.

There is no LICENSE file in this repository, on purpose: you are welcome to read the code, but
using, copying or selling it needs the author's permission. The photos and fonts keep their own licences.
