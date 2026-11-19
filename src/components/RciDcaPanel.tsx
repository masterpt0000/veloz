import {
  RCI_DCA_DEFAULT_PARAMS,
  type RciDcaParams,
} from '../strategy/rciDcaEngine'

interface RciDcaPanelProps {
  params?: Partial<RciDcaParams>
  /** When set, fields become editable inside the builder. */
  onChange?: (next: Partial<RciDcaParams>) => void
}

export function RciDcaPanel({ params, onChange }: RciDcaPanelProps) {
  const p = { ...RCI_DCA_DEFAULT_PARAMS, ...(params ?? {}) }
  const editable = typeof onChange === 'function'

  function patch(partial: Partial<RciDcaParams>) {
    onChange?.({ ...p, ...partial })
  }

  if (!editable) {
    const dca =
      p.dca_mode === 'atr'
        ? `${p.dca_drop_atr} ATR`
        : `${p.dca_drop_pct}%`
    const tp =
      p.tp_mode === 'atr'
        ? `TP ${p.tp_atr} ATR`
        : `TP ${p.tp_pct}%`
    const trail = p.use_trail
      ? p.tp_mode === 'atr'
        ? `trail ${p.trail_atr} ATR`
        : `trail ${p.trail_pct}%`
      : 'trail off'

    return (
      <div className="rci-dca-panel">
        <p className="rci-dca-intro">
          Importado do engine Python <code>rci_dca_engine</code> (TraderBot).
          Corre bar-a-bar no worker — RCI + DCA + TP — igual à fonte.
        </p>

        <dl className="rci-dca-specs">
          <div>
            <dt>RCI</dt>
            <dd>
              {p.rci_short} / {p.rci_middle} / {p.rci_long}
            </dd>
          </div>
          <div>
            <dt>DCA</dt>
            <dd>
              drop {dca} · escala {p.pct1}/{p.pct2}/{p.pct3}/{p.pct4}/{p.pct5}% ·
              máx {p.max_entries}
            </dd>
          </div>
          <div>
            <dt>Saída</dt>
            <dd>
              {tp} · {trail}
            </dd>
          </div>
          <div>
            <dt>Direção</dt>
            <dd>
              {p.trade_long ? 'long' : ''}
              {p.trade_long && p.trade_short ? ' + ' : ''}
              {p.trade_short ? 'short' : ''}
              {!p.trade_long && !p.trade_short ? '—' : ''}
            </dd>
          </div>
          <div>
            <dt>Fees</dt>
            <dd>{(p.fees_pct * 100).toFixed(2)}%</dd>
          </div>
        </dl>

        <p className="rci-dca-hint muted">
          Clique em <strong>Executar backtest</strong> para ver sinais, overlays RCI
          e métricas. Dados de mercado aqui são demo (não Binance futures).
        </p>
      </div>
    )
  }

  return (
    <div className="rci-dca-panel">
      <header className="builder-form-head">
        <div>
          <h2>Parâmetros RCI + DCA</h2>
          <p>
            Edite os inputs do motor Python sem sair do builder. Guarda-se na
            biblioteca local.
          </p>
        </div>
      </header>

      <section className="simple-block">
        <div className="simple-block-head">
          <h3>RCI</h3>
        </div>
        <div className="simple-rule-row">
          <NumField
            label="Curto"
            value={p.rci_short}
            onChange={(rci_short) => patch({ rci_short })}
          />
          <NumField
            label="Médio"
            value={p.rci_middle}
            onChange={(rci_middle) => patch({ rci_middle })}
          />
          <NumField
            label="Longo"
            value={p.rci_long}
            onChange={(rci_long) => patch({ rci_long })}
          />
          <NumField
            label="ATR len"
            value={p.atr_len}
            onChange={(atr_len) => patch({ atr_len })}
          />
        </div>
      </section>

      <section className="simple-block">
        <div className="simple-block-head">
          <h3>DCA</h3>
        </div>
        <div className="simple-rule-row">
          <label className="simple-field">
            <span>Modo drop</span>
            <select
              value={p.dca_mode}
              onChange={(e) =>
                patch({ dca_mode: e.target.value === 'atr' ? 'atr' : 'pct' })
              }
            >
              <option value="pct">%</option>
              <option value="atr">ATR</option>
            </select>
          </label>
          {p.dca_mode === 'atr' ? (
            <NumField
              label="Drop ATR"
              value={p.dca_drop_atr}
              step={0.1}
              onChange={(dca_drop_atr) => patch({ dca_drop_atr })}
            />
          ) : (
            <NumField
              label="Drop %"
              value={p.dca_drop_pct}
              step={0.1}
              onChange={(dca_drop_pct) => patch({ dca_drop_pct })}
            />
          )}
          <NumField
            label="Máx entradas"
            value={p.max_entries}
            onChange={(max_entries) => patch({ max_entries })}
          />
        </div>
        <div className="simple-rule-row">
          <NumField label="pct1" value={p.pct1} step={0.1} onChange={(pct1) => patch({ pct1 })} />
          <NumField label="pct2" value={p.pct2} step={0.1} onChange={(pct2) => patch({ pct2 })} />
          <NumField label="pct3" value={p.pct3} step={0.1} onChange={(pct3) => patch({ pct3 })} />
          <NumField label="pct4" value={p.pct4} step={0.1} onChange={(pct4) => patch({ pct4 })} />
          <NumField label="pct5" value={p.pct5} step={0.1} onChange={(pct5) => patch({ pct5 })} />
        </div>
      </section>

      <section className="simple-block">
        <div className="simple-block-head">
          <h3>Saída / risco</h3>
        </div>
        <div className="simple-rule-row">
          <label className="simple-field">
            <span>Modo TP</span>
            <select
              value={p.tp_mode}
              onChange={(e) =>
                patch({ tp_mode: e.target.value === 'atr' ? 'atr' : 'pct' })
              }
            >
              <option value="pct">%</option>
              <option value="atr">ATR</option>
            </select>
          </label>
          {p.tp_mode === 'atr' ? (
            <NumField
              label="TP ATR"
              value={p.tp_atr}
              step={0.1}
              onChange={(tp_atr) => patch({ tp_atr })}
            />
          ) : (
            <NumField
              label="TP %"
              value={p.tp_pct}
              step={0.1}
              onChange={(tp_pct) => patch({ tp_pct })}
            />
          )}
          <label className="simple-field narrow check-field">
            <span>Trailing</span>
            <input
              type="checkbox"
              checked={p.use_trail}
              onChange={(e) => patch({ use_trail: e.target.checked })}
            />
          </label>
          {p.use_trail &&
            (p.tp_mode === 'atr' ? (
              <NumField
                label="Trail ATR"
                value={p.trail_atr}
                step={0.1}
                onChange={(trail_atr) => patch({ trail_atr })}
              />
            ) : (
              <NumField
                label="Trail %"
                value={p.trail_pct}
                step={0.1}
                onChange={(trail_pct) => patch({ trail_pct })}
              />
            ))}
          <NumField
            label="Fees %"
            value={Number((p.fees_pct * 100).toFixed(4))}
            step={0.01}
            onChange={(v) => patch({ fees_pct: v / 100 })}
          />
        </div>
      </section>

      <section className="simple-block">
        <div className="simple-block-head">
          <h3>Direção</h3>
        </div>
        <div className="simple-rule-row">
          <label className="simple-field narrow check-field">
            <span>Long</span>
            <input
              type="checkbox"
              checked={p.trade_long}
              onChange={(e) => patch({ trade_long: e.target.checked })}
            />
          </label>
          <label className="simple-field narrow check-field">
            <span>Short</span>
            <input
              type="checkbox"
              checked={p.trade_short}
              onChange={(e) => patch({ trade_short: e.target.checked })}
            />
          </label>
          <label className="simple-field narrow check-field">
            <span>DCA long</span>
            <input
              type="checkbox"
              checked={p.dca_long}
              onChange={(e) => patch({ dca_long: e.target.checked })}
            />
          </label>
          <label className="simple-field narrow check-field">
            <span>DCA short</span>
            <input
              type="checkbox"
              checked={p.dca_short}
              onChange={(e) => patch({ dca_short: e.target.checked })}
            />
          </label>
        </div>
      </section>

      <p className="rci-dca-hint muted">
        Volte ao gráfico e clique em <strong>Executar backtest</strong> para
        aplicar. Sync automático via localStorage.
      </p>
    </div>
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
