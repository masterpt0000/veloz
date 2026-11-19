import { describe, expect, it } from 'vitest'
import { makeFixtureBars } from '../test/fixtures/bars'
import { templateSmaCross, templateRsiMeanReversion } from './strategyTemplates'
import { runBuilderSpec } from './builderEngine'
import { defaultBuilderSpec } from './builderSpec'

describe('runBuilderSpec (regression)', () => {
  const bars = makeFixtureBars(400)

  it('is deterministic for SMA cross template', () => {
    const spec = templateSmaCross()
    const a = runBuilderSpec(bars, spec, 10_000)
    const b = runBuilderSpec(bars, spec, 10_000)

    expect(a.metrics).toEqual(b.metrics)
    expect(a.trades).toEqual(b.trades)
    expect(a.signals).toEqual(b.signals)
    expect(a.barCount).toBe(400)
    expect(a.trades.length).toBeGreaterThan(0)
    expect(a.equity.length).toBeGreaterThan(0)
  })

  it('matches snapshot metrics for SMA cross fixture', () => {
    const result = runBuilderSpec(bars, templateSmaCross(), 10_000)
    expect({
      tradeCount: result.metrics.tradeCount,
      totalReturnPct: Number(result.metrics.totalReturnPct.toFixed(6)),
      maxDrawdownPct: Number(result.metrics.maxDrawdownPct.toFixed(6)),
      winRatePct: Number(result.metrics.winRatePct.toFixed(6)),
      finalEquity: Number(result.metrics.finalEquity.toFixed(6)),
      signalCount: result.signals.length,
    }).toMatchInlineSnapshot(`
      {
        "finalEquity": 6964.822267,
        "maxDrawdownPct": 30.40169,
        "signalCount": 14,
        "totalReturnPct": -30.351777,
        "tradeCount": 7,
        "winRatePct": 0,
      }
    `)
  })

  it('RSI mean-reversion produces trades on fixture', () => {
    const result = runBuilderSpec(bars, templateRsiMeanReversion(), 10_000)
    expect(result.metrics.tradeCount).toBeGreaterThan(0)
    expect(result.indicators.some((i) => i.title.includes('RSI'))).toBe(true)
  })

  it('default EMA cross builder spec runs without throwing', () => {
    const result = runBuilderSpec(bars, defaultBuilderSpec(), 10_000)
    expect(result.barCount).toBe(400)
    expect(Array.isArray(result.trades)).toBe(true)
  })
})
