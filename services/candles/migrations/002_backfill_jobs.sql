-- Optional job history for UI-triggered backfills (also ensured at API startup)
CREATE TABLE IF NOT EXISTS backfill_jobs (
  id          text PRIMARY KEY,
  status      text NOT NULL,
  symbols     text[] NOT NULL,
  from_ts     timestamptz,
  to_ts       timestamptz,
  progress    jsonb NOT NULL DEFAULT '{}'::jsonb,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  started_at  timestamptz,
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS backfill_jobs_created_at_idx
  ON backfill_jobs (created_at DESC);
