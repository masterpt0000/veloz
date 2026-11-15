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
import type { Bar, NormalizedIndicator, Signal } from '../types'

interface ChartPaneProps {
  bars: Bar[]
  signals: Signal[]
  indicators: NormalizedIndicator[]
  showVolume: boolean
  /** Local UI visibility overrides keyed by indicator id. */
  visibility: Record<string, boolean>
}

type AnySeries = ISeriesApi<'Line'> | ISeriesApi<'Histogram'>

interface ManagedSeries {
  id: string
  paneId: string
  series: AnySeries
  style: 'line' | 'histogram'
}

const CHART_LAYOUT = {
  background: { type: ColorType.Solid as const, color: 'transparent' },
  textColor: '#4a5c57',
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 12,
  attributionLogo: false,
}

function toUtcData(data: NormalizedIndicator['data']) {
  return data.map((p) =>
    'value' in p
      ? { time: p.time as UTCTimestamp, value: p.value }
      : { time: p.time as UTCTimestamp },
  )
}

export function ChartPane({
  bars,
  signals,
  indicators,
  showVolume,
  visibility,
}: ChartPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const managedRef = useRef<Map<string, ManagedSeries>>(new Map())
  const panesRef = useRef<Map<string, IPaneApi<Time>>>(new Map())

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const chart = createChart(el, {
      autoSize: true,
      layout: CHART_LAYOUT,
      grid: {
        vertLines: { color: 'rgba(11, 61, 54, 0.07)' },
        horzLines: { color: 'rgba(11, 61, 54, 0.07)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(11, 61, 54, 0.35)', width: 1, style: 2 },
        horzLine: { color: 'rgba(11, 61, 54, 0.35)', width: 1, style: 2 },
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
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    })

    const mainPane = chart.panes()[0]
    mainPane.setStretchFactor(3)

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: '#0f766e',
      downColor: '#c2410c',
      borderUpColor: '#0f766e',
      borderDownColor: '#c2410c',
      wickUpColor: '#0f766e',
      wickDownColor: '#c2410c',
    })

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      color: 'rgba(13, 110, 95, 0.35)',
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
  }, [])

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

    volumeRef.current.setData(
      bars.map((b) => ({
        time: b.time as UTCTimestamp,
        value: b.volume,
        color:
          b.close >= b.open
            ? 'rgba(15, 118, 110, 0.35)'
            : 'rgba(194, 65, 12, 0.35)',
      })),
    )

    chartRef.current?.timeScale().fitContent()
  }, [bars])

  useEffect(() => {
    if (!markersRef.current) return

    const maxMarkers = 2500
    const step = Math.max(1, Math.ceil(signals.length / maxMarkers))
    const markers: SeriesMarker<Time>[] = []

    for (let i = 0; i < signals.length; i += step) {
      const s = signals[i]
      const isBuy = s.side === 'buy'
      markers.push({
        time: s.time as UTCTimestamp,
        position: isBuy ? 'belowBar' : 'aboveBar',
        color: isBuy ? '#0f766e' : '#c2410c',
        shape: isBuy ? 'arrowUp' : 'arrowDown',
        text: s.label ?? (isBuy ? 'C' : 'V'),
      })
    }

    markersRef.current.setMarkers(markers)
  }, [signals])

  // Reconcile indicator series onto overlay / separate panes (setData only — no React per point)
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    const managed = managedRef.current
    const panes = panesRef.current
    const nextIds = new Set(indicators.map((ind) => ind.id))

    for (const [id, entry] of managed) {
      if (!nextIds.has(id)) {
        chart.removeSeries(entry.series)
        managed.delete(id)
      }
    }

    // Drop empty separate panes (keep main)
    const neededPaneIds = new Set(
      indicators
        .filter((ind) => ind.pane === 'separate')
        .map((ind) => ind.paneId),
    )
    for (const [paneId, pane] of [...panes.entries()]) {
      if (paneId === 'main') continue
      if (!neededPaneIds.has(paneId)) {
        try {
          chart.removePane(pane.paneIndex())
        } catch {
          /* pane may already be gone */
        }
        panes.delete(paneId)
      }
    }

    for (const ind of indicators) {
      const shown =
        visibility[ind.id] !== undefined ? visibility[ind.id] : ind.visible

      let entry = managed.get(ind.id)
      const wantsHistogram = ind.style === 'histogram'
      const needsRecreate =
        entry &&
        (entry.style !== ind.style ||
          entry.paneId !== (ind.pane === 'overlay' ? 'overlay' : ind.paneId))

      if (needsRecreate && entry) {
        chart.removeSeries(entry.series)
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
          let pane = panes.get(ind.paneId)
          if (!pane) {
            pane = chart.addPane(true)
            pane.setStretchFactor(1)
            panes.set(ind.paneId, pane)
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
            paneId: ind.paneId,
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

    // Stretch: main bigger when separate panes exist
    const main = panes.get('main') ?? chart.panes()[0]
    const separateCount = [...panes.keys()].filter((k) => k !== 'main').length
    main?.setStretchFactor(separateCount > 0 ? 3 : 1)
  }, [indicators, visibility])

  return (
    <div
      className="chart-pane"
      ref={containerRef}
      role="img"
      aria-label="Gráfico de velas e indicadores"
    />
  )
}
