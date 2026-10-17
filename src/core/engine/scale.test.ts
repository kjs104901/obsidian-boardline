import { describe, expect, it } from 'vitest'
import { createConnector, createMindmapNode, createShape, type BoardObject, type ShapeObject } from '../board/model'
import { minScales, scaleObject } from './scale'
import type { MeasureAt } from './text'

// Text measured as 8px per character, so sizes are predictable without a canvas.
const measureAt: MeasureAt = () => (s: string) => s.length * 8
const anchor = { x: 100, y: 100 }
const scale = (o: BoardObject, sx: number, sy = sx, ids: string[] = [o.id]) => scaleObject(o, anchor, sx, sy, new Set(ids), measureAt)
const box = (o: BoardObject) => (o.type === 'shape' ? [o.x, o.y, o.w, o.h] : null)

describe('scaling a selection together', () => {
  it('scales a shape about the anchor', () => {
    const r = { ...createShape('rect', 200, 300, 1), w: 200, h: 100 }
    expect(box(scale(r, 1.5))).toEqual([250, 400, 300, 150])
  })

  it('stretches one way when only one axis changes (an edge)', () => {
    const r = { ...createShape('rect', 200, 300, 1), w: 200, h: 100 }
    expect(box(scale(r, 2, 1))).toEqual([300, 300, 400, 100])
  })

  it('keeps pictures and icons in proportion, centered where the stretch puts them', () => {
    const icon = { ...createShape('icon', 200, 200, 1), w: 80, h: 80 }
    // Stretched across only: the icon grows with that axis and stays square.
    expect(box(scale(icon, 2, 1))).toEqual([300, 160, 160, 160])
    // Both axes, unevenly: the smaller factor, so it fits.
    expect(box(scale(icon, 2, 0.5))).toMatchObject([expect.any(Number), expect.any(Number), 40, 40])
  })

  it('moves tables and links by their middle without changing their size', () => {
    const table = createShape('table', 200, 200, 1)
    const out = scale(table, 2) as ShapeObject
    expect([out.w, out.h]).toEqual([table.w, table.h])
    expect(out.x + out.w / 2).toBe(100 + (table.x + table.w / 2 - 100) * 2)
  })

  it("stretches a lifeline with its actor, and messages' places with them", () => {
    const actor = { ...createShape('actor', 100, 100, 1), stem: 400 }
    const other = { ...createShape('actor', 400, 100, 2), stem: 400 }
    expect((scale(actor, 1, 0.5, [actor.id, other.id]) as ShapeObject).stem).toBe(200)
    const msg = createConnector({ objectId: actor.id, dy: 120 }, { objectId: other.id, dy: 120 }, 3)
    const out = scale(msg, 1, 0.5, [actor.id, other.id, msg.id])
    expect(out.type === 'connector' && 'objectId' in out.from && out.from.dy).toBe(60)
  })

  it("scales a line's free ends and dragged segments; joined ends follow their shapes", () => {
    const a = createShape('rect', 100, 100, 1)
    const line = { ...createConnector({ objectId: a.id, side: 'right' }, { point: { x: 500, y: 300 } }, 2), pins: { at: [null, { x: 300 }, null] } }
    const out = scale(line, 2, 1.5)
    expect(out.type === 'connector' && out.to).toEqual({ point: { x: 900, y: 400 } })
    expect(out.type === 'connector' && out.from).toEqual(line.from)
    expect(out.type === 'connector' && out.pins?.at[1]).toEqual({ x: 500 })
  })

  it('moves a mind map by its root; nodes keep their size', () => {
    const root = createMindmapNode(null, 300, 200, 0, 'gray', 1)
    const child = createMindmapNode(root.id, 0, 0, 0, 'blue', 2)
    expect(scale(root, 2)).toMatchObject({ x: 500, y: 300 })
    expect(scale(child, 2)).toBe(child)
  })

  it('stops shrinking each way when the smallest shape reaches the minimum', () => {
    const big = { ...createShape('rect', 0, 0, 1), w: 400, h: 200 }
    const small = { ...createShape('rect', 0, 0, 2), w: 80, h: 40 }
    expect(minScales([big, small], 40)).toEqual({ x: 0.5, y: 1 })
    expect(minScales([big], 40)).toEqual({ x: 0.1, y: 0.2 })
  })
})
