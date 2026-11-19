import type { ThemeMode } from '../lib/theme'
import type { BacktestResult } from '../types'
import { formatNumber, formatPct } from '../lib/format'
import { EquityChart } from './EquityChart'
import { TradesList } from './TradesList'

interface ResultsPanelProps {
  result: BacktestResult | null
  error: string | null
  running: boolean
  initialCapital: number
  theme?: ThemeMode
}

export function ResultsPanel({
  result,
  error,
  running,
  initialCapital,
  theme = 'light',
}: ResultsPanelProps) {
  const m = result?.metrics

  return (
    <aside className="results-panel">
      <header className="panel-head">
        <h2>Resultados</h2>
        {result && (
          <span className="pill muted">
            {result.barCount.toLocaleString('pt-PT')} barras · {result.durationMs.toFixed(0)} ms
          </span>
        )}
        {running && <span className="pill running">A calcular…</span>}
      </header>

      {error && <p className="error-banner">{error}</p>}

      <div className="metrics-row" role="list">
        <Metric
          label="Retorno"
          value={m ? formatPct(m.totalReturnPct) : '—'}
          tone={m ? (m.totalReturnPct >= 0 ? 'pos' : 'neg') : undefined}
        />
        <Metric
          label="Drawdown"
          value={m ? formatPct(-m.maxDrawdownPct) : '—'}
          tone={m ? 'neg' : undefined}
        />
        <Metric label="Win rate" value={m ? `${m.winRatePct.toFixed(1)}%` : '—'} />
        <Metric
          label="Profit factor"
          value={m ? formatNumber(m.profitFactor, 2) : '—'}
        />
        <Metric label="Trades" value={m ? String(m.tradeCount) : '—'} />
        <Metric
          label="Sharpe≈"
          value={m ? formatNumber(m.sharpeLike, 2) : '—'}
        />
      </div>

      <div className="equity-block">
        <div className="block-label">Curva de equity</div>
        {!result ? (
          <p className="empty-hint">Sem curva — execute o backtest.</p>
        ) : (
          <EquityChart
            equity={result.equity}
            initialCapital={initialCapital}
            theme={theme}
          />
        )}
      </div>

      <div className="trades-block">
        <div className="block-label">
          Operações
          {result ? ` (${result.trades.length})` : ''}
        </div>
        <TradesList trades={result?.trades ?? []} />
      </div>
    </aside>
  )
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'pos' | 'neg'
}) {
  return (
    <div className="metric" role="listitem">
      <span className="metric-label">{label}</span>
      <span className={`metric-value ${tone ?? ''}`}>{value}</span>
    </div>
  )
}
