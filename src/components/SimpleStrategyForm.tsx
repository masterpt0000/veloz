import {
  INDICATOR_KIND_LABELS,
  RULE_COMPARE_LABELS,
  buildSeriesOptions,
  defaultIndicator,
  indicatorTitle,
  seriesRefKey,
  type RuleCompare,
  type SeriesRef,
  type SimpleIndicatorConfig,
  type SimpleIndicatorKind,
  type SimpleRule,
  type SimpleStrategyConfig,
} from '../strategy/simpleStrategy'

interface SimpleStrategyFormProps {
  config: SimpleStrategyConfig
  onChange: (next: SimpleStrategyConfig) => void
}

const KINDS: SimpleIndicatorKind[] = ['sma', 'ema', 'rsi', 'macd']
const COMPARES: RuleCompare[] = [
  'cross_above',
  'cross_below',
  'greater',
  'less',
]

export function SimpleStrategyForm({
  config,
  onChange,
}: SimpleStrategyFormProps) {
  const seriesOptions = buildSeriesOptions(config.indicators)

  function patchIndicators(indicators: SimpleIndicatorConfig[]) {
    onChange({ ...config, indicators })
  }

  function updateIndicator(id: string, patch: Partial<SimpleIndicatorConfig>) {
    patchIndicators(
      config.indicators.map((ind) =>
        ind.id === id ? { ...ind, ...patch } : ind,
      ),
    )
  }

  function changeKind(id: string, kind: SimpleIndicatorKind) {
    const prev = config.indicators.find((i) => i.id === id)
    if (!prev) return
    const next = defaultIndicator(kind, {
      id,
      visible: prev.visible,
      color: prev.color,
      period: kind === 'rsi' ? 14 : prev.period,
    })
    patchIndicators(
      config.indicators.map((ind) => (ind.id === id ? next : ind)),
    )
  }

  function addIndicator() {
    patchIndicators([...config.indicators, defaultIndicator('sma')])
  }

  function removeIndicator(id: string) {
    if (config.indicators.length <= 1) return
    const indicators = config.indicators.filter((i) => i.id !== id)
    onChange({
      indicators,
      entry: retargetRule(config.entry, indicators),
      exit: retargetRule(config.exit, indicators),
    })
  }

  function setRule(which: 'entry' | 'exit', rule: SimpleRule) {
    onChange({ ...config, [which]: rule })
  }

  return (
    <div className="simple-strategy">
      <p className="simple-strategy-intro">
        Monte a estratégia com indicadores e regras — sem código. O backtest e
        os overlays no gráfico usam o mesmo motor.
      </p>

      <section className="simple-block">
        <div className="simple-block-head">
          <h3>Indicadores</h3>
          <button type="button" className="btn ghost" onClick={addIndicator}>
            Adicionar
          </button>
        </div>

        <ul className="simple-indicator-list">
          {config.indicators.map((ind) => (
            <li key={ind.id} className="simple-indicator-row">
              <label className="simple-field">
                <span>Tipo</span>
                <select
                  value={ind.kind}
                  onChange={(e) =>
                    changeKind(ind.id, e.target.value as SimpleIndicatorKind)
                  }
                  aria-label={`Tipo de ${indicatorTitle(ind)}`}
                >
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {INDICATOR_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>

              {ind.kind === 'macd' ? (
                <>
                  <label className="simple-field narrow">
                    <span>Rápida</span>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={ind.fastPeriod}
                      onChange={(e) =>
                        updateIndicator(ind.id, {
                          fastPeriod: Number(e.target.value) || 1,
                        })
                      }
                    />
                  </label>
                  <label className="simple-field narrow">
                    <span>Lenta</span>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={ind.slowPeriod}
                      onChange={(e) =>
                        updateIndicator(ind.id, {
                          slowPeriod: Number(e.target.value) || 1,
                        })
                      }
                    />
                  </label>
                  <label className="simple-field narrow">
                    <span>Sinal</span>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={ind.signalPeriod}
                      onChange={(e) =>
                        updateIndicator(ind.id, {
                          signalPeriod: Number(e.target.value) || 1,
                        })
                      }
                    />
                  </label>
                </>
              ) : (
                <label className="simple-field narrow">
                  <span>Período</span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={ind.period}
                    onChange={(e) =>
                      updateIndicator(ind.id, {
                        period: Number(e.target.value) || 1,
                      })
                    }
                  />
                </label>
              )}

              <label className="simple-field narrow">
                <span>Cor</span>
                <input
                  type="color"
                  value={normalizeColor(ind.color)}
                  onChange={(e) =>
                    updateIndicator(ind.id, { color: e.target.value })
                  }
                  aria-label={`Cor de ${indicatorTitle(ind)}`}
                />
              </label>

              <label className="simple-check">
                <input
                  type="checkbox"
                  checked={ind.visible}
                  onChange={(e) =>
                    updateIndicator(ind.id, { visible: e.target.checked })
                  }
                />
                <span>No gráfico</span>
              </label>

              <button
                type="button"
                className="btn ghost danger"
                onClick={() => removeIndicator(ind.id)}
                disabled={config.indicators.length <= 1}
                title={
                  config.indicators.length <= 1
                    ? 'Tem de ficar pelo menos um indicador'
                    : 'Remover indicador'
                }
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      </section>

      <RuleEditor
        title="Entrada (compra)"
        rule={config.entry}
        seriesOptions={seriesOptions}
        onChange={(rule) => setRule('entry', rule)}
      />

      <RuleEditor
        title="Saída (venda)"
        rule={config.exit}
        seriesOptions={seriesOptions}
        onChange={(rule) => setRule('exit', rule)}
      />
    </div>
  )
}

interface RuleEditorProps {
  title: string
  rule: SimpleRule
  seriesOptions: ReturnType<typeof buildSeriesOptions>
  onChange: (rule: SimpleRule) => void
}

function RuleEditor({ title, rule, seriesOptions, onChange }: RuleEditorProps) {
  const leftKey = seriesRefKey(rule.left)
  const rightKey = seriesRefKey(rule.right)
  const rightIsValue = rule.right.kind === 'value'

  function pickLeft(key: string) {
    const opt = seriesOptions.find((o) => o.key === key)
    if (!opt) return
    if (opt.ref.kind === 'value') {
      onChange({
        ...rule,
        left: { kind: 'value', value: 50 },
      })
      return
    }
    onChange({ ...rule, left: cloneRef(opt.ref) })
  }

  function pickRight(key: string) {
    const opt = seriesOptions.find((o) => o.key === key)
    if (!opt) return
    if (opt.ref.kind === 'value') {
      const prev =
        rule.right.kind === 'value' ? rule.right.value : defaultValueFor(rule)
      onChange({ ...rule, right: { kind: 'value', value: prev } })
      return
    }
    onChange({ ...rule, right: cloneRef(opt.ref) })
  }

  return (
    <section className="simple-block">
      <div className="simple-block-head">
        <h3>{title}</h3>
      </div>
      <div className="simple-rule-row">
        <label className="simple-field">
          <span>Série A</span>
          <select
            value={leftKey === 'value' ? 'value' : leftKey}
            onChange={(e) => pickLeft(e.target.value)}
            aria-label={`${title} série A`}
          >
            {seriesOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {rule.left.kind === 'value' && (
          <label className="simple-field narrow">
            <span>Valor A</span>
            <input
              type="number"
              step="any"
              value={rule.left.value}
              onChange={(e) =>
                onChange({
                  ...rule,
                  left: { kind: 'value', value: Number(e.target.value) },
                })
              }
            />
          </label>
        )}

        <label className="simple-field">
          <span>Condição</span>
          <select
            value={rule.compare}
            onChange={(e) =>
              onChange({
                ...rule,
                compare: e.target.value as RuleCompare,
              })
            }
            aria-label={`${title} condição`}
          >
            {COMPARES.map((c) => (
              <option key={c} value={c}>
                {RULE_COMPARE_LABELS[c]}
              </option>
            ))}
          </select>
        </label>

        <label className="simple-field">
          <span>Série B</span>
          <select
            value={rightIsValue ? 'value' : rightKey}
            onChange={(e) => pickRight(e.target.value)}
            aria-label={`${title} série B`}
          >
            {seriesOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {rightIsValue && rule.right.kind === 'value' && (
          <label className="simple-field narrow">
            <span>Valor B</span>
            <input
              type="number"
              step="any"
              value={rule.right.value}
              onChange={(e) =>
                onChange({
                  ...rule,
                  right: { kind: 'value', value: Number(e.target.value) },
                })
              }
            />
          </label>
        )}
      </div>
    </section>
  )
}

function cloneRef(ref: SeriesRef): SeriesRef {
  if (ref.kind === 'close') return { kind: 'close' }
  if (ref.kind === 'value') return { kind: 'value', value: ref.value }
  return {
    kind: 'indicator',
    indicatorId: ref.indicatorId,
    output: ref.output ?? 'main',
  }
}

function retargetRule(
  rule: SimpleRule,
  indicators: SimpleIndicatorConfig[],
): SimpleRule {
  const ids = new Set(indicators.map((i) => i.id))
  const fix = (ref: SeriesRef): SeriesRef => {
    if (ref.kind !== 'indicator') return ref
    if (ids.has(ref.indicatorId)) return ref
    const first = indicators[0]
    return {
      kind: 'indicator',
      indicatorId: first.id,
      output: first.kind === 'macd' ? 'main' : 'main',
    }
  }
  return { ...rule, left: fix(rule.left), right: fix(rule.right) }
}

function defaultValueFor(rule: SimpleRule): number {
  // RSI thresholds are a common default when comparing to a fixed value.
  void rule
  return 50
}

function normalizeColor(color: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color
  return '#0369a1'
}
