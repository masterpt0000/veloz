import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { EditorView } from '@codemirror/view'

interface StrategyEditorProps {
  code: string
  onChange: (value: string) => void
}

const velozTheme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    height: '100%',
    maxHeight: '100%',
    fontSize: '13px',
  },
  '.cm-scroller': {
    fontFamily: "'DM Sans', ui-monospace, SFMono-Regular, Menlo, monospace",
    lineHeight: '1.55',
    overflow: 'auto',
  },
  '.cm-content': {
    caretColor: '#0b3d36',
    padding: '12px 0',
    minWidth: '100%',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#8aa39a',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(11, 61, 54, 0.05)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'rgba(15, 118, 110, 0.18)',
  },
})

export function StrategyEditor({ code, onChange }: StrategyEditorProps) {
  return (
    <div className="strategy-editor">
      <CodeMirror
        value={code}
        height="100%"
        maxHeight="100%"
        width="100%"
        theme={velozTheme}
        extensions={[javascript({ typescript: true }), EditorView.lineWrapping]}
        onChange={onChange}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: true,
          bracketMatching: true,
        }}
      />
    </div>
  )
}
