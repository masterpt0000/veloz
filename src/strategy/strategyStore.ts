import { SAMPLE_STRATEGY_CODE } from './sampleStrategy'

const STORAGE_KEY = 'veloz.strategies.v1'

export interface SavedStrategy {
  id: string
  name: string
  code: string
  updatedAt: number
}

export interface StrategyLibrary {
  activeId: string
  strategies: SavedStrategy[]
}

const BLANK_TEMPLATE = `/**
 * Nova estratégia Veloz
 * Devolve { signals, indicators? } — ver comentários na amostra SMA.
 */
export function strategy(bars) {
  const signals = [];
  // TODO: gerar sinais a partir de bars
  void bars;
  return { signals, indicators: [] };
}
`

function uid(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function createSeedLibrary(): StrategyLibrary {
  const id = uid()
  return {
    activeId: id,
    strategies: [
      {
        id,
        name: 'SMA + RSI (amostra)',
        code: SAMPLE_STRATEGY_CODE,
        updatedAt: Date.now(),
      },
    ],
  }
}

export function loadLibrary(): StrategyLibrary {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createSeedLibrary()
    const parsed = JSON.parse(raw) as StrategyLibrary
    if (
      !parsed ||
      !Array.isArray(parsed.strategies) ||
      parsed.strategies.length === 0
    ) {
      return createSeedLibrary()
    }
    const activeId =
      parsed.strategies.some((s) => s.id === parsed.activeId)
        ? parsed.activeId
        : parsed.strategies[0].id
    return { activeId, strategies: parsed.strategies }
  } catch {
    return createSeedLibrary()
  }
}

export function saveLibrary(library: StrategyLibrary): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(library))
  } catch {
    /* quota / private mode — ignore */
  }
}

export function getActive(library: StrategyLibrary): SavedStrategy {
  return (
    library.strategies.find((s) => s.id === library.activeId) ??
    library.strategies[0]
  )
}

export function selectStrategy(
  library: StrategyLibrary,
  id: string,
): StrategyLibrary {
  if (!library.strategies.some((s) => s.id === id)) return library
  return { ...library, activeId: id }
}

export function updateActiveCode(
  library: StrategyLibrary,
  code: string,
): StrategyLibrary {
  return {
    ...library,
    strategies: library.strategies.map((s) =>
      s.id === library.activeId
        ? { ...s, code, updatedAt: Date.now() }
        : s,
    ),
  }
}

export function createStrategy(
  library: StrategyLibrary,
  name: string,
  fromSample = false,
): StrategyLibrary {
  const id = uid()
  const trimmed = name.trim() || 'Nova estratégia'
  const next: SavedStrategy = {
    id,
    name: trimmed,
    code: fromSample ? SAMPLE_STRATEGY_CODE : BLANK_TEMPLATE,
    updatedAt: Date.now(),
  }
  return {
    activeId: id,
    strategies: [...library.strategies, next],
  }
}

export function renameStrategy(
  library: StrategyLibrary,
  id: string,
  name: string,
): StrategyLibrary {
  const trimmed = name.trim()
  if (!trimmed) return library
  return {
    ...library,
    strategies: library.strategies.map((s) =>
      s.id === id ? { ...s, name: trimmed, updatedAt: Date.now() } : s,
    ),
  }
}

export function deleteStrategy(
  library: StrategyLibrary,
  id: string,
): StrategyLibrary {
  if (library.strategies.length <= 1) return library
  const strategies = library.strategies.filter((s) => s.id !== id)
  const activeId =
    library.activeId === id ? strategies[0].id : library.activeId
  return { activeId, strategies }
}
