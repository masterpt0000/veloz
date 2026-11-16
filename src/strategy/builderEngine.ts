/**
 * Lightweight bar-by-bar engine for VelozBuilderSpec (backtest ChartBuilder-inspired).
 */

import type {
  BacktestResult,
  Bar,
  EquityPoint,
  NormalizedIndicator,
  Signal,
  StrategyMetrics,
  Trade,
} from '../types'
import {
  normalizeBuilderSpec,
  type BuilderCondition,
  type BuilderExpr,
  type BuilderIndicator,
  type BuilderOperand,
  type BuilderOp,
  type VelozBuilderSpec,
} from './builderSpec'

type SeriesMap = Record<string, Record<string, Array<number | null>>>

function smaSeries(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null)
  for (let i = 0; i < values.length; i++) {
    if (i + 1 < period) continue
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) sum += values[j]
    out[i] = sum / period
  }
  return out
}

function emaSeries(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null)
  if (values.length < period) return out
  let sum = 0
  for (let i = 0; i < period; i++) sum += values[i]
  let prev = sum / period
  out[period - 1] = prev
  const k = 2 / (period + 1)
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

function rsiSeries(closes: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(closes.length).fill(null)
  if (closes.length <= period) return out
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    if (d >= 0) gain += d
    else loss -= d
  }
  let avgGain = gain / period
  let avgLoss = loss / period
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    const g = d > 0 ? d : 0
    const l = d < 0 ? -d : 0
    avgGain = (avgGain * (period - 1) + g) / period
    avgLoss = (avgLoss * (period - 1) + l) / period
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return out
}

function buildSeries(bars: Bar[], indicators: BuilderIndicator[]): SeriesMap {
  const closes = bars.map((b) => b.close)
  const map: SeriesMap = {}
  for (const ind of indicators) {
    if (ind.kind === 'sma') {
      map[ind.id] = { main: smaSeries(closes, ind.period) }
    } else if (ind.kind === 'ema') {
      map[ind.id] = { main: emaSeries(closes, ind.period) }
    } else if (ind.kind === 'rsi') {
      map[ind.id] = { main: rsiSeries(closes, ind.period) }
    } else if (ind.kind === 'macd') {
      const fast = emaSeries(closes, ind.fastPeriod)
      const slow = emaSeries(closes, ind.slowPeriod)
      const macd = closes.map((_, i) =>
        fast[i] == null || slow[i] == null ? null : (fast[i] as number) - (slow[i] as number),
      )
      const macdNums = macd.map((v) => (v == null ? 0 : v))
      const signalRaw = emaSeries(macdNums, ind.signalPeriod)
      const signal = macd.map((v, i) =>
        v == null || signalRaw[i] == null ? null : signalRaw[i],
      )
      const hist = macd.map((v, i) =>
        v == null || signal[i] == null ? null : (v as number) - (signal[i] as number),
      )
      map[ind.id] = { main: macd, signal, hist }
    } else if (ind.kind === 'bb') {
      const mid = smaSeries(closes, ind.period)
      const upper: Array<number | null> = new Array(closes.length).fill(null)
      const lower: Array<number | null> = new Array(closes.length).fill(null)
      for (let i = 0; i < closes.length; i++) {
        if (mid[i] == null || i + 1 < ind.period) continue
        let sumSq = 0
        for (let j = i - ind.period + 1; j <= i; j++) {
          const d = closes[j] - (mid[i] as number)
          sumSq += d * d
        }
        const std = Math.sqrt(sumSq / ind.period)
        upper[i] = (mid[i] as number) + ind.mult * std
        lower[i] = (mid[i] as number) - ind.mult * std
      }
      map[ind.id] = { mid, upper, lower, main: mid }
    }
  }
  return map
}

function resolveOp(
  op: BuilderOperand,
  i: number,
  closes: number[],
  series: SeriesMap,
): number | null {
  if (op.type === 'close') return closes[i]
  if (op.type === 'constant') return op.value
  const pack = series[op.ref]
  if (!pack) return null
  const key = op.output ?? 'main'
  const arr = pack[key] ?? pack.main
  if (!arr) return null
  const v = arr[i]
  return v == null || !Number.isFinite(v) ? null : v
}

function condAt(
  c: BuilderCondition,
  i: number,
  closes: number[],
  series: SeriesMap,
): boolean {
  const left = resolveOp(c.left, i, closes, series)
  const right = resolveOp(c.right, i, closes, series)
  if (left == null || right == null) return false
  switch (c.op) {
    case 'gt':
      return left > right
    case 'lt':
      return left < right
    case 'ge':
      return left >= right
    case 'le':
      return left <= right
    case 'cross_up': {
      if (i === 0) return false
      const lp = resolveOp(c.left, i - 1, closes, series)
      const rp = resolveOp(c.right, i - 1, closes, series)
      if (lp == null || rp == null) return false
      return lp <= rp && left > right
    }
    case 'cross_down': {
      if (i === 0) return false
      const lp = resolveOp(c.left, i - 1, closes, series)
      const rp = resolveOp(c.right, i - 1, closes, series)
      if (lp == null || rp == null) return false
      return lp >= rp && left < right
    }
    default:
      return false
  }
}

/** Minimal if-line: `rsi > 30 and ema12 crosses ema48` style (ids + ops). */
export function parseSimpleIfLine(
  line: string,
  indicators: BuilderIndicator[],
): BuilderExpr | null {
  const src = line.trim()
  if (!src) return null
  const ids = new Set(indicators.map((i) => i.id))
  ids.add('close')

  // Split by and/or (case insensitive) keeping separators
  const joinMatch = /\s+(and|or)\s+/i.exec(src)
  const join: 'and' | 'or' =
    joinMatch && joinMatch[1].toLowerCase() === 'or' ? 'or' : 'and'
  const chunks = src.split(/\s+(?:and|or)\s+/i)
  const parts: BuilderCondition[] = []

  const parseOperand = (tok: string): BuilderOperand | null => {
    const t = tok.trim()
    if (!t) return null
    if (t === 'close' || t === 'c') return { type: 'close' }
    if (/^-?\d+(\.\d+)?$/.test(t)) return { type: 'constant', value: Number(t) }
    // id.output
    const [ref, outRaw] = t.split('.')
    if (!ids.has(ref) && !indicators.some((i) => i.id === ref)) return null
    const allowed = ['main', 'signal', 'hist', 'upper', 'mid', 'lower'] as const
    type Out = (typeof allowed)[number]
    const output: Out = allowed.includes(outRaw as Out)
      ? (outRaw as Out)
      : 'main'
    return { type: 'indicator', ref, output }
  }

  for (const chunk of chunks) {
    const crossUp = /\s+cross(?:es)?(?:\s+above)?\s+/i.exec(chunk)
    const crossDown = /\s+cross(?:es)?(?:\s+below)?\s+/i.exec(chunk)
    let op: BuilderOp | null = null
    let leftS = ''
    let rightS = ''
    if (crossUp && !/below/i.test(chunk)) {
      const [a, b] = chunk.split(/\s+cross(?:es)?(?:\s+above)?\s+/i)
      leftS = a
      rightS = b
      op = 'cross_up'
    } else if (crossDown || /cross(?:es)?\s+below/i.test(chunk)) {
      const [a, b] = chunk.split(/\s+cross(?:es)?(?:\s+below)?\s+/i)
      leftS = a
      rightS = b
      op = 'cross_down'
    } else {
      const m = chunk.match(/^(.+?)\s*(>=|<=|>|<)\s*(.+)$/)
      if (!m) continue
      leftS = m[1]
      rightS = m[3]
      op = m[2] === '>=' ? 'ge' : m[2] === '<=' ? 'le' : m[2] === '>' ? 'gt' : 'lt'
    }
    const left = parseOperand(leftS)
    const right = parseOperand(rightS)
    if (!left || !right || !op) continue
    parts.push({ left, right, op })
  }
  if (!parts.length) return null
  return { join, parts }
}

function evalExpr(
  expr: BuilderExpr | null,
  i: number,
  closes: number[],
  series: SeriesMap,
): boolean {
  if (!expr || !expr.parts.length) return false
  if (expr.join === 'or') {
    return expr.parts.some((p) => condAt(p, i, closes, series))
  }
  return expr.parts.every((p) => condAt(p, i, closes, series))
}

function resolveRule(
  ifLine: string | null,
  fallback: BuilderExpr | null,
  indicators: BuilderIndicator[],
): BuilderExpr | null {
  if (ifLine?.trim()) {
    return parseSimpleIfLine(ifLine, indicators) ?? fallback
  }
  return fallback
}

function toChartData(
  bars: Bar[],
  values: Array<number | null>,
): Array<{ time: number; value: number } | { time: number }> {
  return values.map((v, i) =>
    v == null || !Number.isFinite(v)
      ? { time: bars[i].time }
      : { time: bars[i].time, value: v },
  )
}

export function runBuilderSpec(
  bars: Bar[],
  rawSpec: unknown,
  initialCapital = 10_000,
): BacktestResult {
  const started = performance.now()
  const spec = normalizeBuilderSpec(rawSpec)
  const n = bars.length
  const closes = bars.map((b) => b.close)
  const highs = bars.map((b) => b.high)
  const lows = bars.map((b) => b.low)
  const series = buildSeries(bars, spec.indicators)

  const longE = resolveRule(spec.rules.longIf, spec.rules.long, spec.indicators)
  const shortE = resolveRule(spec.rules.shortIf, spec.rules.short, spec.indicators)
  const exitLE = resolveRule(
    spec.rules.exitLongIf,
    spec.rules.exitLong,
    spec.indicators,
  )
  const exitSE = resolveRule(
    spec.rules.exitShortIf,
    spec.rules.exitShort,
    spec.indicators,
  )

  const tpR = spec.risk.takeProfitPct / 100
  const slR = spec.risk.stopLossPct / 100
  const trailR = spec.risk.trailingStopPct / 100

  type Pos =
    | { side: null }
    | {
        side: 'long' | 'short'
        entry: number
        entryTime: number
        entryIdx: number
        best: number
      }

  let pos: Pos = { side: null }
  let capital = initialCapital
  const trades: Trade[] = []
  const signals: Signal[] = []
  const equityRaw = new Float64Array(n)

  const closePos = (exitPx: number, i: number, label: string) => {
    if (!pos.side) return
    const side = pos.side
    const pnl =
      side === 'long'
        ? ((exitPx - pos.entry) / pos.entry) * capital
        : ((pos.entry - exitPx) / pos.entry) * capital
    const pnlPct =
      side === 'long'
        ? ((exitPx - pos.entry) / pos.entry) * 100
        : ((pos.entry - exitPx) / pos.entry) * 100
    // Mark-to-market style: apply return on full capital (simple, fast)
    capital = capital * (1 + pnlPct / 100)
    trades.push({
      entryTime: pos.entryTime,
      exitTime: bars[i].time,
      entryPrice: pos.entry,
      exitPrice: exitPx,
      side,
      pnl,
      pnlPct,
      barsHeld: Math.max(1, i - pos.entryIdx),
    })
    signals.push({
      time: bars[i].time,
      side: side === 'long' ? 'sell' : 'buy',
      price: exitPx,
      label,
    })
    pos = { side: null }
  }

  for (let i = 0; i < n; i++) {
    const c = closes[i]
    const h = highs[i]
    const l = lows[i]
    const t = bars[i].time
    const wantLong = evalExpr(longE, i, closes, series)
    const wantShort = evalExpr(shortE, i, closes, series)
    const exitLong = evalExpr(exitLE, i, closes, series)
    const exitShort = evalExpr(exitSE, i, closes, series)

    if (!pos.side) {
      if (wantLong) {
        pos = { side: 'long', entry: c, entryTime: t, entryIdx: i, best: c }
        signals.push({ time: t, side: 'buy', price: c, label: 'L' })
      } else if (wantShort) {
        pos = { side: 'short', entry: c, entryTime: t, entryIdx: i, best: c }
        signals.push({ time: t, side: 'sell', price: c, label: 'S' })
      }
    } else if (pos.side === 'long') {
      let done = false
      if (slR > 0 && l <= pos.entry * (1 - slR)) {
        closePos(pos.entry * (1 - slR), i, 'SL')
        done = true
      }
      if (!done && tpR > 0 && h >= pos.entry * (1 + tpR)) {
        closePos(pos.entry * (1 + tpR), i, 'TP')
        done = true
      }
      if (!done && trailR > 0) {
        pos.best = Math.max(pos.best, h)
        const trailPx = pos.best * (1 - trailR)
        if (l <= trailPx) {
          closePos(trailPx, i, 'TR')
          done = true
        }
      }
      if (!done && exitLong) {
        closePos(c, i, 'X')
        done = true
      }
      if (!done && wantShort) {
        closePos(c, i, 'Flip')
        pos = { side: 'short', entry: c, entryTime: t, entryIdx: i, best: c }
        signals.push({ time: t, side: 'sell', price: c, label: 'S' })
        done = true
      }
      if (!done) pos.best = Math.max(pos.best, h)
    } else {
      let done = false
      if (slR > 0 && h >= pos.entry * (1 + slR)) {
        closePos(pos.entry * (1 + slR), i, 'SL')
        done = true
      }
      if (!done && tpR > 0 && l <= pos.entry * (1 - tpR)) {
        closePos(pos.entry * (1 - tpR), i, 'TP')
        done = true
      }
      if (!done && trailR > 0) {
        pos.best = Math.min(pos.best, l)
        const trailPx = pos.best * (1 + trailR)
        if (h >= trailPx) {
          closePos(trailPx, i, 'TR')
          done = true
        }
      }
      if (!done && exitShort) {
        closePos(c, i, 'X')
        done = true
      }
      if (!done && wantLong) {
        closePos(c, i, 'Flip')
        pos = { side: 'long', entry: c, entryTime: t, entryIdx: i, best: c }
        signals.push({ time: t, side: 'buy', price: c, label: 'L' })
        done = true
      }
      if (!done) pos.best = Math.min(pos.best, l)
    }

    // Equity mark
    if (!pos.side) equityRaw[i] = capital
    else if (pos.side === 'long') {
      equityRaw[i] = capital * (c / pos.entry)
    } else {
      equityRaw[i] = capital * (2 - c / pos.entry)
    }
  }

  const maxPoints = 4000
  const stride = Math.max(1, Math.ceil(n / maxPoints))
  const equity: EquityPoint[] = []
  for (let i = 0; i < n; i++) {
    if (i % stride === 0 || i === n - 1) {
      equity.push({ time: bars[i].time, equity: equityRaw[i] })
    }
  }

  const finalEquity = n ? equityRaw[n - 1] : initialCapital
  const totalReturnPct = ((finalEquity - initialCapital) / initialCapital) * 100
  let peak = initialCapital
  let maxDd = 0
  for (let i = 0; i < n; i++) {
    const eq = equityRaw[i]
    if (eq > peak) peak = eq
    const dd = peak > 0 ? ((peak - eq) / peak) * 100 : 0
    if (dd > maxDd) maxDd = dd
  }
  const wins = trades.filter((t) => t.pnlPct > 0)
  const losses = trades.filter((t) => t.pnlPct <= 0)
  const winRatePct = trades.length ? (wins.length / trades.length) * 100 : 0
  const grossWin = wins.reduce((s, t) => s + Math.abs(t.pnlPct), 0)
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlPct, 0))
  const profitFactor =
    grossLoss > 1e-9 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0

  const rets: number[] = []
  for (let i = 1; i < equity.length; i++) {
    const prev = equity[i - 1].equity
    if (prev > 0) rets.push((equity[i].equity - prev) / prev)
  }
  const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0
  const variance =
    rets.length > 1
      ? rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1)
      : 0
  const std = Math.sqrt(variance)
  const sharpeLike = std > 0 ? (mean / std) * Math.sqrt(252) : 0

  const metrics: StrategyMetrics = {
    totalReturnPct,
    maxDrawdownPct: maxDd,
    winRatePct,
    profitFactor: Number.isFinite(profitFactor) ? profitFactor : 99,
    tradeCount: trades.length,
    avgTradePct: trades.length
      ? trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length
      : 0,
    sharpeLike,
    finalEquity,
  }

  const indicators: NormalizedIndicator[] = []
  for (const ind of spec.indicators) {
    const pack = series[ind.id]
    if (!pack) continue
    if (ind.kind === 'rsi') {
      indicators.push({
        id: ind.id,
        title: ind.label,
        pane: 'separate',
        paneId: `rsi-${ind.id}`,
        visible: ind.visible,
        color: ind.color,
        style: 'line',
        lineWidth: 2,
        data: toChartData(bars, pack.main),
      })
    } else if (ind.kind === 'macd') {
      const paneId = `macd-${ind.id}`
      indicators.push(
        {
          id: `${ind.id}-macd`,
          title: 'MACD',
          pane: 'separate',
          paneId,
          visible: ind.visible,
          color: ind.color,
          style: 'line',
          lineWidth: 2,
          data: toChartData(bars, pack.main),
        },
        {
          id: `${ind.id}-sig`,
          title: 'Sinal',
          pane: 'separate',
          paneId,
          visible: ind.visible,
          color: '#d97706',
          style: 'line',
          lineWidth: 1,
          data: toChartData(bars, pack.signal ?? []),
        },
        {
          id: `${ind.id}-hist`,
          title: 'Hist',
          pane: 'separate',
          paneId,
          visible: ind.visible,
          color: '#94a3b8',
          style: 'histogram',
          lineWidth: 1,
          data: toChartData(bars, pack.hist ?? []),
        },
      )
    } else if (ind.kind === 'bb') {
      indicators.push(
        {
          id: `${ind.id}-mid`,
          title: `${ind.label} mid`,
          pane: 'overlay',
          paneId: 'price',
          visible: ind.visible,
          color: ind.color,
          style: 'line',
          lineWidth: 1,
          data: toChartData(bars, pack.mid ?? pack.main),
        },
        {
          id: `${ind.id}-up`,
          title: 'BB upper',
          pane: 'overlay',
          paneId: 'price',
          visible: ind.visible,
          color: '#64748b',
          style: 'line',
          lineWidth: 1,
          data: toChartData(bars, pack.upper ?? []),
        },
        {
          id: `${ind.id}-lo`,
          title: 'BB lower',
          pane: 'overlay',
          paneId: 'price',
          visible: ind.visible,
          color: '#64748b',
          style: 'line',
          lineWidth: 1,
          data: toChartData(bars, pack.lower ?? []),
        },
      )
    } else {
      indicators.push({
        id: ind.id,
        title: ind.label,
        pane: 'overlay',
        paneId: 'price',
        visible: ind.visible,
        color: ind.color,
        style: 'line',
        lineWidth: 2,
        data: toChartData(bars, pack.main),
      })
    }
  }

  return {
    signals,
    trades,
    equity,
    metrics,
    indicators,
    durationMs: performance.now() - started,
    barCount: n,
  }
}

export type { VelozBuilderSpec }
