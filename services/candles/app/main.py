"""HTTP API for Veloz candles + optional Binance ingest worker."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Annotated, Literal

import uvicorn
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import settings
from .db import TIMEFRAME_INTERVALS, close_pool, query_candles, wait_for_db
from .ingest import ingest_loop

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
    market: str


_stop_ingest: asyncio.Event | None = None
_ingest_task: asyncio.Task[None] | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _stop_ingest, _ingest_task
    wait_for_db()
    log.info("database ready")
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


app = FastAPI(title="Veloz Candles API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def require_api_key(
    x_api_key: Annotated[str | None, Header()] = None,
) -> None:
    expected = settings.candles_api_key.strip()
    if not expected:
        return
    if x_api_key != expected:
        raise HTTPException(status_code=401, detail="invalid or missing X-API-Key")


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    db_status = "ok"
    try:
        wait_for_db(retries=1, delay_s=0.1)
    except Exception as exc:  # noqa: BLE001
        db_status = f"error: {exc}"
    return HealthResponse(
        status="ok" if db_status == "ok" else "degraded",
        database=db_status,
        symbols=settings.symbols,
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


def main() -> None:
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
