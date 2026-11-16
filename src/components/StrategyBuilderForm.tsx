import { useEffect, useRef, useState } from 'react'
import {
  BUILDER_KIND_LABELS,
  BUILDER_OP_LABELS,
  defaultBuilderIndicator,
  emptyBuilderExpr,
  renameBuilderIndicatorRefs,
  type BuilderCondition,
  type BuilderExpr,
  type BuilderIndicator,
  type BuilderIndicatorKind,
  type BuilderOp,
  type BuilderOperand,
  type VelozBuilderSpec,
} from '../strategy/builderSpec'

interface StrategyBuilderFormProps {
  spec: VelozBuilderSpec
  onChange: (next: VelozBuilderSpec) => void
}

const KINDS: BuilderIndicatorKind[] = ['sma', 'ema', 'rsi', 'macd', 'bb']
const OPS: BuilderOp[] = ['cross_up', 'cross_down', 'gt', 'lt', 'ge', 'le']

export function StrategyBuilderForm({ spec, onChange }: StrategyBuilderFormProps) {
  // Stable React keys — never use the editable indicator id (duplicate/changing
  // keys remount rows and can spawn ghost DOM children).
  const rowKeysRef = useRef<string[]>([])
  if (rowKeysRef.current.length < spec.indicators.length) {
    for (let i = rowKeysRef.current.length; i < spec.indicators.length; i++) {
      rowKeysRef.current.push(`ind-${i}-${Math.random().toString(36).slice(2, 9)}`)
    }
  } else if (rowKeysRef.current.length > spec.indicators.length) {
    rowKeysRef.current = rowKeysRef.current.slice(0, spec.indicators.length)
  }

  function patch(partial: Partial<VelozBuilderSpec>) {
    onChange({ ...spec, ...partial })
  }

  function setIndicators(indicators: BuilderIndicator[]) {
    patch({ indicators })
  }

  function updateIndicatorAt(
    index: number,
    updater: (ind: BuilderIndicator) => BuilderIndicator,
  ) {
    setIndicators(
      spec.indicators.map((ind, i) => (i === index ? updater(ind) : ind)),
    )
  }

  function renameIndicatorAt(index: number, nextRaw: string) {
    const current = spec.indicators[index]
    if (!current) return
    const trimmed = nextRaw.trim()
    if (!trimmed) return

    const taken = new Set(
      spec.indicators.map((ind, i) => (i === index ? '' : ind.id)).filter(Boolean),
    )
    let nextId = trimmed
    if (taken.has(nextId)) {
      let n = 2
      while (taken.has(`${trimmed}_${n}`)) n += 1
      nextId = `${trimmed}_${n}`
    }
    if (nextId === current.id) return

    const indicators = spec.indicators.map((ind, i) =>
      i === index ? { ...ind, id: nextId } : ind,
    )
    onChange(
      renameBuilderIndicatorRefs({ ...spec, indicators }, current.id, nextId),
    )
  }

  function removeIndicatorAt(index: number) {
    if (spec.indicators.length <= 1) return
    rowKeysRef.current = rowKeysRef.current.filter((_, i) => i !== index)
    setIndicators(spec.indicators.filter((_, i) => i !== index))
  }

  function setRules(rules: VelozBuilderSpec['rules']) {
    patch({ rules })
  }

  function setRisk(risk: VelozBuilderSpec['risk']) {
    patch({ risk })
  }

  return (
    <div className="builder-form">
      <header className="builder-form-head">
        <div>
          <h2>Definições da estratégia</h2>
          <p>
            Formato inspirado no repo <code>backtest</code> (indicadores + regras +
            risco). O gráfico e resultados ficam na outra janela.
          </p>
        </div>
        <DraftTextField
          label="Nome"
          value={spec.name}
          onChange={(name) => patch({ name })}
        />
      </header>

      <section className="simple-block">
        <div className="simple-block-head">
          <h3>Indicadores</h3>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              rowKeysRef.current.push(
                `ind-${rowKeysRef.current.length}-${Math.random().toString(36).slice(2, 9)}`,
              )
              setIndicators([...spec.indicators, defaultBuilderIndicator('sma')])
            }}
          >
            Adicionar
          </button>
        </div>
        <ul className="simple-indicator-list">
          {spec.indicators.map((ind, index) => (
            <li
              key={rowKeysRef.current[index] ?? `fallback-${index}`}
              className="simple-indicator-row"
            >
              <IndicatorIdField
                id={ind.id}
                onCommit={(next) => renameIndicatorAt(index, next)}
              />
              <label className="simple-field">
                <span>Tipo</span>
                <select
                  value={ind.kind}
                  onChange={(e) => {
                    const kind = e.target.value as BuilderIndicatorKind
                    updateIndicatorAt(index, (x) =>
                      defaultBuilderIndicator(kind, { id: x.id, color: x.color }),
                    )
                  }}
                >
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {BUILDER_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
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
                  label={ind.kind === 'bb' ? 'Período' : 'Período'}
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
              <button
                type="button"
                className="btn ghost danger"
                disabled={spec.indicators.length <= 1}
                onClick={() => removeIndicatorAt(index)}
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      </section>

      <RuleBlock
        title="Entrada long"
        expr={spec.rules.long}
        ifLine={spec.rules.longIf}
        indicators={spec.indicators}
        onExpr={(long) => setRules({ ...spec.rules, long })}
        onIf={(longIf) => setRules({ ...spec.rules, longIf })}
      />
      <RuleBlock
        title="Entrada short"
        expr={spec.rules.short}
        ifLine={spec.rules.shortIf}
        indicators={spec.indicators}
        onExpr={(short) => setRules({ ...spec.rules, short })}
        onIf={(shortIf) => setRules({ ...spec.rules, shortIf })}
        allowEmpty
      />
      <RuleBlock
        title="Saída long"
        expr={spec.rules.exitLong}
        ifLine={spec.rules.exitLongIf}
        indicators={spec.indicators}
        onExpr={(exitLong) => setRules({ ...spec.rules, exitLong })}
        onIf={(exitLongIf) => setRules({ ...spec.rules, exitLongIf })}
      />
      <RuleBlock
        title="Saída short"
        expr={spec.rules.exitShort}
        ifLine={spec.rules.exitShortIf}
        indicators={spec.indicators}
        onExpr={(exitShort) => setRules({ ...spec.rules, exitShort })}
        onIf={(exitShortIf) => setRules({ ...spec.rules, exitShortIf })}
        allowEmpty
      />

      <section className="simple-block">
        <div className="simple-block-head">
          <h3>Risco (como no backtest)</h3>
        </div>
        <div className="simple-rule-row">
          <NumField
            label="Take profit %"
            value={spec.risk.takeProfitPct}
            step={0.1}
            onChange={(takeProfitPct) => setRisk({ ...spec.risk, takeProfitPct })}
          />
          <NumField
            label="Stop loss %"
            value={spec.risk.stopLossPct}
            step={0.1}
            onChange={(stopLossPct) => setRisk({ ...spec.risk, stopLossPct })}
          />
          <NumField
            label="Trailing %"
            value={spec.risk.trailingStopPct}
            step={0.1}
            onChange={(trailingStopPct) =>
              setRisk({ ...spec.risk, trailingStopPct })
            }
          />
        </div>
        <p className="muted builder-hint">
          0 = desligado. Preferência: regras de saída estruturadas; TP/SL são
          intrabar no motor.
        </p>
      </section>
    </div>
  )
}

function IndicatorIdField({
  id,
  onCommit,
}: {
  id: string
  onCommit: (next: string) => void
}) {
  const [draft, setDraft] = useState(id)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setDraft(id)
  }, [id, focused])

  return (
    <label className="simple-field">
      <span>Id</span>
      <input
        type="text"
        value={draft}
        onFocus={() => setFocused(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setFocused(false)
          const next = draft.trim()
          if (!next || next === id) {
            setDraft(id)
            return
          }
          onCommit(next)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur()
          }
        }}
      />
    </label>
  )
}

/** Keeps spaces while typing even if parent normalize/sync rewrites the value. */
function DraftTextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setDraft(value)
  }, [value, focused])

  return (
    <label className="simple-field">
      <span>{label}</span>
      <input
        type="text"
        placeholder={placeholder}
        value={draft}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          const next = e.target.value
          setDraft(next)
          onChange(next)
        }}
        onBlur={() => {
          setFocused(false)
          setDraft(value)
        }}
      />
    </label>
  )
}

function IfLineField({
  value,
  onChange,
}: {
  value: string | null
  onChange: (next: string | null) => void
}) {
  const external = value ?? ''
  const [draft, setDraft] = useState(external)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setDraft(external)
  }, [external, focused])

  return (
    <label className="simple-field">
      <span>If-line (opcional, estilo backtest)</span>
      <input
        type="text"
        placeholder="ex.: ema12 crosses ema48 and rsi14 > 40"
        value={draft}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          const next = e.target.value
          setDraft(next)
          onChange(next.trim() ? next : null)
        }}
        onBlur={() => {
          setFocused(false)
          const next = draft.trim() ? draft : null
          setDraft(next ?? '')
          onChange(next)
        }}
      />
    </label>
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

function RuleBlock({
  title,
  expr,
  ifLine,
  indicators,
  onExpr,
  onIf,
  allowEmpty = false,
}: {
  title: string
  expr: BuilderExpr | null
  ifLine: string | null
  indicators: BuilderIndicator[]
  onExpr: (e: BuilderExpr | null) => void
  onIf: (s: string | null) => void
  allowEmpty?: boolean
}) {
  const active = expr ?? emptyBuilderExpr()

  function updatePart(i: number, part: BuilderCondition) {
    const parts = active.parts.map((p, idx) => (idx === i ? part : p))
    onExpr({ ...active, parts })
  }

  return (
    <section className="simple-block">
      <div className="simple-block-head">
        <h3>{title}</h3>
        <div className="code-actions">
          {allowEmpty && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                onExpr(null)
                onIf(null)
              }}
            >
              Limpar
            </button>
          )}
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              onExpr({
                ...active,
                parts: [
                  ...active.parts,
                  {
                    left: {
                      type: 'indicator',
                      ref: indicators[0]?.id ?? 'close',
                      output: 'main',
                    },
                    right: { type: 'constant', value: 0 },
                    op: 'gt',
                  },
                ],
              })
            }
          >
            + condição
          </button>
        </div>
      </div>

      <IfLineField value={ifLine} onChange={onIf} />

      {active.parts.length > 1 && (
        <label className="simple-field narrow">
          <span>Juntar</span>
          <select
            value={active.join}
            onChange={(e) =>
              onExpr({
                ...active,
                join: e.target.value === 'or' ? 'or' : 'and',
              })
            }
          >
            <option value="and">E (and)</option>
            <option value="or">OU (or)</option>
          </select>
        </label>
      )}

      {active.parts.map((part, i) => (
        <div key={i} className="simple-rule-row">
          <OperandSelect
            label="Série A"
            value={part.left}
            indicators={indicators}
            onChange={(left) => updatePart(i, { ...part, left })}
          />
          <label className="simple-field">
            <span>Op</span>
            <select
              value={part.op}
              onChange={(e) =>
                updatePart(i, { ...part, op: e.target.value as BuilderOp })
              }
            >
              {OPS.map((op) => (
                <option key={op} value={op}>
                  {BUILDER_OP_LABELS[op]}
                </option>
              ))}
            </select>
          </label>
          <OperandSelect
            label="Série B"
            value={part.right}
            indicators={indicators}
            onChange={(right) => updatePart(i, { ...part, right })}
            allowConstant
          />
          <button
            type="button"
            className="btn ghost danger"
            onClick={() => {
              const parts = active.parts.filter((_, idx) => idx !== i)
              onExpr(parts.length ? { ...active, parts } : allowEmpty ? null : emptyBuilderExpr())
            }}
          >
            ×
          </button>
        </div>
      ))}
    </section>
  )
}

function OperandSelect({
  label,
  value,
  indicators,
  onChange,
  allowConstant = false,
}: {
  label: string
  value: BuilderOperand
  indicators: BuilderIndicator[]
  onChange: (o: BuilderOperand) => void
  allowConstant?: boolean
}) {
  const key =
    value.type === 'close'
      ? 'close'
      : value.type === 'constant'
        ? 'constant'
        : `${value.ref}:${value.output ?? 'main'}`

  return (
    <>
      <label className="simple-field">
        <span>{label}</span>
        <select
          value={key}
          onChange={(e) => {
            const v = e.target.value
            if (v === 'close') onChange({ type: 'close' })
            else if (v === 'constant')
              onChange({
                type: 'constant',
                value: value.type === 'constant' ? value.value : 50,
              })
            else {
              const [ref, output] = v.split(':')
              onChange({
                type: 'indicator',
                ref,
                output: output as 'main',
              })
            }
          }}
        >
          <option value="close">Preço close</option>
          {indicators.map((ind, indIndex) => {
            if (ind.kind === 'macd') {
              return (
                <optgroup key={`macd-${indIndex}`} label={ind.label}>
                  <option value={`${ind.id}:main`}>MACD</option>
                  <option value={`${ind.id}:signal`}>Sinal</option>
                  <option value={`${ind.id}:hist`}>Hist</option>
                </optgroup>
              )
            }
            if (ind.kind === 'bb') {
              return (
                <optgroup key={`bb-${indIndex}`} label={ind.label}>
                  <option value={`${ind.id}:mid`}>Mid</option>
                  <option value={`${ind.id}:upper`}>Upper</option>
                  <option value={`${ind.id}:lower`}>Lower</option>
                </optgroup>
              )
            }
            return (
              <option key={`ind-${indIndex}`} value={`${ind.id}:main`}>
                {ind.label}
              </option>
            )
          })}
          {allowConstant && <option value="constant">Valor fixo…</option>}
        </select>
      </label>
      {value.type === 'constant' && (
        <label className="simple-field narrow">
          <span>Valor</span>
          <input
            type="number"
            step="any"
            value={value.value}
            onChange={(e) =>
              onChange({ type: 'constant', value: Number(e.target.value) })
            }
          />
        </label>
      )}
    </>
  )
}
