import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import type { Trade } from '../types'
import { formatPct, formatPrice, formatTime } from '../lib/format'

interface TradesListProps {
  trades: Trade[]
}

const ROW_HEIGHT = 36
const OVERSCAN = 8

export function TradesList({ trades }: TradesListProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(240)

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight))
    ro.observe(el)
    setViewportH(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  const onScroll = useCallback(() => {
    const el = scrollerRef.current
    if (el) setScrollTop(el.scrollTop)
  }, [])

  const { start, end, offsetY } = useMemo(() => {
    const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
    const visible = Math.ceil(viewportH / ROW_HEIGHT) + OVERSCAN * 2
    const endIdx = Math.min(trades.length, startIdx + visible)
    return { start: startIdx, end: endIdx, offsetY: startIdx * ROW_HEIGHT }
  }, [scrollTop, viewportH, trades.length])

  const slice = trades.slice(start, end)

  if (!trades.length) {
    return <p className="empty-hint">Sem operações — execute a estratégia.</p>
  }

  return (
    <div className="trades-list" ref={scrollerRef} onScroll={onScroll}>
      <div className="trades-spacer" style={{ height: trades.length * ROW_HEIGHT }}>
        <table className="trades-table" style={{ transform: `translateY(${offsetY}px)` }}>
          <thead className="visually-hidden">
            <tr>
              <th>Entrada</th>
              <th>Saída</th>
              <th>PnL</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((t, i) => (
              <tr key={`${t.entryTime}-${t.exitTime}-${start + i}`}>
                <td>
                  <span className={t.side === 'short' ? 'neg' : 'pos'}>
                    {t.side === 'short' ? 'S' : 'L'}
                  </span>{' '}
                  <span className="mono">{formatTime(t.entryTime)}</span>
                  <span className="muted"> → {formatPrice(t.entryPrice)}</span>
                </td>
                <td>
                  <span className="mono">{formatTime(t.exitTime)}</span>
                  <span className="muted"> → {formatPrice(t.exitPrice)}</span>
                </td>
                <td className={t.pnlPct >= 0 ? 'pos' : 'neg'}>
                  {formatPct(t.pnlPct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
