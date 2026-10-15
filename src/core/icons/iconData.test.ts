import { describe, expect, it } from 'vitest'
import { searchIcons, type IconMeta } from './iconData'

const all: IconMeta[] = [
  { n: 'airplane', c: ['maps & travel'], t: ['flight', 'travel'] },
  { n: 'rocket', c: ['objects'], t: ['launch', 'space'] },
  { n: 'rocket-launch', c: ['objects'], t: ['space'] },
  { n: 'user', c: ['people'], t: ['person', 'account'] },
]

describe('icon search', () => {
  it('matches names before tags and needs every word', () => {
    expect(searchIcons(all, 'launch').map((i) => i.n)).toEqual(['rocket-launch', 'rocket'])
    expect(searchIcons(all, 'rocket space').map((i) => i.n)).toEqual(['rocket', 'rocket-launch'])
    expect(searchIcons(all, 'person')).toEqual([all[3]])
    expect(searchIcons(all, '  ')).toEqual([])
  })
})
