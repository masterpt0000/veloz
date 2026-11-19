import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  filterAndSortStrategies,
  listAllTags,
  type SavedStrategy,
  type StrategySortMode,
} from '../strategy/strategyStore'
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
  onDuplicate?: () => void
  onToggleFavorite?: (id: string) => void
  onTagsChange?: (id: string, tags: string[]) => void
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
  onDuplicate,
  onToggleFavorite,
  onTagsChange,
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
  const [query, setQuery] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [sort, setSort] = useState<StrategySortMode>('favorites')
  const [tagsDraft, setTagsDraft] = useState<string | null>(null)

  const allTags = useMemo(() => listAllTags(strategies), [strategies])
  const active = strategies.find((s) => s.id === activeId) ?? strategies[0]
  const visible = useMemo(() => {
    const filtered = filterAndSortStrategies(strategies, {
      query,
      tag: tagFilter || null,
      favoritesOnly,
      sort,
    })
    // Keep the active strategy visible even if it fails the current filter.
    if (active && !filtered.some((s) => s.id === active.id)) {
      return [active, ...filtered]
    }
    return filtered
  }, [strategies, query, tagFilter, favoritesOnly, sort, active])

  useEffect(() => {
    setTagsDraft(null)
  }, [activeId])

  const tagsValue = tagsDraft ?? (active?.tags ?? []).join(', ')

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

  function commitTags() {
    if (!active || !onTagsChange || tagsDraft == null) return
    const tags = tagsDraft
      .split(/[,;]+/)
      .map((t) => t.trim())
      .filter(Boolean)
    onTagsChange(active.id, tags)
    setTagsDraft(null)
  }

  return (
    <div className="strategy-toolbar-wrap">
      <div className="strategy-list-filters" role="search">
        <label className="strategy-filter-field">
          <span className="visually-hidden">Pesquisar estratégias</span>
          <input
            type="search"
            className="strategy-filter-input"
            placeholder="Pesquisar…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Pesquisar estratégias"
          />
        </label>
        <label className="strategy-filter-field">
          <span className="visually-hidden">Filtrar por etiqueta</span>
          <select
            className="strategy-filter-select"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            aria-label="Filtrar por etiqueta"
          >
            <option value="">Todas as etiquetas</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>
        <label className="strategy-filter-field">
          <span className="visually-hidden">Ordenar</span>
          <select
            className="strategy-filter-select"
            value={sort}
            onChange={(e) => setSort(e.target.value as StrategySortMode)}
            aria-label="Ordenar estratégias"
          >
            <option value="favorites">Favoritos primeiro</option>
            <option value="recent">Recentes</option>
            <option value="name">Nome</option>
          </select>
        </label>
        <button
          type="button"
          className={`btn ghost filter-fav${favoritesOnly ? ' active' : ''}`}
          aria-pressed={favoritesOnly}
          title="Só favoritos"
          onClick={() => setFavoritesOnly((v) => !v)}
        >
          ★ Só favoritos
        </button>
      </div>

      <div className="strategy-toolbar">
        <label className="strategy-select-field">
          <span className="visually-hidden">Estratégia guardada</span>
          <select
            className="strategy-select"
            value={active?.id ?? ''}
            onChange={(e) => onSelect(e.target.value)}
            aria-label="Escolher estratégia"
            disabled={visible.length === 0}
          >
            {visible.length === 0 ? (
              <option value="">Nenhuma corresponde ao filtro</option>
            ) : (
              visible.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.favorite ? '★ ' : ''}
                  {s.name}
                </option>
              ))
            )}
          </select>
        </label>

        {onToggleFavorite && active && (
          <button
            type="button"
            className={`btn ghost fav-btn${active.favorite ? ' active' : ''}`}
            onClick={() => onToggleFavorite(active.id)}
            title={
              active.favorite ? 'Remover dos favoritos' : 'Marcar como favorito'
            }
            aria-pressed={active.favorite}
            aria-label={
              active.favorite ? 'Remover dos favoritos' : 'Marcar como favorito'
            }
          >
            {active.favorite ? '★' : '☆'}
          </button>
        )}

        <div className="code-actions">
          <button type="button" className="btn ghost" onClick={onCreate}>
            Nova
          </button>

          {onDuplicate && (
            <button
              type="button"
              className="btn ghost"
              onClick={onDuplicate}
              title="Duplicar estratégia activa"
            >
              Duplicar
            </button>
          )}

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
            title={
              canDelete
                ? 'Eliminar estratégia'
                : 'Tem de ficar pelo menos uma'
            }
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

      {onTagsChange && active && (
        <label className="strategy-tags-field">
          <span>Etiquetas</span>
          <input
            type="text"
            className="strategy-tags-input"
            placeholder="ex.: tendência, rsi, scalp"
            value={tagsValue}
            onChange={(e) => setTagsDraft(e.target.value)}
            onFocus={() => setTagsDraft((active.tags ?? []).join(', '))}
            onBlur={commitTags}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur()
              }
            }}
            aria-label="Etiquetas da estratégia"
          />
        </label>
      )}
    </div>
  )
}
