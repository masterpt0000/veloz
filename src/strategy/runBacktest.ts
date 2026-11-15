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
    const onMessage = (event: MessageEvent<BacktestResponse>) => {
      if (event.data.id !== id) return
      w.removeEventListener('message', onMessage)
      w.removeEventListener('error', onError)
      if (event.data.ok) resolve(event.data.result)
      else reject(new Error(event.data.error))
    }
    const onError = (event: ErrorEvent) => {
      w.removeEventListener('message', onMessage)
      w.removeEventListener('error', onError)
      reject(event.error ?? new Error(event.message || 'Worker falhou'))
    }

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
