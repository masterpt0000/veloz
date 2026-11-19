import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chartColors, loadTheme, saveTheme } from './theme'

describe('theme', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('persists light/dark preference', () => {
    saveTheme('dark')
    expect(loadTheme()).toBe('dark')
    saveTheme('light')
    expect(loadTheme()).toBe('light')
  })

  it('returns distinct chart palettes', () => {
    const light = chartColors('light')
    const dark = chartColors('dark')
    expect(light.text).not.toBe(dark.text)
    expect(dark.up).toBe('#2dd4bf')
    expect(light.up).toBe('#0f766e')
  })
})
