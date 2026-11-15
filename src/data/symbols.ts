import type { SymbolInfo, Timeframe } from '../types'

export const SYMBOLS: SymbolInfo[] = [
  { id: 'EURUSD', label: 'EUR/USD', basePrice: 1.085, volatility: 0.00035, seed: 11 },
  { id: 'AAPL', label: 'AAPL', basePrice: 178.4, volatility: 0.012, seed: 42 },
  { id: 'BTCUSD', label: 'BTC/USD', basePrice: 64200, volatility: 0.018, seed: 77 },
  { id: 'PETR4', label: 'PETR4', basePrice: 38.2, volatility: 0.016, seed: 23 },
]

export const TIMEFRAMES: { id: Timeframe; label: string; seconds: number }[] = [
  { id: '1m', label: '1m', seconds: 60 },
  { id: '5m', label: '5m', seconds: 300 },
  { id: '15m', label: '15m', seconds: 900 },
  { id: '1h', label: '1H', seconds: 3600 },
  { id: '4h', label: '4H', seconds: 14400 },
  { id: '1D', label: '1D', seconds: 86400 },
]

export const BAR_COUNTS = [
  { id: 5_000, label: '5k' },
  { id: 25_000, label: '25k' },
  { id: 100_000, label: '100k' },
] as const

export function getTimeframeSeconds(tf: Timeframe): number {
  return TIMEFRAMES.find((t) => t.id === tf)?.seconds ?? 3600
}
