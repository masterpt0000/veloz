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

const API_URL = (import.meta.env.VITE_CANDLES_API_URL as string | undefined)?.replace(
  /\/$/,
  '',
)
const API_KEY = import.meta.env.VITE_CANDLES_API_KEY as string | undefined

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

  const headers: HeadersInit = { Accept: 'application/json' }
  if (API_KEY) headers['X-API-Key'] = API_KEY

  try {
    const res = await fetch(`${API_URL}/candles?${qs}`, { headers })
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
