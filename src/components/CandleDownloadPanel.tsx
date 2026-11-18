import { useEffect, useState } from 'react'
import {
  fetchBackfillJob,
  fetchSymbolCoverage,
  getCandlesApiKey,
  isCandlesApiConfigured,
  setCandlesApiKey,
  startBackfill,
  type BackfillJob,
  type SymbolCoverage,
} from '../data/candlesApi'

/** Common Binance spot pairs offered for download (UI presets). */
export const DOWNLOAD_SYMBOL_PRESETS = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'ADAUSDT',
  'DOGEUSDT',
  'AVAXUSDT',
  'LINKUSDT',
  'DOTUSDT',
] as const

type RangeMode = 'until_now' | 'from_to'

function toIsoStartOfDay(dateStr: string): string {
  // date input is YYYY-MM-DD → treat as UTC midnight
  return `${dateStr}T00:00:00.000Z`
}

function toIsoEndOfDay(dateStr: string): string {
  return `${dateStr}T23:59:59.000Z`
}

function formatTs(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-PT', { timeZone: 'UTC' }) + ' UTC'
  } catch {
    return iso
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'queued':
      return 'na fila'
    case 'running':
      return 'a correr'
    case 'done':
      return 'concluído'
    case 'error':
      return 'erro'
    default:
      return status
  }
}

interface Props {
  open: boolean
  onClose: () => void
}

export function CandleDownloadPanel({ open, onClose }: Props) {
  const configured = isCandlesApiConfigured()
  const [coverage, setCoverage] = useState<SymbolCoverage[]>([])
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']),
  )
  const [customSymbol, setCustomSymbol] = useState('')
  const [rangeMode, setRangeMode] = useState<RangeMode>('until_now')
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - 7)
    return d.toISOString().slice(0, 10)
  })
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [job, setJob] = useState<BackfillJob | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState(() => getCandlesApiKey())

  async function refreshCoverage() {
    if (!configured) return
    const rows = await fetchSymbolCoverage()
    if (rows == null) {
      setLoadError(
        'Não foi possível ler a cobertura na BD (rede, CORS ou chave inválida).',
      )
      return
    }
    setLoadError(null)
    setCoverage(rows)
  }

  function saveApiKey() {
    setCandlesApiKey(apiKeyInput)
    setMessage(
      apiKeyInput.trim()
        ? 'Chave guardada nesta sessão (não vai no bundle).'
        : 'Chave removida desta sessão.',
    )
    void refreshCoverage()
  }

  useEffect(() => {
    if (!open || !configured) return
    void refreshCoverage()
  }, [open, configured])

  // Poll active job without touching chart data path
  useEffect(() => {
    if (!job || job.status === 'done' || job.status === 'error') return
    let cancelled = false
    const id = window.setInterval(async () => {
      const next = await fetchBackfillJob(job.id)
      if (cancelled || !next) return
      setJob(next)
      if (next.status === 'done' || next.status === 'error') {
        void refreshCoverage()
      }
    }, 1500)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [job?.id, job?.status])

  function toggleSymbol(sym: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(sym)) next.delete(sym)
      else next.add(sym)
      return next
    })
  }

  function addCustom() {
    const sym = customSymbol.trim().toUpperCase()
    if (!sym) return
    setSelected((prev) => new Set(prev).add(sym))
    setCustomSymbol('')
  }

  async function handleDownload() {
    if (!configured) {
      setMessage('Define VITE_CANDLES_API_URL para usar a API de candles.')
      return
    }
    const symbols = [...selected]
    if (symbols.length === 0) {
      setMessage('Escolhe pelo menos um símbolo.')
      return
    }
    if (symbols.length > 10) {
      setMessage('No máximo 10 símbolos por pedido.')
      return
    }
    setBusy(true)
    setMessage(null)
    const from = toIsoStartOfDay(fromDate)
    const to =
      rangeMode === 'from_to' ? toIsoEndOfDay(toDate) : undefined
    const started = await startBackfill({
      symbols,
      from,
      to,
    })
    setBusy(false)
    if (!started) {
      setMessage('Falha ao iniciar o download. Verifica a API / rede.')
      return
    }
    setJob(started)
    setMessage(`Pedido enviado (${started.id.slice(0, 8)}…)`)
  }

  if (!open) return null

  return (
    <section className="candle-download" aria-label="Download de candles">
      <div className="candle-download-head">
        <div>
          <h2>Dados Binance → BD</h2>
          <p>
            Escolhe moedas e o intervalo a descarregar (candles de 1 minuto). O
            gráfico continua a ler só janelas via GET /candles.
          </p>
        </div>
        <button type="button" className="btn ghost" onClick={onClose}>
          Fechar
        </button>
      </div>

      {!configured ? (
        <p className="candle-download-warn">
          API não configurada. No cliente, define{' '}
          <code>VITE_CANDLES_API_URL</code> (ex. http://192.168.1.216:8080).
        </p>
      ) : null}

      {configured ? (
        <div className="candle-download-block candle-download-key">
          <h3>Chave API (opcional)</h3>
          <p className="candle-download-hint">
            Em modo LAN aberto a API não exige chave. Se o servidor tiver{' '}
            <code>CANDLES_API_KEY</code> definido, cola-o aqui — fica só nesta
            sessão (não uses <code>VITE_*</code> para segredos).
          </p>
          <div className="range-row">
            <input
              type="password"
              autoComplete="off"
              placeholder="opcional — só se a API exigir"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
            />
            <button type="button" className="btn ghost" onClick={saveApiKey}>
              Guardar
            </button>
          </div>
        </div>
      ) : null}

      {loadError ? <p className="candle-download-warn">{loadError}</p> : null}

      <div className="candle-download-grid">
        <div className="candle-download-block">
          <h3>Símbolos</h3>
          <div className="symbol-chips">
            {DOWNLOAD_SYMBOL_PRESETS.map((sym) => (
              <label key={sym} className="chip-toggle">
                <input
                  type="checkbox"
                  checked={selected.has(sym)}
                  onChange={() => toggleSymbol(sym)}
                />
                <span>{sym}</span>
              </label>
            ))}
          </div>
          <div className="custom-symbol-row">
            <input
              type="text"
              value={customSymbol}
              placeholder="Outro (ex. MATICUSDT)"
              onChange={(e) => setCustomSymbol(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addCustom()
                }
              }}
            />
            <button type="button" className="btn ghost" onClick={addCustom}>
              Adicionar
            </button>
          </div>
          {[...selected]
            .filter((s) => !(DOWNLOAD_SYMBOL_PRESETS as readonly string[]).includes(s))
            .map((sym) => (
              <label key={sym} className="chip-toggle">
                <input
                  type="checkbox"
                  checked={selected.has(sym)}
                  onChange={() => toggleSymbol(sym)}
                />
                <span>{sym}</span>
              </label>
            ))}
        </div>

        <div className="candle-download-block">
          <h3>Intervalo</h3>
          <div className="range-modes">
            <label className="toggle">
              <input
                type="radio"
                name="rangeMode"
                checked={rangeMode === 'until_now'}
                onChange={() => setRangeMode('until_now')}
              />
              <span>De … até agora</span>
            </label>
            <label className="toggle">
              <input
                type="radio"
                name="rangeMode"
                checked={rangeMode === 'from_to'}
                onChange={() => setRangeMode('from_to')}
              />
              <span>De … até …</span>
            </label>
          </div>
          <div className="date-fields">
            <label className="field">
              <span>De</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </label>
            {rangeMode === 'from_to' ? (
              <label className="field">
                <span>Até</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </label>
            ) : (
              <p className="hint-inline">Até: agora (UTC)</p>
            )}
          </div>
          <button
            type="button"
            className="btn primary"
            disabled={busy || !configured}
            onClick={() => void handleDownload()}
          >
            {busy ? 'A enviar…' : 'Descarregar / backfill'}
          </button>
          {message ? <p className="hint-inline">{message}</p> : null}
        </div>

        <div className="candle-download-block">
          <div className="block-head-row">
            <h3>Na base de dados</h3>
            <button
              type="button"
              className="btn ghost"
              disabled={!configured}
              onClick={() => void refreshCoverage()}
            >
              Atualizar
            </button>
          </div>
          {coverage.length === 0 ? (
            <p className="hint-inline">Ainda sem símbolos na BD.</p>
          ) : (
            <table className="coverage-table">
              <thead>
                <tr>
                  <th>Símbolo</th>
                  <th>Desde</th>
                  <th>Até</th>
                  <th>Barras</th>
                </tr>
              </thead>
              <tbody>
                {coverage.map((row) => (
                  <tr key={row.symbol}>
                    <td>{row.symbol}</td>
                    <td>{formatTs(row.minTs)}</td>
                    <td>{formatTs(row.maxTs)}</td>
                    <td>{row.barCount.toLocaleString('pt-PT')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {job ? (
        <div className="candle-job-status">
          <strong>Estado do pedido:</strong> {statusLabel(job.status)}
          {job.error ? <span className="job-error"> — {job.error}</span> : null}
          <ul>
            {job.symbols.map((sym) => {
              const p = job.progress?.[sym]
              return (
                <li key={sym}>
                  {sym}: {statusLabel(p?.status ?? '—')}
                  {p?.bars != null ? ` · ${p.bars.toLocaleString('pt-PT')} barras` : ''}
                  {p?.error ? ` · ${p.error}` : ''}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
