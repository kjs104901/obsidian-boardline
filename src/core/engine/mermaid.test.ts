import { describe, expect, it } from 'vitest'
import { createConnector, createShape } from '../board/model'
import { toMermaid } from './mermaid'
import { parseMermaid, type Flowchart } from '../board/mermaidImport'

describe('copy as Mermaid', () => {
  it('names shapes in reading order and keeps labels, shapes and line styles', () => {
    const start = { ...createShape('pill', 0, 0, 1), text: 'Start' }
    const check = { ...createShape('diamond', 0, 200, 2), text: 'OK?' }
    const done = { ...createShape('rect', 300, 200, 3), text: 'Say "hi"\nnow' }
    const a = createConnector({ objectId: start.id }, { objectId: check.id }, 4)
    const b = { ...createConnector({ objectId: check.id }, { objectId: done.id }, 5), label: 'yes', line: 'dashed' as const }
    const loose = createConnector({ objectId: done.id }, { point: { x: 0, y: 0 } }, 6)
    expect(toMermaid([done, a, check, b, start, loose])).toBe(
      [
        'flowchart TD',
        '  n1(["Start"])',
        '  n2{"OK?"}',
        '  n3["Say #quot;hi#quot;<br/>now"]',
        '  n1 --> n2',
        '  n2 -.->|"yes"| n3',
        '',
      ].join('\n'),
    )
  })
})

describe('Mermaid 11 shapes', () => {
  it('writes the shapes only the new syntax has, and reads them back', () => {
    const doc = { ...createShape('document', 0, 0, 1), text: '보고서' }
    const sub = { ...createShape('subroutine', 0, 200, 2), text: '하위' }
    const line = createConnector({ objectId: doc.id }, { objectId: sub.id }, 3)
    const text = toMermaid([doc, sub, line])
    expect(text).toBe('flowchart TD\n  n1@{ shape: doc, label: "보고서" }\n  n2[["하위"]]\n  n1 --> n2\n')
    const back = parseMermaid(text) as Flowchart
    expect(back.nodes.map((n) => [n.shape, n.text])).toEqual([
      ['document', '보고서'],
      ['subroutine', '하위'],
    ])
  })
})
