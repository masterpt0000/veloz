/** Default sample strategy: SMA crossover + overlay SMAs + RSI pane. */
export const SAMPLE_STRATEGY_CODE = `/**
 * Veloz strategy API
 * -----------------
 * Export \`strategy(bars)\` returning:
 *
 * {
 *   signals: Array<{ time, side: 'buy'|'sell', label? }>,
 *   indicators?: Array<{
 *     id: string,
 *     title: string,
 *     values: Array<number|null> | Array<{ time, value }>,  // null = gap
 *     pane: 'overlay' | 'separate',   // overlay = on candles; separate = sub-pane
 *     visible?: boolean,              // false = hide (default true)
 *     color?: string,
 *     style?: 'line' | 'histogram',
 *     lineWidth?: number,
 *     paneId?: string,                // group series in the same separate pane
 *   }>
 * }
 *
 * Show/hide: set visible:false in code, or use the Indicadores toggles in the UI.
 * Pane: 'overlay' for SMA/EMA on price; 'separate' for RSI/MACD below.
 */
function sma(values, period, end) {
  if (end + 1 < period) return null;
  let sum = 0;
  for (let i = end - period + 1; i <= end; i++) sum += values[i];
  return sum / period;
}

function rsiSeries(closes, period) {
  const out = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function strategy(bars) {
  const fastPeriod = 12;
  const slowPeriod = 48;
  const rsiPeriod = 14;
  const closes = bars.map((b) => b.close);
  const signals = [];
  const smaFast = new Array(bars.length).fill(null);
  const smaSlow = new Array(bars.length).fill(null);

  let prevFast = null;
  let prevSlow = null;
  let position = 0; // 0 flat, 1 long

  for (let i = 0; i < bars.length; i++) {
    const fast = sma(closes, fastPeriod, i);
    const slow = sma(closes, slowPeriod, i);
    smaFast[i] = fast;
    smaSlow[i] = slow;
    if (fast == null || slow == null || prevFast == null || prevSlow == null) {
      prevFast = fast;
      prevSlow = slow;
      continue;
    }

    const crossedUp = prevFast <= prevSlow && fast > slow;
    const crossedDown = prevFast >= prevSlow && fast < slow;

    if (crossedUp && position === 0) {
      signals.push({ time: bars[i].time, side: 'buy', label: 'SMA↑' });
      position = 1;
    } else if (crossedDown && position === 1) {
      signals.push({ time: bars[i].time, side: 'sell', label: 'SMA↓' });
      position = 0;
    }

    prevFast = fast;
    prevSlow = slow;
  }

  const rsi = rsiSeries(closes, rsiPeriod);

  return {
    signals,
    indicators: [
      {
        id: 'sma-fast',
        title: 'SMA 12',
        values: smaFast,
        pane: 'overlay',
        visible: true,
        color: '#0369a1',
        lineWidth: 2,
      },
      {
        id: 'sma-slow',
        title: 'SMA 48',
        values: smaSlow,
        pane: 'overlay',
        visible: true,
        color: '#d97706',
        lineWidth: 2,
      },
      {
        id: 'rsi',
        title: 'RSI 14',
        values: rsi,
        pane: 'separate',
        paneId: 'rsi',
        visible: true,
        color: '#7c3aed',
        style: 'line',
        lineWidth: 2,
      },
    ],
  };
}
`
