import { startTransition, useDeferredValue, useEffect, useState } from 'react'
import { ChartPane } from './components/ChartPane'
import { IndicatorLegend } from './components/IndicatorLegend'
import { ResultsPanel } from './components/ResultsPanel'
import { StrategyEditor } from './components/StrategyEditor'
import { StrategyToolbar } from './components/StrategyToolbar'
import { BAR_COUNTS, SYMBOLS, TIMEFRAMES } from './data/symbols'
import { generateMarketData } from './data/generateMarketData'
import { runBacktest } from './strategy/runBacktest'
import {
  createStrategy,
  deleteStrategy,
  getActive,
  loadLibrary,
  renameStrategy,
  saveLibrary,
  selectStrategy,
  updateActiveCode,
  type StrategyLibrary,
} from './strategy/strategyStore'
import type { BacktestResult, Timeframe } from './types'
import './App.css'

const INITIAL_CAPITAL = 10_000

function useStrategyLibrary() {
  const [library, setLibrary] = useState<StrategyLibrary>(() => loadLibrary())

  useEffect(() => {
    saveLibrary(library)
  }, [library])

  const active = getActive(library)

  return { library, setLibrary, active }
}

export default function App() {
  const [symbolId, setSymbolId] = useState(SYMBOLS[0].id)
  const [timeframe, setTimeframe] = useState<Timeframe>('1h')
  const [barCount, setBarCount] = useState<number>(25_000)
  const [showVolume, setShowVolume] = useState(true)
  const { library, setLibrary, active } = useStrategyLibrary()
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [dataMs, setDataMs] = useState(0)
  const [indicatorVisibility, setIndicatorVisibility] = useState<
    Record<string, boolean>
  >({})

  const symbol = SYMBOLS.find((s) => s.id === symbolId) ?? SYMBOLS[0]
  const code = active.code

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

  function handleCodeChange(nextCode: string) {
    setLibrary((lib) => updateActiveCode(lib, nextCode))
  }

  function handleSelect(id: string) {
    setLibrary((lib) => selectStrategy(lib, id))
    // Load code only — do not auto-run backtest
    setResult(null)
    setError(null)
    setIndicatorVisibility({})
  }

  function handleCreate() {
    const name = window.prompt('Nome da nova estratégia:', 'Nova estratégia')
    if (name == null) return
    const useSample = window.confirm(
      'Usar o código da amostra SMA + RSI?\n\nOK = amostra · Cancelar = modelo em branco',
    )
    setLibrary((lib) => createStrategy(lib, name, useSample))
    setResult(null)
    setError(null)
    setIndicatorVisibility({})
  }

  function handleRename() {
    const current = getActive(library)
    const name = window.prompt('Novo nome:', current.name)
    if (name == null || !name.trim()) return
    setLibrary((lib) => renameStrategy(lib, current.id, name))
  }

  function handleDelete() {
    if (library.strategies.length <= 1) return
    const current = getActive(library)
    const ok = window.confirm(`Eliminar «${current.name}»? Esta ação não se desfaz.`)
    if (!ok) return
    setLibrary((lib) => deleteStrategy(lib, current.id))
    setResult(null)
    setError(null)
    setIndicatorVisibility({})
  }

  async function handleRun() {
    setRunning(true)
    setError(null)
    try {
      const next = await runBacktest(code, bars, INITIAL_CAPITAL)
      setResult(next)
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
            <StrategyToolbar
              strategies={library.strategies}
              activeId={library.activeId}
              running={running}
              onSelect={handleSelect}
              onCreate={handleCreate}
              onRename={handleRename}
              onDelete={handleDelete}
              onRun={handleRun}
            />
          </div>
          <StrategyEditor
            key={library.activeId}
            code={code}
            onChange={handleCodeChange}
          />
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
