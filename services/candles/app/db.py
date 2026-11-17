from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import settings

_pool: ConnectionPool | None = None

TIMEFRAME_INTERVALS: dict[str, str] = {
    "1m": "1 minute",
    "5m": "5 minutes",
    "15m": "15 minutes",
    "1h": "1 hour",
    "4h": "4 hours",
    "1D": "1 day",
}


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            conninfo=settings.database_url,
            min_size=1,
            max_size=8,
            kwargs={"row_factory": dict_row, "connect_timeout": 5},
            timeout=10,
            open=True,
        )
    return _pool


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


@contextmanager
def connection() -> Iterator[Any]:
    with get_pool().connection() as conn:
        yield conn


def wait_for_db(retries: int = 40, delay_s: float = 0.5) -> None:
    import time

    last: Exception | None = None
    for _ in range(retries):
        try:
            with connection() as conn:
                conn.execute("SELECT 1")
            return
        except Exception as exc:  # noqa: BLE001 — retry until ready
            last = exc
            time.sleep(delay_s)
    raise RuntimeError(f"database not ready: {last}")


def upsert_candles(
    rows: list[tuple[str, datetime, float, float, float, float, float, str]],
) -> int:
    if not rows:
        return 0
    sql = """
        INSERT INTO candles_1m (symbol, ts, open, high, low, close, volume, source)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (symbol, ts) DO UPDATE SET
          open = EXCLUDED.open,
          high = EXCLUDED.high,
          low = EXCLUDED.low,
          close = EXCLUDED.close,
          volume = EXCLUDED.volume,
          source = EXCLUDED.source
    """
    with connection() as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, rows)
        conn.commit()
    return len(rows)


def latest_ts(symbol: str) -> datetime | None:
    with connection() as conn:
        row = conn.execute(
            "SELECT max(ts) AS ts FROM candles_1m WHERE symbol = %s",
            (symbol,),
        ).fetchone()
    if not row or row["ts"] is None:
        return None
    ts = row["ts"]
    if ts.tzinfo is None:
        return ts.replace(tzinfo=timezone.utc)
    return ts


def query_candles(
    *,
    symbol: str,
    timeframe: str,
    from_ts: int | None,
    to_ts: int | None,
    before_ts: int | None,
    limit: int,
) -> list[dict[str, Any]]:
    interval = TIMEFRAME_INTERVALS[timeframe]
    params: list[Any] = [symbol]
    where = ["symbol = %s"]

    if from_ts is not None:
        where.append("ts >= to_timestamp(%s)")
        params.append(from_ts)
    if to_ts is not None:
        where.append("ts < to_timestamp(%s)")
        params.append(to_ts)
    if before_ts is not None:
        where.append("ts < to_timestamp(%s)")
        params.append(before_ts)

    where_sql = " AND ".join(where)

    if timeframe == "1m":
        # Newest page first when no explicit from — then reverse for ascending order.
        order_inner = "ts DESC" if from_ts is None else "ts ASC"
        sql = f"""
            SELECT extract(epoch FROM ts)::bigint AS time,
                   open, high, low, close, volume
            FROM (
              SELECT ts, open, high, low, close, volume
              FROM candles_1m
              WHERE {where_sql}
              ORDER BY {order_inner}
              LIMIT %s
            ) q
            ORDER BY time ASC
        """
        params.append(limit)
    else:
        # Aggregate on-read from 1m; page newest buckets when from is omitted.
        order_inner = "bucket DESC" if from_ts is None else "bucket ASC"
        sql = f"""
            SELECT extract(epoch FROM bucket)::bigint AS time,
                   open, high, low, close, volume
            FROM (
              SELECT time_bucket(%s::interval, ts) AS bucket,
                     first(open, ts) AS open,
                     max(high) AS high,
                     min(low) AS low,
                     last(close, ts) AS close,
                     sum(volume) AS volume
              FROM candles_1m
              WHERE {where_sql}
              GROUP BY bucket
              ORDER BY {order_inner}
              LIMIT %s
            ) q
            ORDER BY time ASC
        """
        params = [interval, *params, limit]

    with connection() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [
        {
            "time": int(r["time"]),
            "open": float(r["open"]),
            "high": float(r["high"]),
            "low": float(r["low"]),
            "close": float(r["close"]),
            "volume": float(r["volume"]),
        }
        for r in rows
    ]
