-- Schema of the booking system (BK-005).
--
-- Every row of shop data belongs to a sandbox: 'seed' holds the starting data (written by the Worker from
-- app/data/seed.ts), and each visitor who writes something gets a copy under the SHA-256 of a random
-- token (D-004, D-006). The daily purge deletes sandboxes older than 24 hours with all their rows.
--
-- D1 counts every row and every index entry it writes against the free plan's 100,000 rows a day
-- (D-008), so the tables keep few indexes, and lists that change together (service options, opening
-- hours, days off) are JSON in one row. Tables keyed by text are WITHOUT ROWID: no second copy of the key.

-- One row per visitor who has written something. id = SHA-256 of the sandbox token (base64url).
CREATE TABLE sandboxes (
  id TEXT PRIMARY KEY,
  -- SHA-256 of the IPv4 address or the IPv6 /64 network that created it: limits new sandboxes per IP.
  ip_key TEXT NOT NULL,
  created_at INTEGER NOT NULL, -- ms since 1970 (UTC)
  -- Back office changes in the current minute (rate limit), counted here instead of a counter table.
  change_window_start INTEGER NOT NULL DEFAULT 0,
  change_count INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;

CREATE INDEX sandboxes_by_ip ON sandboxes (ip_key, created_at);

CREATE TABLE services (
  sandbox_id TEXT NOT NULL,
  id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  includes TEXT, -- packages only: what the package is made of
  options TEXT NOT NULL, -- JSON: [{ "minutes": 60, "price": 400 }, ...], shortest first
  enabled INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL,
  PRIMARY KEY (sandbox_id, id)
) WITHOUT ROWID;

CREATE TABLE therapists (
  sandbox_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  initial TEXT NOT NULL,
  role TEXT NOT NULL,
  years INTEGER NOT NULL,
  specialty TEXT NOT NULL, -- JSON list of phrases
  work_days INTEGER NOT NULL, -- bit n set = works on weekday n (0 = Sunday)
  leave_dates TEXT NOT NULL DEFAULT '[]', -- JSON list of 'YYYY-MM-DD'
  position INTEGER NOT NULL,
  PRIMARY KEY (sandbox_id, id)
) WITHOUT ROWID;

CREATE TABLE shop_settings (
  sandbox_id TEXT PRIMARY KEY,
  hours TEXT NOT NULL, -- JSON: 7 days, Sunday first: { weekday, closed, open, close, lastBooking }
  closed_dates TEXT NOT NULL DEFAULT '[]' -- JSON list of 'YYYY-MM-DD': special days closed all day
) WITHOUT ROWID;

CREATE TABLE bookings (
  sandbox_id TEXT NOT NULL,
  code TEXT NOT NULL, -- NP-XXXXX, unique in its sandbox
  service_id TEXT NOT NULL,
  service_name TEXT NOT NULL, -- as it was when booked
  minutes INTEGER NOT NULL,
  price INTEGER NOT NULL, -- baht, as it was when booked
  therapist_id TEXT, -- NULL = no preference
  date TEXT NOT NULL, -- 'YYYY-MM-DD', Thai time
  start_min INTEGER NOT NULL, -- minutes after midnight, Thai time
  end_min INTEGER NOT NULL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL, -- digits only; '+' kept before 66
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'done', 'cancelled')),
  is_seed INTEGER NOT NULL DEFAULT 0, -- 1 = starting data; 0 = made in this sandbox (label "ใหม่")
  created_at INTEGER NOT NULL,
  PRIMARY KEY (sandbox_id, code)
) WITHOUT ROWID;

CREATE INDEX bookings_by_day ON bookings (sandbox_id, date, start_min);

-- Back office sessions. id = SHA-256 of the session token; a session ends with its sandbox.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  sandbox_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
) WITHOUT ROWID;

-- Wrong passwords per IP (rate limit). Rows older than a day are deleted by the purge.
CREATE TABLE login_failures (
  ip_key TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE INDEX login_failures_by_ip ON login_failures (ip_key, at);

-- Rows written to D1 per UTC day, from D1's own `rows_written` (D-008).
CREATE TABLE write_budget (
  day TEXT PRIMARY KEY, -- 'YYYY-MM-DD', UTC
  rows INTEGER NOT NULL
) WITHOUT ROWID;

-- Small facts of the service: last_purge_at, and which starting data is installed.
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;
