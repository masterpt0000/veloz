/**
 * Light / dark theme persistence for Veloz UI + charts.
 */

export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'veloz.theme.v1'

export function loadTheme(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'dark' || raw === 'light') return raw
  } catch {
    /* private mode */
  }
  if (typeof window !== 'undefined' && window.matchMedia) {
    try {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
    } catch {
      /* ignore */
    }
  }
  return 'light'
}

export function saveTheme(mode: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    /* ignore */
  }
}

export function applyThemeToDocument(mode: ThemeMode): void {
  document.documentElement.dataset.theme = mode
  document.documentElement.style.colorScheme = mode
}

export interface ChartThemeColors {
  text: string
  grid: string
  crosshair: string
  up: string
  down: string
  volumeUp: string
  volumeDown: string
  equityLine: string
  equityTop: string
  equityBottom: string
}

export function chartColors(mode: ThemeMode): ChartThemeColors {
  if (mode === 'dark') {
    return {
      text: '#9db5ae',
      grid: 'rgba(232, 242, 238, 0.07)',
      crosshair: 'rgba(232, 242, 238, 0.35)',
      up: '#2dd4bf',
      down: '#fb923c',
      volumeUp: 'rgba(45, 212, 191, 0.35)',
      volumeDown: 'rgba(251, 146, 60, 0.35)',
      equityLine: '#2dd4bf',
      equityTop: 'rgba(45, 212, 191, 0.35)',
      equityBottom: 'rgba(45, 212, 191, 0.02)',
    }
  }
  return {
    text: '#4a5c57',
    grid: 'rgba(11, 61, 54, 0.07)',
    crosshair: 'rgba(11, 61, 54, 0.35)',
    up: '#0f766e',
    down: '#c2410c',
    volumeUp: 'rgba(15, 118, 110, 0.35)',
    volumeDown: 'rgba(194, 65, 12, 0.35)',
    equityLine: '#0f766e',
    equityTop: 'rgba(15, 118, 110, 0.35)',
    equityBottom: 'rgba(15, 118, 110, 0.02)',
  }
}
