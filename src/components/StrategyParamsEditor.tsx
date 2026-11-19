/**
 * Compact parameter editor for builder strategies — indicator periods + risk.
 * Lives inside the builder so params can be tuned without switching modes.
 */

import type {
  BuilderIndicator,
  VelozBuilderSpec,
} from '../strategy/builderSpec'

interface StrategyParamsEditorProps {
  spec: VelozBuilderSpec
  onChange: (next: VelozBuilderSpec) => void
  /** Compact layout for chart side panel */
  compact?: boolean
}

export function StrategyParamsEditor({
  spec,
  onChange,
  compact = false,
}: StrategyParamsEditorProps) {
  function patch(partial: Partial<VelozBuilderSpec>) {
    onChange({ ...spec, ...partial })
  }

  function updateIndicatorAt(
    index: number,
    updater: (ind: BuilderIndicator) => BuilderIndicator,
  ) {
    patch({
      indicators: spec.indicators.map((ind, i) =>
        i === index ? updater(ind) : ind,
      ),
    })
  }

  return (
    <section className={`strategy-params-editor${compact ? ' compact' : ''}`}>
      {!compact && (
        <div className="simple-block-head">
          <h3>Parâmetros</h3>
          <p className="muted builder-hint">
            Ajuste períodos e risco sem sair do builder. As regras ficam abaixo.
          </p>
        </div>
      )}
      {compact && (
        <div className="simple-block-head">
          <h3>Parâmetros</h3>
        </div>
      )}

      <ul className="params-indicator-list">
        {spec.indicators.map((ind, index) => (
          <li key={`${ind.id}-${index}`} className="params-indicator-row">
            <span className="params-ind-label" title={ind.id}>
              {ind.label || ind.id}
            </span>
            {ind.kind === 'macd' ? (
              <>
                <NumField
                  label="Rápida"
                  value={ind.fastPeriod}
                  onChange={(v) =>
                    updateIndicatorAt(index, (x) => ({ ...x, fastPeriod: v }))
                  }
                />
                <NumField
                  label="Lenta"
                  value={ind.slowPeriod}
                  onChange={(v) =>
                    updateIndicatorAt(index, (x) => ({ ...x, slowPeriod: v }))
                  }
                />
                <NumField
                  label="Sinal"
                  value={ind.signalPeriod}
                  onChange={(v) =>
                    updateIndicatorAt(index, (x) => ({ ...x, signalPeriod: v }))
                  }
                />
              </>
            ) : (
              <NumField
                label="Período"
                value={ind.period}
                onChange={(v) =>
                  updateIndicatorAt(index, (x) => ({
                    ...x,
                    period: v,
                    label: `${x.kind.toUpperCase()} ${v}`,
                  }))
                }
              />
            )}
            {ind.kind === 'bb' && (
              <NumField
                label="Mult"
                value={ind.mult}
                step={0.1}
                onChange={(v) =>
                  updateIndicatorAt(index, (x) => ({ ...x, mult: v }))
                }
              />
            )}
          </li>
        ))}
      </ul>

      <div className="simple-rule-row params-risk-row">
        <NumField
          label="Take profit %"
          value={spec.risk.takeProfitPct}
          step={0.1}
          onChange={(takeProfitPct) =>
            patch({ risk: { ...spec.risk, takeProfitPct } })
          }
        />
        <NumField
          label="Stop loss %"
          value={spec.risk.stopLossPct}
          step={0.1}
          onChange={(stopLossPct) =>
            patch({ risk: { ...spec.risk, stopLossPct } })
          }
        />
        <NumField
          label="Trailing %"
          value={spec.risk.trailingStopPct}
          step={0.1}
          onChange={(trailingStopPct) =>
            patch({ risk: { ...spec.risk, trailingStopPct } })
          }
        />
      </div>
    </section>
  )
}

function NumField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
}) {
  return (
    <label className="simple-field narrow">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </label>
  )
}
