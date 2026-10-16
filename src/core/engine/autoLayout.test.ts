import { describe, expect, it } from 'vitest'
import { buildDiagram, parseMermaid } from '../board/mermaidImport'
import { createConnector, createShape, isConnector, type BoardObject, type ShapeObject } from '../board/model'
import { autoLayout, nearestSide } from './autoLayout'
import { connectorPolyline } from './connectors'
import type { Point } from './geometry'

describe('auto layout', () => {
  // A chain a -> b -> c scattered on the board, plus d hanging off a.
  const a = createShape('rect', 600, 300, 1)
  const b = createShape('rect', 120, 900, 2)
  const c = createShape('rect', 1200, 60, 3)
  const d = createShape('rect', 0, 0, 4)
  const ab = createConnector({ objectId: a.id, side: 'right' }, { objectId: b.id }, 5)
  const bc = createConnector({ objectId: b.id }, { objectId: c.id }, 6)
  const ad = createConnector({ objectId: a.id }, { objectId: d.id, side: 'left' }, 7)

  // Layers are 80px apart; where edges have to bend (a fans out to b and d) ELK keeps
  // edgeNodeBetweenLayers (40) on both sides of the bends: 80px as well.
  it('stacks layers top to bottom and attaches bottom -> top', async () => {
    const r = await autoLayout([a, b, c, d], [ab, bc, ad], 'DOWN')
    const pa = r.positions.get(a.id)!
    const pb = r.positions.get(b.id)!
    const pc = r.positions.get(c.id)!
    expect(pb.y - (pa.y + a.h)).toBe(80)
    expect(pc.y - (pb.y + b.h)).toBe(80)
    expect(r.ends.get(ab.id)).toMatchObject({ from: { side: 'bottom' }, to: { side: 'top' } })
    // Everything stays on the grid, anchored at the old top-left (0, 0).
    for (const p of r.positions.values()) {
      expect(p.x % 20).toBe(0)
      expect(p.y % 20).toBe(0)
    }
    expect(Math.min(...[...r.positions.values()].map((p) => p.y))).toBe(0)
  })

  it('lays out left to right with sides right -> left', async () => {
    const r = await autoLayout([a, b, c, d], [ab, bc, ad], 'RIGHT')
    const pa = r.positions.get(a.id)!
    const pb = r.positions.get(b.id)!
    const pc = r.positions.get(c.id)!
    expect(pb.x - (pa.x + a.w)).toBe(80)
    expect(pc.x - (pb.x + b.w)).toBe(80)
    expect(r.ends.get(bc.id)).toMatchObject({ from: { side: 'right' }, to: { side: 'left' } })
  })

  it('picks the nearest side', () => {
    const rect = { x: 0, y: 0, w: 100, h: 50 }
    expect(nearestSide(rect, { x: 50, y: 52 })).toBe('bottom')
    expect(nearestSide(rect, { x: -3, y: 20 })).toBe('left')
  })
})

// Segments two polylines run along together (the same line, overlapping by more than a point).
function sharedRuns(a: Point[], b: Point[]): number {
  let shared = 0
  for (let i = 1; i < a.length; i++) {
    for (let j = 1; j < b.length; j++) {
      const [p, q, r, s] = [a[i - 1], a[i], b[j - 1], b[j]]
      for (const axis of ['x', 'y'] as const) {
        const other = axis === 'x' ? 'y' : 'x'
        if (p[axis] !== q[axis] || r[axis] !== s[axis] || p[axis] !== r[axis]) continue
        const lo = Math.max(Math.min(p[other], q[other]), Math.min(r[other], s[other]))
        const hi = Math.min(Math.max(p[other], q[other]), Math.max(r[other], s[other]))
        if (hi - lo > 1) shared++
      }
    }
  }
  return shared
}

describe('imported flowcharts with a loop back', () => {
  for (const dir of ['TD', 'LR']) {
    it(`keep every line on its own path (${dir})`, async () => {
      const text = `flowchart ${dir}
  A[시작] --> B{조건}
  B -->|예| C[끝]
  B -->|아니오| D[다시]
  D --> A`
      const objects = await buildDiagram(parseMermaid(text)!, { autosize: (s: ShapeObject) => s, layout: autoLayout })
      const byId = new Map<string, BoardObject>(objects.map((o) => [o.id, o]))
      const lines = objects.filter(isConnector)
      const routes = lines.map((c) => connectorPolyline(c, (id) => byId.get(id))!)
      for (let i = 0; i < routes.length; i++) for (let j = i + 1; j < routes.length; j++) expect(sharedRuns(routes[i], routes[j])).toBe(0)
      // No two ends share a spot on a shape.
      const spots = lines.flatMap((c) => [c.from, c.to]).map((e) => ('objectId' in e ? `${e.objectId} ${e.side} ${e.at ?? 0.5}` : ''))
      expect(new Set(spots).size).toBe(spots.length)
    })
  }
})

describe('a loop back up a flowchart', () => {
  it('keeps the steps in the order they lead to each other', async () => {
    const text = `flowchart TD
  idea([New idea]) --> sketch[Sketch it]
  sketch --> ok{Looks right?}
  ok -->|Yes| note[Write the note]
  ok -->|No| sketch`
    const objects = await buildDiagram(parseMermaid(text)!, { autosize: (s: ShapeObject) => s, layout: autoLayout })
    const top = (label: string) => objects.find((o): o is ShapeObject => o.type === 'shape' && o.text === label)!.y
    expect(top('New idea')).toBeLessThan(top('Sketch it'))
    expect(top('Sketch it')).toBeLessThan(top('Looks right?'))
    expect(top('Looks right?')).toBeLessThan(top('Write the note'))
  })
})
