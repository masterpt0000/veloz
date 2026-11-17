# Veloz

High-performance chart + strategy workspace (TradingView-like). Candlestick charts via TradingView Lightweight Charts, in-browser JavaScript/TypeScript strategy editor, Web Worker backtests, and candles from a local TimescaleDB API (or bundled demo data).

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Edit the strategy, click **Executar backtest**.

---

## Candle store + API (TimescaleDB)

1-minute OHLCV is the source of truth. Higher timeframes (`5m`, `15m`, `1h`, `4h`, `1D`) are aggregated on read. Data is ingested from **Binance** public klines (spot by default).

### Stack

| Service | Default port | Role |
|---|---|---|
| `timescaledb` | `5432` | Postgres + Timescale hypertable `candles_1m` |
| `candles-api` | `8080` | FastAPI: `/health`, `/candles` (+ `/v1/candles`) + Binance REST ingest |

### Run on Ubuntu (e.g. m4st3r)

Requires Docker + Docker Compose plugin.

```bash
cd /path/to/veloz
cp .env.example .env   # edit passwords / symbols / ports
docker compose up -d --build
```

Check health and a sample window:

```bash
curl -s http://127.0.0.1:8080/health | jq
curl -s 'http://127.0.0.1:8080/candles?symbol=BTCUSDT&timeframe=1h&limit=5' | jq
```

Logs / restart:

```bash
docker compose logs -f candles-api
docker compose down    # keep volume
docker compose down -v # wipe DB
```

### Environment variables

| Var | Default | Meaning |
|---|---|---|
| `POSTGRES_USER` / `PASSWORD` / `DB` | `veloz` / `veloz` / `veloz_candles` | DB credentials |
| `TIMESCALE_PORT` | `5432` | Host port for Postgres |
| `CANDLES_API_PORT` | `8080` | Host port for the HTTP API |
| `CANDLES_API_KEY` | _(empty)_ | If set, require `X-API-Key` on `/candles` |
| `CORS_ORIGINS` | `*` | CORS allow-list (comma-separated or `*`) |
| `BINANCE_MARKET` | `spot` | `spot` or `futures` (USDT-M) |
| `BINANCE_REST_URL` | _(market default)_ | Override klines URL (spot default: `data-api.binance.vision`) |
| `BINANCE_SYMBOLS` | `BTCUSDT,ETHUSDT,SOLUSDT` | Comma-separated symbols to ingest |
| `INGEST_BACKFILL_DAYS` | `7` | Initial REST backfill depth |
| `INGEST_POLL_SECONDS` | `30` | Incremental poll interval |
| `RUN_INGEST` | `1` | Set `0` to serve API only (no Binance poller) |

Frontend (Vite) — create `.env.local` in the repo root:

| Var | Example | Meaning |
|---|---|---|
| `VITE_CANDLES_API_URL` | `http://192.168.1.216:8080` | Candles API base URL (no trailing slash) |
| `VITE_CANDLES_API_KEY` | _(optional)_ | Sent as `X-API-Key` when the API key is set |

If `VITE_CANDLES_API_URL` is unset or the request fails, Veloz keeps using the in-browser demo generator.

### API

```
GET /candles?symbol=BTCUSDT&timeframe=1h&from=&to=&before=&limit=
GET /v1/candles   # same
GET /health
```

- `timeframe`: `1m` \| `5m` \| `15m` \| `1h` \| `4h` \| `1D`
- `from` / `to`: unix seconds (inclusive / exclusive)
- `before`: page older bars (strictly before `ts`)
- `limit`: default `5000`, max `50000`
- Response bars match Veloz `Bar`: `{ time, open, high, low, close, volume }` (`time` = UTC seconds)

### Point Veloz at the API on m4st3r

On the machine running the Vite app (or a built static host):

```bash
# .env.local
VITE_CANDLES_API_URL=http://192.168.1.216:8080
```

Restart `npm run dev` (or rebuild). Symbol ids such as `BTCUSDT` must match ingested Binance symbols.
