import type { Bar } from '../../types'

/** Deterministic synthetic OHLC for regression fixtures (no Math.random). */
export function makeFixtureBars(
  count: number,
  opts?: { start?: number; base?: number; step?: number },
): Bar[] {
  const start = opts?.start ?? 1_700_000_000
  const base = opts?.base ?? 100
  const step = opts?.step ?? 3600
  const bars: Bar[] = new Array(count)
  let price = base
  for (let i = 0; i < count; i++) {
    // Slow sine + mild trend — enough for SMA crosses / RSI swings
    const wave = Math.sin(i / 8) * 3 + Math.sin(i / 23) * 1.5
    const trend = (i / count) * 4
    const open = price
    const close = base + wave + trend
    const high = Math.max(open, close) + 0.4
    const low = Math.min(open, close) - 0.4
    bars[i] = {
      time: start + i * step,
      open,
      high,
      low,
      close,
      volume: 1000 + (i % 50) * 10,
    }
    price = close
  }
  return bars
}
