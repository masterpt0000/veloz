/** Simple (no-code) strategy config + JS code generator for the backtest worker. */

export type StrategyEditMode = 'simple' | 'advanced'

export type SimpleIndicatorKind = 'sma' | 'ema' | 'rsi' | 'macd'

export interface SimpleIndicatorConfig {
  id: string
  kind: SimpleIndicatorKind
  /** SMA / EMA / RSI period (ignored for MACD). */
  period: number
  /** MACD fast EMA period. */
  fastPeriod: number
  /** MACD slow EMA period. */
  slowPeriod: number
  /** MACD signal EMA period. */
  signalPeriod: number
  visible: boolean
  color: string
}

export type RuleCompare = 'cross_above' | 'cross_below' | 'greater' | 'less'

export type SeriesRef =
  | { kind: 'close' }
  | { kind: 'value'; value: number }
  | {
      kind: 'indicator'
      indicatorId: string
      /** MACD outputs; single-line indicators use `main`. */
      output?: 'main' | 'signal' | 'hist'
    }

export interface SimpleRule {
  compare: RuleCompare
  left: SeriesRef
  right: SeriesRef
}

export interface SimpleStrategyConfig {
  indicators: SimpleIndicatorConfig[]
  entry: SimpleRule
  exit: SimpleRule
}

const COLORS = {
  smaFast: '#0369a1',
  smaSlow: '#d97706',
  ema: '#0f766e',
  rsi: '#7c3aed',
  macd: '#0369a1',
  macdSignal: '#d97706',
  macdHist: '#94a3b8',
}

export const INDICATOR_KIND_LABELS: Record<SimpleIndicatorKind, string> = {
  sma: 'SMA (média simples)',
  ema: 'EMA (média exponencial)',
  rsi: 'RSI',
  macd: 'MACD',
}

export const RULE_COMPARE_LABELS: Record<RuleCompare, string> = {
  cross_above: 'Cruza acima',
  cross_below: 'Cruza abaixo',
  greater: 'Está acima de',
  less: 'Está abaixo de',
}

let idSeq = 0
export function newSimpleIndicatorId(kind: SimpleIndicatorKind): string {
  idSeq += 1
  return `${kind}_${Date.now().toString(36)}_${idSeq}`
}

export function defaultIndicator(
  kind: SimpleIndicatorKind,
  overrides: Partial<SimpleIndicatorConfig> = {},
): SimpleIndicatorConfig {
  const base: SimpleIndicatorConfig = {
    id: newSimpleIndicatorId(kind),
    kind,
    period: kind === 'rsi' ? 14 : kind === 'ema' ? 21 : 20,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    visible: true,
    color:
      kind === 'rsi'
        ? COLORS.rsi
        : kind === 'ema'
          ? COLORS.ema
          : kind === 'macd'
            ? COLORS.macd
            : COLORS.smaFast,
  }
  return { ...base, ...overrides, kind, id: overrides.id ?? base.id }
}

/** Default config mirrors the SMA + RSI sample strategy. */
export function defaultSimpleConfig(): SimpleStrategyConfig {
  const fast = defaultIndicator('sma', {
    id: 'sma_fast',
    period: 12,
    color: COLORS.smaFast,
  })
  const slow = defaultIndicator('sma', {
    id: 'sma_slow',
    period: 48,
    color: COLORS.smaSlow,
  })
  const rsi = defaultIndicator('rsi', {
    id: 'rsi_main',
    period: 14,
    color: COLORS.rsi,
  })
  return {
    indicators: [fast, slow, rsi],
    entry: {
      compare: 'cross_above',
      left: { kind: 'indicator', indicatorId: fast.id, output: 'main' },
      right: { kind: 'indicator', indicatorId: slow.id, output: 'main' },
    },
    exit: {
      compare: 'cross_below',
      left: { kind: 'indicator', indicatorId: fast.id, output: 'main' },
      right: { kind: 'indicator', indicatorId: slow.id, output: 'main' },
    },
  }
}

export function normalizeSimpleConfig(
  raw: unknown,
): SimpleStrategyConfig {
  if (!raw || typeof raw !== 'object') return defaultSimpleConfig()
  const cfg = raw as Partial<SimpleStrategyConfig>
  const indicators = Array.isArray(cfg.indicators)
    ? cfg.indicators
        .filter((i): i is SimpleIndicatorConfig => !!i && typeof i === 'object')
        .map((i) => ({
          id: String(i.id || newSimpleIndicatorId(i.kind || 'sma')),
          kind: (['sma', 'ema', 'rsi', 'macd'].includes(i.kind)
            ? i.kind
            : 'sma') as SimpleIndicatorKind,
          period: clampPeriod(Number(i.period) || 20),
          fastPeriod: clampPeriod(Number(i.fastPeriod) || 12),
          slowPeriod: clampPeriod(Number(i.slowPeriod) || 26),
          signalPeriod: clampPeriod(Number(i.signalPeriod) || 9),
          visible: i.visible !== false,
          color: typeof i.color === 'string' ? i.color : COLORS.smaFast,
        }))
    : defaultSimpleConfig().indicators

  if (!indicators.length) return defaultSimpleConfig()

  return {
    indicators,
    entry: normalizeRule(cfg.entry, indicators, 'entry'),
    exit: normalizeRule(cfg.exit, indicators, 'exit'),
  }
}

function clampPeriod(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(500, Math.floor(n))
}

function normalizeRule(
  raw: unknown,
  indicators: SimpleIndicatorConfig[],
  which: 'entry' | 'exit',
): SimpleRule {
  const fallback = defaultSimpleConfig()[which]
  if (!raw || typeof raw !== 'object') return fixRuleRefs(fallback, indicators)
  const r = raw as Partial<SimpleRule>
  const compare = (
    ['cross_above', 'cross_below', 'greater', 'less'] as RuleCompare[]
  ).includes(r.compare as RuleCompare)
    ? (r.compare as RuleCompare)
    : fallback.compare
  return fixRuleRefs(
    {
      compare,
      left: normalizeRef(r.left, indicators, fallback.left),
      right: normalizeRef(r.right, indicators, fallback.right),
    },
    indicators,
  )
}

function normalizeRef(
  raw: unknown,
  indicators: SimpleIndicatorConfig[],
  fallback: SeriesRef,
): SeriesRef {
  if (!raw || typeof raw !== 'object') return fallback
  const r = raw as SeriesRef
  if (r.kind === 'close') return { kind: 'close' }
  if (r.kind === 'value') {
    const v = Number((r as { value?: number }).value)
    return { kind: 'value', value: Number.isFinite(v) ? v : 0 }
  }
  if (r.kind === 'indicator') {
    const id = String((r as { indicatorId?: string }).indicatorId || '')
    if (!indicators.some((i) => i.id === id)) return fallback
    const output = (r as { output?: string }).output
    const out =
      output === 'signal' || output === 'hist' || output === 'main'
        ? output
        : 'main'
    return { kind: 'indicator', indicatorId: id, output: out }
  }
  return fallback
}

function fixRuleRefs(
  rule: SimpleRule,
  indicators: SimpleIndicatorConfig[],
): SimpleRule {
  return {
    compare: rule.compare,
    left: normalizeRef(rule.left, indicators, { kind: 'close' }),
    right: normalizeRef(rule.right, indicators, {
      kind: 'value',
      value: 0,
    }),
  }
}

export interface SeriesOption {
  key: string
  label: string
  ref: SeriesRef
}

/** Build Portuguese labels for rule series dropdowns. */
export function buildSeriesOptions(
  indicators: SimpleIndicatorConfig[],
): SeriesOption[] {
  const opts: SeriesOption[] = [
    { key: 'close', label: 'Preço de fecho', ref: { kind: 'close' } },
  ]
  for (const ind of indicators) {
    const title = indicatorTitle(ind)
    if (ind.kind === 'macd') {
      opts.push(
        {
          key: `${ind.id}:main`,
          label: `${title} · linha MACD`,
          ref: { kind: 'indicator', indicatorId: ind.id, output: 'main' },
        },
        {
          key: `${ind.id}:signal`,
          label: `${title} · sinal`,
          ref: { kind: 'indicator', indicatorId: ind.id, output: 'signal' },
        },
        {
          key: `${ind.id}:hist`,
          label: `${title} · histograma`,
          ref: { kind: 'indicator', indicatorId: ind.id, output: 'hist' },
        },
      )
    } else {
      opts.push({
        key: `${ind.id}:main`,
        label: title,
        ref: { kind: 'indicator', indicatorId: ind.id, output: 'main' },
      })
    }
  }
  opts.push({
    key: 'value',
    label: 'Valor fixo…',
    ref: { kind: 'value', value: 50 },
  })
  return opts
}

export function seriesRefKey(ref: SeriesRef): string {
  if (ref.kind === 'close') return 'close'
  if (ref.kind === 'value') return 'value'
  return `${ref.indicatorId}:${ref.output ?? 'main'}`
}

export function indicatorTitle(ind: SimpleIndicatorConfig): string {
  if (ind.kind === 'macd') {
    return `MACD ${ind.fastPeriod}/${ind.slowPeriod}/${ind.signalPeriod}`
  }
  const name = ind.kind.toUpperCase()
  return `${name} ${ind.period}`
}

/**
 * Compile a simple config into `export function strategy(bars)` source
 * that the existing backtest worker can run unchanged.
 */
export function compileSimpleStrategyCode(config: SimpleStrategyConfig): string {
  const normalized = normalizeSimpleConfig(config)
  const payload = JSON.stringify(normalized)
  return `/**
 * Estratégia gerada pelo modo Simples — edite no separador Simples
 * ou passe para Avançado para alterar o código.
 */
const __VELOZ_SIMPLE__ = ${payload};

function sma(values, period, end) {
  if (end + 1 < period) return null;
  let sum = 0;
  for (let i = end - period + 1; i <= end; i++) sum += values[i];
  return sum / period;
}

function emaSeries(values, period) {
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function smaSeries(values, period) {
  const out = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) out[i] = sma(values, period, i);
  return out;
}

function rsiSeries(closes, period) {
  const out = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function macdBundle(closes, fastPeriod, slowPeriod, signalPeriod) {
  const fast = emaSeries(closes, fastPeriod);
  const slow = emaSeries(closes, slowPeriod);
  const macd = closes.map((_, i) =>
    fast[i] == null || slow[i] == null ? null : fast[i] - slow[i],
  );
  const macdNums = macd.map((v) => (v == null ? 0 : v));
  const signalRaw = emaSeries(macdNums, signalPeriod);
  const signal = macd.map((v, i) => (v == null || signalRaw[i] == null ? null : signalRaw[i]));
  const hist = macd.map((v, i) =>
    v == null || signal[i] == null ? null : v - signal[i],
  );
  return { macd, signal, hist };
}

function resolveSeries(ref, closes, seriesMap, i) {
  if (ref.kind === 'close') return closes[i];
  if (ref.kind === 'value') return ref.value;
  const pack = seriesMap[ref.indicatorId];
  if (!pack) return null;
  const out = ref.output || 'main';
  const arr = pack[out] || pack.main;
  return arr ? arr[i] : null;
}

function ruleFired(rule, closes, seriesMap, i, prevI) {
  const left = resolveSeries(rule.left, closes, seriesMap, i);
  const right = resolveSeries(rule.right, closes, seriesMap, i);
  if (left == null || right == null) return false;
  if (rule.compare === 'greater') return left > right;
  if (rule.compare === 'less') return left < right;
  const prevLeft = resolveSeries(rule.left, closes, seriesMap, prevI);
  const prevRight = resolveSeries(rule.right, closes, seriesMap, prevI);
  if (prevLeft == null || prevRight == null) return false;
  if (rule.compare === 'cross_above') return prevLeft <= prevRight && left > right;
  if (rule.compare === 'cross_below') return prevLeft >= prevRight && left < right;
  return false;
}

export function strategy(bars) {
  const cfg = __VELOZ_SIMPLE__;
  const closes = bars.map((b) => b.close);
  const seriesMap = {};
  const indicators = [];

  for (const ind of cfg.indicators) {
    if (ind.kind === 'sma') {
      const main = smaSeries(closes, ind.period);
      seriesMap[ind.id] = { main };
      indicators.push({
        id: ind.id,
        title: 'SMA ' + ind.period,
        values: main,
        pane: 'overlay',
        visible: ind.visible !== false,
        color: ind.color,
        lineWidth: 2,
      });
    } else if (ind.kind === 'ema') {
      const main = emaSeries(closes, ind.period);
      seriesMap[ind.id] = { main };
      indicators.push({
        id: ind.id,
        title: 'EMA ' + ind.period,
        values: main,
        pane: 'overlay',
        visible: ind.visible !== false,
        color: ind.color,
        lineWidth: 2,
      });
    } else if (ind.kind === 'rsi') {
      const main = rsiSeries(closes, ind.period);
      seriesMap[ind.id] = { main };
      indicators.push({
        id: ind.id,
        title: 'RSI ' + ind.period,
        values: main,
        pane: 'separate',
        paneId: 'rsi-' + ind.id,
        visible: ind.visible !== false,
        color: ind.color,
        style: 'line',
        lineWidth: 2,
      });
    } else if (ind.kind === 'macd') {
      const bundle = macdBundle(closes, ind.fastPeriod, ind.slowPeriod, ind.signalPeriod);
      seriesMap[ind.id] = {
        main: bundle.macd,
        signal: bundle.signal,
        hist: bundle.hist,
      };
      const paneId = 'macd-' + ind.id;
      indicators.push(
        {
          id: ind.id + '-macd',
          title: 'MACD',
          values: bundle.macd,
          pane: 'separate',
          paneId,
          visible: ind.visible !== false,
          color: ind.color || '#0369a1',
          style: 'line',
          lineWidth: 2,
        },
        {
          id: ind.id + '-signal',
          title: 'Sinal',
          values: bundle.signal,
          pane: 'separate',
          paneId,
          visible: ind.visible !== false,
          color: '#d97706',
          style: 'line',
          lineWidth: 1,
        },
        {
          id: ind.id + '-hist',
          title: 'Histograma',
          values: bundle.hist,
          pane: 'separate',
          paneId,
          visible: ind.visible !== false,
          color: '#94a3b8',
          style: 'histogram',
          lineWidth: 1,
        },
      );
    }
  }

  const signals = [];
  let position = 0;
  for (let i = 1; i < bars.length; i++) {
    const prevI = i - 1;
    if (position === 0 && ruleFired(cfg.entry, closes, seriesMap, i, prevI)) {
      signals.push({ time: bars[i].time, side: 'buy', label: 'Entrada' });
      position = 1;
    } else if (position === 1 && ruleFired(cfg.exit, closes, seriesMap, i, prevI)) {
      signals.push({ time: bars[i].time, side: 'sell', label: 'Saída' });
      position = 0;
    }
  }

  return { signals, indicators };
}
`
}
