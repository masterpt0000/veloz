/** UTC timestamp in seconds (lightweight-charts UTCTimestamp). */
export type BarTime = number

export interface Bar {
  time: BarTime
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1D'

export interface SymbolInfo {
  id: string
  label: string
  basePrice: number
  volatility: number
  seed: number
}

export type SignalSide = 'buy' | 'sell'

export interface Signal {
  time: BarTime
  side: SignalSide
  price?: number
  label?: string
}

export interface Trade {
  entryTime: BarTime
  exitTime: BarTime
  entryPrice: number
  exitPrice: number
  side: 'long' | 'short'
  pnl: number
  pnlPct: number
  barsHeld: number
}

export interface EquityPoint {
  time: BarTime
  equity: number
}

export interface StrategyMetrics {
  totalReturnPct: number
  maxDrawdownPct: number
  winRatePct: number
  profitFactor: number
  tradeCount: number
  avgTradePct: number
  sharpeLike: number
  finalEquity: number
}

export interface BacktestResult {
  signals: Signal[]
  trades: Trade[]
  equity: EquityPoint[]
  metrics: StrategyMetrics
  durationMs: number
  barCount: number
}

export interface BacktestRequest {
  id: number
  code: string
  bars: Bar[]
  initialCapital: number
}

export type BacktestResponse =
  | { id: number; ok: true; result: BacktestResult }
  | { id: number; ok: false; error: string }
