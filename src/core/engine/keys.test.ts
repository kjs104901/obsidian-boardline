import { describe, expect, it } from 'vitest'
import { shortcutKey } from './keys'

describe('shortcut keys', () => {
  it('take the letter on the key', () => {
    expect(shortcutKey({ key: 'R', code: 'KeyR' })).toBe('r')
    expect(shortcutKey({ key: '.', code: 'Period' })).toBe('.')
    expect(shortcutKey({ key: 'Escape', code: 'Escape' })).toBe('escape')
    // Another Latin layout keeps its own letters (AZERTY's A sits where QWERTY has Q).
    expect(shortcutKey({ key: 'a', code: 'KeyQ' })).toBe('a')
  })

  it('read the physical key under a Korean input mode or a busy input method', () => {
    expect(shortcutKey({ key: 'ㄱ', code: 'KeyR' })).toBe('r')
    expect(shortcutKey({ key: 'ㅎ', code: 'KeyG' })).toBe('g')
    expect(shortcutKey({ key: 'Process', code: 'KeyN' })).toBe('n')
    expect(shortcutKey({ key: 'Process', code: 'Period' })).toBe('.')
    expect(shortcutKey({ key: 'Process', code: 'Digit0' })).toBe('0')
  })
})
