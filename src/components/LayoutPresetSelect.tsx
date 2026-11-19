import {
  LAYOUT_PRESETS,
  type LayoutPresetId,
} from '../lib/layoutPresets'

interface LayoutPresetSelectProps {
  value: LayoutPresetId
  onChange: (id: LayoutPresetId) => void
}

export function LayoutPresetSelect({
  value,
  onChange,
}: LayoutPresetSelectProps) {
  return (
    <label className="field layout-preset-field">
      <span>Layout</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as LayoutPresetId)}
        aria-label="Predefinição de layout"
        title="Predefinições gráfico vs resultados"
      >
        {LAYOUT_PRESETS.map((p) => (
          <option key={p.id} value={p.id} title={p.description}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  )
}
