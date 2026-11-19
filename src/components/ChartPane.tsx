import { useEffect, useRef } from 'react'
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type IPaneApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import { chartColors, type ThemeMode } from '../lib/theme'
import type { Bar, NormalizedIndicator, Signal } from '../types'

interface ChartPaneProps {
  bars: Bar[]
  signals: Signal[]
  indicators: NormalizedIndicator[]
  showVolume: boolean
  /** Local UI visibility overrides keyed by indicator id. */
  visibility: Record<string, boolean>
  /** Stretch factor for the main candle pane. */
  mainStretch?: number
  /** Stretch factor for each separate indicator pane. */
  separateStretch?: number
  /** Match chart chrome to app light/dark theme. */
  theme?: ThemeMode
}

type AnySeries = ISeriesApi<'Line'> | ISeriesApi<'Histogram'>

interface ManagedSeries {
  id: string
  paneId: string
  series: AnySeries
  style: 'line' | 'histogram'
}

function chartLayout(mode: ThemeMode) {
  const c = chartColors(mode)
  return {
    background: { type: ColorType.Solid as const, color: 'transparent' },
    textColor: c.text,
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 12,
    attributionLogo: false,
  }
}

function toUtcData(data: NormalizedIndicator['data']) {
  return data.map((p) =>
    'value' in p
      ? { time: p.time as UTCTimestamp, value: p.value }
      : { time: p.time as UTCTimestamp },
  )
}

/** Stable target pane key for an indicator (avoids empty/ghost paneIds). */
function targetPaneId(ind: NormalizedIndicator): string {
  if (ind.pane === 'overlay') return 'overlay'
  const raw = (ind.paneId || ind.id || 'separate').trim()
  return raw || ind.id || 'separate'
}

export function ChartPane({
  bars,
  signals,
  indicators,
  showVolume,
  visibility,
  mainStretch = 3,
  separateStretch = 1,
  theme = 'light',
}: ChartPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const managedRef = useRef<Map<string, ManagedSeries>>(new Map())
  const panesRef = useRef<Map<string, IPaneApi<Time>>>(new Map())
  const stretchRef = useRef({ main: mainStretch, separate: separateStretch })
  const themeRef = useRef(theme)
  stretchRef.current = { main: mainStretch, separate: separateStretch }
  themeRef.current = theme

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const colors = chartColors(themeRef.current)
    const chart = createChart(el, {
      autoSize: true,
      layout: chartLayout(themeRef.current),
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: colors.crosshair, width: 1, style: 2 },
        horzLine: { color: colors.crosshair, width: 1, style: 2 },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.08, bottom: showVolume ? 0.22 : 0.06 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    })

    const mainPane = chart.panes()[0]
    mainPane.setStretchFactor(stretchRef.current.main)

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: colors.up,
      downColor: colors.down,
      borderUpColor: colors.up,
      borderDownColor: colors.down,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
    })

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      color: colors.volumeUp,
    })
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    })

    chartRef.current = chart
    candleRef.current = candles
    volumeRef.current = volume
    markersRef.current = createSeriesMarkers(candles, [])
    panesRef.current.set('main', mainPane)

    return () => {
      managedRef.current.clear()
      panesRef.current.clear()
      markersRef.current = null
      candleRef.current = null
      volumeRef.current = null
      chartRef.current = null
      chart.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once; theme/volume updated below
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    const candles = candleRef.current
    if (!chart || !candles) return
    const colors = chartColors(theme)
    chart.applyOptions({
      layout: chartLayout(theme),
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      crosshair: {
        vertLine: { color: colors.crosshair },
        horzLine: { color: colors.crosshair },
      },
    })
    candles.applyOptions({
      upColor: colors.up,
      downColor: colors.down,
      borderUpColor: colors.up,
      borderDownColor: colors.down,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
    })
  }, [theme])

  useEffect(() => {
    chartRef.current?.priceScale('right').applyOptions({
      scaleMargins: { top: 0.08, bottom: showVolume ? 0.22 : 0.06 },
    })
    volumeRef.current?.applyOptions({ visible: showVolume })
  }, [showVolume])

  useEffect(() => {
    if (!candleRef.current || !volumeRef.current) return

    candleRef.current.setData(
      bars.map((b) => ({
        time: b.time as UTCTimestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    )

    const colors = chartColors(themeRef.current)
    volumeRef.current.setData(
      bars.map((b) => ({
        time: b.time as UTCTimestamp,
        value: b.volume,
        color: b.close >= b.open ? colors.volumeUp : colors.volumeDown,
      })),
    )

    chartRef.current?.timeScale().fitContent()
  }, [bars, theme])

  useEffect(() => {
    if (!markersRef.current) return

    const colors = chartColors(theme)
    const maxMarkers = 2500
    const step = Math.max(1, Math.ceil(signals.length / maxMarkers))
    const markers: SeriesMarker<Time>[] = []

    for (let i = 0; i < signals.length; i += step) {
      const s = signals[i]
      const isBuy = s.side === 'buy'
      markers.push({
        time: s.time as UTCTimestamp,
        position: isBuy ? 'belowBar' : 'aboveBar',
        color: isBuy ? colors.up : colors.down,
        shape: isBuy ? 'arrowUp' : 'arrowDown',
        text: s.label ?? (isBuy ? 'C' : 'V'),
      })
    }

    markersRef.current.setMarkers(markers)
  }, [signals, theme])

  // Reconcile indicator series onto overlay / separate panes (setData only — no React per point)
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    const managed = managedRef.current
    const panes = panesRef.current
    const nextIds = new Set(indicators.map((ind) => ind.id))

    for (const [id, entry] of managed) {
      if (!nextIds.has(id)) {
        try {
          chart.removeSeries(entry.series)
        } catch {
          /* already gone */
        }
        managed.delete(id)
      }
    }

    // Needed separate panes in stable sorted order (avoids layout thrash / index ghosts)
    const neededPaneIds = [
      ...new Set(
        indicators
          .filter((ind) => ind.pane === 'separate')
          .map((ind) => targetPaneId(ind)),
      ),
    ].sort()

    // Drop empty separate panes — highest paneIndex first so removals don't shift lower indices
    const removable = [...panes.entries()]
      .filter(([paneId]) => paneId !== 'main' && !neededPaneIds.includes(paneId))
      .map(([paneId, pane]) => {
        let idx = -1
        try {
          idx = pane.paneIndex()
        } catch {
          idx = -1
        }
        return { paneId, pane, idx }
      })
      .filter((x) => x.idx >= 0)
      .sort((a, b) => b.idx - a.idx)

    for (const { paneId, pane } of removable) {
      try {
        chart.removePane(pane.paneIndex())
      } catch {
        /* pane may already be gone */
      }
      panes.delete(paneId)
    }

    for (const ind of indicators) {
      const shown =
        visibility[ind.id] !== undefined ? visibility[ind.id] : ind.visible
      const paneKey = targetPaneId(ind)

      let entry = managed.get(ind.id)
      const wantsHistogram = ind.style === 'histogram'
      const needsRecreate =
        entry &&
        (entry.style !== ind.style || entry.paneId !== paneKey)

      if (needsRecreate && entry) {
        try {
          chart.removeSeries(entry.series)
        } catch {
          /* ignore */
        }
        managed.delete(ind.id)
        entry = undefined
      }

      if (!entry) {
        if (ind.pane === 'overlay') {
          const series = wantsHistogram
            ? chart.addSeries(HistogramSeries, {
                color: ind.color,
                priceScaleId: 'right',
                lastValueVisible: false,
                priceLineVisible: false,
              })
            : chart.addSeries(LineSeries, {
                color: ind.color,
                lineWidth: ind.lineWidth as 1 | 2 | 3 | 4,
                priceScaleId: 'right',
                lastValueVisible: false,
                priceLineVisible: false,
                crosshairMarkerVisible: false,
              })
          entry = {
            id: ind.id,
            paneId: 'overlay',
            series,
            style: ind.style,
          }
        } else {
          let pane = panes.get(paneKey)
          if (!pane) {
            pane = chart.addPane(true)
            pane.setStretchFactor(stretchRef.current.separate)
            panes.set(paneKey, pane)
          }
          const series = wantsHistogram
            ? pane.addSeries(HistogramSeries, {
                color: ind.color,
                lastValueVisible: true,
                priceLineVisible: false,
              })
            : pane.addSeries(LineSeries, {
                color: ind.color,
                lineWidth: ind.lineWidth as 1 | 2 | 3 | 4,
                lastValueVisible: true,
                priceLineVisible: false,
                crosshairMarkerVisible: false,
              })
          entry = {
            id: ind.id,
            paneId: paneKey,
            series,
            style: ind.style,
          }
        }
        managed.set(ind.id, entry)
      }

      entry.series.applyOptions(
        wantsHistogram
          ? { color: ind.color, visible: shown }
          : {
              color: ind.color,
              lineWidth: ind.lineWidth as 1 | 2 | 3 | 4,
              visible: shown,
            },
      )
      entry.series.setData(toUtcData(ind.data))
    }

    // Apply stretch from active layout preset
    const main = panes.get('main') ?? chart.panes()[0]
    const separateCount = [...panes.keys()].filter((k) => k !== 'main').length
    main?.setStretchFactor(
      separateCount > 0 ? stretchRef.current.main : stretchRef.current.main,
    )
    for (const [paneId, pane] of panes) {
      if (paneId === 'main') continue
      try {
        pane.setStretchFactor(stretchRef.current.separate)
      } catch {
        /* ignore */
      }
    }
  }, [indicators, visibility, mainStretch, separateStretch])

  return (
    <div
      className="chart-pane"
      ref={containerRef}
      role="img"
      aria-label="Gráfico de velas e indicadores"
    />
  )
}
