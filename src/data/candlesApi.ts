import type { Bar, Timeframe } from '../types'

export interface CandlesPage {
  symbol: string
  timeframe: Timeframe
  bars: Bar[]
  nextBefore: number | null
  hasMore: boolean
}

export interface FetchCandlesParams {
  symbol: string
  timeframe: Timeframe
  from?: number
  to?: number
  before?: number
  limit?: number
}

export interface SymbolCoverage {
  symbol: string
  minTs: string | null
  maxTs: string | null
  minTime: number | null
  maxTime: number | null
  barCount: number
}

export interface BackfillSymbolProgress {
  status: string
  bars: number
  error: string | null
}

export interface BackfillJob {
  id: string
  status: string
  symbols: string[]
  from: string | null
  to: string | null
  progress: Record<string, BackfillSymbolProgress>
  error: string | null
  createdAt: string | null
  startedAt: string | null
  finishedAt: string | null
}

const API_URL = (import.meta.env.VITE_CANDLES_API_URL as string | undefined)?.replace(
  /\/$/,
  '',
)
const API_KEY = import.meta.env.VITE_CANDLES_API_KEY as string | undefined

function apiHeaders(json = false): HeadersInit {
  const headers: HeadersInit = { Accept: 'application/json' }
  if (json) headers['Content-Type'] = 'application/json'
  if (API_KEY) headers['X-API-Key'] = API_KEY
  return headers
}

/** True when Veloz should prefer the candles HTTP API over demo generators. */
export function isCandlesApiConfigured(): boolean {
  return Boolean(API_URL)
}

/**
 * Fetch a window of OHLCV bars from the Veloz candles API.
 * Returns null when `VITE_CANDLES_API_URL` is unset or the request fails.
 */
export async function fetchCandles(
  params: FetchCandlesParams,
): Promise<CandlesPage | null> {
  if (!API_URL) return null

  const qs = new URLSearchParams()
  qs.set('symbol', params.symbol)
  qs.set('timeframe', params.timeframe)
  qs.set('limit', String(params.limit ?? 5_000))
  if (params.from != null) qs.set('from', String(params.from))
  if (params.to != null) qs.set('to', String(params.to))
  if (params.before != null) qs.set('before', String(params.before))

  try {
    const res = await fetch(`${API_URL}/candles?${qs}`, { headers: apiHeaders() })
    if (!res.ok) {
      console.warn('[candlesApi] HTTP', res.status, await res.text())
      return null
    }
    const data = (await res.json()) as CandlesPage
    if (!Array.isArray(data.bars)) return null
    return data
  } catch (err) {
    console.warn('[candlesApi] fetch failed', err)
    return null
  }
}

export async function fetchSymbolCoverage(): Promise<SymbolCoverage[] | null> {
  if (!API_URL) return null
  try {
    const res = await fetch(`${API_URL}/symbols`, { headers: apiHeaders() })
    if (!res.ok) {
      console.warn('[candlesApi] /symbols', res.status, await res.text())
      return null
    }
    const data = (await res.json()) as { symbols: SymbolCoverage[] }
    return Array.isArray(data.symbols) ? data.symbols : null
  } catch (err) {
    console.warn('[candlesApi] /symbols failed', err)
    return null
  }
}

export async function startBackfill(params: {
  symbols: string[]
  from?: string
  to?: string
}): Promise<BackfillJob | null> {
  if (!API_URL) return null
  const body: Record<string, unknown> = { symbols: params.symbols }
  if (params.from) body.from = params.from
  if (params.to) body.to = params.to
  try {
    const res = await fetch(`${API_URL}/backfill`, {
      method: 'POST',
      headers: apiHeaders(true),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      console.warn('[candlesApi] /backfill', res.status, await res.text())
      return null
    }
    return (await res.json()) as BackfillJob
  } catch (err) {
    console.warn('[candlesApi] /backfill failed', err)
    return null
  }
}

export async function fetchBackfillJob(jobId: string): Promise<BackfillJob | null> {
  if (!API_URL) return null
  try {
    const res = await fetch(`${API_URL}/backfill/${encodeURIComponent(jobId)}`, {
      headers: apiHeaders(),
    })
    if (!res.ok) {
      console.warn('[candlesApi] /backfill/:id', res.status, await res.text())
      return null
    }
    return (await res.json()) as BackfillJob
  } catch (err) {
    console.warn('[candlesApi] /backfill/:id failed', err)
    return null
  }
}
