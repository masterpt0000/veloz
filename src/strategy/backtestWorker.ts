import type { BacktestRequest, BacktestResponse, Bar, Signal } from '../types'
import { buildEquityCurve, computeMetrics, signalsToTrades } from './metrics'
import { normalizeIndicators } from './normalizeIndicators'
import { runBuilderSpec } from './builderEngine'
import { simulateRciDca, type RciDcaParams } from './rciDcaEngine'

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

function extractIndicators(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'indicators' in raw) {
    return (raw as { indicators?: unknown }).indicators ?? []
  }
  return []
}

function runCodeBacktest(req: BacktestRequest): BacktestResponse {
  const started = performance.now()
  try {
    const strategy = compileStrategy(req.code)
    const raw = strategy(req.bars)
    const signals = normalizeSignals(raw)
    const indicators = normalizeIndicators(req.bars, extractIndicators(raw))
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
        indicators,
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

function runBuiltin(req: BacktestRequest): BacktestResponse {
  try {
    if (req.builtin === 'rci_dca') {
      const result = simulateRciDca(
        req.bars,
        req.builtinParams as Partial<RciDcaParams> | undefined,
        req.initialCapital,
      )
      return { id: req.id, ok: true, result }
    }
    if (req.builtin === 'builder') {
      const result = runBuilderSpec(
        req.bars,
        req.builtinParams,
        req.initialCapital,
      )
      return { id: req.id, ok: true, result }
    }
    return {
      id: req.id,
      ok: false,
      error: `Motor builtin desconhecido: ${String(req.builtin)}`,
    }
  } catch (err) {
    return {
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

function runBacktest(req: BacktestRequest): BacktestResponse {
  if (req.builtin) return runBuiltin(req)
  return runCodeBacktest(req)
}

const workerScope = self as unknown as DedicatedWorkerGlobalScope

workerScope.onmessage = (event: MessageEvent<BacktestRequest>) => {
  workerScope.postMessage(runBacktest(event.data))
}
