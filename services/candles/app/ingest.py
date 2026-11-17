"""Binance REST klines → candles_1m (backfill + incremental poll)."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

import httpx

from .config import settings
from .db import latest_ts, upsert_candles

log = logging.getLogger("candles.ingest")

# data-api.binance.vision mirrors spot public market data and works from more regions
# than api.binance.com (which often returns HTTP 451).
SPOT_URL = "https://data-api.binance.vision/api/v3/klines"
FUTURES_URL = "https://fapi.binance.com/fapi/v1/klines"
KLINE_LIMIT = 1000
SOURCE = "binance"


def _base_url() -> str:
    override = settings.binance_rest_url.strip()
    if override:
        return override.rstrip("/")
    return FUTURES_URL if settings.binance_market.lower() == "futures" else SPOT_URL


def _ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


def _parse_kline(symbol: str, k: list) -> tuple[str, datetime, float, float, float, float, float, str]:
    # [ openTime, o, h, l, c, volume, closeTime, ... ]
    ts = datetime.fromtimestamp(int(k[0]) / 1000, tz=timezone.utc)
    return (
        symbol,
        ts,
        float(k[1]),
        float(k[2]),
        float(k[3]),
        float(k[4]),
        float(k[5]),
        SOURCE,
    )


async def fetch_klines(
    client: httpx.AsyncClient,
    symbol: str,
    start_ms: int,
    end_ms: int | None = None,
) -> list:
    params: dict[str, str | int] = {
        "symbol": symbol,
        "interval": "1m",
        "limit": KLINE_LIMIT,
        "startTime": start_ms,
    }
    if end_ms is not None:
        params["endTime"] = end_ms
    r = await client.get(_base_url(), params=params, timeout=30.0)
    r.raise_for_status()
    return r.json()


async def backfill_symbol(client: httpx.AsyncClient, symbol: str, days: int) -> int:
    now = datetime.now(timezone.utc)
    existing = latest_ts(symbol)
    if existing is not None:
        start = existing - timedelta(minutes=1)  # refresh last closed bar
    else:
        start = now - timedelta(days=days)

    total = 0
    cursor = start
    end = now

    while cursor < end:
        batch = await fetch_klines(client, symbol, _ms(cursor), _ms(end))
        if not batch:
            break
        rows = [_parse_kline(symbol, k) for k in batch]
        # Drop the forming (incomplete) last candle if openTime is current minute
        last_open = rows[-1][1]
        if last_open + timedelta(minutes=1) > now:
            rows = rows[:-1]
        if not rows:
            break
        n = upsert_candles(rows)
        total += n
        last_ts = rows[-1][1]
        next_cursor = last_ts + timedelta(minutes=1)
        if next_cursor <= cursor:
            break
        cursor = next_cursor
        if len(batch) < KLINE_LIMIT:
            break
        await asyncio.sleep(0.15)

    log.info("backfill %s: upserted ~%s bars (start=%s)", symbol, total, start.isoformat())
    return total


async def ingest_loop(stop: asyncio.Event) -> None:
    symbols = settings.symbols
    days = max(1, settings.ingest_backfill_days)
    poll = max(5, settings.ingest_poll_seconds)
    log.info(
        "ingest start market=%s symbols=%s backfill_days=%s poll=%ss",
        settings.binance_market,
        symbols,
        days,
        poll,
    )

    async with httpx.AsyncClient(headers={"User-Agent": "veloz-candles/1.0"}) as client:
        # Initial backfill
        for symbol in symbols:
            if stop.is_set():
                return
            try:
                await backfill_symbol(client, symbol, days)
            except Exception:
                log.exception("backfill failed for %s", symbol)

        # Incremental poll
        while not stop.is_set():
            try:
                await asyncio.wait_for(stop.wait(), timeout=poll)
                break
            except asyncio.TimeoutError:
                pass
            for symbol in symbols:
                if stop.is_set():
                    return
                try:
                    await backfill_symbol(client, symbol, days=1)
                except Exception:
                    log.exception("incremental ingest failed for %s", symbol)
