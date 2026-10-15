import { describe, expect, it } from 'vitest'
import { buildDiagram, mermaidKind, parseMermaid, type Flowchart, type MindmapTree, type Sequence } from './mermaidImport'
import type { ConnectorObject, MindmapNode, ShapeObject } from './model'

describe('Mermaid import', () => {
  it('recognizes the diagrams it reads', () => {
    expect(mermaidKind('%% c\ngraph LR\nA-->B')).toBe('flowchart')
    expect(mermaidKind('sequenceDiagram\nA->>B: hi')).toBe('sequence')
    expect(mermaidKind('mindmap\n  root')).toBe('mindmap')
    expect(mermaidKind('pie\n "a": 1')).toBeNull()
  })

  it('reads flowchart nodes, shapes, chains, groups and link styles', () => {
    const d = parseMermaid(
      [
        'flowchart LR',
        '  start([시작]) --> check{"OK?"}',
        '  check -->|예| done[(DB)]',
        '  check -. 아니오 .-> fix[/고치기/]',
        '  fix --- A & B',
        '  A <--> B ==> C',
        '  C((끝)); D{{육각}}',
        '  E[\\반대/]',
        '  subgraph g1 [묶음]',
        '    A',
        '    B',
        '  end',
        '  classDef red fill:#f00',
      ].join('\n'),
    ) as Flowchart
    expect(d.direction).toBe('RIGHT')
    const shape = Object.fromEntries(d.nodes.map((n) => [n.id, [n.shape, n.text]]))
    expect(shape).toMatchObject({
      start: ['pill', '시작'],
      check: ['diamond', 'OK?'],
      done: ['cylinder', 'DB'],
      fix: ['parallelogram', '고치기'],
      A: ['rect', 'A'],
      C: ['ellipse', '끝'],
      D: ['hexagon', '육각'],
      E: ['trapezoid', '반대'],
    })
    const edges = d.edges.map((e) => `${e.from}>${e.to}${e.label ? ':' + e.label : ''}${e.dashed ? ' dashed' : ''} ${e.startCap}/${e.endCap}`)
    expect(edges).toEqual([
      'start>check none/arrow',
      'check>done:예 none/arrow',
      'check>fix:아니오 dashed none/arrow',
      'fix>A none/none',
      'fix>B none/none',
      'A>B arrow/arrow',
      'B>C none/arrow',
    ])
    expect(d.subgraphs).toEqual([{ title: '묶음', nodes: ['A', 'B'] }])
  })

  it('reads sequence diagrams', () => {
    const d = parseMermaid(
      ['sequenceDiagram', '  participant U as 사용자', '  actor S', '  U->>+S: 요청', '  S-->>-U: 응답', '  S->>S: 생각', '  Note over U: 무시', '  loop 반복', '  end'].join('\n'),
    ) as Sequence
    expect(d.participants).toEqual([
      { id: 'U', label: '사용자' },
      { id: 'S', label: 'S' },
    ])
    expect(d.messages).toEqual([
      { from: 'U', to: 'S', text: '요청', dashed: false, arrow: true },
      { from: 'S', to: 'U', text: '응답', dashed: true, arrow: true },
      { from: 'S', to: 'S', text: '생각', dashed: false, arrow: true },
    ])
  })

  it('reads mind maps by indentation', () => {
    const d = parseMermaid(['mindmap', '  root((주제))', '    가지 1', '      잎', '    가지 2', '      ::icon(fa fa-book)', '      [네모]'].join('\n')) as MindmapTree
    expect(d.root).toEqual({
      text: '주제',
      children: [
        { text: '가지 1', children: [{ text: '잎', children: [] }] },
        { text: '가지 2', children: [{ text: '네모', children: [] }] },
      ],
    })
  })

  it('builds board objects', async () => {
    const ctx = { autosize: (s: ShapeObject) => s, layout: async () => ({ positions: new Map(), sides: new Map() }) }
    const flow = await buildDiagram(parseMermaid('graph TD\nA-->B\nsubgraph S\nA\nend')!, ctx)
    expect(flow.filter((o) => o.type === 'shape').map((o) => (o as ShapeObject).shape)).toEqual(['section', 'rect', 'rect'])
    const seq = await buildDiagram(parseMermaid('sequenceDiagram\nA->>B: x\nB->>B: y')!, ctx)
    const msgs = seq.filter((o): o is ConnectorObject => o.type === 'connector')
    expect(msgs.map((m) => [('dy' in m.from ? m.from.dy : 0), 'dy' in m.to ? m.to.dy : 0])).toEqual([
      [100, 100],
      [160, 220],
    ])
    const mm = await buildDiagram(parseMermaid('mindmap\n  a\n    b\n    c')!, ctx)
    const nodes = mm as MindmapNode[]
    expect(nodes.map((n) => [n.text, n.parentId === null ? null : nodes.find((p) => p.id === n.parentId)?.text])).toEqual([
      ['a', null],
      ['b', 'a'],
      ['c', 'a'],
    ])
  })
})
