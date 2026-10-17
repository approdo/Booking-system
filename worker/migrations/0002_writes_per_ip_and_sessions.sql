-- Limits of the security review (BK-005 scope 13, D-011 M1).

-- Rows written per UTC day by each IP address (IPv6: each /64), all its sandboxes together: one address may
-- write at most D1_WRITE_BUDGET_PER_IP_PERCENT of the day's budget. ip_key is the same SHA-256 as in
-- sandboxes.ip_key; the daily purge deletes the rows of past days.
CREATE TABLE ip_write_budget (
  day TEXT NOT NULL, -- 'YYYY-MM-DD', UTC
  ip_key TEXT NOT NULL,
  rows INTEGER NOT NULL,
  PRIMARY KEY (day, ip_key)
) WITHOUT ROWID;

-- A sandbox keeps at most SESSIONS_PER_SANDBOX sessions: signing in once more ends its oldest one. This
-- index lets the sign-in find a sandbox's sessions without reading every session of every sandbox.
CREATE INDEX sessions_by_sandbox ON sessions (sandbox_id, created_at);
