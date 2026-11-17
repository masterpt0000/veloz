"""In-process backfill job runner with DB-backed status for UI polling."""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from .config import settings
from .db import (
    get_backfill_job,
    insert_backfill_job,
    list_recent_backfill_jobs,
    update_backfill_job,
)
from .ingest import backfill_symbol_range

log = logging.getLogger("candles.jobs")

_running: set[str] = set()
_lock = asyncio.Lock()


def _parse_iso(value: str | None) -> datetime | None:
    if value is None or not value.strip():
        return None
    raw = value.strip().replace("Z", "+00:00")
    dt = datetime.fromisoformat(raw)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


async def enqueue_backfill(
    *,
    symbols: list[str],
    from_iso: str | None = None,
    to_iso: str | None = None,
) -> dict[str, Any]:
    cleaned = [s.strip().upper() for s in symbols if s and s.strip()]
    if not cleaned:
        raise ValueError("symbols must be a non-empty list")
    max_syms = settings.max_backfill_symbols
    if len(cleaned) > max_syms:
        raise ValueError(f"at most {max_syms} symbols per backfill request")

    from_ts = _parse_iso(from_iso)
    to_ts = _parse_iso(to_iso)
    now = datetime.now(timezone.utc)
    if to_ts is None:
        to_ts = now
    if from_ts is None:
        # Default: last N days when "from" omitted ("até agora" needs an anchor)
        from_ts = to_ts - timedelta(days=max(1, settings.ingest_backfill_days))
    if from_ts >= to_ts:
        raise ValueError("from must be before to")
    span = to_ts - from_ts
    max_days = settings.max_backfill_days
    if span > timedelta(days=max_days):
        raise ValueError(f"backfill range must be <= {max_days} days")

    progress = {
        sym: {"status": "queued", "bars": 0, "error": None} for sym in cleaned
    }
    job_id = uuid.uuid4().hex
    insert_backfill_job(
        job_id=job_id,
        status="queued",
        symbols=cleaned,
        from_ts=from_ts,
        to_ts=to_ts,
        progress=progress,
    )
    asyncio.create_task(
        _run_job(job_id, cleaned, from_ts, to_ts),
        name=f"backfill-{job_id}",
    )
    job = get_backfill_job(job_id)
    assert job is not None
    return job


async def _run_job(
    job_id: str,
    symbols: list[str],
    from_ts: datetime,
    to_ts: datetime,
) -> None:
    async with _lock:
        if job_id in _running:
            return
        _running.add(job_id)

    progress: dict[str, Any] = {
        sym: {"status": "queued", "bars": 0, "error": None} for sym in symbols
    }
    update_backfill_job(job_id, status="running", progress=progress, started=True)

    try:
        async with httpx.AsyncClient(
            headers={"User-Agent": "veloz-candles/1.0"}
        ) as client:
            for sym in symbols:
                progress[sym] = {"status": "running", "bars": 0, "error": None}
                update_backfill_job(job_id, progress=progress)
                try:
                    n = await backfill_symbol_range(client, sym, from_ts, to_ts)
                    progress[sym] = {"status": "done", "bars": n, "error": None}
                except Exception as exc:  # noqa: BLE001
                    log.exception("job %s failed for %s", job_id, sym)
                    progress[sym] = {
                        "status": "error",
                        "bars": 0,
                        "error": str(exc),
                    }
                update_backfill_job(job_id, progress=progress)

        any_error = any(p.get("status") == "error" for p in progress.values())
        update_backfill_job(
            job_id,
            status="error" if any_error else "done",
            progress=progress,
            finished=True,
            error="one or more symbols failed" if any_error else None,
        )
    except Exception as exc:  # noqa: BLE001
        log.exception("job %s crashed", job_id)
        update_backfill_job(
            job_id,
            status="error",
            progress=progress,
            error=str(exc),
            finished=True,
        )
    finally:
        _running.discard(job_id)


def get_job(job_id: str) -> dict[str, Any] | None:
    return get_backfill_job(job_id)


def list_jobs(limit: int = 20) -> list[dict[str, Any]]:
    return list_recent_backfill_jobs(limit=limit)
