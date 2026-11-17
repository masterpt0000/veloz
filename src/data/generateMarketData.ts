import type { Bar, SymbolInfo, Timeframe } from '../types'
import { getTimeframeSeconds } from './symbols'
import { fetchCandles, isCandlesApiConfigured } from './candlesApi'

/** Mulberry32 — fast deterministic PRNG for reproducible demo series. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Generate OHLC(+volume) bars offline. No API keys required.
 * Used as demo fallback when `VITE_CANDLES_API_URL` is unset or the API fails.
 */
export function generateMarketData(
  symbol: SymbolInfo,
  timeframe: Timeframe,
  barCount: number,
): Bar[] {
  const rand = mulberry32(symbol.seed + barCount + getTimeframeSeconds(timeframe))
  const step = getTimeframeSeconds(timeframe)
  const end = Math.floor(Date.now() / 1000)
  const alignedEnd = end - (end % step)
  const start = alignedEnd - barCount * step

  const bars: Bar[] = new Array(barCount)
  let price = symbol.basePrice
  const vol = symbol.volatility * Math.sqrt(step / 3600)

  for (let i = 0; i < barCount; i++) {
    // Mild mean reversion + drift so crossovers fire occasionally
    const drift = (symbol.basePrice - price) * 0.0008
    const shock = (rand() - 0.48) * vol * price
    const open = price
    let close = Math.max(0.0001, open + drift + shock)
    const wick = Math.abs(shock) * (0.4 + rand() * 1.4)
    const high = Math.max(open, close) + wick * rand()
    const low = Math.min(open, close) - wick * rand()
    const volume = Math.floor(500 + rand() * 4500 + Math.abs(shock / price) * 80000)
    bars[i] = {
      time: start + i * step,
      open,
      high,
      low,
      close,
      volume,
    }
    price = close
  }

  return bars
}

/**
 * Prefer live candles API when `VITE_CANDLES_API_URL` is set; otherwise null (demo).
 * Symbol ids are passed through as-is (e.g. BTCUSDT once the UI lists Binance pairs).
 */
export async function fetchMarketData(
  symbolId: string,
  timeframe: Timeframe,
  barCount: number,
): Promise<Bar[] | null> {
  if (!isCandlesApiConfigured()) return null
  const page = await fetchCandles({
    symbol: symbolId,
    timeframe,
    limit: Math.min(barCount, 50_000),
  })
  if (!page || page.bars.length === 0) return null
  return page.bars
}
