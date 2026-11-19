# Veloz

High-performance chart + strategy workspace (TradingView-like). Candlestick charts via TradingView Lightweight Charts, in-browser JavaScript/TypeScript strategy editor, Web Worker backtests, and candles from a local TimescaleDB API (or bundled demo data).

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Edit the strategy, click **Executar backtest**.

No painel **Dados BD** podes escolher símbolos Binance e o intervalo a descarregar para a Timescale; o gráfico continua a pedir só janelas via `GET /candles`. A chave da API introduz-se aí (fica só na sessão do browser).

---

## Candle store + API (TimescaleDB)

1-minute OHLCV is the source of truth. Higher timeframes (`5m`, `15m`, `1h`, `4h`, `1D`) are aggregated on read. Data is ingested from **Binance** public klines (spot by default).

### Stack

| Service | Default port | Role |
|---|---|---|
| `timescaledb` | `127.0.0.1:5432` | Postgres + Timescale hypertable `candles_1m` (loopback only) |
| `candles-api` | `8080` | FastAPI: chart reads, symbol coverage, backfill jobs, daily sync + optional Binance poller |

### Run on Ubuntu (e.g. m4st3r)

Requires Docker + Docker Compose plugin.

```bash
cd /path/to/veloz
cp .env.example .env
# REQUIRED — generate strong secrets (never commit .env):
#   openssl rand -hex 24   → POSTGRES_PASSWORD
#   openssl rand -hex 32   → CANDLES_API_KEY
nano .env
docker compose up -d --build
```

**Rotate on an existing deploy:** set new `POSTGRES_PASSWORD` / `CANDLES_API_KEY` in `.env`, then `ALTER USER … PASSWORD` (or recreate the volume) and `docker compose up -d --build`. Prefer rotating away from any old `veloz` password.

Check health and a sample window (API routes except `/health` need the key):

```bash
curl -s http://127.0.0.1:8080/health | jq
curl -s -H "X-API-Key: $CANDLES_API_KEY" \
  'http://127.0.0.1:8080/candles?symbol=BTCUSDT&timeframe=1h&limit=5' | jq
curl -s -H "X-API-Key: $CANDLES_API_KEY" http://127.0.0.1:8080/symbols | jq
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
| `POSTGRES_USER` / `DB` | `veloz` / `veloz_candles` | DB user / database name |
| `POSTGRES_PASSWORD` | **required** | Strong DB password (`openssl rand -hex 24`). No weak default. |
| `TIMESCALE_PORT` | `5432` | Host port for Postgres (**bound to 127.0.0.1**) |
| `CANDLES_API_PORT` | `8080` | Host port for the HTTP API |
| `CANDLES_API_KEY` | **required** (≥16 chars) | Always required as `X-API-Key` on API routes except `/health` |
| `CORS_ORIGINS` | localhost + `https://veloz.apps.grok.bot` | Explicit allow-list (comma-separated). `*` rejected. |
| `MAX_BACKFILL_SYMBOLS` | `10` | Max symbols per `POST /backfill` |
| `MAX_BACKFILL_DAYS` | `366` | Max `from`→`to` span for backfill |
| `BINANCE_MARKET` | `spot` | `spot` or `futures` (USDT-M) |
| `BINANCE_REST_URL` | _(market default)_ | Override klines URL (spot default: `data-api.binance.vision`) |
| `BINANCE_SYMBOLS` | `BTCUSDT,ETHUSDT,SOLUSDT` | Symbols for the **startup** ingest poller |
| `INGEST_BACKFILL_DAYS` | `7` | Default depth when `from` is omitted on backfill / initial poller |
| `INGEST_POLL_SECONDS` | `30` | Incremental poll interval (poller only) |
| `RUN_INGEST` | `1` | Set `0` to serve API only (no continuous Binance poller). Daily cron still works. |

Frontend (Vite) — URL only; **never** put the API key in a `VITE_*` variable (Vite would bake it into the public JS bundle):

| Var | Example | Meaning |
|---|---|---|
| `VITE_CANDLES_API_URL` | `http://192.168.1.216:8080` | Candles API base URL (no trailing slash) |

How Veloz sends the key: paste `CANDLES_API_KEY` in the **Dados BD** panel → stored in `sessionStorage` for this tab only and sent as `X-API-Key`. Alternatives: run Veloz locally on the LAN, or put a same-origin reverse proxy in front of the API that injects the header.

If the API URL is unreachable or the request fails, Veloz keeps using the in-browser demo generator.

### API

```
GET  /candles?symbol=BTCUSDT&timeframe=1h&from=&to=&before=&limit=
GET  /v1/candles          # same (chart path — keep this fast)
GET  /health              # open (no API key)
GET  /symbols             # symbols in DB + min/max ts + bar count
POST /backfill            # { "symbols": ["BTCUSDT"], "from": "ISO", "to": "ISO" }
GET  /backfill/{job_id}   # poll queued|running|done|error (+ progressPct)
GET  /backfill            # recent jobs
POST /daily-sync          # fill yesterday (UTC) for every symbol already in DB
GET  /sync-status?kind=daily  # last cron/API daily-sync success|error (Dados BD)
```

All routes except `/health` require header `X-API-Key: <CANDLES_API_KEY>`.

- `timeframe`: `1m` \| `5m` \| `15m` \| `1h` \| `4h` \| `1D`
- `from` / `to` on `/candles`: unix seconds (inclusive / exclusive)
- Backfill body `from` / `to`: ISO-8601 timestamps (UTC). Omit `to` = until now; omit `from` = last `INGEST_BACKFILL_DAYS`. Max symbols / day span: `MAX_BACKFILL_*`.
- Backfill job responses include `progressPct` (0–100 from per-symbol status) for UI polling.
- `GET /sync-status` returns the latest row written by `python -m app.daily_sync` or `POST /daily-sync`.
- `before`: page older bars (strictly before `ts`)
- `limit`: default `5000`, max `50000`
- Response bars match Veloz `Bar`: `{ time, open, high, low, close, volume }` (`time` = UTC seconds)

Example backfill:

```bash
curl -s -X POST http://127.0.0.1:8080/backfill \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $CANDLES_API_KEY" \
  -d '{"symbols":["BTCUSDT","ETHUSDT"],"from":"2026-11-01T00:00:00Z"}' | jq
```

### Daily sync (cron on Ubuntu / m4st3r)

After `docker compose up`, schedule a job that fills **yesterday’s UTC day** of 1m candles for **every symbol that already has rows** in `candles_1m` (gap-friendly upsert).

**Preferred (container CLI):**

```bash
# smoke once
docker exec veloz-candles-api python -m app.daily_sync
```

Install cron as the user that can talk to Docker (often `master`):

```bash
sudo mkdir -p /var/log
sudo touch /var/log/veloz-daily-sync.log
sudo chown master:master /var/log/veloz-daily-sync.log

crontab -e
```

Add (runs daily at 01:15 local time):

```cron
15 1 * * * docker exec veloz-candles-api python -m app.daily_sync >> /var/log/veloz-daily-sync.log 2>&1
```

**Alternative (HTTP):**

```cron
15 1 * * * curl -fsS -X POST -H "X-API-Key: $CANDLES_API_KEY" http://127.0.0.1:8080/daily-sync >> /var/log/veloz-daily-sync.log 2>&1
```

New symbols are **not** picked up by the daily job until they have at least one bar (use the Veloz **Dados BD** panel or `POST /backfill` once).

### Point Veloz at the API on m4st3r

On the machine running the Vite app (or a built static host):

```bash
# .env.local — URL only, never the API key
VITE_CANDLES_API_URL=http://192.168.1.216:8080
```

Restart `npm run dev` (or rebuild). Open **Dados BD**, paste the API key, Guardar. Symbol ids such as `BTCUSDT` must match ingested Binance symbols.

**LAN note:** `192.168.1.216:8080` is only reachable on Tiago’s home LAN. From outside the LAN use a tunnel/VPN, or run Veloz locally against the API.
