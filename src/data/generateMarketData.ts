import type { Bar, SymbolInfo, Timeframe } from '../types'
import { getTimeframeSeconds } from './symbols'

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
 * Optional hook: swap this module for a real feed later (see fetchMarketData stub).
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

/** Placeholder for a future real-data adapter. */
export async function fetchMarketData(
  _symbolId: string,
  _timeframe: Timeframe,
  _barCount: number,
): Promise<Bar[] | null> {
  // Wire an exchange/HTTP API here when keys exist. Return null to keep sample data.
  return null
}
