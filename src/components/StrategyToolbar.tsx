import type { SavedStrategy } from '../strategy/strategyStore'

interface StrategyToolbarProps {
  strategies: SavedStrategy[]
  activeId: string
  running: boolean
  /** Hide run when on builder-only pane */
  showRun?: boolean
  onSelect: (id: string) => void
  onCreate: () => void
  onRename: () => void
  onDelete: () => void
  onRun: () => void
  onOpenBuilder?: () => void
}

export function StrategyToolbar({
  strategies,
  activeId,
  running,
  showRun = true,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onRun,
  onOpenBuilder,
}: StrategyToolbarProps) {
  const canDelete = strategies.length > 1

  return (
    <div className="strategy-toolbar">
      <label className="strategy-select-field">
        <span className="visually-hidden">Estratégia guardada</span>
        <select
          className="strategy-select"
          value={activeId}
          onChange={(e) => onSelect(e.target.value)}
          aria-label="Escolher estratégia"
        >
          {strategies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <div className="code-actions">
        <button type="button" className="btn ghost" onClick={onCreate}>
          Nova
        </button>
        <button type="button" className="btn ghost" onClick={onRename}>
          Renomear
        </button>
        <button
          type="button"
          className="btn ghost danger"
          onClick={onDelete}
          disabled={!canDelete}
          title={canDelete ? 'Eliminar estratégia' : 'Tem de ficar pelo menos uma'}
        >
          Eliminar
        </button>
        {onOpenBuilder && (
          <button
            type="button"
            className="btn ghost"
            onClick={onOpenBuilder}
            title="Abre definições noutro separador"
          >
            Definir estratégia
          </button>
        )}
        {showRun && (
          <button
            type="button"
            className="btn primary"
            onClick={onRun}
            disabled={running}
          >
            {running ? 'A executar…' : 'Executar backtest'}
          </button>
        )}
      </div>
    </div>
  )
}
