/**
 * Veloz strategy builder — adapted from masterpt0000/backtest ChartBuilderSpecV1.
 * Keeps indicators + rule expressions + risk; omits TA-Lib/feat/MTF for speed.
 */

export type BuilderIndicatorKind = 'sma' | 'ema' | 'rsi' | 'macd' | 'bb'

export interface BuilderIndicator {
  id: string
  label: string
  kind: BuilderIndicatorKind
  period: number
  /** MACD */
  fastPeriod: number
  slowPeriod: number
  signalPeriod: number
  /** Bollinger mult */
  mult: number
  visible: boolean
  color: string
}

export type BuilderOp =
  | 'cross_up'
  | 'cross_down'
  | 'gt'
  | 'lt'
  | 'ge'
  | 'le'

export type BuilderOperand =
  | { type: 'close' }
  | { type: 'constant'; value: number }
  | {
      type: 'indicator'
      ref: string
      /** MACD: main|signal|hist; BB: upper|mid|lower */
      output?: 'main' | 'signal' | 'hist' | 'upper' | 'mid' | 'lower'
    }

export interface BuilderCondition {
  left: BuilderOperand
  right: BuilderOperand
  op: BuilderOp
}

/** all = AND, any = OR between atoms (flat for UI; nested not required in v1). */
export interface BuilderExpr {
  join: 'and' | 'or'
  parts: BuilderCondition[]
}

export interface BuilderRules {
  long: BuilderExpr | null
  short: BuilderExpr | null
  exitLong: BuilderExpr | null
  exitShort: BuilderExpr | null
  /** Optional free-text if-lines (backtest-style); when set, override structured expr. */
  longIf: string | null
  shortIf: string | null
  exitLongIf: string | null
  exitShortIf: string | null
}

export interface BuilderRisk {
  takeProfitPct: number
  stopLossPct: number
  trailingStopPct: number
}

export interface VelozBuilderSpec {
  version: 1
  name: string
  indicators: BuilderIndicator[]
  rules: BuilderRules
  risk: BuilderRisk
}

export const BUILDER_OP_LABELS: Record<BuilderOp, string> = {
  cross_up: 'Cruza acima',
  cross_down: 'Cruza abaixo',
  gt: '>',
  lt: '<',
  ge: '≥',
  le: '≤',
}

export const BUILDER_KIND_LABELS: Record<BuilderIndicatorKind, string> = {
  sma: 'SMA',
  ema: 'EMA',
  rsi: 'RSI',
  macd: 'MACD',
  bb: 'Bollinger',
}

const COLORS = ['#0369a1', '#d97706', '#7c3aed', '#0f766e', '#c2410c', '#2563eb']

let seq = 0
export function newBuilderIndId(kind: BuilderIndicatorKind): string {
  seq += 1
  return `${kind}_${Date.now().toString(36)}_${seq}`
}

export function defaultBuilderIndicator(
  kind: BuilderIndicatorKind,
  overrides: Partial<BuilderIndicator> = {},
): BuilderIndicator {
  const id = overrides.id ?? newBuilderIndId(kind)
  const period =
    overrides.period ??
    (kind === 'rsi' ? 14 : kind === 'ema' ? 21 : kind === 'sma' ? 20 : 20)
  return {
    id,
    label: overrides.label ?? `${kind.toUpperCase()} ${kind === 'macd' ? '12/26/9' : period}`,
    kind,
    period,
    fastPeriod: overrides.fastPeriod ?? 12,
    slowPeriod: overrides.slowPeriod ?? 26,
    signalPeriod: overrides.signalPeriod ?? 9,
    mult: overrides.mult ?? 2,
    visible: overrides.visible !== false,
    color: overrides.color ?? COLORS[seq % COLORS.length],
  }
}

function emptyExpr(): BuilderExpr {
  return { join: 'and', parts: [] }
}

export function defaultBuilderSpec(name = 'Nova estratégia (builder)'): VelozBuilderSpec {
  const rsi = defaultBuilderIndicator('rsi', { id: 'rsi14', period: 14, color: '#7c3aed' })
  const emaFast = defaultBuilderIndicator('ema', {
    id: 'ema12',
    period: 12,
    color: '#0369a1',
  })
  const emaSlow = defaultBuilderIndicator('ema', {
    id: 'ema48',
    period: 48,
    color: '#d97706',
  })
  return {
    version: 1,
    name,
    indicators: [emaFast, emaSlow, rsi],
    rules: {
      long: {
        join: 'and',
        parts: [
          {
            left: { type: 'indicator', ref: emaFast.id, output: 'main' },
            right: { type: 'indicator', ref: emaSlow.id, output: 'main' },
            op: 'cross_up',
          },
        ],
      },
      short: null,
      exitLong: {
        join: 'and',
        parts: [
          {
            left: { type: 'indicator', ref: emaFast.id, output: 'main' },
            right: { type: 'indicator', ref: emaSlow.id, output: 'main' },
            op: 'cross_down',
          },
        ],
      },
      exitShort: null,
      longIf: null,
      shortIf: null,
      exitLongIf: null,
      exitShortIf: null,
    },
    risk: { takeProfitPct: 0, stopLossPct: 0, trailingStopPct: 0 },
  }
}

export function normalizeBuilderSpec(raw: unknown): VelozBuilderSpec {
  if (!raw || typeof raw !== 'object') return defaultBuilderSpec()
  const o = raw as Partial<VelozBuilderSpec>
  const base = defaultBuilderSpec(typeof o.name === 'string' ? o.name : undefined)
  const indicators = Array.isArray(o.indicators)
    ? o.indicators
        .filter((i): i is BuilderIndicator => !!i && typeof i === 'object')
        .map((i) =>
          defaultBuilderIndicator((['sma', 'ema', 'rsi', 'macd', 'bb'] as const).includes(i.kind)
            ? i.kind
            : 'sma', {
            ...i,
            id: String(i.id || newBuilderIndId('sma')),
          }),
        )
    : base.indicators
  if (!indicators.length) return defaultBuilderSpec()

  const rules = o.rules && typeof o.rules === 'object' ? o.rules : base.rules
  const risk = o.risk && typeof o.risk === 'object' ? o.risk : base.risk

  return {
    version: 1,
    name: (typeof o.name === 'string' && o.name.trim()) || base.name,
    indicators,
    rules: {
      long: normalizeExpr(rules.long),
      short: normalizeExpr(rules.short),
      exitLong: normalizeExpr(rules.exitLong),
      exitShort: normalizeExpr(rules.exitShort),
      longIf: strOrNull(rules.longIf),
      shortIf: strOrNull(rules.shortIf),
      exitLongIf: strOrNull(rules.exitLongIf),
      exitShortIf: strOrNull(rules.exitShortIf),
    },
    risk: {
      takeProfitPct: num(risk.takeProfitPct, 0),
      stopLossPct: num(risk.stopLossPct, 0),
      trailingStopPct: num(risk.trailingStopPct, 0),
    },
  }
}

function strOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t || null
}

function num(v: unknown, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : d
}

function normalizeExpr(raw: unknown): BuilderExpr | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as BuilderExpr
  const parts = Array.isArray(e.parts)
    ? e.parts.filter((p) => p && typeof p === 'object' && p.op && p.left && p.right)
    : []
  if (!parts.length) return null
  return {
    join: e.join === 'or' ? 'or' : 'and',
    parts: parts as BuilderCondition[],
  }
}

export function emptyBuilderExpr(): BuilderExpr {
  return emptyExpr()
}

export const BUILDER_STUB_CODE = `/**
 * Estratégia Builder (formato backtest adaptado)
 * Edite em ?pane=builder — não como JS livre.
 */
export function strategy(bars) {
  void bars;
  throw new Error('Use o motor builtin builder');
}
`
