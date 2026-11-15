import type { Bar, EquityPoint, Signal, StrategyMetrics, Trade } from '../types'

export function signalsToTrades(bars: Bar[], signals: Signal[]): Trade[] {
  if (!bars.length || !signals.length) return []

  const byTime = new Map<number, Bar>()
  for (const b of bars) byTime.set(b.time, b)

  const sorted = [...signals].sort((a, b) => a.time - b.time)
  const trades: Trade[] = []
  let open: { time: number; price: number; index: number } | null = null

  const barIndex = new Map<number, number>()
  bars.forEach((b, i) => barIndex.set(b.time, i))

  for (const signal of sorted) {
    const bar = byTime.get(signal.time)
    if (!bar) continue
    const price = signal.price ?? bar.close
    const idx = barIndex.get(signal.time) ?? 0

    if (signal.side === 'buy' && !open) {
      open = { time: signal.time, price, index: idx }
    } else if (signal.side === 'sell' && open) {
      const pnl = price - open.price
      const pnlPct = (pnl / open.price) * 100
      trades.push({
        entryTime: open.time,
        exitTime: signal.time,
        entryPrice: open.price,
        exitPrice: price,
        side: 'long',
        pnl,
        pnlPct,
        barsHeld: Math.max(1, idx - open.index),
      })
      open = null
    }
  }

  return trades
}

export function buildEquityCurve(
  bars: Bar[],
  trades: Trade[],
  initialCapital: number,
): EquityPoint[] {
  if (!bars.length) return []

  const exits = new Map<number, Trade[]>()
  for (const t of trades) {
    const list = exits.get(t.exitTime)
    if (list) list.push(t)
    else exits.set(t.exitTime, [t])
  }

  // Downsample equity for very large series: keep ~4k points max for the panel chart
  const maxPoints = 4000
  const stride = Math.max(1, Math.ceil(bars.length / maxPoints))
  const equity: EquityPoint[] = []
  let capital = initialCapital
  let openEntry: number | null = null

  const entries = new Map<number, number>()
  for (const t of trades) entries.set(t.entryTime, t.entryPrice)

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i]
    if (entries.has(bar.time)) openEntry = entries.get(bar.time)!
    const closed = exits.get(bar.time)
    if (closed) {
      for (const t of closed) {
        capital += (t.pnl / t.entryPrice) * (initialCapital * 0.1) // 10% notional per trade
      }
      openEntry = null
    }

    let mark = capital
    if (openEntry != null) {
      const unrealized = ((bar.close - openEntry) / openEntry) * (initialCapital * 0.1)
      mark = capital + unrealized
    }

    if (i % stride === 0 || i === bars.length - 1 || closed) {
      equity.push({ time: bar.time, equity: mark })
    }
  }

  return equity
}

export function computeMetrics(
  equity: EquityPoint[],
  trades: Trade[],
  initialCapital: number,
): StrategyMetrics {
  const finalEquity = equity.length ? equity[equity.length - 1].equity : initialCapital
  const totalReturnPct = ((finalEquity - initialCapital) / initialCapital) * 100

  let peak = initialCapital
  let maxDd = 0
  for (const p of equity) {
    if (p.equity > peak) peak = p.equity
    const dd = peak > 0 ? ((peak - p.equity) / peak) * 100 : 0
    if (dd > maxDd) maxDd = dd
  }

  const wins = trades.filter((t) => t.pnl > 0)
  const losses = trades.filter((t) => t.pnl <= 0)
  const winRatePct = trades.length ? (wins.length / trades.length) * 100 : 0
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0)
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0))
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0
  const avgTradePct = trades.length
    ? trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length
    : 0

  // Rough Sharpe-like from equity returns
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

  return {
    totalReturnPct,
    maxDrawdownPct: maxDd,
    winRatePct,
    profitFactor: Number.isFinite(profitFactor) ? profitFactor : 99,
    tradeCount: trades.length,
    avgTradePct,
    sharpeLike,
    finalEquity,
  }
}
