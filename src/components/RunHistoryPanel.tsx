import { formatPct, formatTime } from '../lib/format'
import type { SavedRun } from '../strategy/runHistory'

interface RunHistoryPanelProps {
  runs: SavedRun[]
  open: boolean
  onClose: () => void
  onOpen: (run: SavedRun) => void
  onDelete: (id: string) => void
  onClear: () => void
}

export function RunHistoryPanel({
  runs,
  open,
  onClose,
  onOpen,
  onDelete,
  onClear,
}: RunHistoryPanelProps) {
  if (!open) return null

  return (
    <div className="run-history-drawer" role="dialog" aria-label="Histórico de backtests">
      <header className="run-history-head">
        <div>
          <h2>Histórico de runs</h2>
          <p className="run-history-sub">
            Resumo, equity e trades guardados após cada Executar (localStorage)
          </p>
        </div>
        <div className="run-history-head-actions">
          {runs.length > 0 && (
            <button
              type="button"
              className="btn ghost danger"
              onClick={() => {
                if (window.confirm('Limpar todo o histórico de runs?')) onClear()
              }}
            >
              Limpar
            </button>
          )}
          <button type="button" className="btn ghost" onClick={onClose}>
            Fechar
          </button>
        </div>
      </header>

      {runs.length === 0 ? (
        <p className="run-history-empty">
          Ainda não há runs. Execute um backtest para guardar o resultado aqui.
        </p>
      ) : (
        <ul className="run-history-list">
          {runs.map((run) => (
            <li key={run.id} className="run-history-item">
              <button
                type="button"
                className="run-history-main"
                onClick={() => onOpen(run)}
              >
                <span className="run-history-title">{run.meta.strategyName}</span>
                <span className="run-history-meta">
                  {run.meta.symbolLabel} · {run.meta.timeframe} ·{' '}
                  {run.meta.barCount.toLocaleString('pt-PT')} barras
                </span>
                <span className="run-history-stats">
                  <span
                    className={
                      run.metrics.totalReturnPct >= 0 ? 'tone-pos' : 'tone-neg'
                    }
                  >
                    {formatPct(run.metrics.totalReturnPct)}
                  </span>
                  <span>DD {formatPct(-run.metrics.maxDrawdownPct)}</span>
                  <span>{run.metrics.tradeCount} trades</span>
                </span>
                <span className="run-history-when">
                  {formatTime(Math.floor(run.createdAt / 1000))}
                </span>
              </button>
              <button
                type="button"
                className="btn ghost danger run-history-delete"
                title="Eliminar run"
                onClick={() => onDelete(run.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
