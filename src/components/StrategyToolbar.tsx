import { useRef, useState, type ChangeEvent } from 'react'
import type { SavedStrategy } from '../strategy/strategyStore'
import { STRATEGY_TEMPLATES } from '../strategy/strategyTemplates'

interface StrategyToolbarProps {
  strategies: SavedStrategy[]
  activeId: string
  running: boolean
  /** Hide run when on builder-only pane */
  showRun?: boolean
  onSelect: (id: string) => void
  onCreate: () => void
  onRename: () => void
  onDelete: () => void
  onRun: () => void
  onOpenBuilder?: () => void
  onExport?: () => void
  onCopyExport?: () => void
  onImportJson?: (text: string) => void
  onAddTemplate?: (templateId: string) => void
  onToggleHistory?: () => void
  historyCount?: number
}

export function StrategyToolbar({
  strategies,
  activeId,
  running,
  showRun = true,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onRun,
  onOpenBuilder,
  onExport,
  onCopyExport,
  onImportJson,
  onAddTemplate,
  onToggleHistory,
  historyCount = 0,
}: StrategyToolbarProps) {
  const canDelete = strategies.length > 1
  const fileRef = useRef<HTMLInputElement>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !onImportJson) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      onImportJson(text)
    }
    reader.readAsText(file)
  }

  async function handlePasteImport() {
    if (!onImportJson) return
    try {
      const text = await navigator.clipboard.readText()
      onImportJson(text)
    } catch {
      const text = window.prompt('Cole o JSON da estratégia:')
      if (text) onImportJson(text)
    }
  }

  return (
    <div className="strategy-toolbar">
      <label className="strategy-select-field">
        <span className="visually-hidden">Estratégia guardada</span>
        <select
          className="strategy-select"
          value={activeId}
          onChange={(e) => onSelect(e.target.value)}
          aria-label="Escolher estratégia"
        >
          {strategies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <div className="code-actions">
        <button type="button" className="btn ghost" onClick={onCreate}>
          Nova
        </button>

        {onAddTemplate && (
          <div className="toolbar-menu">
            <button
              type="button"
              className="btn ghost"
              aria-expanded={templatesOpen}
              onClick={() => {
                setTemplatesOpen((v) => !v)
                setShareOpen(false)
              }}
            >
              Modelos
            </button>
            {templatesOpen && (
              <div className="toolbar-menu-panel" role="menu">
                {STRATEGY_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="toolbar-menu-item"
                    role="menuitem"
                    onClick={() => {
                      onAddTemplate(t.id)
                      setTemplatesOpen(false)
                    }}
                  >
                    <strong>{t.name}</strong>
                    <span>{t.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button type="button" className="btn ghost" onClick={onRename}>
          Renomear
        </button>
        <button
          type="button"
          className="btn ghost danger"
          onClick={onDelete}
          disabled={!canDelete}
          title={canDelete ? 'Eliminar estratégia' : 'Tem de ficar pelo menos uma'}
        >
          Eliminar
        </button>

        {(onExport || onImportJson) && (
          <div className="toolbar-menu">
            <button
              type="button"
              className="btn ghost"
              aria-expanded={shareOpen}
              onClick={() => {
                setShareOpen((v) => !v)
                setTemplatesOpen(false)
              }}
            >
              Partilhar
            </button>
            {shareOpen && (
              <div className="toolbar-menu-panel" role="menu">
                {onExport && (
                  <button
                    type="button"
                    className="toolbar-menu-item"
                    role="menuitem"
                    onClick={() => {
                      onExport()
                      setShareOpen(false)
                    }}
                  >
                    <strong>Exportar JSON</strong>
                    <span>Descarregar ficheiro .veloz.json</span>
                  </button>
                )}
                {onCopyExport && (
                  <button
                    type="button"
                    className="toolbar-menu-item"
                    role="menuitem"
                    onClick={() => {
                      void onCopyExport()
                      setShareOpen(false)
                    }}
                  >
                    <strong>Copiar JSON</strong>
                    <span>Para colar noutro browser / partilha</span>
                  </button>
                )}
                {onImportJson && (
                  <>
                    <button
                      type="button"
                      className="toolbar-menu-item"
                      role="menuitem"
                      onClick={() => {
                        fileRef.current?.click()
                        setShareOpen(false)
                      }}
                    >
                      <strong>Importar ficheiro</strong>
                      <span>Carregar .json exportado</span>
                    </button>
                    <button
                      type="button"
                      className="toolbar-menu-item"
                      role="menuitem"
                      onClick={() => {
                        void handlePasteImport()
                        setShareOpen(false)
                      }}
                    >
                      <strong>Importar da área de transferência</strong>
                      <span>Colar JSON já copiado</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json,.veloz.json"
          className="visually-hidden"
          onChange={handleFile}
        />

        {onOpenBuilder && (
          <button
            type="button"
            className="btn ghost"
            onClick={onOpenBuilder}
            title="Abre definições noutro separador"
          >
            Definir estratégia
          </button>
        )}

        {onToggleHistory && (
          <button
            type="button"
            className="btn ghost"
            onClick={onToggleHistory}
            title="Ver runs de backtest guardados"
          >
            Histórico{historyCount > 0 ? ` (${historyCount})` : ''}
          </button>
        )}

        {showRun && (
          <button
            type="button"
            className="btn primary"
            onClick={onRun}
            disabled={running}
            title="Atalho: Ctrl+Enter (⌘+Enter no Mac)"
          >
            {running ? 'A executar…' : 'Executar backtest'}
          </button>
        )}
      </div>
    </div>
  )
}
