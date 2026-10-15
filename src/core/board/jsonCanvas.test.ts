import { describe, expect, it } from 'vitest'
import { canvasToObjects } from './jsonCanvas'

describe('Obsidian canvases', () => {
  it('turns cards, groups and edges into board objects', () => {
    const json = JSON.stringify({
      nodes: [
        { id: 't', type: 'text', x: 0, y: 0, width: 250, height: 60, text: '**Hi**', color: '1' },
        { id: 'n', type: 'file', x: 300, y: 0, width: 400, height: 400, file: 'notes/A.md' },
        { id: 'p', type: 'file', x: 0, y: 500, width: 200, height: 100, file: 'img/cat.png' },
        { id: 'g', type: 'group', x: -20, y: -20, width: 800, height: 700, label: 'All', color: '#AbC' },
      ],
      edges: [{ id: 'e', fromNode: 't', fromSide: 'right', toNode: 'n', toSide: 'left', fromEnd: 'arrow', label: 'see' }],
    })
    const objects = canvasToObjects(json)
    expect(objects.map((o) => [o.id, o.type === 'shape' ? o.shape : o.type])).toEqual([
      ['g', 'section'],
      ['t', 'rect'],
      ['n', 'note'],
      ['p', 'image'],
      ['e', 'connector'],
    ])
    expect(objects[0]).toMatchObject({ text: 'All', color: '#aabbcc' })
    expect(objects[1]).toMatchObject({ text: '**Hi**', color: 'red', align: 'left', x: 0, y: 0, w: 250, h: 60 })
    expect(objects[2]).toMatchObject({ link: 'boardline://doc/notes/A.md' })
    expect(objects[3]).toMatchObject({ src: 'img/cat.png' })
    expect(objects[4]).toMatchObject({ from: { objectId: 't', side: 'right' }, to: { objectId: 'n', side: 'left' }, startCap: 'arrow', endCap: 'arrow', label: 'see' })
  })

  it('reads nothing from a broken file', () => {
    expect(canvasToObjects('{nope')).toEqual([])
  })
})
