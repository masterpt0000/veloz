import { startTransition, useDeferredValue, useEffect, useState } from 'react'
import { ChartPane } from './components/ChartPane'
import { IndicatorLegend } from './components/IndicatorLegend'
import { ResultsPanel } from './components/ResultsPanel'
import { StrategyEditor } from './components/StrategyEditor'
import { BAR_COUNTS, SYMBOLS, TIMEFRAMES } from './data/symbols'
import { generateMarketData } from './data/generateMarketData'
import { SAMPLE_STRATEGY_CODE } from './strategy/sampleStrategy'
import { runBacktest } from './strategy/runBacktest'
import type { BacktestResult, Timeframe } from './types'
import './App.css'

const INITIAL_CAPITAL = 10_000

export default function App() {
  const [symbolId, setSymbolId] = useState(SYMBOLS[0].id)
  const [timeframe, setTimeframe] = useState<Timeframe>('1h')
  const [barCount, setBarCount] = useState<number>(25_000)
  const [showVolume, setShowVolume] = useState(true)
  const [code, setCode] = useState(SAMPLE_STRATEGY_CODE)
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [dataMs, setDataMs] = useState(0)
  const [indicatorVisibility, setIndicatorVisibility] = useState<
    Record<string, boolean>
  >({})

  const symbol = SYMBOLS.find((s) => s.id === symbolId) ?? SYMBOLS[0]

  const [bars, setBars] = useState(() =>
    generateMarketData(SYMBOLS[0], '1h', 25_000),
  )

  useEffect(() => {
    const t0 = performance.now()
    const next = generateMarketData(symbol, timeframe, barCount)
    startTransition(() => {
      setBars(next)
      setDataMs(performance.now() - t0)
      setResult(null)
      setError(null)
      setIndicatorVisibility({})
    })
  }, [symbol, timeframe, barCount])

  const deferredBars = useDeferredValue(bars)
  const deferredSignals = useDeferredValue(result?.signals ?? [])
  const deferredIndicators = useDeferredValue(result?.indicators ?? [])

  async function handleRun() {
    setRunning(true)
    setError(null)
    try {
      const next = await runBacktest(code, bars, INITIAL_CAPITAL)
      setResult(next)
      // Seed toggles from strategy `visible` flags
      const seed: Record<string, boolean> = {}
      for (const ind of next.indicators) seed[ind.id] = ind.visible
      setIndicatorVisibility(seed)
    } catch (err) {
      setResult(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  function handleResetCode() {
    setCode(SAMPLE_STRATEGY_CODE)
  }

  function toggleIndicator(id: string) {
    setIndicatorVisibility((prev) => ({
      ...prev,
      [id]: !(prev[id] ?? true),
    }))
  }

  return (
    <div className="app-shell">
      <div className="atmosphere" aria-hidden="true" />

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div className="brand-text">
            <h1>Veloz</h1>
            <p>gráficos · estratégias · sem frear</p>
          </div>
        </div>

        <div className="controls">
          <label className="field">
            <span>Ativo</span>
            <select value={symbolId} onChange={(e) => setSymbolId(e.target.value)}>
              {SYMBOLS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Tempo</span>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as Timeframe)}
            >
              {TIMEFRAMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Barras</span>
            <select
              value={barCount}
              onChange={(e) => setBarCount(Number(e.target.value))}
            >
              {BAR_COUNTS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={showVolume}
              onChange={(e) => setShowVolume(e.target.checked)}
            />
            <span>Volume</span>
          </label>
        </div>

        <div className="topbar-meta">
          <span className="pill muted">
            dados demo · {deferredBars.length.toLocaleString('pt-PT')} · {dataMs.toFixed(0)} ms
          </span>
        </div>
      </header>

      <main className="workspace">
        <section className="chart-section">
          <div className="section-label">
            <span>
              {symbol.label} · {timeframe}
            </span>
            <span className="muted">zoom / pan com rato ou touch</span>
          </div>
          <IndicatorLegend
            indicators={deferredIndicators}
            visibility={indicatorVisibility}
            onToggle={toggleIndicator}
          />
          <ChartPane
            bars={deferredBars}
            signals={deferredSignals}
            indicators={deferredIndicators}
            showVolume={showVolume}
            visibility={indicatorVisibility}
          />
        </section>

        <section className="code-section">
          <div className="section-label">
            <span>Estratégia</span>
            <div className="code-actions">
              <button type="button" className="btn ghost" onClick={handleResetCode}>
                Restaurar amostra
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={handleRun}
                disabled={running}
              >
                {running ? 'A executar…' : 'Executar backtest'}
              </button>
            </div>
          </div>
          <StrategyEditor code={code} onChange={setCode} />
        </section>

        <ResultsPanel
          result={result}
          error={error}
          running={running}
          initialCapital={INITIAL_CAPITAL}
        />
      </main>
    </div>
  )
}
