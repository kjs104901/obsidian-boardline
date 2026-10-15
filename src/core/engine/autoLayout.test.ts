import { describe, expect, it } from 'vitest'
import { createConnector, createShape } from '../board/model'
import { autoLayout, nearestSide } from './autoLayout'

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
    expect(r.sides.get(ab.id)).toEqual({ from: 'bottom', to: 'top' })
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
    expect(r.sides.get(bc.id)).toEqual({ from: 'right', to: 'left' })
  })

  it('picks the nearest side', () => {
    const rect = { x: 0, y: 0, w: 100, h: 50 }
    expect(nearestSide(rect, { x: 50, y: 52 })).toBe('bottom')
    expect(nearestSide(rect, { x: -3, y: 20 })).toBe('left')
  })
})
