import { describe, expect, it } from 'vitest'
import { boardLink, hostOf, normalizeAddress, parseLink } from './links'

describe('links', () => {
  it('round-trip board links with an object or a view', () => {
    expect(parseLink(boardLink('b1'))).toEqual({ kind: 'board', boardId: 'b1' })
    expect(parseLink(boardLink('b1', 'o2'))).toEqual({ kind: 'board', boardId: 'b1', objectId: 'o2' })
    expect(parseLink(boardLink('b1', undefined, { x: 10.4, y: -20, zoom: 1.25 }))).toEqual({ kind: 'board', boardId: 'b1', view: { x: 10, y: -20, zoom: 1.25 } })
  })

  it('accept web addresses and complete bare domains', () => {
    expect(parseLink('https://example.com/a?b=1')).toEqual({ kind: 'web', url: 'https://example.com/a?b=1' })
    expect(parseLink('two words')).toBeNull()
    expect(normalizeAddress('example.com/docs')).toBe('https://example.com/docs')
    expect(normalizeAddress('www.naver.com')).toBe('https://www.naver.com')
    expect(normalizeAddress('보드 20')).toBeNull()
    expect(normalizeAddress('v1.2')).toBeNull()
    expect(hostOf('https://www.github.com/x')).toBe('github.com')
  })
})
