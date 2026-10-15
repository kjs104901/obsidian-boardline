import { describe, expect, it } from 'vitest'
import { layoutMindmaps } from '../engine/mindmap'
import { canvasToObjects } from './jsonCanvas'
import { boardLink, docLink } from './links'
import { createConnector, createMindmapNode, createShape, type BoardObject } from './model'
import { boardToCanvas } from './toCanvas'

const measure = () => (s: string) => s.length * 8

describe('boards as Obsidian canvases', () => {
  const box = { ...createShape('rect', 0, 0, 1), text: '**Start**', color: 'red' as const }
  const sticky = { ...createShape('sticky', 300, 0, 2), text: 'idea', color: 'yellow' as const }
  const note = { ...createShape('note', 0, 200, 3, { w: 400, h: 300 }), link: docLink('notes/plan.md') }
  const boardCard = { ...createShape('note', 500, 200, 4), link: boardLink('b-1') }
  const web = { ...createShape('link', 0, 600, 5), link: 'https://example.com', text: 'Example' }
  const picture = { ...createShape('image', 300, 600, 6, { w: 120, h: 80 }), src: 'img/cat.png' }
  const section = { ...createShape('section', -40, -40, 0, { w: 900, h: 900 }), text: 'All' }
  const table = { ...createShape('table', 600, 0, 7), cells: [['A', 'B'], ['1', '2']] }
  const stroke = { ...createShape('freehand', 0, 0, 8), points: [0, 0, 10, 10] }
  const line = { ...createConnector({ objectId: box.id, side: 'right' }, { objectId: sticky.id, side: 'left' }, 9), label: '*yes*' }
  const loose = createConnector({ objectId: box.id }, { point: { x: 900, y: 900 } }, 10)
  const objects: BoardObject[] = [section, box, sticky, note, boardCard, web, picture, table, stroke, line, loose]

  it('writes cards, groups and edges, and counts what has no place in a canvas', async () => {
    const { json, skipped } = await boardToCanvas(objects, layoutMindmaps([], measure), async (id) => (id === 'b-1' ? 'boards/Other.board' : null))
    const canvas = JSON.parse(json)
    expect(skipped).toBe(2) // the pen stroke and the line with a free end
    expect(canvas.nodes[0]).toMatchObject({ id: section.id, type: 'group', label: 'All' })
    const byId = new Map(canvas.nodes.map((n: { id: string }) => [n.id, n]))
    expect(byId.get(box.id)).toMatchObject({ type: 'text', text: '**Start**', color: '1', width: box.w })
    expect(byId.get(sticky.id)).toMatchObject({ color: '3' })
    expect(byId.get(note.id)).toMatchObject({ type: 'file', file: 'notes/plan.md' })
    expect(byId.get(boardCard.id)).toMatchObject({ type: 'file', file: 'boards/Other.board' })
    expect(byId.get(web.id)).toMatchObject({ type: 'link', url: 'https://example.com' })
    expect(byId.get(table.id)).toMatchObject({ text: '| A | B |\n| --- | --- |\n| 1 | 2 |' })
    expect(canvas.edges).toEqual([{ id: line.id, fromNode: box.id, toNode: sticky.id, fromSide: 'right', toSide: 'left', label: 'yes' }])
  })

  it('reads back as the same board (what a canvas can hold)', async () => {
    const back = canvasToObjects((await boardToCanvas([box, note, picture, line, sticky], layoutMindmaps([], measure))).json)
    expect(back.find((o) => o.id === note.id)).toMatchObject({ shape: 'note', link: note.link })
    expect(back.find((o) => o.id === picture.id)).toMatchObject({ shape: 'image', src: 'img/cat.png', x: 300, y: 600 })
    expect(back.find((o) => o.id === line.id)).toMatchObject({ type: 'connector', from: { objectId: box.id, side: 'right' } })
  })

  it('writes a mind map as cards joined by branch edges', async () => {
    const root = { ...createMindmapNode(null, 0, 0, 0, 'gray', 1), text: 'Root' }
    const kid = { ...createMindmapNode(root.id, 0, 0, 0, 'blue', 2), text: 'Kid' }
    const { json } = await boardToCanvas([root, kid], layoutMindmaps([root, kid], measure))
    const canvas = JSON.parse(json)
    expect(canvas.nodes.map((n: { text: string }) => n.text)).toEqual(['Root', 'Kid'])
    expect(canvas.edges[0]).toMatchObject({ fromNode: root.id, toNode: kid.id, fromSide: 'right', toSide: 'left', toEnd: 'none' })
  })
})
