import { describe, expect, it } from 'vitest'
import { makeFixtureBars } from '../test/fixtures/bars'
import { RCI_DCA_DEFAULT_PARAMS, simulateRciDca } from './rciDcaEngine'

describe('simulateRciDca (regression)', () => {
  const bars = makeFixtureBars(500)

  it('is deterministic with default params', () => {
    const a = simulateRciDca(bars, RCI_DCA_DEFAULT_PARAMS, 10_000)
    const b = simulateRciDca(bars, RCI_DCA_DEFAULT_PARAMS, 10_000)
    expect(a.metrics).toEqual(b.metrics)
    expect(a.trades).toEqual(b.trades)
    expect(a.barCount).toBe(500)
  })

  it('returns indicators including RCI series', () => {
    const result = simulateRciDca(bars, RCI_DCA_DEFAULT_PARAMS, 10_000)
    expect(result.indicators.length).toBeGreaterThan(0)
    expect(result.equity.length).toBeGreaterThan(0)
  })
})
