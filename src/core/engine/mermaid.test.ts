import { describe, expect, it } from 'vitest'
import { createConnector, createShape } from '../board/model'
import { toMermaid } from './mermaid'

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
