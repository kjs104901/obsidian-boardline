import { describe, expect, it } from 'vitest'
import { createConnector, createMindmapNode, createShape, type BoardObject } from './model'
import { boardToMarkdown } from './toMarkdown'

const shape = (kind: Parameters<typeof createShape>[0], x: number, y: number, extra: object = {}) => ({ ...createShape(kind, x, y, 0), ...extra })

describe('board as a note', () => {
  it('writes sections as headings and their contents in reading order', () => {
    const section = shape('section', 0, 0, { w: 600, h: 400, text: '아이디어', id: 's' })
    const a = shape('sticky', 300, 40, { text: '둘째', id: 'a' })
    const b = shape('sticky', 40, 40, { text: '**첫째**\n- 세부', id: 'b' })
    const loose = shape('text', 0, 600, { text: '마무리 문단', id: 't' })
    const tasks = shape('sticky', 0, 450, { text: '- [ ] 할 일', id: 'k' })
    const line = { ...createConnector({ objectId: 'b' }, { objectId: 'a' }, 0), label: '다음' }
    const md = boardToMarkdown([loose, a, section, b, tasks, line] as BoardObject[])
    expect(md).toBe('## 아이디어\n\n- **첫째**\n  - 세부\n- 둘째\n- [ ] 할 일\n\n마무리 문단\n\n## 연결\n\n- 첫째 → 둘째: 다음\n')
  })

  it('writes mind maps as nested lists, tables as tables, files as links', () => {
    const root = { ...createMindmapNode(null, 0, 0, 0, 'gray', 0), id: 'r', text: '중심' }
    const kid = { ...createMindmapNode('r', 0, 0, 0, 'blue', 0), id: 'k', text: '가지' }
    const grand = { ...createMindmapNode('k', 0, 0, 0, 'blue', 0), id: 'g', text: '잎' }
    const table = shape('table', 0, 300, { cells: [['이름', '값'], ['가', '1|2']] })
    const note = shape('note', 0, 500, { link: 'boardline://doc/notes/Plan.md' })
    const picture = shape('image', 0, 1000, { src: 'img/a.png' })
    expect(boardToMarkdown([grand, kid, root, table, note, picture])).toBe(
      '- 중심\n  - 가지\n    - 잎\n\n| 이름 | 값 |\n| --- | --- |\n| 가 | 1\\|2 |\n\n- [[notes/Plan]]\n\n![[img/a.png]]\n',
    )
  })
})
