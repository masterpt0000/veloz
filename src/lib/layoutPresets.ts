/**
 * Workspace layout presets (chart vs results) + indicator pane stretch.
 * Persisted in localStorage so chart/builder tabs can share them.
 */

export type LayoutPresetId = 'chart_wide' | 'balanced' | 'results_wide'

export interface LayoutPreset {
  id: LayoutPresetId
  name: string
  description: string
  /** CSS grid column for chart (fr units as number). */
  chartFr: number
  /** CSS grid column for results panel. */
  resultsFr: number
  /** Main candle pane stretch vs separate indicator panes. */
  mainStretch: number
  separateStretch: number
}

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: 'chart_wide',
    name: 'Gráfico amplo',
    description: 'Mais espaço para o gráfico; resultados compactos',
    chartFr: 2.2,
    resultsFr: 0.7,
    mainStretch: 4,
    separateStretch: 1,
  },
  {
    id: 'balanced',
    name: 'Equilibrado',
    description: 'Equilíbrio gráfico / resultados',
    chartFr: 1.65,
    resultsFr: 0.85,
    mainStretch: 3,
    separateStretch: 1,
  },
  {
    id: 'results_wide',
    name: 'Resultados amplos',
    description: 'Mais espaço para métricas, equity e trades',
    chartFr: 1.15,
    resultsFr: 1.2,
    mainStretch: 2.5,
    separateStretch: 1.2,
  },
]

const STORAGE_KEY = 'veloz.layoutPreset.v1'

export function getPreset(id: LayoutPresetId): LayoutPreset {
  return LAYOUT_PRESETS.find((p) => p.id === id) ?? LAYOUT_PRESETS[1]
}

export function loadLayoutPresetId(): LayoutPresetId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'chart_wide' || raw === 'balanced' || raw === 'results_wide') {
      return raw
    }
  } catch {
    /* ignore */
  }
  return 'balanced'
}

export function saveLayoutPresetId(id: LayoutPresetId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}

export function layoutPresetCss(preset: LayoutPreset): string {
  return `minmax(0, ${preset.chartFr}fr) minmax(280px, ${preset.resultsFr}fr)`
}
