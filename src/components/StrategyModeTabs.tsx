import type { StrategyEditMode } from '../strategy/simpleStrategy'

interface StrategyModeTabsProps {
  mode: StrategyEditMode
  onChange: (mode: StrategyEditMode) => void
}

export function StrategyModeTabs({ mode, onChange }: StrategyModeTabsProps) {
  return (
    <div className="strategy-mode-tabs" role="tablist" aria-label="Modo da estratégia">
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'simple'}
        className={mode === 'simple' ? 'mode-tab active' : 'mode-tab'}
        onClick={() => onChange('simple')}
      >
        Simples
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'advanced'}
        className={mode === 'advanced' ? 'mode-tab active' : 'mode-tab'}
        onClick={() => onChange('advanced')}
      >
        Avançado
      </button>
    </div>
  )
}
