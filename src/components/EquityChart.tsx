import { useEffect, useRef } from 'react'
import {
  AreaSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { EquityPoint } from '../types'

interface EquityChartProps {
  equity: EquityPoint[]
  initialCapital: number
}

export function EquityChart({ equity, initialCapital: _initialCapital }: EquityChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#4a5c57',
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: 'rgba(11, 61, 54, 0.08)' },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, visible: false },
      crosshair: { vertLine: { visible: false }, horzLine: { labelVisible: true } },
      handleScroll: false,
      handleScale: false,
    })

    const series = chart.addSeries(AreaSeries, {
      lineColor: '#0f766e',
      topColor: 'rgba(15, 118, 110, 0.35)',
      bottomColor: 'rgba(15, 118, 110, 0.02)',
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
