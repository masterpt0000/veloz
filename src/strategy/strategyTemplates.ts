/**
 * Ready-made strategy templates (builder specs + optional JS samples).
 * Seeded into the library alongside RCI+DCA.
 */

import {
  BUILDER_STUB_CODE,
  defaultBuilderIndicator,
  defaultBuilderSpec,
  type VelozBuilderSpec,
} from './builderSpec'
import { defaultSimpleConfig } from './simpleStrategy'
import type { SavedStrategy } from './strategyStore'

function uid(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function makeBuilder(name: string, spec: VelozBuilderSpec): SavedStrategy {
  return {
    id: uid(),
    name,
    code: BUILDER_STUB_CODE,
    updatedAt: Date.now(),
    mode: 'advanced',
    simpleConfig: defaultSimpleConfig(),
    engine: 'builder',
    builderSpec: { ...spec, name },
  }
}

/** SMA 20/50 crossover — classic trend follow. */
export function templateSmaCross(): VelozBuilderSpec {
  const fast = defaultBuilderIndicator('sma', {
    id: 'sma20',
    period: 20,
    label: 'SMA 20',
    color: '#0369a1',
  })
  const slow = defaultBuilderIndicator('sma', {
    id: 'sma50',
    period: 50,
    label: 'SMA 50',
    color: '#d97706',
  })
  return {
    version: 1,
    name: 'SMA Cross 20/50',
    indicators: [fast, slow],
    rules: {
      long: {
        join: 'and',
        parts: [
          {
            left: { type: 'indicator', ref: fast.id, output: 'main' },
            right: { type: 'indicator', ref: slow.id, output: 'main' },
            op: 'cross_up',
          },
        ],
      },
      short: null,
      exitLong: {
        join: 'and',
        parts: [
          {
            left: { type: 'indicator', ref: fast.id, output: 'main' },
            right: { type: 'indicator', ref: slow.id, output: 'main' },
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

/** RSI mean-reversion: buy oversold, sell overbought. */
export function templateRsiMeanReversion(): VelozBuilderSpec {
  const rsi = defaultBuilderIndicator('rsi', {
    id: 'rsi14',
    period: 14,
    label: 'RSI 14',
    color: '#7c3aed',
  })
  return {
    version: 1,
    name: 'RSI Mean Reversion',
    indicators: [rsi],
    rules: {
      long: {
        join: 'and',
        parts: [
          {
            left: { type: 'indicator', ref: rsi.id, output: 'main' },
            right: { type: 'constant', value: 30 },
            op: 'cross_up',
          },
        ],
      },
      short: null,
      exitLong: {
        join: 'and',
        parts: [
          {
            left: { type: 'indicator', ref: rsi.id, output: 'main' },
            right: { type: 'constant', value: 70 },
            op: 'cross_up',
          },
        ],
      },
      exitShort: null,
      longIf: null,
      shortIf: null,
      exitLongIf: null,
      exitShortIf: null,
    },
    risk: { takeProfitPct: 2, stopLossPct: 1.5, trailingStopPct: 0 },
  }
}

/** Bollinger breakout: enter when close crosses above upper band. */
export function templateBbBreakout(): VelozBuilderSpec {
  const bb = defaultBuilderIndicator('bb', {
    id: 'bb20',
    period: 20,
    mult: 2,
    label: 'BB 20×2',
    color: '#0f766e',
  })
  return {
    version: 1,
    name: 'Breakout Bollinger',
    indicators: [bb],
    rules: {
      long: {
        join: 'and',
        parts: [
          {
            left: { type: 'close' },
            right: { type: 'indicator', ref: bb.id, output: 'upper' },
            op: 'cross_up',
          },
        ],
      },
      short: null,
      exitLong: {
        join: 'and',
        parts: [
          {
            left: { type: 'close' },
            right: { type: 'indicator', ref: bb.id, output: 'mid' },
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
    risk: { takeProfitPct: 3, stopLossPct: 1.5, trailingStopPct: 1 },
  }
}

export interface StrategyTemplateMeta {
  id: string
  name: string
  description: string
  build: () => SavedStrategy
}

/** Templates offered via «Modelos» UI (beyond seeds already in the library). */
export const STRATEGY_TEMPLATES: StrategyTemplateMeta[] = [
  {
    id: 'sma_cross',
    name: 'SMA Cross 20/50',
    description: 'Cruzamento de médias simples — tendência clássica',
    build: () => makeBuilder('SMA Cross 20/50', templateSmaCross()),
  },
  {
    id: 'rsi_mr',
    name: 'RSI Mean Reversion',
    description: 'Compra em sobrevenda (30) · sai em sobrecompra (70)',
    build: () => makeBuilder('RSI Mean Reversion', templateRsiMeanReversion()),
  },
  {
    id: 'bb_breakout',
    name: 'Breakout Bollinger',
    description: 'Entrada no rompimento da banda superior · TP/SL',
    build: () => makeBuilder('Breakout Bollinger', templateBbBreakout()),
  },
  {
    id: 'ema_cross',
    name: 'EMA Cross (builder)',
    description: 'EMA 12/48 + RSI — especificação builder por omissão',
    build: () => {
      const spec = defaultBuilderSpec('EMA Cross (builder)')
      return makeBuilder(spec.name, spec)
    },
  },
]

/** Seed helpers: ensure library contains these named builder templates once. */
export function ensureTemplateStrategies(
  strategies: SavedStrategy[],
): SavedStrategy[] {
  const names = new Set(strategies.map((s) => s.name))
  const extras: SavedStrategy[] = []
  for (const t of [
    templateSmaCross,
    templateRsiMeanReversion,
    templateBbBreakout,
  ]) {
    const spec = t()
    if (names.has(spec.name)) continue
    extras.push(makeBuilder(spec.name, spec))
    names.add(spec.name)
  }
  return extras.length ? [...strategies, ...extras] : strategies
}
