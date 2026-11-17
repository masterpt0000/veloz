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


async def backfill_symbol_range(
    client: httpx.AsyncClient,
    symbol: str,
    start: datetime,
    end: datetime,
) -> int:
    """Fetch 1m klines for [start, end) and upsert. end is exclusive-ish (open times < end)."""
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    # Never request past "now"; drop the forming minute
    end = min(end, now)
    if start >= end:
        return 0

    total = 0
    cursor = start

    while cursor < end:
        batch = await fetch_klines(client, symbol, _ms(cursor), _ms(end))
        if not batch:
            break
        rows = [_parse_kline(symbol, k) for k in batch]
        # Keep only bars whose open is in [start, end) and fully closed
        filtered: list[tuple[str, datetime, float, float, float, float, float, str]] = []
        for row in rows:
            ts = row[1]
            if ts < start:
                continue
            if ts >= end:
                continue
            if ts + timedelta(minutes=1) > now:
                continue
            filtered.append(row)
        if not filtered:
            # Advance past an empty/forming window
            last_raw = rows[-1][1]
            next_cursor = last_raw + timedelta(minutes=1)
            if next_cursor <= cursor:
                break
            cursor = next_cursor
            if len(batch) < KLINE_LIMIT:
                break
            await asyncio.sleep(0.15)
            continue

        n = upsert_candles(filtered)
        total += n
        last_ts = filtered[-1][1]
        next_cursor = last_ts + timedelta(minutes=1)
        if next_cursor <= cursor:
            break
        cursor = next_cursor
        if len(batch) < KLINE_LIMIT:
            break
        await asyncio.sleep(0.15)

    log.info(
        "backfill %s: upserted ~%s bars (%s → %s)",
        symbol,
        total,
        start.isoformat(),
        end.isoformat(),
    )
    return total


async def backfill_symbol(client: httpx.AsyncClient, symbol: str, days: int) -> int:
    """Incremental-friendly backfill: from last DB bar (or N days ago) until now."""
    now = datetime.now(timezone.utc)
    existing = latest_ts(symbol)
    if existing is not None:
        start = existing - timedelta(minutes=1)  # refresh last closed bar
    else:
        start = now - timedelta(days=days)
    return await backfill_symbol_range(client, symbol, start, now)


async def daily_sync_symbol(client: httpx.AsyncClient, symbol: str) -> int:
    """Fill previous UTC calendar day's 1m candles for one symbol."""
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday = today - timedelta(days=1)
    return await backfill_symbol_range(client, symbol, yesterday, today)


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
