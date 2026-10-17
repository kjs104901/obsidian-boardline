import { describe, expect, it } from 'vitest'
import { docLink } from './links'
import { createConnector, createMindmapNode, createShape } from './model'
import { mayLinkTo, relinkAll, relinkObjects } from './relink'

describe('links following a moved file', () => {
  const card = { ...createShape('note', 0, 0, 1), link: docLink('notes/plan.md') }
  const picture = { ...createShape('image', 0, 0, 2), src: 'assets/photo.png' }
  const text = { ...createShape('text', 0, 0, 3), text: 'see [[plan]], [[notes/plan#Goals|goals]] and [[other]]' }
  const other = { ...createShape('note', 0, 0, 4), link: docLink('notes/other.md') }

  it('follows a renamed note in cards and in [[links]] by name or path', () => {
    const changed = relinkObjects([card, picture, text, other], 'notes/plan.md', 'notes/roadmap.md')
    expect(changed.map((o) => o.id)).toEqual([card.id, text.id])
    expect(changed[0]).toMatchObject({ link: docLink('notes/roadmap.md') })
    expect(changed[1]).toMatchObject({ text: 'see [[roadmap]], [[notes/roadmap#Goals|goals]] and [[other]]' })
  })

  it('follows a moved folder in links and pictures', () => {
    const changed = relinkObjects([card, other, picture], 'notes', 'archive/notes')
    expect(changed.map((o) => ('link' in o ? o.link : ''))).toEqual([docLink('archive/notes/plan.md'), docLink('archive/notes/other.md')])
    expect(relinkObjects([picture], 'assets/photo.png', 'pics/photo 2.png')[0]).toMatchObject({ src: 'pics/photo 2.png' })
  })

  it('reaches node text, labels and table cells', () => {
    const node = { ...createMindmapNode(null, 0, 0, 0, 'gray', 5), text: '[[plan]]' }
    const line = { ...createConnector({ point: { x: 0, y: 0 } }, { point: { x: 1, y: 1 } }, 6), label: '![[plan]]' }
    const table = { ...createShape('table', 0, 0, 7), cells: [['[[plan]]', 'x'], ['', '']] }
    const changed = relinkObjects([node, line, table], 'plan.md', 'idea.md')
    expect(changed).toHaveLength(3)
    expect(changed[1]).toMatchObject({ label: '![[idea]]' })
    expect(changed[2]).toMatchObject({ cells: [['[[idea]]', 'x'], ['', '']] })
  })

  it('follows several moves in a row, each object once as it ends up', () => {
    const moves = [
      { from: 'notes', to: 'archive' },
      { from: 'archive/plan.md', to: 'archive/roadmap.md' },
    ]
    const changed = relinkAll([card, picture, other], moves)
    expect(changed.map((o) => ('link' in o ? o.link : ''))).toEqual([docLink('archive/roadmap.md'), docLink('archive/other.md')])
    expect(relinkAll([picture], moves)).toEqual([])
  })

  it('tells boards that may link to a file from those that cannot', () => {
    expect(mayLinkTo(JSON.stringify(card), 'notes/plan.md')).toBe(true)
    expect(mayLinkTo('{"text":"nothing"}', 'notes/plan.md')).toBe(false)
  })
})
