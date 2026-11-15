/** Default sample strategy shown in the editor (SMA crossover). */
export const SAMPLE_STRATEGY_CODE = `/**
 * Veloz strategy API
 * -----------------
 * Export a function named \`strategy\` that receives bars and returns signals.
 *
 * bars: Array<{ time, open, high, low, close, volume }>
 * return: { signals: Array<{ time, side: 'buy'|'sell', label? }> }
 *
 * The engine turns buy/sell flips into long trades and builds the equity curve.
 */
function sma(values, period, end) {
  if (end + 1 < period) return null;
  let sum = 0;
  for (let i = end - period + 1; i <= end; i++) sum += values[i];
  return sum / period;
}

export function strategy(bars) {
  const fastPeriod = 12;
  const slowPeriod = 48;
  const closes = bars.map((b) => b.close);
  const signals = [];

  let prevFast = null;
  let prevSlow = null;
  let position = 0; // 0 flat, 1 long

  for (let i = 0; i < bars.length; i++) {
    const fast = sma(closes, fastPeriod, i);
    const slow = sma(closes, slowPeriod, i);
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

  return { signals };
}
`
