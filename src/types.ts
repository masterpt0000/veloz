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

/** Where an indicator series is drawn. */
export type IndicatorPane = 'overlay' | 'separate'

/** Visual style for an indicator series. */
export type IndicatorStyle = 'line' | 'histogram'

/** Sparse point form accepted from strategy code. */
export interface IndicatorPoint {
  time: BarTime
  value: number
}

/**
 * Indicator declared by strategy code (TradingView-like).
 *
 * - `pane: 'overlay'` → drawn on the candle price scale
 * - `pane: 'separate'` → own sub-pane under the main chart
 * - `visible: false` → hidden (can still be toggled in the UI)
 * - `paneId` → group several series into the same separate pane (e.g. MACD)
 * - `values` → either one number|null per bar (aligned with `bars`) or `{time,value}[]`
 */
export interface StrategyIndicator {
  id: string
  title: string
  values: Array<number | null> | IndicatorPoint[]
  pane: IndicatorPane
  visible?: boolean
  color?: string
  style?: IndicatorStyle
  lineWidth?: number
  paneId?: string
}

/** Normalized point ready for lightweight-charts setData (whitespace = gap). */
export type IndicatorChartPoint =
  | { time: BarTime; value: number }
  | { time: BarTime }

export interface NormalizedIndicator {
  id: string
  title: string
  pane: IndicatorPane
  paneId: string
  visible: boolean
  color: string
  style: IndicatorStyle
  lineWidth: number
  data: IndicatorChartPoint[]
}

export interface BacktestResult {
  signals: Signal[]
  trades: Trade[]
  equity: EquityPoint[]
  metrics: StrategyMetrics
  indicators: NormalizedIndicator[]
  durationMs: number
  barCount: number
}

/** Builtin engines that skip user JS (ported from TraderBot / backtest builder). */
export type BuiltinEngine = 'rci_dca' | 'builder'

export interface BacktestRequest {
  id: number
  code: string
  bars: Bar[]
  initialCapital: number
  /** When set, worker runs a ported engine instead of compiling code. */
  builtin?: BuiltinEngine
  /** Params for builtin engines (JSON-serializable). */
  builtinParams?: Record<string, unknown>
}

export type BacktestResponse =
  | { id: number; ok: true; result: BacktestResult }
  | { id: number; ok: false; error: string }
