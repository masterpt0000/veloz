-- Last daily-sync (and similar) run metadata for Dados BD UI
CREATE TABLE IF NOT EXISTS sync_runs (
  id          bigserial PRIMARY KEY,
  kind        text NOT NULL DEFAULT 'daily',
  ok          boolean NOT NULL,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NOT NULL DEFAULT now(),
  results     jsonb NOT NULL DEFAULT '{}'::jsonb,
  error       text
);

CREATE INDEX IF NOT EXISTS sync_runs_kind_finished_idx
  ON sync_runs (kind, finished_at DESC);
