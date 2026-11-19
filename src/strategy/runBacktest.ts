import type {
  BacktestRequest,
  BacktestResponse,
  BacktestResult,
  Bar,
  BuiltinEngine,
} from '../types'
import BacktestWorker from './backtestWorker?worker'

let worker: Worker | null = null
let nextId = 1

/** Hard cap so a hung worker cannot leave the UI stuck on 「A executar…」. */
const BACKTEST_TIMEOUT_MS = 60_000

function getWorker(): Worker {
  if (!worker) {
    worker = new BacktestWorker()
  }
  return worker
}

export interface RunBacktestOptions {
  builtin?: BuiltinEngine
  builtinParams?: Record<string, unknown>
}

export function runBacktest(
  code: string,
  bars: Bar[],
  initialCapital = 10_000,
  options?: RunBacktestOptions,
): Promise<BacktestResult> {
  const id = nextId++
  const w = getWorker()

  return new Promise((resolve, reject) => {
    let settled = false

    const cleanup = () => {
      w.removeEventListener('message', onMessage)
      w.removeEventListener('error', onError)
      window.clearTimeout(timer)
    }

    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      fn()
    }

    const onMessage = (event: MessageEvent<BacktestResponse>) => {
      if (event.data.id !== id) return
      settle(() => {
        if (event.data.ok) resolve(event.data.result)
        else reject(new Error(event.data.error))
      })
    }
    const onError = (event: ErrorEvent) => {
      settle(() => {
        reject(event.error ?? new Error(event.message || 'Worker falhou'))
      })
    }

    const timer = window.setTimeout(() => {
      settle(() => {
        reject(
          new Error(
            `Backtest excedeu o tempo limite (${BACKTEST_TIMEOUT_MS / 1000}s)`,
          ),
        )
      })
    }, BACKTEST_TIMEOUT_MS)

    w.addEventListener('message', onMessage)
    w.addEventListener('error', onError)

    const payload: BacktestRequest = {
      id,
      code,
      bars,
      initialCapital,
      builtin: options?.builtin,
      builtinParams: options?.builtinParams,
    }
    w.postMessage(payload)
  })
}
