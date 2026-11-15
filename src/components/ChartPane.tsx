import { useEffect, useRef } from 'react'
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { Bar, Signal } from '../types'

interface ChartPaneProps {
  bars: Bar[]
  signals: Signal[]
  showVolume: boolean
}

export function ChartPane({ bars, signals, showVolume }: ChartPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#4a5c57',
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 12,
        attributionLogo: false,
      },
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

    return () => {
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

    // lightweight-charts handles LOD internally — pass full series once, no React per-bar render
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

    // Cap markers drawn for extreme signal counts to keep interaction smooth
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

  return <div className="chart-pane" ref={containerRef} role="img" aria-label="Gráfico de velas" />
}
