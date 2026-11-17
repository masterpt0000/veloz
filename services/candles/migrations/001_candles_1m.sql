-- Veloz 1m OHLCV source of truth (TimescaleDB hypertable)
CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS candles_1m (
  symbol   text             NOT NULL,
  ts       timestamptz      NOT NULL,
  open     double precision NOT NULL,
  high     double precision NOT NULL,
  low      double precision NOT NULL,
  close    double precision NOT NULL,
  volume   double precision NOT NULL DEFAULT 0,
  source   text,
  PRIMARY KEY (symbol, ts)
);

SELECT create_hypertable('candles_1m', 'ts', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS candles_1m_symbol_ts_desc_idx
  ON candles_1m (symbol, ts DESC);
