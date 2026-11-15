import type { BacktestRequest, BacktestResponse, Bar, Signal } from '../types'
import { buildEquityCurve, computeMetrics, signalsToTrades } from './metrics'

function compileStrategy(code: string): (bars: Bar[]) => unknown {
  // Strip ES export so new Function can wrap user code safely in the worker.
  const cleaned = code
    .replace(/^\s*export\s+default\s+function\s+/m, 'function ')
    .replace(/^\s*export\s+function\s+/gm, 'function ')
    .replace(/^\s*export\s+\{[^}]+\}\s*;?\s*$/gm, '')
    .replace(/^\s*export\s+const\s+strategy\s*=/m, 'const strategy =')

  // eslint-disable-next-line no-new-func
  const factory = new Function(
    `${cleaned}\n; if (typeof strategy !== 'function') throw new Error('Defina export function strategy(bars)'); return strategy;`,
  )
  return factory() as (bars: Bar[]) => unknown
}

function normalizeSignals(raw: unknown): Signal[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw as Signal[]
  if (typeof raw === 'object' && raw !== null && 'signals' in raw) {
    const signals = (raw as { signals?: unknown }).signals
    return Array.isArray(signals) ? (signals as Signal[]) : []
  }
  throw new Error('A estratégia deve devolver { signals: [...] }')
}

function runBacktest(req: BacktestRequest): BacktestResponse {
  const started = performance.now()
  try {
    const strategy = compileStrategy(req.code)
    const raw = strategy(req.bars)
    const signals = normalizeSignals(raw)
    const trades = signalsToTrades(req.bars, signals)
    const equity = buildEquityCurve(req.bars, trades, req.initialCapital)
    const metrics = computeMetrics(equity, trades, req.initialCapital)
    return {
      id: req.id,
      ok: true,
      result: {
        signals,
        trades,
        equity,
        metrics,
        durationMs: performance.now() - started,
        barCount: req.bars.length,
      },
    }
  } catch (err) {
    return {
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

const workerScope = self as unknown as DedicatedWorkerGlobalScope

workerScope.onmessage = (event: MessageEvent<BacktestRequest>) => {
  workerScope.postMessage(runBacktest(event.data))
}
