import { useEffect, useRef } from 'react'

interface ShortcutsHelpProps {
  open: boolean
  onClose: () => void
}

const SHORTCUTS = [
  {
    keys: 'Ctrl + Enter',
    keysMac: '⌘ + Enter',
    action: 'Executar backtest',
    note: 'No gráfico (não no painel builder)',
  },
  {
    keys: '?',
    keysMac: '?',
    action: 'Abrir / fechar atalhos',
    note: 'Este painel',
  },
  {
    keys: 'T',
    keysMac: 'T',
    action: 'Alternar tema claro / escuro',
    note: 'Ignorado se estiver a escrever num campo',
  },
] as const

export function ShortcutsHelp({ open, onClose }: ShortcutsHelpProps) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
  }, [open])

  if (!open) return null

  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)

  return (
    <div
      className="shortcuts-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      onClick={onClose}
    >
      <div
        className="shortcuts-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shortcuts-head">
          <div>
            <h2 id="shortcuts-title">Atalhos de teclado</h2>
            <p>Referência rápida · UI em português</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="btn ghost"
            onClick={onClose}
          >
            Fechar
          </button>
        </header>
        <ul className="shortcuts-list">
          {SHORTCUTS.map((row) => (
            <li key={row.action}>
              <kbd>{isMac ? row.keysMac : row.keys}</kbd>
              <div>
                <strong>{row.action}</strong>
                <span>{row.note}</span>
              </div>
            </li>
          ))}
        </ul>
        <p className="shortcuts-foot muted">
          Também pode usar o botão <strong>Atalhos</strong> na barra superior e o
          interruptor de tema.
        </p>
      </div>
    </div>
  )
}
