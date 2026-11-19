import { describe, expect, it } from 'vitest'
import type { Bar, Signal } from '../types'
import {
  buildEquityCurve,
  computeMetrics,
  signalsToTrades,
} from './metrics'

function barsOf(closes: number[]): Bar[] {
  return closes.map((close, i) => ({
    time: 1_000 + i,
    open: close,
    high: close + 0.1,
    low: close - 0.1,
    close,
    volume: 1,
  }))
}

describe('metrics helpers (regression)', () => {
  it('pairs buy/sell into a long trade', () => {
    const bars = barsOf([10, 11, 12, 13, 14])
    const signals: Signal[] = [
      { time: 1_001, side: 'buy' },
      { time: 1_003, side: 'sell' },
    ]
    const trades = signalsToTrades(bars, signals)
    expect(trades).toHaveLength(1)
    expect(trades[0].side).toBe('long')
    expect(trades[0].entryPrice).toBe(11)
    expect(trades[0].exitPrice).toBe(13)
    expect(trades[0].pnlPct).toBeCloseTo((2 / 11) * 100, 6)
  })

  it('equity and metrics are deterministic', () => {
    const bars = barsOf([100, 101, 102, 103, 104, 105])
    const signals: Signal[] = [
      { time: 1_001, side: 'buy' },
      { time: 1_004, side: 'sell' },
    ]
    const trades = signalsToTrades(bars, signals)
    const equity = buildEquityCurve(bars, trades, 10_000)
    const metrics = computeMetrics(equity, trades, 10_000)

    expect(equity[0].equity).toBe(10_000)
    expect(metrics.tradeCount).toBe(1)
    expect(metrics.totalReturnPct).toBeCloseTo(
      ((metrics.finalEquity - 10_000) / 10_000) * 100,
      6,
    )
    expect(metrics).toEqual(
      computeMetrics(buildEquityCurve(bars, trades, 10_000), trades, 10_000),
    )
  })
})
