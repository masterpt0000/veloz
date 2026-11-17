"""
Cron-friendly daily sync: fill yesterday's 1m Binance candles for every symbol in DB.

Usage (on host or inside candles-api container):

  python -m app.daily_sync

Docker / Ubuntu cron example (after deploy on m4st3r):

  15 1 * * * docker exec veloz-candles-api python -m app.daily_sync \\
      >> /var/log/veloz-daily-sync.log 2>&1
"""

from __future__ import annotations

import asyncio
import logging
import sys

import httpx

from .db import close_pool, ensure_schema, list_db_symbols, wait_for_db
from .ingest import daily_sync_symbol

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("candles.daily_sync")


async def run_daily_sync() -> dict[str, int | str]:
    wait_for_db()
    ensure_schema()
    symbols = list_db_symbols()
    if not symbols:
        log.warning("no symbols in DB — nothing to sync")
        return {"symbols": 0, "bars": 0}

    results: dict[str, int | str] = {}
    total = 0
    async with httpx.AsyncClient(headers={"User-Agent": "veloz-candles/1.0"}) as client:
        for symbol in symbols:
            try:
                n = await daily_sync_symbol(client, symbol)
                results[symbol] = n
                total += n
                log.info("daily_sync %s: %s bars", symbol, n)
            except Exception as exc:  # noqa: BLE001
                log.exception("daily_sync failed for %s", symbol)
                results[symbol] = f"error: {exc}"

    results["_total_bars"] = total
    results["_symbol_count"] = len(symbols)
    return results


def main() -> None:
    try:
        summary = asyncio.run(run_daily_sync())
        log.info("daily_sync done: %s", summary)
        # Non-zero exit if any symbol errored
        failed = [
            k
            for k, v in summary.items()
            if isinstance(v, str) and v.startswith("error:")
        ]
        if failed:
            sys.exit(1)
    finally:
        close_pool()


if __name__ == "__main__":
    main()
