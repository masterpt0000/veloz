"""HTTP API for Veloz candles + optional Binance ingest worker."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Annotated, Literal

import uvicorn
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .config import settings
from .daily_sync import run_daily_sync
from .db import (
    TIMEFRAME_INTERVALS,
    close_pool,
    ensure_schema,
    list_symbol_coverage,
    query_candles,
    wait_for_db,
)
from .ingest import ingest_loop
from .jobs import enqueue_backfill, get_job, list_jobs

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("candles.api")

Timeframe = Literal["1m", "5m", "15m", "1h", "4h", "1D"]


class CandleBar(BaseModel):
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: float


class CandlesResponse(BaseModel):
    symbol: str
    timeframe: str
    bars: list[CandleBar]
    nextBefore: int | None = None
    hasMore: bool = False


class HealthResponse(BaseModel):
    status: str
    database: str
    symbols: list[str]
    dbSymbols: list[str] = Field(default_factory=list)
    market: str


class SymbolCoverage(BaseModel):
    symbol: str
    minTs: str | None = None
    maxTs: str | None = None
    minTime: int | None = None
    maxTime: int | None = None
    barCount: int


class SymbolsResponse(BaseModel):
    symbols: list[SymbolCoverage]


class BackfillRequest(BaseModel):
    model_config = {"populate_by_name": True}

    symbols: list[str] = Field(min_length=1)
    from_: str | None = Field(default=None, alias="from")
    to: str | None = None


class SymbolProgress(BaseModel):
    status: str
    bars: int = 0
    error: str | None = None


class BackfillJobResponse(BaseModel):
    model_config = {"populate_by_name": True}

    id: str
    status: str
    symbols: list[str]
    from_: str | None = Field(default=None, alias="from")
    to: str | None = None
    progress: dict[str, SymbolProgress]
    error: str | None = None
    createdAt: str | None = None
    startedAt: str | None = None
    finishedAt: str | None = None


class DailySyncResponse(BaseModel):
    ok: bool
    results: dict[str, int | str]


_stop_ingest: asyncio.Event | None = None
_ingest_task: asyncio.Task[None] | None = None


def _job_to_response(job: dict) -> BackfillJobResponse:
    progress: dict[str, SymbolProgress] = {}
    raw_progress = job.get("progress") or {}
    for sym, info in raw_progress.items():
        if isinstance(info, dict):
            progress[sym] = SymbolProgress(
                status=str(info.get("status", "unknown")),
                bars=int(info.get("bars") or 0),
                error=info.get("error"),
            )
        else:
            progress[sym] = SymbolProgress(status="unknown")
    return BackfillJobResponse.model_validate(
        {
            "id": job["id"],
            "status": job["status"],
            "symbols": job["symbols"],
            "from": job.get("from"),
            "to": job.get("to"),
            "progress": progress,
            "error": job.get("error"),
            "createdAt": job.get("createdAt"),
            "startedAt": job.get("startedAt"),
            "finishedAt": job.get("finishedAt"),
        }
    )


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _stop_ingest, _ingest_task
    wait_for_db()
    ensure_schema()
    log.info("database ready")
    if settings.api_auth_enabled:
        log.info("API auth enabled (X-API-Key required)")
    else:
        log.info("API auth disabled (open LAN — CANDLES_API_KEY empty)")
    log.info("CORS origins: %s", settings.cors_origins)
    if settings.run_ingest:
        _stop_ingest = asyncio.Event()
        _ingest_task = asyncio.create_task(ingest_loop(_stop_ingest))
    yield
    if _stop_ingest is not None:
        _stop_ingest.set()
    if _ingest_task is not None:
        try:
            await asyncio.wait_for(_ingest_task, timeout=10)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            _ingest_task.cancel()
    close_pool()


app = FastAPI(title="Veloz Candles API", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Accept", "Content-Type", "X-API-Key"],
)


def require_api_key(
    x_api_key: Annotated[str | None, Header()] = None,
) -> None:
    """When CANDLES_API_KEY is set, require matching X-API-Key. Empty key = open LAN."""
    if not settings.api_auth_enabled:
        return
    expected = settings.candles_api_key
    if not x_api_key or x_api_key != expected:
        raise HTTPException(status_code=401, detail="invalid or missing X-API-Key")


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    db_status = "ok"
    db_symbols: list[str] = []
    try:
        wait_for_db(retries=1, delay_s=0.1)
        coverage = list_symbol_coverage()
        db_symbols = [c["symbol"] for c in coverage]
    except Exception as exc:  # noqa: BLE001
        db_status = f"error: {exc}"
    return HealthResponse(
        status="ok" if db_status == "ok" else "degraded",
        database=db_status,
        symbols=settings.symbols,
        dbSymbols=db_symbols,
        market=settings.binance_market,
    )


def _candles_handler(
    symbol: str,
    timeframe: Timeframe,
    from_: int | None,
    to: int | None,
    before: int | None,
    limit: int,
) -> CandlesResponse:
    if timeframe not in TIMEFRAME_INTERVALS:
        raise HTTPException(status_code=400, detail=f"unsupported timeframe: {timeframe}")
    if from_ is not None and to is not None and from_ >= to:
        raise HTTPException(status_code=400, detail="from must be < to")
    if before is not None and from_ is not None:
        raise HTTPException(status_code=400, detail="use either before or from, not both")

    hard_limit = min(max(1, limit), settings.max_bars_per_request)
    # Fetch one extra to detect hasMore when paging backward / newest window
    fetch_limit = hard_limit + 1
    rows = query_candles(
        symbol=symbol.upper(),
        timeframe=timeframe,
        from_ts=from_,
        to_ts=to,
        before_ts=before,
        limit=fetch_limit,
    )
    has_more = len(rows) > hard_limit
    if has_more:
        if from_ is None:
            # Newest-first page: drop the oldest extra
            rows = rows[-hard_limit:]
        else:
            rows = rows[:hard_limit]

    next_before: int | None = None
    if rows and has_more:
        next_before = rows[0]["time"]

    return CandlesResponse(
        symbol=symbol.upper(),
        timeframe=timeframe,
        bars=[CandleBar(**r) for r in rows],
        nextBefore=next_before,
        hasMore=has_more,
    )


@app.get("/candles", response_model=CandlesResponse)
@app.get("/v1/candles", response_model=CandlesResponse)
def get_candles(
    _: Annotated[None, Depends(require_api_key)],
    symbol: Annotated[str, Query(min_length=1, max_length=32)],
    timeframe: Annotated[Timeframe, Query()] = "1m",
    from_: Annotated[int | None, Query(alias="from")] = None,
    to: Annotated[int | None, Query()] = None,
    before: Annotated[int | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=50_000)] = 5_000,
) -> CandlesResponse:
    return _candles_handler(symbol, timeframe, from_, to, before, limit)


@app.get("/symbols", response_model=SymbolsResponse)
@app.get("/v1/symbols", response_model=SymbolsResponse)
def get_symbols(
    _: Annotated[None, Depends(require_api_key)],
) -> SymbolsResponse:
    rows = list_symbol_coverage()
    return SymbolsResponse(symbols=[SymbolCoverage(**r) for r in rows])


@app.post("/backfill", response_model=BackfillJobResponse)
@app.post("/v1/backfill", response_model=BackfillJobResponse)
async def post_backfill(
    body: BackfillRequest,
    _: Annotated[None, Depends(require_api_key)],
) -> BackfillJobResponse:
    try:
        job = await enqueue_backfill(
            symbols=body.symbols,
            from_iso=body.from_,
            to_iso=body.to,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _job_to_response(job)


@app.get("/backfill/{job_id}", response_model=BackfillJobResponse)
@app.get("/v1/backfill/{job_id}", response_model=BackfillJobResponse)
def get_backfill_job(
    job_id: str,
    _: Annotated[None, Depends(require_api_key)],
) -> BackfillJobResponse:
    job = get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return _job_to_response(job)


@app.get("/backfill", response_model=list[BackfillJobResponse])
@app.get("/v1/backfill", response_model=list[BackfillJobResponse])
def list_backfill_jobs(
    _: Annotated[None, Depends(require_api_key)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[BackfillJobResponse]:
    return [_job_to_response(j) for j in list_jobs(limit=limit)]


@app.post("/daily-sync", response_model=DailySyncResponse)
@app.post("/v1/daily-sync", response_model=DailySyncResponse)
async def post_daily_sync(
    _: Annotated[None, Depends(require_api_key)],
) -> DailySyncResponse:
    """Scheduler-friendly: fill yesterday's 1m gaps for every symbol already in DB."""
    results = await run_daily_sync()
    failed = any(
        isinstance(v, str) and v.startswith("error:") for v in results.values()
    )
    return DailySyncResponse(ok=not failed, results=results)


def main() -> None:
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
