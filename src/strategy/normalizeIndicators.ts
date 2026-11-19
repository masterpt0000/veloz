import type {
  Bar,
  IndicatorChartPoint,
  IndicatorPoint,
  NormalizedIndicator,
  StrategyIndicator,
} from '../types'

const DEFAULT_COLORS = [
  '#0f766e',
  '#d97706',
  '#0369a1',
  '#7c3aed',
  '#be123c',
  '#15803d',
]

function isPointArray(
  values: StrategyIndicator['values'],
): values is IndicatorPoint[] {
  return (
    Array.isArray(values) &&
    values.length > 0 &&
    typeof values[0] === 'object' &&
    values[0] !== null &&
    'time' in values[0]
  )
}

function toChartData(
  bars: Bar[],
  values: StrategyIndicator['values'],
): IndicatorChartPoint[] {
  if (isPointArray(values)) {
    const out: IndicatorChartPoint[] = []
    for (const p of values) {
      if (p == null || !Number.isFinite(p.time)) continue
      if (p.value == null || !Number.isFinite(p.value)) {
        out.push({ time: p.time })
      } else {
        out.push({ time: p.time, value: p.value })
      }
    }
    return out
  }

  const aligned = values as Array<number | null>
  const n = Math.min(bars.length, aligned.length)
  const out: IndicatorChartPoint[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const v = aligned[i]
    if (v == null || !Number.isFinite(v)) out[i] = { time: bars[i].time }
    else out[i] = { time: bars[i].time, value: v }
  }
  return out
}

/** Normalize raw strategy indicators for chart setData (runs in the worker). */
export function normalizeIndicators(
  bars: Bar[],
  raw: unknown,
): NormalizedIndicator[] {
  if (raw == null) return []
  if (!Array.isArray(raw)) {
    throw new Error('indicators deve ser um array')
  }

  const out: NormalizedIndicator[] = []
  const seenIds = new Set<string>()
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i] as Partial<StrategyIndicator> | null
    if (!item || typeof item !== 'object') continue
    let id = String(item.id ?? `ind-${i}`).trim() || `ind-${i}`
    // Uniquify duplicate ids so chart reconcile does not thrash / ghost panes
    if (seenIds.has(id)) {
      let n = 2
      while (seenIds.has(`${id}_${n}`)) n += 1
      id = `${id}_${n}`
    }
    seenIds.add(id)
    const title = String(item.title ?? id)
    const pane = item.pane === 'separate' ? 'separate' : 'overlay'
    if (!item.values || !Array.isArray(item.values)) {
      throw new Error(`Indicador "${id}" precisa de values[]`)
    }
    const paneIdRaw = String(
      item.paneId ?? (pane === 'separate' ? id : 'overlay'),
    ).trim()

    out.push({
      id,
      title,
      pane,
      paneId: paneIdRaw || (pane === 'separate' ? id : 'overlay'),
      visible: item.visible !== false,
      color: item.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
      style: item.style === 'histogram' ? 'histogram' : 'line',
      lineWidth: Math.min(4, Math.max(1, Number(item.lineWidth) || 2)),
      data: toChartData(bars, item.values),
    })
  }
  return out
}
