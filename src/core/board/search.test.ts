import { describe, expect, it } from 'vitest'
import { matches, replaceAll, replaceInObject } from './search'
import { createConnector, createShape } from './model'

describe('matching', () => {
  it('ignores case and Unicode composition', () => {
    expect(matches('Login Flow', 'login')).toBe(true)
    // "한" typed as decomposed jamo still matches the composed syllable.
    expect(matches('결제 한도', '한'.normalize('NFD'))).toBe(true)
    expect(matches('anything', '   ')).toBe(false)
  })
})

describe('replacing', () => {
  it('replaces every match, ignoring case, and counts them', () => {
    expect(replaceAll('Login and LOGIN (a.b)', 'login', 'Sign-in')).toEqual({ text: 'Sign-in and Sign-in (a.b)', count: 2 })
    expect(replaceAll('price $5 (a.b)', '(a.b)', '$&')).toEqual({ text: 'price $5 $&', count: 1 })
    expect(replaceAll('nothing here', 'x', 'y')).toEqual({ text: 'nothing here', count: 0 })
  })

  it('reaches shape text, table cells and line labels', () => {
    const table = { ...createShape('table', 0, 0, 1), cells: [['a cat', 'b'], ['cat', '']] }
    const r = replaceInObject(table, 'cat', 'dog')
    expect(r.count).toBe(2)
    expect((r.object as typeof table).cells).toEqual([['a dog', 'b'], ['dog', '']])
    const line = { ...createConnector({ point: { x: 0, y: 0 } }, { point: { x: 1, y: 1 } }, 1), label: 'yes' }
    expect(replaceInObject(line, 'YES', 'no').object).toMatchObject({ label: 'no' })
  })
})
