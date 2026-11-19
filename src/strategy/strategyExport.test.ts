import { describe, expect, it } from 'vitest'
import {
  parseStrategyJson,
  strategyToJson,
  STRATEGY_EXPORT_KIND,
} from './strategyExport'
import { STRATEGY_TEMPLATES } from './strategyTemplates'

describe('strategy export/import', () => {
  it('round-trips a builder template', () => {
    const created = {
      ...STRATEGY_TEMPLATES[0].build(),
      tags: ['tendência', 'sma'],
      favorite: true,
    }
    const json = strategyToJson(created)
    const back = parseStrategyJson(json)
    expect(back.name).toBe(created.name)
    expect(back.engine).toBe('builder')
    expect(back.tags).toEqual(['tendência', 'sma'])
    expect(back.favorite).toBe(true)
    expect(back.builderSpec?.indicators.map((i) => i.kind)).toEqual(
      created.builderSpec?.indicators.map((i) => i.kind),
    )
    expect(JSON.parse(json).kind).toBe(STRATEGY_EXPORT_KIND)
  })

  it('accepts bare builderSpec JSON', () => {
    const spec = STRATEGY_TEMPLATES[1].build().builderSpec!
    const back = parseStrategyJson(JSON.stringify(spec))
    expect(back.engine).toBe('builder')
    expect(back.name).toBe(spec.name)
  })
})
