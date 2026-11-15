/**
 * Port of TraderBot `traders_py/configs/rci_dca_engine.py` → Veloz.
 * Bar-by-bar RCI Long/Short DCA + TP trail (mirrors Pine + Python).
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

export interface RciDcaParams {
  rci_short: number
  rci_middle: number
  rci_long: number
  atr_len: number
  dca_mode: 'pct' | 'atr'
  dca_drop_pct: number
  dca_drop_atr: number
  pct1: number
  pct2: number
  pct3: number
  pct4: number
  pct5: number
  max_entries: number
  dca_long: boolean
  dca_short: boolean
  trade_long: boolean
  trade_short: boolean
  tp_mode: 'pct' | 'atr'
  tp_pct: number
  tp_atr: number
  use_trail: boolean
  trail_pct: number
  trail_atr: number
  fees_pct: number
  max_adverse_pct: number
  scale: string
}

export const RCI_DCA_DEFAULT_PARAMS: RciDcaParams = {
  rci_short: 10,
  rci_middle: 30,
  rci_long: 200,
  atr_len: 14,
  dca_mode: 'pct',
  dca_drop_pct: 4.0,
  dca_drop_atr: 1.0,
  pct1: 1.0,
  pct2: 2.0,
  pct3: 4.0,
  pct4: 8.0,
  pct5: 16.0,
  max_entries: 5,
  dca_long: true,
  dca_short: true,
  trade_long: true,
  trade_short: true,
  tp_mode: 'pct',
  tp_pct: 1.0,
  tp_atr: 2.0,
  use_trail: false,
  trail_pct: 0.5,
  trail_atr: 1.0,
  fees_pct: 0.0004,
  max_adverse_pct: 0.0,
  scale: 'classic',
}

export const RCI_DCA_STRATEGY_CODE = `/**
 * RCI + DCA — motor Python (TraderBot rci_dca_engine)
 * ----------------------------------------------------
 * Esta estratégia corre o engine portado (não edite como JS livre).
 * Params default: RCI 10/30/200 · DCA 4% · TP 1% · trail off · long+short.
 * Fonte: masterpt0000/TraderBot traders_py/configs/rci_dca_engine.py
 */
export function strategy(bars) {
  void bars;
  throw new Error('Use o motor builtin RCI+DCA (engine=rci_dca)');
}
`

type FillLot = { price: number; qty: number; cost: number }

interface DealState {
  side: 'long' | 'short' | null
  qty: number
  avgPrice: number
  costBasis: number
  entriesUsed: number
  lastEntryPrice: number
  signalReset: boolean
  trailArmed: boolean
  runExtreme: number | null
  trailStop: number | null
  atrLock: number | null
  tpLimit: number | null
  exitLive: boolean
  fills: FillLot[] | null
  entryBar: number
}

interface ClosedDeal {
  side: 'long' | 'short'
  entryBar: number
  exitBar: number
  avgEntry: number
  exitPrice: number
  qty: number
  pnl: number
  pnlPct: number
  entries: number
  exitReason: string
}

function emptyState(): DealState {
  return {
    side: null,
    qty: 0,
    avgPrice: 0,
    costBasis: 0,
    entriesUsed: 0,
    lastEntryPrice: 0,
    signalReset: false,
    trailArmed: false,
    runExtreme: null,
    trailStop: null,
    atrLock: null,
    tpLimit: null,
    exitLive: false,
    fills: null,
    entryBar: -1,
  }
}

function isFlat(s: DealState): boolean {
  return s.side == null || s.qty <= 0
}

function clearState(s: DealState): void {
  Object.assign(s, emptyState())
}

function resetTrail(s: DealState): void {
  s.trailArmed = false
  s.runExtreme = null
  s.trailStop = null
  s.atrLock = null
  s.tpLimit = null
  s.exitLive = false
}

function averageRanks(window: Float64Array): Float64Array {
  const n = window.length
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => window[a] - window[b] || a - b,
  )
  const ranks = new Float64Array(n)
  let i = 0
  while (i < n) {
    let j = i + 1
    while (j < n && window[order[j]] === window[order[i]]) j += 1
    const avgRank = 0.5 * (i + j - 1)
    for (let k = i; k < j; k++) ranks[order[k]] = avgRank
    i = j
  }
  return ranks
}

/** TradingView ta.rci — Pearson of 0-based price ranks vs time ranks × 100. */
export function computeRci(close: Float64Array, length: number): Float64Array {
  const n = close.length
  const out = new Float64Array(n)
  out.fill(Number.NaN)
  if (length < 2 || n < length) return out

  const timeRanks = new Float64Array(length)
  for (let t = 0; t < length; t++) timeRanks[t] = t
  let timeMean = 0
  for (let t = 0; t < length; t++) timeMean += timeRanks[t]
  timeMean /= length
  const timeCentered = new Float64Array(length)
  let timeSs = 0
  for (let t = 0; t < length; t++) {
    timeCentered[t] = timeRanks[t] - timeMean
    timeSs += timeCentered[t] * timeCentered[t]
  }
  if (timeSs <= 0) return out

  const window = new Float64Array(length)
  for (let i = length - 1; i < n; i++) {
    for (let k = 0; k < length; k++) window[k] = close[i - length + 1 + k]
    let finite = true
    for (let k = 0; k < length; k++) {
      if (!Number.isFinite(window[k])) {
        finite = false
        break
      }
    }
    if (!finite) continue
    const priceRanks = averageRanks(window)
    let prMean = 0
    for (let k = 0; k < length; k++) prMean += priceRanks[k]
    prMean /= length
    let prSs = 0
    let cov = 0
    for (let k = 0; k < length; k++) {
      const pr = priceRanks[k] - prMean
      prSs += pr * pr
      cov += pr * timeCentered[k]
    }
    if (prSs <= 1e-18) {
      out[i] = Number.NaN
      continue
    }
    out[i] = (cov / Math.sqrt(prSs * timeSs)) * 100
  }
  return out
}

/** Wilder ATR (TradingView ta.atr). */
export function computeAtr(
  high: Float64Array,
  low: Float64Array,
  close: Float64Array,
  length: number,
): Float64Array {
  const n = close.length
  const out = new Float64Array(n)
  out.fill(Number.NaN)
  if (length < 1 || n < 2) return out

  const tr = new Float64Array(n)
  tr[0] = high[0] - low[0]
  for (let i = 1; i < n; i++) {
    tr[i] = Math.max(
      high[i] - low[i],
      Math.abs(high[i] - close[i - 1]),
      Math.abs(low[i] - close[i - 1]),
    )
  }

  const first = length - 1
  if (first >= n) return out
  let sum = 0
  for (let i = 0; i < length; i++) sum += tr[i]
  let atr = sum / length
  out[first] = atr
  for (let i = first + 1; i < n; i++) {
    atr = (atr * (length - 1) + tr[i]) / length
    out[i] = atr
  }
  return out
}

function longSignal(rs: number, rm: number, rl: number, rsP: number): boolean {
  return (
    Number.isFinite(rs) &&
    Number.isFinite(rm) &&
    Number.isFinite(rl) &&
    Number.isFinite(rsP) &&
    rm < -70 &&
    rs < -80 &&
    rs > rsP &&
    rl <= 70
  )
}

function shortSignal(rs: number, rm: number, rl: number, rsP: number): boolean {
  return (
    Number.isFinite(rs) &&
    Number.isFinite(rm) &&
    Number.isFinite(rl) &&
    Number.isFinite(rsP) &&
    rm > 70 &&
    rs > 80 &&
    rs < rsP &&
    rl >= -70
  )
}

function dcaDist(state: DealState, atrVal: number, p: RciDcaParams): number {
  if (p.dca_mode === 'atr') return atrVal * p.dca_drop_atr
  return (state.lastEntryPrice * p.dca_drop_pct) / 100
}

function addToPosition(
  state: DealState,
  side: 'long' | 'short',
  price: number,
  quote: number,
  fees: number,
): number {
  if (quote <= 0 || price <= 0) return 0
  const fee = quote * fees
  const qtyAdd = (quote - fee) / price
  if (qtyAdd <= 0) return 0
  if (!state.fills) state.fills = []
  if (isFlat(state)) {
    state.side = side
    state.qty = qtyAdd
    state.costBasis = quote
    state.avgPrice = price
    state.fills = [{ price, qty: qtyAdd, cost: quote }]
  } else {
    state.qty += qtyAdd
    state.costBasis += quote
    state.avgPrice = state.qty > 0 ? state.costBasis / state.qty : price
    state.fills.push({ price, qty: qtyAdd, cost: quote })
  }
  return quote
}

function closeDeal(
  state: DealState,
  exitPrice: number,
  fees: number,
  barI: number,
  reason: string,
): { cashBack: number; rec: ClosedDeal; fillPnls: number[] } {
  const qty = state.qty
  const side = state.side ?? 'long'
  const cost = state.costBasis
  const avg = state.avgPrice
  const fills = state.fills ? [...state.fills] : []

  let cashBack: number
  let pnl: number
  if (side === 'long') {
    const proceeds = qty * exitPrice * (1 - fees)
    pnl = proceeds - cost
    cashBack = proceeds
  } else {
    pnl = qty * (avg - exitPrice) - (cost * fees + qty * exitPrice * fees)
    cashBack = cost + pnl
  }
  const margin = cost > 0 ? cost : 1
  const pnlPct = margin > 0 ? (pnl / margin) * 100 : 0

  const fillPnls: number[] = []
  for (const f of fills) {
    if (side === 'long') {
      fillPnls.push(f.qty * exitPrice * (1 - fees) - f.cost)
    } else {
      fillPnls.push(
        f.qty * (f.price - exitPrice) - (f.cost * fees + f.qty * exitPrice * fees),
      )
    }
  }

  const rec: ClosedDeal = {
    side,
    entryBar: state.entryBar,
    exitBar: barI,
    avgEntry: avg,
    exitPrice,
    qty,
    pnl,
    pnlPct,
    entries: state.entriesUsed,
    exitReason: reason,
  }
  clearState(state)
  return { cashBack, rec, fillPnls }
}

function tryFillExit(
  state: DealState,
  high: number,
  low: number,
  p: RciDcaParams,
): { hit: boolean; price: number; reason: string } {
  if (isFlat(state) || !state.exitLive) return { hit: false, price: 0, reason: '' }

  if (p.use_trail) {
    if (!state.trailArmed || state.trailStop == null) {
      return { hit: false, price: 0, reason: '' }
    }
    if (state.side === 'long' && low <= state.trailStop) {
      return { hit: true, price: state.trailStop, reason: 'trail' }
    }
    if (state.side === 'short' && high >= state.trailStop) {
      return { hit: true, price: state.trailStop, reason: 'trail' }
    }
    return { hit: false, price: 0, reason: '' }
  }

  if (state.tpLimit == null) return { hit: false, price: 0, reason: '' }
  if (state.side === 'long' && high >= state.tpLimit) {
    return { hit: true, price: state.tpLimit, reason: 'tp' }
  }
  if (state.side === 'short' && low <= state.tpLimit) {
    return { hit: true, price: state.tpLimit, reason: 'tp' }
  }
  return { hit: false, price: 0, reason: '' }
}

function updateExitState(
  state: DealState,
  high: number,
  low: number,
  atrVal: number,
  p: RciDcaParams,
): void {
  if (isFlat(state)) return

  const avg = state.avgPrice
  const tpIsAtr = p.tp_mode === 'atr'

  if (tpIsAtr && !Number.isFinite(atrVal)) return

  let atrUsed = state.atrLock ?? atrVal
  let tpDist: number
  let trailDist: number
  let tpTrigLong: number
  let tpTrigShort: number

  if (tpIsAtr) {
    tpDist = atrUsed * p.tp_atr
    trailDist = atrUsed * p.trail_atr
    tpTrigLong = avg + atrVal * p.tp_atr
    tpTrigShort = avg - atrVal * p.tp_atr
  } else {
    tpDist = (avg * p.tp_pct) / 100
    trailDist = (avg * p.trail_pct) / 100
    tpTrigLong = avg * (1 + p.tp_pct / 100)
    tpTrigShort = avg * (1 - p.tp_pct / 100)
  }

  let floorDist = Math.max(0, tpDist - trailDist)

  if (!p.use_trail) {
    state.tpLimit = state.side === 'long' ? avg + tpDist : avg - tpDist
    state.exitLive = true
    return
  }

  if (state.side === 'long') {
    let floorPx = avg + floorDist
    if (high >= tpTrigLong) {
      state.trailArmed = true
      if (tpIsAtr && state.atrLock == null && Number.isFinite(atrVal)) {
        state.atrLock = atrVal
        atrUsed = state.atrLock
        tpDist = atrUsed * p.tp_atr
        trailDist = atrUsed * p.trail_atr
        floorDist = Math.max(0, tpDist - trailDist)
        floorPx = avg + floorDist
      }
    }
    if (state.trailArmed) {
      state.runExtreme =
        state.runExtreme == null ? high : Math.max(state.runExtreme, high)
      const newStop = Math.max(floorPx, state.runExtreme - trailDist)
      state.trailStop =
        state.trailStop == null ? newStop : Math.max(state.trailStop, newStop)
      state.exitLive = true
    } else {
      state.exitLive = false
    }
  } else {
    let ceilPx = avg - floorDist
    if (low <= tpTrigShort) {
      state.trailArmed = true
      if (tpIsAtr && state.atrLock == null && Number.isFinite(atrVal)) {
        state.atrLock = atrVal
        atrUsed = state.atrLock
        tpDist = atrUsed * p.tp_atr
        trailDist = atrUsed * p.trail_atr
        floorDist = Math.max(0, tpDist - trailDist)
        ceilPx = avg - floorDist
      }
    }
    if (state.trailArmed) {
      state.runExtreme =
        state.runExtreme == null ? low : Math.min(state.runExtreme, low)
      const newStop = Math.min(ceilPx, state.runExtreme + trailDist)
      state.trailStop =
        state.trailStop == null ? newStop : Math.min(state.trailStop, newStop)
      state.exitLive = true
    } else {
      state.exitLive = false
    }
  }
}

function mergeParams(raw?: Partial<RciDcaParams>): RciDcaParams {
  return { ...RCI_DCA_DEFAULT_PARAMS, ...(raw ?? {}) }
}

function seriesToChart(
  bars: Bar[],
  values: Float64Array,
): Array<{ time: number; value: number } | { time: number }> {
  const out: Array<{ time: number; value: number } | { time: number }> = []
  for (let i = 0; i < bars.length; i++) {
    const v = values[i]
    if (Number.isFinite(v)) out.push({ time: bars[i].time, value: v })
    else out.push({ time: bars[i].time })
  }
  return out
}

export function simulateRciDca(
  bars: Bar[],
  params?: Partial<RciDcaParams>,
  initialCash = 10_000,
): BacktestResult {
  const started = performance.now()
  const p = mergeParams(params)
  const n = bars.length
  const close = new Float64Array(n)
  const high = new Float64Array(n)
  const low = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    close[i] = bars[i].close
    high[i] = bars[i].high
    low[i] = bars[i].low
  }

  const stagePcts = [p.pct1, p.pct2, p.pct3, p.pct4, p.pct5]
  const fees = p.fees_pct
  const dcaIsAtr = p.dca_mode === 'atr'

  const rciS = computeRci(close, p.rci_short)
  const rciM = computeRci(close, p.rci_middle)
  const rciL = computeRci(close, p.rci_long)
  const atr = computeAtr(high, low, close, p.atr_len)

  const indWarmup =
    Math.max(p.rci_long, p.rci_middle, p.rci_short, p.atr_len) + 2
  const tradeI0 = Math.min(indWarmup, n)

  let cash = initialCash
  let realized = 0
  const state = emptyState()
  const deals: ClosedDeal[] = []
  const fillPnlsAll: number[] = []
  const equityRaw = new Float64Array(n)
  const signals: Signal[] = []

  const spendQuote = (stage: number): number => {
    const base = initialCash + realized
    const idx = Math.min(Math.max(0, stage), stagePcts.length - 1)
    return Math.max(0, (base * stagePcts[idx]) / 100)
  }

  for (let i = 0; i < n; i++) {
    if (i < tradeI0) {
      equityRaw[i] = cash
      continue
    }

    const hi = high[i]
    const lo = low[i]
    const cl = close[i]
    const atrI = atr[i]
    const rs = rciS[i]
    const rm = rciM[i]
    const rl = rciL[i]
    const rsP = i > 0 ? rciS[i - 1] : Number.NaN
    const longCond = longSignal(rs, rm, rl, rsP)
    const shortCond = shortSignal(rs, rm, rl, rsP)

    // 1) Fill exit from previous bar
    const fill = tryFillExit(state, hi, lo, p)
    if (fill.hit) {
      const { cashBack, rec, fillPnls } = closeDeal(
        state,
        fill.price,
        fees,
        i,
        fill.reason,
      )
      cash += cashBack
      realized += rec.pnl
      deals.push(rec)
      fillPnlsAll.push(...fillPnls)
      signals.push({
        time: bars[i].time,
        side: rec.side === 'long' ? 'sell' : 'buy',
        price: fill.price,
        label: fill.reason.toUpperCase(),
      })
    }

    // 1b) Optional invalidation
    const maxAdv = p.max_adverse_pct || 0
    if (maxAdv > 0 && !isFlat(state) && state.avgPrice > 0) {
      const hitInv =
        (state.side === 'long' && cl <= state.avgPrice * (1 - maxAdv / 100)) ||
        (state.side === 'short' && cl >= state.avgPrice * (1 + maxAdv / 100))
      if (hitInv) {
        const { cashBack, rec, fillPnls } = closeDeal(state, cl, fees, i, 'invalidation')
        cash += cashBack
        realized += rec.pnl
        deals.push(rec)
        fillPnlsAll.push(...fillPnls)
        signals.push({
          time: bars[i].time,
          side: rec.side === 'long' ? 'sell' : 'buy',
          price: cl,
          label: 'INV',
        })
      }
    }

    // 2) Flip short → long
    if (!isFlat(state) && state.side === 'short' && p.trade_long && longCond) {
      const { cashBack, rec, fillPnls } = closeDeal(state, cl, fees, i, 'flip_long')
      cash += cashBack
      realized += rec.pnl
      deals.push(rec)
      fillPnlsAll.push(...fillPnls)
      signals.push({
        time: bars[i].time,
        side: 'buy',
        price: cl,
        label: 'Flip',
      })
    }

    // 3) Signal reset
    if (!isFlat(state) && state.side === 'long' && !longCond) state.signalReset = true
    if (!isFlat(state) && state.side === 'short' && !shortCond) state.signalReset = true

    const atrOk = !dcaIsAtr || Number.isFinite(atrI)

    // 4) Entries / DCA
    if (isFlat(state)) {
      if (p.trade_long && longCond) {
        const quote = spendQuote(0)
        const spent = addToPosition(state, 'long', cl, Math.min(quote, cash), fees)
        if (spent > 0) {
          cash -= spent
          state.entriesUsed = 1
          state.lastEntryPrice = cl
          state.signalReset = false
          state.entryBar = i
          state.exitLive = false
          signals.push({ time: bars[i].time, side: 'buy', price: cl, label: 'L1' })
        }
      } else if (p.trade_short && shortCond) {
        const quote = spendQuote(0)
        const spent = addToPosition(state, 'short', cl, Math.min(quote, cash), fees)
        if (spent > 0) {
          cash -= spent
          state.entriesUsed = 1
          state.lastEntryPrice = cl
          state.signalReset = false
          state.entryBar = i
          state.exitLive = false
          signals.push({ time: bars[i].time, side: 'sell', price: cl, label: 'S1' })
        }
      }
    } else {
      const dcaReady = state.lastEntryPrice > 0 && atrOk
      const dist = dcaReady ? dcaDist(state, atrI, p) : 0

      if (
        state.side === 'long' &&
        p.dca_long &&
        state.signalReset &&
        longCond &&
        dcaReady &&
        state.entriesUsed < p.max_entries &&
        cl <= state.lastEntryPrice - dist
      ) {
        const quote = spendQuote(state.entriesUsed)
        const spent = addToPosition(state, 'long', cl, Math.min(quote, cash), fees)
        if (spent > 0) {
          cash -= spent
          state.entriesUsed += 1
          state.lastEntryPrice = cl
          state.signalReset = false
          resetTrail(state)
          signals.push({
            time: bars[i].time,
            side: 'buy',
            price: cl,
            label: `DCA${state.entriesUsed}`,
          })
        }
      } else if (
        state.side === 'short' &&
        p.dca_short &&
        state.signalReset &&
        shortCond &&
        dcaReady &&
        state.entriesUsed < p.max_entries &&
        cl >= state.lastEntryPrice + dist
      ) {
        const quote = spendQuote(state.entriesUsed)
        const spent = addToPosition(state, 'short', cl, Math.min(quote, cash), fees)
        if (spent > 0) {
          cash -= spent
          state.entriesUsed += 1
          state.lastEntryPrice = cl
          state.signalReset = false
          resetTrail(state)
          signals.push({
            time: bars[i].time,
            side: 'sell',
            price: cl,
            label: `DCA${state.entriesUsed}`,
          })
        }
      }
    }

    if (!isFlat(state)) updateExitState(state, hi, lo, atrI, p)

    if (isFlat(state)) equityRaw[i] = cash
    else if (state.side === 'long') equityRaw[i] = cash + state.qty * cl
    else equityRaw[i] = cash + state.costBasis - state.qty * cl
  }

  // Equity curve (downsample)
  const maxPoints = 4000
  const stride = Math.max(1, Math.ceil(n / maxPoints))
  const equity: EquityPoint[] = []
  for (let i = 0; i < n; i++) {
    if (i % stride === 0 || i === n - 1) {
      equity.push({ time: bars[i].time, equity: equityRaw[i] })
    }
  }

  const trades: Trade[] = deals.map((d) => ({
    entryTime: bars[Math.max(0, d.entryBar)]?.time ?? bars[0].time,
    exitTime: bars[d.exitBar]?.time ?? bars[n - 1].time,
    entryPrice: d.avgEntry,
    exitPrice: d.exitPrice,
    side: d.side,
    pnl: d.pnl,
    pnlPct: d.pnlPct,
    barsHeld: Math.max(1, d.exitBar - d.entryBar),
  }))

  const finalEquity = n ? equityRaw[n - 1] : initialCash
  const totalReturnPct = ((finalEquity - initialCash) / initialCash) * 100

  let peak = initialCash
  let maxDd = 0
  for (let i = tradeI0; i < n; i++) {
    const eq = equityRaw[i]
    if (eq > peak) peak = eq
    const dd = peak > 0 ? ((peak - eq) / peak) * 100 : 0
    if (dd > maxDd) maxDd = dd
  }

  const useFills = fillPnlsAll.length > 0
  const tradeCount = useFills ? fillPnlsAll.length : trades.length
  let winRatePct = 0
  let grossWin = 0
  let grossLoss = 0
  if (useFills) {
    const fillWins = fillPnlsAll.filter((x) => x > 0)
    winRatePct = tradeCount ? (fillWins.length / tradeCount) * 100 : 0
    grossWin = fillWins.reduce((s, x) => s + x, 0)
    grossLoss = Math.abs(
      fillPnlsAll.filter((x) => x <= 0).reduce((s, x) => s + x, 0),
    )
  } else {
    const dealWins = trades.filter((t) => t.pnl > 0)
    winRatePct = tradeCount ? (dealWins.length / tradeCount) * 100 : 0
    grossWin = dealWins.reduce((s, t) => s + t.pnl, 0)
    grossLoss = Math.abs(
      trades.filter((t) => t.pnl <= 0).reduce((s, t) => s + t.pnl, 0),
    )
  }
  const profitFactor =
    grossLoss > 1e-12 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0

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
    tradeCount,
    avgTradePct: trades.length
      ? trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length
      : 0,
    sharpeLike,
    finalEquity,
  }

  const indicators: NormalizedIndicator[] = [
    {
      id: 'rci-short',
      title: `RCI ${p.rci_short}`,
      pane: 'separate',
      paneId: 'rci',
      visible: true,
      color: '#2563eb',
      style: 'line',
      lineWidth: 2,
      data: seriesToChart(bars, rciS),
    },
    {
      id: 'rci-mid',
      title: `RCI ${p.rci_middle}`,
      pane: 'separate',
      paneId: 'rci',
      visible: true,
      color: '#dc2626',
      style: 'line',
      lineWidth: 2,
      data: seriesToChart(bars, rciM),
    },
    {
      id: 'rci-long',
      title: `RCI ${p.rci_long}`,
      pane: 'separate',
      paneId: 'rci',
      visible: true,
      color: '#16a34a',
      style: 'line',
      lineWidth: 2,
      data: seriesToChart(bars, rciL),
    },
  ]

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
