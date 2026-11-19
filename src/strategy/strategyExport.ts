/**
 * Share / export / import strategies as portable JSON.
 */

import {
  BUILDER_STUB_CODE,
  normalizeBuilderSpec,
  type VelozBuilderSpec,
} from './builderSpec'
import {
  RCI_DCA_DEFAULT_PARAMS,
  RCI_DCA_STRATEGY_CODE,
  type RciDcaParams,
} from './rciDcaEngine'
import {
  defaultSimpleConfig,
  normalizeSimpleConfig,
  type SimpleStrategyConfig,
  type StrategyEditMode,
} from './simpleStrategy'
import type { BuiltinEngine } from '../types'
import type { SavedStrategy } from './strategyStore'

export const STRATEGY_EXPORT_VERSION = 1 as const
export const STRATEGY_EXPORT_KIND = 'veloz.strategy' as const

export interface StrategyExportPayload {
  kind: typeof STRATEGY_EXPORT_KIND
  version: typeof STRATEGY_EXPORT_VERSION
  exportedAt: number
  strategy: {
    name: string
    code: string
    mode: StrategyEditMode
    simpleConfig: SimpleStrategyConfig
    engine?: BuiltinEngine
    rciDcaParams?: Partial<RciDcaParams>
    builderSpec?: VelozBuilderSpec
  }
}

function uid(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** Build a portable JSON object from a saved strategy (no local id). */
export function toExportPayload(strategy: SavedStrategy): StrategyExportPayload {
  return {
    kind: STRATEGY_EXPORT_KIND,
    version: STRATEGY_EXPORT_VERSION,
    exportedAt: Date.now(),
    strategy: {
      name: strategy.name,
      code: strategy.code,
      mode: strategy.mode,
      simpleConfig: strategy.simpleConfig,
      engine: strategy.engine,
      rciDcaParams: strategy.rciDcaParams,
      builderSpec: strategy.builderSpec,
    },
  }
}

export function strategyToJson(strategy: SavedStrategy): string {
  return JSON.stringify(toExportPayload(strategy), null, 2)
}

export function parseStrategyImport(raw: unknown): SavedStrategy {
  if (!raw || typeof raw !== 'object') {
    throw new Error('JSON inválido: objeto esperado')
  }
  const o = raw as Record<string, unknown>

  // Full envelope
  if (o.kind === STRATEGY_EXPORT_KIND || o.strategy) {
    const version = o.version
    if (version != null && version !== 1) {
      throw new Error(`Versão de exportação não suportada: ${String(version)}`)
    }
    const s = (o.strategy ?? o) as Record<string, unknown>
    return hydrateImported(s)
  }

  // Bare SavedStrategy-like or builder-only spec
  if (typeof o.name === 'string' && (o.code != null || o.builderSpec || o.engine)) {
    return hydrateImported(o)
  }

  // Bare VelozBuilderSpec (version:1 + indicators + rules)
  if (o.version === 1 && Array.isArray(o.indicators) && o.rules) {
    const spec = normalizeBuilderSpec(o)
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

  throw new Error(
    'Formato não reconhecido. Use um export Veloz (veloz.strategy) ou um builderSpec.',
  )
}

function hydrateImported(s: Record<string, unknown>): SavedStrategy {
  const name =
    typeof s.name === 'string' && s.name.trim() ? s.name.trim() : 'Estratégia importada'
  const mode: StrategyEditMode =
    s.mode === 'simple' || s.mode === 'advanced' ? s.mode : 'advanced'
  const engine: BuiltinEngine | undefined =
    s.engine === 'rci_dca' || s.engine === 'builder' ? s.engine : undefined
  const simpleConfig = normalizeSimpleConfig(s.simpleConfig)
  let code = typeof s.code === 'string' ? s.code : ''
  let builderSpec =
    s.builderSpec != null ? normalizeBuilderSpec(s.builderSpec) : undefined
  let rciDcaParams =
    s.rciDcaParams && typeof s.rciDcaParams === 'object'
      ? (s.rciDcaParams as Partial<RciDcaParams>)
      : undefined

  if (engine === 'builder') {
    builderSpec = normalizeBuilderSpec(builderSpec ?? { name })
    code = BUILDER_STUB_CODE
  } else if (engine === 'rci_dca') {
    rciDcaParams = { ...RCI_DCA_DEFAULT_PARAMS, ...(rciDcaParams ?? {}) }
    code = RCI_DCA_STRATEGY_CODE
  } else if (!code) {
    throw new Error('Importação sem código nem motor builtin')
  }

  return {
    id: uid(),
    name,
    code,
    updatedAt: Date.now(),
    mode,
    simpleConfig,
    engine,
    rciDcaParams,
    builderSpec,
  }
}

export function parseStrategyJson(text: string): SavedStrategy {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('JSON inválido — não foi possível analisar o texto')
  }
  return parseStrategyImport(parsed)
}

export function downloadStrategyJson(strategy: SavedStrategy): void {
  const json = strategyToJson(strategy)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safe = strategy.name
    .replace(/[^\w\-àáâãäåæçèéêëìíîïñòóôõöùúûüýÿ]+/gi, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60)
  a.href = url
  a.download = `${safe || 'estrategia'}.veloz.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function copyStrategyJson(strategy: SavedStrategy): Promise<void> {
  const json = strategyToJson(strategy)
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(json)
    return
  }
  // Fallback
  const ta = document.createElement('textarea')
  ta.value = json
  ta.style.position = 'fixed'
  ta.style.left = '-9999px'
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  document.body.removeChild(ta)
}
