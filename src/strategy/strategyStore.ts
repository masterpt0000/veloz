import type { BuiltinEngine } from '../types'
import {
  BUILDER_STUB_CODE,
  defaultBuilderSpec,
  normalizeBuilderSpec,
  type VelozBuilderSpec,
} from './builderSpec'
import {
  RCI_DCA_DEFAULT_PARAMS,
  RCI_DCA_STRATEGY_CODE,
  type RciDcaParams,
} from './rciDcaEngine'
import { SAMPLE_STRATEGY_CODE } from './sampleStrategy'
import {
  compileSimpleStrategyCode,
  defaultSimpleConfig,
  normalizeSimpleConfig,
  type SimpleStrategyConfig,
  type StrategyEditMode,
} from './simpleStrategy'
import { ensureTemplateStrategies } from './strategyTemplates'

const STORAGE_KEY = 'veloz.strategies.v1'

export interface SavedStrategy {
  id: string
  name: string
  code: string
  updatedAt: number
  /** Editor mode: simple (forms) or advanced (code). */
  mode: StrategyEditMode
  /** No-code builder config; kept even in advanced mode. */
  simpleConfig: SimpleStrategyConfig
  /** Builtin engine (ported Python / backtest builder); undefined = user JS. */
  engine?: BuiltinEngine
  /** Params for builtin RCI+DCA engine. */
  rciDcaParams?: Partial<RciDcaParams>
  /** Spec for builtin chart-builder engine (backtest-inspired). */
  builderSpec?: VelozBuilderSpec
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

function makeRciDcaStrategy(): SavedStrategy {
  return {
    id: uid(),
    name: 'RCI + DCA (Python)',
    code: RCI_DCA_STRATEGY_CODE,
    updatedAt: Date.now(),
    mode: 'advanced',
    simpleConfig: defaultSimpleConfig(),
    engine: 'rci_dca',
    rciDcaParams: { ...RCI_DCA_DEFAULT_PARAMS },
  }
}

function makeBuilderStrategy(): SavedStrategy {
  const spec = defaultBuilderSpec('EMA cross (builder)')
  return {
    id: uid(),
    name: spec.name,
    code: BUILDER_STUB_CODE,
    updatedAt: Date.now(),
    mode: 'advanced',
    simpleConfig: defaultSimpleConfig(),
    engine: 'builder',
    builderSpec: spec,
  }
}

function migrateStrategy(raw: Partial<SavedStrategy> & { id: string; name: string; code: string }): SavedStrategy {
  const simpleConfig = normalizeSimpleConfig(raw.simpleConfig)
  const mode: StrategyEditMode =
    raw.mode === 'simple' || raw.mode === 'advanced' ? raw.mode : 'advanced'
  const engine: BuiltinEngine | undefined =
    raw.engine === 'rci_dca' || raw.engine === 'builder' ? raw.engine : undefined
  return {
    id: raw.id,
    name: raw.name,
    code: typeof raw.code === 'string' ? raw.code : BLANK_TEMPLATE,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    mode,
    simpleConfig,
    engine,
    rciDcaParams:
      engine === 'rci_dca'
        ? { ...RCI_DCA_DEFAULT_PARAMS, ...(raw.rciDcaParams ?? {}) }
        : raw.rciDcaParams,
    builderSpec:
      engine === 'builder'
        ? normalizeBuilderSpec(raw.builderSpec ?? defaultBuilderSpec(raw.name))
        : raw.builderSpec
          ? normalizeBuilderSpec(raw.builderSpec)
          : undefined,
  }
}

export function createSeedLibrary(): StrategyLibrary {
  const id = uid()
  const simpleConfig = defaultSimpleConfig()
  const rci = makeRciDcaStrategy()
  const builder = makeBuilderStrategy()
  const strategies = ensureTemplateStrategies([
    {
      id,
      name: 'SMA + RSI (amostra)',
      code: SAMPLE_STRATEGY_CODE,
      updatedAt: Date.now(),
      mode: 'advanced',
      simpleConfig,
    },
    rci,
    builder,
  ])
  return {
    activeId: builder.id,
    strategies,
  }
}

/** Ensure existing libraries get the imported RCI+DCA strategy once. */
export function ensureRciDcaStrategy(library: StrategyLibrary): StrategyLibrary {
  if (library.strategies.some((s) => s.engine === 'rci_dca')) return library
  const rci = makeRciDcaStrategy()
  return {
    ...library,
    strategies: [...library.strategies, rci],
  }
}

export function ensureBuilderStrategy(library: StrategyLibrary): StrategyLibrary {
  if (library.strategies.some((s) => s.engine === 'builder')) return library
  const builder = makeBuilderStrategy()
  return {
    ...library,
    strategies: [...library.strategies, builder],
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
    const strategies = parsed.strategies
      .filter((s) => s && typeof s.id === 'string' && typeof s.name === 'string')
      .map((s) => migrateStrategy(s as SavedStrategy))
    if (!strategies.length) return createSeedLibrary()
    const withExtras = ensureBuilderStrategy(
      ensureRciDcaStrategy({
        activeId: parsed.activeId,
        strategies,
      }),
    )
    const withTemplates = {
      ...withExtras,
      strategies: ensureTemplateStrategies(withExtras.strategies),
    }
    const activeId =
      withTemplates.strategies.some((s) => s.id === parsed.activeId)
        ? parsed.activeId
        : withTemplates.strategies[0].id
    return { activeId, strategies: withTemplates.strategies }
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

export function updateActiveMode(
  library: StrategyLibrary,
  mode: StrategyEditMode,
): StrategyLibrary {
  return {
    ...library,
    strategies: library.strategies.map((s) => {
      if (s.id !== library.activeId) return s
      // When entering advanced from simple, keep code in sync with builder.
      if (mode === 'advanced' && s.mode === 'simple') {
        return {
          ...s,
          mode,
          code: compileSimpleStrategyCode(s.simpleConfig),
          updatedAt: Date.now(),
        }
      }
      return { ...s, mode, updatedAt: Date.now() }
    }),
  }
}

export function updateActiveSimpleConfig(
  library: StrategyLibrary,
  simpleConfig: SimpleStrategyConfig,
): StrategyLibrary {
  const normalized = normalizeSimpleConfig(simpleConfig)
  const code = compileSimpleStrategyCode(normalized)
  return {
    ...library,
    strategies: library.strategies.map((s) =>
      s.id === library.activeId
        ? {
            ...s,
            simpleConfig: normalized,
            // Keep generated code fresh so backtest / advanced stay aligned.
            code: s.mode === 'simple' ? code : s.code,
            updatedAt: Date.now(),
          }
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
  const simpleConfig = defaultSimpleConfig()
  const next: SavedStrategy = fromSample
    ? {
        id,
        name: trimmed,
        code: SAMPLE_STRATEGY_CODE,
        updatedAt: Date.now(),
        mode: 'advanced',
        simpleConfig,
      }
    : {
        id,
        name: trimmed,
        code: BUILDER_STUB_CODE,
        updatedAt: Date.now(),
        mode: 'advanced',
        simpleConfig,
        engine: 'builder',
        builderSpec: defaultBuilderSpec(trimmed),
      }
  return {
    activeId: id,
    strategies: [...library.strategies, next],
  }
}

export function updateActiveBuilderSpec(
  library: StrategyLibrary,
  builderSpec: VelozBuilderSpec,
): StrategyLibrary {
  const normalized = normalizeBuilderSpec(builderSpec)
  return {
    ...library,
    strategies: library.strategies.map((s) =>
      s.id === library.activeId
        ? {
            ...s,
            name: normalized.name || s.name,
            engine: 'builder',
            builderSpec: normalized,
            code: BUILDER_STUB_CODE,
            updatedAt: Date.now(),
          }
        : s,
    ),
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

/** Insert an imported / template strategy and make it active. */
export function addStrategy(
  library: StrategyLibrary,
  strategy: SavedStrategy,
): StrategyLibrary {
  return {
    activeId: strategy.id,
    strategies: [...library.strategies, strategy],
  }
}

/** Code to send to the backtest worker for the active strategy. */
export function resolveRunCode(strategy: SavedStrategy): string {
  if (strategy.engine === 'rci_dca') return RCI_DCA_STRATEGY_CODE
  if (strategy.engine === 'builder') return BUILDER_STUB_CODE
  if (strategy.mode === 'simple') {
    return compileSimpleStrategyCode(strategy.simpleConfig)
  }
  return strategy.code
}
