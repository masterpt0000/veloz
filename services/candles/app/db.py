from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from psycopg.types.json import Jsonb

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

_MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


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


def ensure_schema() -> None:
    """Apply SQL migrations idempotently (safe for existing Timescale volumes)."""
    if not _MIGRATIONS_DIR.is_dir():
        return
    files = sorted(_MIGRATIONS_DIR.glob("*.sql"))
    with connection() as conn:
        for path in files:
            sql = path.read_text(encoding="utf-8")
            conn.execute(sql)
        conn.commit()


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


def _as_utc(ts: datetime | None) -> datetime | None:
    if ts is None:
        return None
    if ts.tzinfo is None:
        return ts.replace(tzinfo=timezone.utc)
    return ts


def list_symbol_coverage() -> list[dict[str, Any]]:
    """Symbols present in DB with min/max ts and bar count."""
    sql = """
        SELECT symbol,
               min(ts) AS min_ts,
               max(ts) AS max_ts,
               count(*)::bigint AS bar_count
        FROM candles_1m
        GROUP BY symbol
        ORDER BY symbol ASC
    """
    with connection() as conn:
        rows = conn.execute(sql).fetchall()
    out: list[dict[str, Any]] = []
    for r in rows:
        min_ts = _as_utc(r["min_ts"])
        max_ts = _as_utc(r["max_ts"])
        out.append(
            {
                "symbol": r["symbol"],
                "minTs": min_ts.isoformat() if min_ts else None,
                "maxTs": max_ts.isoformat() if max_ts else None,
                "minTime": int(min_ts.timestamp()) if min_ts else None,
                "maxTime": int(max_ts.timestamp()) if max_ts else None,
                "barCount": int(r["bar_count"]),
            }
        )
    return out


def list_db_symbols() -> list[str]:
    with connection() as conn:
        rows = conn.execute(
            "SELECT DISTINCT symbol FROM candles_1m ORDER BY symbol ASC"
        ).fetchall()
    return [r["symbol"] for r in rows]


def insert_backfill_job(
    *,
    job_id: str,
    status: str,
    symbols: list[str],
    from_ts: datetime | None,
    to_ts: datetime | None,
    progress: dict[str, Any],
) -> None:
    sql = """
        INSERT INTO backfill_jobs
          (id, status, symbols, from_ts, to_ts, progress, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, now())
    """
    with connection() as conn:
        conn.execute(
            sql,
            (job_id, status, symbols, from_ts, to_ts, Jsonb(progress)),
        )
        conn.commit()


def update_backfill_job(
    job_id: str,
    *,
    status: str | None = None,
    progress: dict[str, Any] | None = None,
    error: str | None = None,
    started: bool = False,
    finished: bool = False,
) -> None:
    sets: list[str] = []
    params: list[Any] = []
    if status is not None:
        sets.append("status = %s")
        params.append(status)
    if progress is not None:
        sets.append("progress = %s")
        params.append(Jsonb(progress))
    if error is not None:
        sets.append("error = %s")
        params.append(error)
    if started:
        sets.append("started_at = COALESCE(started_at, now())")
    if finished:
        sets.append("finished_at = now()")
    if not sets:
        return
    params.append(job_id)
    sql = f"UPDATE backfill_jobs SET {', '.join(sets)} WHERE id = %s"
    with connection() as conn:
        conn.execute(sql, params)
        conn.commit()


def get_backfill_job(job_id: str) -> dict[str, Any] | None:
    with connection() as conn:
        row = conn.execute(
            """
            SELECT id, status, symbols, from_ts, to_ts, progress, error,
                   created_at, started_at, finished_at
            FROM backfill_jobs
            WHERE id = %s
            """,
            (job_id,),
        ).fetchone()
    if not row:
        return None
    from_ts = _as_utc(row["from_ts"])
    to_ts = _as_utc(row["to_ts"])
    created = _as_utc(row["created_at"])
    started = _as_utc(row["started_at"])
    finished = _as_utc(row["finished_at"])
    progress = row["progress"] or {}
    if not isinstance(progress, dict):
        progress = dict(progress)
    return {
        "id": row["id"],
        "status": row["status"],
        "symbols": list(row["symbols"] or []),
        "from": from_ts.isoformat() if from_ts else None,
        "to": to_ts.isoformat() if to_ts else None,
        "progress": progress,
        "error": row["error"],
        "createdAt": created.isoformat() if created else None,
        "startedAt": started.isoformat() if started else None,
        "finishedAt": finished.isoformat() if finished else None,
    }


def list_recent_backfill_jobs(limit: int = 20) -> list[dict[str, Any]]:
    with connection() as conn:
        rows = conn.execute(
            """
            SELECT id FROM backfill_jobs
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (limit,),
        ).fetchall()
    out: list[dict[str, Any]] = []
    for r in rows:
        job = get_backfill_job(r["id"])
        if job:
            out.append(job)
    return out


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
