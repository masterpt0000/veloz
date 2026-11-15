import {
  RCI_DCA_DEFAULT_PARAMS,
  type RciDcaParams,
} from '../strategy/rciDcaEngine'

interface RciDcaPanelProps {
  params?: Partial<RciDcaParams>
}

export function RciDcaPanel({ params }: RciDcaPanelProps) {
  const p = { ...RCI_DCA_DEFAULT_PARAMS, ...(params ?? {}) }
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
