import type { NormalizedIndicator } from '../types'

interface IndicatorLegendProps {
  indicators: NormalizedIndicator[]
  visibility: Record<string, boolean>
  onToggle: (id: string) => void
}

export function IndicatorLegend({
  indicators,
  visibility,
  onToggle,
}: IndicatorLegendProps) {
  if (!indicators.length) {
    return (
      <p className="indicator-empty muted">
        Sem indicadores ainda — clique em <strong>Executar backtest</strong> para
        os ver no gráfico.
      </p>
    )
  }

  return (
    <div className="indicator-legend" aria-label="Indicadores">
      <span className="indicator-legend-label">Indicadores</span>
      <div className="indicator-chips">
        {indicators.map((ind) => {
          const on =
            visibility[ind.id] !== undefined ? visibility[ind.id] : ind.visible
          const paneHint = ind.pane === 'overlay' ? 'overlay' : 'painel'
          return (
            <button
              key={ind.id}
              type="button"
              className={`indicator-chip ${on ? 'on' : 'off'}`}
              style={{ ['--ind-color' as string]: ind.color }}
              onClick={() => onToggle(ind.id)}
              aria-pressed={on}
              aria-label={`${ind.title} (${paneHint})`}
              title={`${ind.title} · ${paneHint} · clicar para ${on ? 'ocultar' : 'mostrar'}`}
            >
              <span className="indicator-swatch" aria-hidden="true" />
              <span>{ind.title}</span>
              <span className="indicator-pane-tag">
                {ind.pane === 'overlay' ? 'preço' : 'painel'}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
