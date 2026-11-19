/**
 * Persist backtest run summaries (metrics + equity + trades) in localStorage.
 */

import type {
  BacktestResult,
  EquityPoint,
  StrategyMetrics,
  Trade,
} from '../types'

const STORAGE_KEY = 'veloz.runHistory.v1'
const MAX_RUNS = 30
/** Cap equity points stored per run to keep quota healthy. */
const MAX_EQUITY_POINTS = 800

export interface RunHistoryMeta {
  symbolId: string
  symbolLabel: string
  timeframe: string
  barCount: number
  strategyId: string
  strategyName: string
  initialCapital: number
}

export interface SavedRun {
  id: string
  createdAt: number
  meta: RunHistoryMeta
  metrics: StrategyMetrics
  /** May be downsampled vs live result. */
  equity: EquityPoint[]
  trades: Trade[]
  durationMs: number
  /** Signals omitted from history (too large); chart reopens without markers. */
}

export interface RunHistoryStore {
  runs: SavedRun[]
}

function uid(): string {
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function downsampleEquity(
  equity: EquityPoint[],
  maxPoints = MAX_EQUITY_POINTS,
): EquityPoint[] {
  if (equity.length <= maxPoints) return equity
  const out: EquityPoint[] = []
  const step = (equity.length - 1) / (maxPoints - 1)
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.min(equity.length - 1, Math.round(i * step))
    out.push(equity[idx])
  }
  // Always keep last point exact
  out[out.length - 1] = equity[equity.length - 1]
  return out
}

export function loadRunHistory(): RunHistoryStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { runs: [] }
    const parsed = JSON.parse(raw) as RunHistoryStore
    if (!parsed || !Array.isArray(parsed.runs)) return { runs: [] }
    return {
      runs: parsed.runs.filter(
        (r) => r && typeof r.id === 'string' && r.metrics && Array.isArray(r.equity),
      ),
    }
  } catch {
    return { runs: [] }
  }
}

export function saveRunHistory(store: RunHistoryStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Quota — drop oldest half and retry once
    try {
      const trimmed = { runs: store.runs.slice(0, Math.floor(MAX_RUNS / 2)) }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
    } catch {
      /* ignore */
    }
  }
}

export function appendRun(
  store: RunHistoryStore,
  result: BacktestResult,
  meta: RunHistoryMeta,
): RunHistoryStore {
  const entry: SavedRun = {
    id: uid(),
    createdAt: Date.now(),
    meta: { ...meta },
    metrics: { ...result.metrics },
    equity: downsampleEquity(result.equity),
    trades: result.trades.slice(0, 2_000),
    durationMs: result.durationMs,
  }
  const runs = [entry, ...store.runs].slice(0, MAX_RUNS)
  const next = { runs }
  saveRunHistory(next)
  return next
}

export function deleteRun(store: RunHistoryStore, id: string): RunHistoryStore {
  const next = { runs: store.runs.filter((r) => r.id !== id) }
  saveRunHistory(next)
  return next
}

export function clearRunHistory(): RunHistoryStore {
  const next = { runs: [] }
  saveRunHistory(next)
  return next
}

/** Rebuild a BacktestResult-shaped object for the Results / Equity UI. */
export function savedRunToResult(run: SavedRun): BacktestResult {
  return {
    signals: [],
    trades: run.trades,
    equity: run.equity,
    metrics: run.metrics,
    indicators: [],
    durationMs: run.durationMs,
    barCount: run.meta.barCount,
  }
}
