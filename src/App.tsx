import { startTransition, useDeferredValue, useEffect, useState } from 'react'
import { CandleDownloadPanel } from './components/CandleDownloadPanel'
import { ChartPane } from './components/ChartPane'
import { IndicatorLegend } from './components/IndicatorLegend'
import { ResultsPanel } from './components/ResultsPanel'
import { RciDcaPanel } from './components/RciDcaPanel'
import { RunHistoryPanel } from './components/RunHistoryPanel'
import { SimpleStrategyForm } from './components/SimpleStrategyForm'
import { StrategyBuilderForm } from './components/StrategyBuilderForm'
import { StrategyEditor } from './components/StrategyEditor'
import { StrategyModeTabs } from './components/StrategyModeTabs'
import { StrategyToolbar } from './components/StrategyToolbar'
import {
  fetchSymbolCoverage,
  getCandlesApiKey,
  isCandlesApiConfigured,
  probeCandlesApi,
  type CandlesApiAlert,
  type SymbolCoverage,
} from './data/candlesApi'
import {
  BAR_COUNTS,
  chartSymbolsFromCoverage,
  SYMBOLS,
  TIMEFRAMES,
} from './data/symbols'
import {
  fetchMarketData,
  generateMarketData,
} from './data/generateMarketData'
import { runBacktest } from './strategy/runBacktest'
import {
  defaultBuilderSpec,
  type VelozBuilderSpec,
} from './strategy/builderSpec'
import {
  appendRun,
  clearRunHistory,
  deleteRun,
  loadRunHistory,
  savedRunToResult,
  type RunHistoryStore,
  type SavedRun,
} from './strategy/runHistory'
import type {
  SimpleStrategyConfig,
  StrategyEditMode,
} from './strategy/simpleStrategy'
import {
  copyStrategyJson,
  downloadStrategyJson,
  parseStrategyJson,
} from './strategy/strategyExport'
import {
  addStrategy,
  createStrategy,
  deleteStrategy,
  getActive,
  loadLibrary,
  renameStrategy,
  resolveRunCode,
  saveLibrary,
  selectStrategy,
  updateActiveBuilderSpec,
  updateActiveCode,
  updateActiveMode,
  updateActiveSimpleConfig,
  type StrategyLibrary,
} from './strategy/strategyStore'
import { STRATEGY_TEMPLATES } from './strategy/strategyTemplates'
import type { BacktestResult, Timeframe } from './types'
import './App.css'

const INITIAL_CAPITAL = 10_000

function readPane(): 'chart' | 'builder' {
  try {
    const q = new URLSearchParams(window.location.search)
    return q.get('pane') === 'builder' ? 'builder' : 'chart'
  } catch {
    return 'chart'
  }
}

function useStrategyLibrary() {
  const [library, setLibrary] = useState<StrategyLibrary>(() => loadLibrary())

  useEffect(() => {
    saveLibrary(library)
  }, [library])

  // Sync when the builder tab writes localStorage
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== 'veloz.strategies.v1' || !e.newValue) return
      try {
        setLibrary(loadLibrary())
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const active = getActive(library)
  return { library, setLibrary, active }
}

export default function App() {
  const [pane] = useState(readPane)
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
  const [dataPanelOpen, setDataPanelOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [runHistory, setRunHistory] = useState<RunHistoryStore>(() =>
    loadRunHistory(),
  )
  const [statusToast, setStatusToast] = useState<string | null>(null)
  const [chartSymbols, setChartSymbols] = useState(SYMBOLS)
  const [apiAlert, setApiAlert] = useState<CandlesApiAlert | null>(null)
  const candlesLive = isCandlesApiConfigured()

  const symbol = chartSymbols.find((s) => s.id === symbolId) ?? chartSymbols[0]
  const code = active.code
  const mode = active.mode
  const simpleConfig = active.simpleConfig
  const builderSpec = active.builderSpec ?? defaultBuilderSpec(active.name)

  useEffect(() => {
    if (!statusToast) return
    const t = window.setTimeout(() => setStatusToast(null), 2800)
    return () => window.clearTimeout(t)
  }, [statusToast])

  const [bars, setBars] = useState(() =>
    generateMarketData(SYMBOLS[0], '1h', 25_000),
  )

  function applyCoverageToChart(rows: SymbolCoverage[] | null) {
    const next = chartSymbolsFromCoverage(rows)
    setChartSymbols(next)
    setSymbolId((current) =>
      next.some((s) => s.id === current) ? current : next[0].id,
    )
  }

  useEffect(() => {
    if (!candlesLive || pane === 'builder') return
    let cancelled = false
    void (async () => {
      const alert = await probeCandlesApi()
      if (cancelled) return
      setApiAlert(alert)
      if (alert.kind !== 'ok' || !getCandlesApiKey()) return
      const rows = await fetchSymbolCoverage()
      if (cancelled || rows == null) return
      applyCoverageToChart(rows)
    })()
    const id = window.setInterval(() => {
      void probeCandlesApi().then((alert) => {
        if (!cancelled) setApiAlert(alert)
      })
    }, 45_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [candlesLive, pane])

  useEffect(() => {
    if (pane === 'builder') return
    let cancelled = false
    const t0 = performance.now()

    async function loadBars() {
      const live = await fetchMarketData(symbol.id, timeframe, barCount)
      if (cancelled) return
      const next = live ?? generateMarketData(symbol, timeframe, barCount)
      startTransition(() => {
        setBars(next)
        setDataMs(performance.now() - t0)
        setResult(null)
        setError(null)
        setIndicatorVisibility({})
      })
    }

    void loadBars()
    return () => {
      cancelled = true
    }
  }, [symbol, timeframe, barCount, pane])

  const deferredBars = useDeferredValue(bars)
  const deferredSignals = useDeferredValue(result?.signals ?? [])
  const deferredIndicators = useDeferredValue(result?.indicators ?? [])

  function handleCodeChange(nextCode: string) {
    setLibrary((lib) => updateActiveCode(lib, nextCode))
  }

  function handleModeChange(nextMode: StrategyEditMode) {
    setLibrary((lib) => updateActiveMode(lib, nextMode))
  }

  function handleSimpleConfigChange(next: SimpleStrategyConfig) {
    setLibrary((lib) => updateActiveSimpleConfig(lib, next))
  }

  function handleBuilderSpecChange(next: VelozBuilderSpec) {
    setLibrary((lib) => updateActiveBuilderSpec(lib, next))
  }

  function handleSelect(id: string) {
    setLibrary((lib) => selectStrategy(lib, id))
    setResult(null)
    setError(null)
    setIndicatorVisibility({})
  }

  function handleCreate() {
    const name = window.prompt('Nome da nova estratégia:', 'Nova estratégia')
    if (name == null) return
    const useSample = window.confirm(
      'Usar a amostra SMA + RSI (código avançado)?\n\nOK = amostra · Cancelar = builder (formato backtest)',
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

  function handleExport() {
    downloadStrategyJson(active)
    setStatusToast('Estratégia exportada (.json)')
  }

  async function handleCopyExport() {
    try {
      await copyStrategyJson(active)
      setStatusToast('JSON copiado para a área de transferência')
    } catch {
      setStatusToast('Não foi possível copiar — use Exportar JSON')
    }
  }

  function handleImportJson(text: string) {
    try {
      const imported = parseStrategyJson(text)
      setLibrary((lib) => addStrategy(lib, imported))
      setResult(null)
      setError(null)
      setIndicatorVisibility({})
      setStatusToast(`Importada: ${imported.name}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function handleAddTemplate(templateId: string) {
    const meta = STRATEGY_TEMPLATES.find((t) => t.id === templateId)
    if (!meta) return
    const created = meta.build()
    setLibrary((lib) => addStrategy(lib, created))
    setResult(null)
    setError(null)
    setIndicatorVisibility({})
    setStatusToast(`Modelo adicionado: ${created.name}`)
  }

  function openSavedRun(run: SavedRun) {
    setResult(savedRunToResult(run))
    setError(null)
    setIndicatorVisibility({})
    setHistoryOpen(false)
    setStatusToast(`Run reaberto: ${run.meta.strategyName}`)
  }

  function openBuilderTab() {
    const url = new URL(window.location.href)
    url.searchParams.set('pane', 'builder')
    window.open(url.toString(), 'veloz-strategy-builder')
  }

  async function handleRun() {
    setRunning(true)
    setError(null)
    try {
      const runCode = resolveRunCode(active)
      const builtinParams =
        active.engine === 'rci_dca'
          ? active.rciDcaParams
          : active.engine === 'builder'
            ? (active.builderSpec ?? builderSpec)
            : undefined
      const next = await runBacktest(runCode, bars, INITIAL_CAPITAL, {
        builtin: active.engine,
        builtinParams: builtinParams as Record<string, unknown> | undefined,
      })
      setResult(next)
      const seed: Record<string, boolean> = {}
      for (const ind of next.indicators) seed[ind.id] = ind.visible
      setIndicatorVisibility(seed)
      setRunHistory((hist) =>
        appendRun(hist, next, {
          symbolId: symbol.id,
          symbolLabel: symbol.label,
          timeframe,
          barCount: bars.length,
          strategyId: active.id,
          strategyName: active.name,
          initialCapital: INITIAL_CAPITAL,
        }),
      )
    } catch (err) {
      setResult(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  const shareHandlers = {
    onExport: handleExport,
    onCopyExport: handleCopyExport,
    onImportJson: handleImportJson,
    onAddTemplate: handleAddTemplate,
  }

  const isBuiltinRci = active.engine === 'rci_dca'
  const isBuilder = active.engine === 'builder'

  function toggleIndicator(id: string) {
    setIndicatorVisibility((prev) => ({
      ...prev,
      [id]: !(prev[id] ?? true),
    }))
  }

  if (pane === 'builder') {
    return (
      <div className="app-shell builder-shell">
        <div className="atmosphere" aria-hidden="true" />
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true" />
            <div className="brand-text">
              <h1>Veloz</h1>
              <p>definições de estratégia</p>
            </div>
          </div>
          <div className="topbar-meta">
            <span className="pill muted">painel builder · sync via localStorage</span>
          </div>
        </header>
        {statusToast && (
          <div className="status-toast" role="status">
            {statusToast}
          </div>
        )}
        <main className="builder-workspace">
          <div className="section-label">
            <span>Estratégia</span>
            <StrategyToolbar
              strategies={library.strategies}
              activeId={library.activeId}
              running={false}
              showRun={false}
              onSelect={handleSelect}
              onCreate={handleCreate}
              onRename={handleRename}
              onDelete={handleDelete}
              onRun={() => undefined}
              {...shareHandlers}
            />
          </div>
          {isBuiltinRci ? (
            <RciDcaPanel params={active.rciDcaParams} />
          ) : isBuilder || !active.engine ? (
            <StrategyBuilderForm
              key={library.activeId}
              spec={
                isBuilder || active.builderSpec
                  ? builderSpec
                  : defaultBuilderSpec(active.name)
              }
              onChange={(next) => {
                handleBuilderSpecChange(next)
              }}
            />
          ) : mode === 'simple' ? (
            <SimpleStrategyForm
              key={`${library.activeId}-simple`}
              config={simpleConfig}
              onChange={handleSimpleConfigChange}
            />
          ) : (
            <>
              <StrategyModeTabs mode={mode} onChange={handleModeChange} />
              <StrategyEditor
                key={`${library.activeId}-advanced`}
                code={code}
                onChange={handleCodeChange}
              />
            </>
          )}
        </main>
      </div>
    )
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
              {chartSymbols.map((s) => (
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

          <button
            type="button"
            className="btn ghost"
            onClick={() => setDataPanelOpen((v) => !v)}
          >
            {dataPanelOpen ? 'Ocultar dados' : 'Dados BD'}
          </button>
        </div>

        <div className="topbar-meta">
          <span
            className={`pill ${
              !candlesLive || apiAlert?.kind === 'ok'
                ? candlesLive
                  ? ''
                  : 'muted'
                : apiAlert?.kind === 'no_key'
                  ? 'warn'
                  : 'danger'
            }`}
            title={
              apiAlert && 'message' in apiAlert ? apiAlert.message : undefined
            }
          >
            {!candlesLive
              ? 'dados demo'
              : apiAlert?.kind === 'ok'
                ? 'API candles'
                : apiAlert?.kind === 'offline'
                  ? 'API offline'
                  : apiAlert?.kind === 'unauthorized'
                    ? 'API 401'
                    : apiAlert?.kind === 'no_key'
                      ? 'API sem chave'
                      : apiAlert?.kind === 'error'
                        ? 'API erro'
                        : 'API candles'}{' '}
            · {deferredBars.length.toLocaleString('pt-PT')} · {dataMs.toFixed(0)}{' '}
            ms
          </span>
        </div>
      </header>

      {apiAlert &&
        (apiAlert.kind === 'offline' ||
          apiAlert.kind === 'unauthorized' ||
          apiAlert.kind === 'error') && (
          <div className="api-alert-banner danger" role="alert">
            <strong>Candles API:</strong> {apiAlert.message}
            <button
              type="button"
              className="btn ghost"
              onClick={() => setDataPanelOpen(true)}
            >
              Abrir Dados BD
            </button>
          </div>
        )}

      <CandleDownloadPanel
        open={dataPanelOpen}
        onClose={() => setDataPanelOpen(false)}
        onCoverageChange={applyCoverageToChart}
        onApiAlert={setApiAlert}
      />

      <RunHistoryPanel
        open={historyOpen}
        runs={runHistory.runs}
        onClose={() => setHistoryOpen(false)}
        onOpen={openSavedRun}
        onDelete={(id) => setRunHistory((h) => deleteRun(h, id))}
        onClear={() => setRunHistory(clearRunHistory())}
      />

      {statusToast && (
        <div className="status-toast" role="status">
          {statusToast}
        </div>
      )}

      <main className="workspace workspace-chart">
        <section className="chart-section">
          <div className="section-label">
            <span>
              {symbol.label} · {timeframe}
            </span>
            <StrategyToolbar
              strategies={library.strategies}
              activeId={library.activeId}
              running={running}
              onSelect={handleSelect}
              onCreate={handleCreate}
              onRename={handleRename}
              onDelete={handleDelete}
              onRun={handleRun}
              onOpenBuilder={openBuilderTab}
              onToggleHistory={() => setHistoryOpen((v) => !v)}
              historyCount={runHistory.runs.length}
              {...shareHandlers}
            />
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
