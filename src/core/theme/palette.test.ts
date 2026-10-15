import { afterEach, describe, expect, it } from 'vitest'
import type { ColorKey } from '../board/model'
import { fillColor, setThemeMode, strokeColor, textColor, theme } from './palette'

afterEach(() => setThemeMode('dark'))

describe('object colors', () => {
  it('fills outlined neutrals with the canvas', () => {
    for (const mode of ['dark', 'light'] as const) {
      setThemeMode(mode)
      for (const c of ['gray', 'light', 'ink'] as ColorKey[]) expect(fillColor(c, 'outline')).toBe(theme.shapeFill)
    }
  })

  // A canvas ignores a color it can't read and keeps the one before (another object's fill).
  it('reads keys of the old palette as gray, never as an empty color', () => {
    for (const old of ['default', 'silver', 'white', 'violet', '#abc'] as ColorKey[]) {
      for (const deco of ['outline', 'dashed', 'fill'] as const) expect(fillColor(old, deco)).toBe(fillColor('gray', deco))
      expect(strokeColor(old)).toBe(strokeColor('gray'))
      expect(textColor(old, 'fill')).toBe(textColor('gray', 'fill'))
    }
  })

  it('tints the inside of a custom color', () => {
    expect(strokeColor('#ff0000')).toBe('#ff0000')
    expect(fillColor('#ff0000', 'fill')).toBe('#ff0000')
    expect(fillColor('#ff0000', 'outline')).toMatch(/^#[0-9a-f]{6}$/)
    expect(fillColor('#ff0000', 'outline')).not.toBe(theme.shapeFill)
  })
})
