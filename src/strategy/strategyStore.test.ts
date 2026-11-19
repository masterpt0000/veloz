import { describe, expect, it } from 'vitest'
import {
  createSeedLibrary,
  duplicateStrategy,
  filterAndSortStrategies,
  normalizeTags,
  setStrategyFavorite,
  setStrategyTags,
} from './strategyStore'

describe('strategy tags / favorites / duplicate', () => {
  it('normalizes tags', () => {
    expect(normalizeTags([' RSI ', 'rsi', 'Tendência', '', 1])).toEqual([
      'rsi',
      'tendência',
    ])
  })

  it('duplicates with a new id and name', () => {
    const lib = createSeedLibrary()
    const source = lib.strategies[0]
    const next = duplicateStrategy(lib, source.id, 'Minha cópia')
    const clone = next.strategies.find((s) => s.id === next.activeId)!
    expect(clone.id).not.toBe(source.id)
    expect(clone.name).toBe('Minha cópia')
    expect(clone.favorite).toBe(false)
    expect(clone.code).toBe(source.code)
    expect(next.strategies).toHaveLength(lib.strategies.length + 1)
  })

  it('filters favorites and sorts by name', () => {
    let lib = createSeedLibrary()
    const a = lib.strategies[0]
    const b = lib.strategies[1]
    lib = setStrategyFavorite(lib, a.id, true)
    lib = setStrategyTags(lib, b.id, ['scalp'])

    const favs = filterAndSortStrategies(lib.strategies, {
      favoritesOnly: true,
      sort: 'name',
    })
    expect(favs.every((s) => s.favorite)).toBe(true)
    expect(favs.some((s) => s.id === a.id)).toBe(true)

    const tagged = filterAndSortStrategies(lib.strategies, {
      tag: 'scalp',
      sort: 'recent',
    })
    expect(tagged.map((s) => s.id)).toEqual([b.id])
  })
})
