import { useEffect, useRef } from 'react'
import {
  AreaSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import { chartColors, type ThemeMode } from '../lib/theme'
import type { EquityPoint } from '../types'

interface EquityChartProps {
  equity: EquityPoint[]
  initialCapital: number
  theme?: ThemeMode
}

export function EquityChart({
  equity,
  initialCapital: _initialCapital,
  theme = 'light',
}: EquityChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null)
  const themeRef = useRef(theme)
  themeRef.current = theme

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const colors = chartColors(themeRef.current)
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: colors.text,
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: colors.grid },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, visible: false },
      crosshair: { vertLine: { visible: false }, horzLine: { labelVisible: true } },
      handleScroll: false,
      handleScale: false,
    })

    const series = chart.addSeries(AreaSeries, {
      lineColor: colors.equityLine,
      topColor: colors.equityTop,
      bottomColor: colors.equityBottom,
      lineWidth: 2,
      crosshairMarkerVisible: true,
    })

    chartRef.current = chart
    seriesRef.current = series

    return () => {
      seriesRef.current = null
      chartRef.current = null
      chart.remove()
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    const series = seriesRef.current
    if (!chart || !series) return
    const colors = chartColors(theme)
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: colors.text,
      },
      grid: {
        horzLines: { color: colors.grid },
      },
    })
    series.applyOptions({
      lineColor: colors.equityLine,
      topColor: colors.equityTop,
      bottomColor: colors.equityBottom,
    })
  }, [theme])

  useEffect(() => {
    if (!seriesRef.current) return
    if (!equity.length) {
      seriesRef.current.setData([])
      return
    }
    seriesRef.current.setData(
      equity.map((p) => ({
        time: p.time as UTCTimestamp,
        value: p.equity,
      })),
    )
    chartRef.current?.timeScale().fitContent()
  }, [equity])

  return <div className="equity-chart" ref={containerRef} aria-label="Curva de equity" />
}
