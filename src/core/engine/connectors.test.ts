import { describe, expect, it } from 'vitest'
import { createConnector, createShape, type BoardObject, type Endpoint, type ShapeObject } from '../board/model'
import { applyPins, connectorGeometry, connectorHandles, connectorPolyline, END_GAP, lengthAtPoint, pinSegment, pinsApply, polylineLength, reverseConnector, segmentSnapValues, shiftPins, withoutIdlePins } from './connectors'
import { growSections, planQuickAdd } from './quickAdd'

const shape = (x: number, y: number, w = 200, h = 100): ShapeObject => ({ ...createShape('rect', x, y, 1), w, h })

function route(objects: BoardObject[], from: Endpoint, to: Endpoint) {
  const map = new Map(objects.map((o) => [o.id, o]))
  return connectorPolyline(createConnector(from, to, 9), (id) => map.get(id))
}

// Source A = (300,400, 200x100), pinned to its right side (500,450); target B (200x100) is a
// floating end: the route picks the side it enters and ends on B's outline.
describe('elbow routing', () => {
  const a = shape(300, 400)
  const cases: [string, number, number, number[][]][] = [
    ['same row ahead: straight', 800, 400, [[500, 450], [800, 450]]],
    ['ahead and up: a Z bending halfway', 800, 100, [[500, 450], [650, 450], [650, 150], [800, 150]]],
    ['above, same column: out 40 and back in from the right', 300, 100, [[500, 450], [540, 450], [540, 150], [500, 150]]],
    ['below, same column', 300, 700, [[500, 450], [540, 450], [540, 750], [500, 750]]],
    ['below-left', 0, 700, [[500, 450], [540, 450], [540, 750], [200, 750]]],
    ['same row behind: around below A, 40 clear', 0, 400, [[500, 450], [540, 450], [540, 540], [100, 540], [100, 500]]],
    ['ahead-up over the exit column: an L into its bottom', 460, 200, [[500, 450], [560, 450], [560, 300]]],
  ]
  for (const [name, bx, by, expected] of cases) {
    it(name, () => {
      const b = shape(bx, by)
      const pts = route([a, b], { objectId: a.id, side: 'right' }, { objectId: b.id })
      expect(pts?.map((p) => [p.x, p.y])).toEqual(expected)
    })
  }

  it('routes quick-add pairs between facing sides through the middle of the gap', () => {
    const b = shape(780, 560)
    const pts = route([a, b], { objectId: a.id, side: 'right' }, { objectId: b.id, side: 'left' })
    expect(pts?.map((p) => [p.x, p.y])).toEqual([[500, 450], [640, 450], [640, 610], [780, 610]])
  })

  it('handles other directions the same way (bottom -> top)', () => {
    const b = shape(300, 600)
    const pts = route([a, b], { objectId: a.id, side: 'bottom' }, { objectId: b.id, side: 'top' })
    expect(pts?.map((p) => [p.x, p.y])).toEqual([[400, 500], [400, 600]])
  })

  it('keeps a free end where it was dropped', () => {
    const pts = route([a], { objectId: a.id, side: 'left' }, { point: { x: 80, y: 450 } })
    expect(pts?.map((p) => [p.x, p.y])).toEqual([[300, 450], [80, 450]])
  })
})

describe('connector geometry', () => {
  it('trims the attached ends and puts the label mid-way', () => {
    const a = shape(300, 400)
    const b = shape(800, 100)
    const map = new Map<string, BoardObject>([[a.id, a], [b.id, b]])
    const c = createConnector({ objectId: a.id, side: 'right' }, { objectId: b.id }, 3)
    const g = connectorGeometry(c, (id) => map.get(id))!
    expect(g.points[0]).toEqual({ x: 500 + END_GAP, y: 450 })
    expect(g.points[g.points.length - 1]).toEqual({ x: 800 - END_GAP, y: 150 })
    // Visible length (150 + 300 + 150) - 2*6 = 588 -> label 294 from the start: 144 right, then 150 up.
    expect(polylineLength(g.points)).toBe(588)
    expect(g.labelAt).toEqual({ x: 650, y: 300 })
  })

  it('curves out of each pinned side and ends on the other', () => {
    const a = shape(0, 0)
    const b = shape(500, 300)
    const map = new Map<string, BoardObject>([[a.id, a], [b.id, b]])
    const c = { ...createConnector({ objectId: a.id, side: 'bottom' }, { objectId: b.id, side: 'left' }, 3), kind: 'curved' as const }
    const pts = connectorPolyline(c, (id) => map.get(id))!
    expect(pts.length).toBeGreaterThan(20)
    expect(pts[0]).toEqual({ x: 100, y: 100 })
    expect(pts[pts.length - 1]).toEqual({ x: 500, y: 350 })
    // Leaves straight down out of the bottom, arrives going right into the left side.
    expect(pts[1].y).toBeGreaterThan(pts[0].y)
    expect(Math.abs(pts[1].x - pts[0].x)).toBeLessThan(1)
    expect(pts[pts.length - 2].x).toBeLessThan(500)
    expect(Math.abs(pts[pts.length - 2].y - 350)).toBeLessThan(1)
  })

  it('puts a moved label that far along the line, and finds how far along a point is', () => {
    const line = createConnector({ point: { x: 0, y: 0 } }, { point: { x: 200, y: 0 } }, 1)
    const g = connectorGeometry({ ...line, kind: 'straight', labelPos: 0.25 }, () => undefined)!
    expect(g.labelAt).toEqual({ x: 50, y: 0 })
    expect(lengthAtPoint([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], { x: 130, y: 40 })).toBe(140)
  })
})

describe('quick-add placement', () => {
  const a = shape(300, 400)
  it('places 80px away with the same size', () => {
    expect(planQuickAdd(a, 'right', [a], new Set()).rect).toMatchObject({ x: 580, y: 400, w: 200, h: 100 })
    expect(planQuickAdd(a, 'bottom', [a], new Set()).rect).toMatchObject({ x: 300, y: 580 })
  })

  it('steps aside 40px below a connected sibling', () => {
    const child = shape(580, 400)
    const plan = planQuickAdd(a, 'right', [a, child], new Set([child.id]))
    expect(plan).toEqual({ rect: { ...plan.rect, x: 580, y: 540 }, existingId: null })
  })

  it('reuses an unconnected shape already at the spot', () => {
    const lonely = shape(600, 420)
    expect(planQuickAdd(a, 'right', [a, lonely], new Set()).existingId).toBe(lonely.id)
  })

  // Section 200..1000 x 300..600 around A (300..500 x 400..500): 100 of room on the left, 500 on the right.
  const section = createShape('section', 200, 300, 0, { w: 800, h: 300 })

  it('puts the shape on the section it starts in, neither joining it nor stepping round it', () => {
    expect(planQuickAdd(a, 'right', [section, a], new Set())).toEqual({ rect: { ...a, x: 580 }, existingId: null })
    const sticky = { ...createShape('sticky', 300, 320, 1), w: 200, h: 200 }
    expect(planQuickAdd(sticky, 'right', [section, sticky], new Set([section.id, sticky.id]), sticky, { gap: 20, aside: 20 }).rect).toMatchObject({ x: 520, y: 320 })
  })

  it('grows the section where the new shape would stick out, by the room it leaves (80 at most)', () => {
    expect(growSections(a, { ...a, x: 580 }, [section, a], 80)).toEqual([])
    expect(growSections(a, { ...a, x: 900 }, [section, a], 80)).toEqual([{ ...section, w: 980, idealW: 980 }])
    expect(growSections(a, { ...a, y: 580 }, [section, a], 80)).toEqual([{ ...section, h: 460, idealH: 460 }])
    expect(growSections(a, { ...a, x: 20 }, [section, a], 80)).toEqual([{ ...section, x: -60, w: 1060, idealW: 1060 }])
    // A pressed against the edge still leaves a grid step.
    const tight = { ...section, x: 300 }
    expect(growSections(a, { ...a, x: 100 }, [tight, a], 80)).toMatchObject([{ x: 80 }])
  })

  it('grows the sections around the one it starts in to keep that one, and leaves locked ones', () => {
    // Outer 100..1100: 100 of room right of the section, so it ends 80 past it.
    const outer = createShape('section', 100, 200, -1, { w: 1000, h: 500 })
    const [inner, wrap] = growSections(a, { ...a, x: 900 }, [outer, section, a], 80)
    expect(inner).toMatchObject({ id: section.id, x: 200, w: 980 })
    expect(wrap).toMatchObject({ id: outer.id, x: 100, w: 1160 })
    expect(growSections(a, { ...a, x: 900 }, [{ ...section, locked: true }, a], 80)).toEqual([])
  })
})

// The Z's middle segment dragged to x=700 stays there when the target moves.
describe('pinned segments', () => {
  const a = shape(300, 400)
  const b = shape(800, 100)
  const lookupOf = (objects: BoardObject[]) => {
    const map = new Map(objects.map((o) => [o.id, o]))
    return (id: string) => map.get(id)
  }
  const pinned = { ...createConnector({ objectId: a.id, side: 'right' }, { objectId: b.id }, 9), pins: { at: [null, { x: 700 }, null] } }

  it('moves the middle segment to the pinned x', () => {
    const pts = connectorPolyline(pinned, lookupOf([a, b]))
    expect(pts?.map((p) => [p.x, p.y])).toEqual([[500, 450], [700, 450], [700, 150], [800, 150]])
  })

  it('keeps the pinned x when the target moves', () => {
    const moved = { ...b, y: 0 }
    const pts = connectorPolyline(pinned, lookupOf([a, moved]))
    expect(pts?.map((p) => [p.x, p.y])).toEqual([[500, 450], [700, 450], [700, 50], [800, 50]])
  })

  it('keeps attached legs at least 20px long', () => {
    const pts = applyPins([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 100 }], { at: [null, { x: -50 }, null] }, true, true)
    expect(pts.map((p) => [p.x, p.y])).toEqual([[0, 0], [20, 0], [20, 100], [200, 100]])
  })

  it('ignores pins that no longer fit the route', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 100 }]
    expect(applyPins(pts, { at: [null, { y: 50 }, null] }, true, true)).toEqual(pts)
  })

  it('offers a handle on every segment', () => {
    const h = connectorHandles(pinned, lookupOf([a, b]))!
    expect(h.segments).toEqual([
      { at: { x: 600, y: 450 }, axis: 'y', value: 450, index: 0 },
      { at: { x: 700, y: 300 }, axis: 'x', value: 700, index: 1 },
      { at: { x: 750, y: 150 }, axis: 'y', value: 150, index: 2 },
    ])
    // End handles sit on the outline, where the line is attached.
    expect(h.ends[0]).toEqual({ x: 500, y: 450 })
  })
})

// A value per segment; only the dragged one is fixed.
describe('per-segment pins', () => {
  const a = shape(0, 0)
  const b = shape(300, 0)
  const lookup = (id: string) => (id === a.id ? a : id === b.id ? b : undefined)
  // A's bottom to B's top: down, across the gap, up over B and down into it (5 segments).
  const c = createConnector({ objectId: a.id, side: 'bottom' }, { objectId: b.id, side: 'top' }, 9)

  it('moves only the dragged one of two parallel segments', () => {
    const before = connectorPolyline(c, lookup)!
    expect(before.map((p) => p.y)).toEqual([100, 140, 140, -40, -40, 0])
    const dragged = pinSegment(c, lookup, 1, 200)
    expect(dragged.pins).toEqual({ at: [null, { y: 200 }, null, null, null] })
    expect(connectorPolyline(dragged, lookup)!.map((p) => p.y)).toEqual([100, 200, 200, -40, -40, 0])
  })

  it('keeps earlier dragged segments when another is dragged', () => {
    const twice = pinSegment(pinSegment(c, lookup, 1, 200), lookup, 3, -80)
    expect(twice.pins).toEqual({ at: [null, { y: 200 }, null, { y: -80 }, null] })
  })

  it('lets go of the pins once the route takes another shape', () => {
    const dragged = pinSegment(c, lookup, 1, 200)
    const below = { ...b, y: 200 }
    const look2 = (id: string) => (id === a.id ? a : id === b.id ? below : undefined)
    expect(connectorPolyline(dragged, look2)).toEqual(connectorPolyline(c, look2))
  })

  it('carries the pins along when the whole connector moves', () => {
    expect(shiftPins({ at: [null, { y: 200 }, { x: 10 }] }, 5, 7)).toEqual({ at: [null, { y: 207 }, { x: 15 }] })
  })
})

describe('lines from a shape to itself and jogs', () => {
  const a = shape(0, 0)
  const b = shape(0, 200)
  const lookup = (id: string) => (id === a.id ? a : id === b.id ? b : undefined)
  const pts = (c: Parameters<typeof connectorPolyline>[0], look = lookup) => connectorPolyline(c, look)!.map((p) => [p.x, p.y])

  it('goes round the corner from the bottom to the right side, 40 clear', () => {
    const self = createConnector({ objectId: a.id, side: 'bottom' }, { objectId: a.id, side: 'right' }, 9)
    expect(pts(self)).toEqual([[100, 100], [100, 140], [240, 140], [240, 50], [200, 50]])
  })

  // A's bottom straight down to B's top.
  const down = createConnector({ objectId: a.id, side: 'bottom' }, { objectId: b.id, side: 'top' }, 9)

  it('a single segment dragged aside jogs at both ends', () => {
    expect(pts(down)).toEqual([[100, 100], [100, 200]])
    const moved = pinSegment(down, lookup, 0, 40)
    expect(pts(moved)).toEqual([[100, 100], [100, 120], [40, 120], [40, 180], [100, 180], [100, 200]])
  })

  it("an end's segment dragged aside leaves the end 20, turns and runs along the new line", () => {
    const beside = { ...b, x: 300, y: 0 }
    const look = (id: string) => (id === a.id ? a : id === b.id ? beside : undefined)
    expect(pts(down, look)[1]).toEqual([100, 140])
    const moved = pinSegment(down, look, 0, 40)
    expect(pts(moved, look).slice(0, 5)).toEqual([[100, 100], [100, 120], [40, 120], [40, 140], [250, 140]])
    // The route is the user's own now: every segment keeps its value; the ends follow the shapes.
    const lower = { ...beside, y: 40 }
    const look2 = (id: string) => (id === a.id ? a : id === b.id ? lower : undefined)
    expect(pts(moved, look2).slice(-2)).toEqual([[400, -40], [400, 40]])
    // Another segment dragged keeps the jog.
    const again = pinSegment(moved, look, 3, 200)
    expect(pts(again, look).slice(0, 5)).toEqual([[100, 100], [100, 120], [40, 120], [40, 200], [250, 200]])
  })

  it('keeps the leg out of an attached end when its shape moves past the jog', () => {
    const moved = pinSegment(down, lookup, 0, 40)
    const lower = { ...a, y: 40 }
    const look = (id: string) => (id === a.id ? lower : id === b.id ? b : undefined)
    // The leg still leaves A's bottom (now 140) downwards by 20 before turning.
    expect(pts(moved, look).slice(0, 3)).toEqual([[100, 140], [100, 160], [40, 160]])
  })
})

// An end pinned along a side: it leaves the outline there, square to the side.
describe('ends along a side', () => {
  it('leave a rectangle side at that spot', () => {
    const a = shape(0, 0)
    const b = shape(400, 0)
    const pts = route([a, b], { objectId: a.id, side: 'right', at: 0.2 }, { objectId: b.id, side: 'left', at: 0.2 })
    expect(pts?.map((p) => [p.x, p.y])).toEqual([
      [200, 20],
      [400, 20],
    ])
  })

  it('leave an ellipse on its curve, going straight out', () => {
    const e = { ...createShape('ellipse', 0, 0, 1), w: 200, h: 100 }
    const t = shape(0, -300)
    const pts = route([e, t], { objectId: e.id, side: 'top', at: 0.25 }, { objectId: t.id, side: 'bottom', at: 0.25 })!
    expect(pts[0].x).toBeCloseTo(50)
    expect(pts[0].y).toBeCloseTo(50 - 50 * Math.sqrt(0.75), 0)
    expect(pts[1].x).toBeCloseTo(50)
    expect(pts[1].y).toBeLessThan(pts[0].y)
  })

  it('loop back to another spot on the same shape, entering square to its side', () => {
    const a = shape(0, 0, 160, 180)
    const pts = route([a], { objectId: a.id, side: 'bottom' }, { objectId: a.id, side: 'right', at: 0.75 })
    expect(pts?.map((p) => [p.x, p.y])).toEqual([
      [80, 180],
      [80, 220],
      [200, 220],
      [200, 135],
      [160, 135],
    ])
  })

  it('follow the shape when it is resized', () => {
    const a = shape(0, 0)
    const map = new Map<string, BoardObject>([[a.id, a]])
    const c = createConnector({ objectId: a.id, side: 'bottom', at: 0.75 }, { point: { x: 150, y: 400 } }, 2)
    const before = connectorPolyline(c, (id) => map.get(id))!
    expect([before[0].x, before[0].y]).toEqual([150, 100])
    map.set(a.id, { ...a, w: 400 })
    const after = connectorPolyline(c, (id) => map.get(id))!
    expect([after[0].x, after[0].y]).toEqual([300, 100])
  })
})

describe('dragged segments over time', () => {
  // A and B side by side, lined up: a straight line between their middles (y = 250).
  const a = shape(100, 200)
  const b = shape(600, 200)
  const objects = (moved = b) => new Map<string, BoardObject>([[a.id, a], [moved.id, moved]])
  const lookupWith = (moved = b) => (id: string) => objects(moved).get(id)
  const line = createConnector({ objectId: a.id, side: 'right' }, { objectId: b.id, side: 'left' }, 3)

  it('a segment dragged back in line lets the line route itself again', () => {
    const lookup = lookupWith()
    const detour = pinSegment(line, lookup, 0, 320)
    expect(detour.pins).toBeDefined()
    // 250, the shapes' middle, is off the 20px grid: it is one of the spots a segment snaps to.
    expect(segmentSnapValues(detour, lookup, 'y')).toContain(250)
    const back = withoutIdlePins(pinSegment(detour, lookup, 2, 250), lookup)
    expect(back.pins).toBeUndefined()
    expect(connectorPolyline(back, lookup)?.map((p) => [p.x, p.y])).toEqual([[300, 250], [600, 250]])
  })

  it('a detour holds while the shapes stay lined up, and lets go when they no longer are', () => {
    const detour = pinSegment(line, lookupWith(), 0, 320)
    expect(pinsApply(detour, lookupWith({ ...b, x: 700 }))).toBe(true)
    expect(pinsApply(detour, lookupWith({ ...b, y: 40 }))).toBe(false)
    // Let go, the line is routed as if it had never been dragged.
    const up = lookupWith({ ...b, y: 40 })
    expect(connectorPolyline(detour, up)).toEqual(connectorPolyline(line, up))
  })

  it('reversing keeps the path and turns the arrow round', () => {
    const c = shape(400, 500)
    const lookup = (id: string) => new Map<string, BoardObject>([[a.id, a], [c.id, c]]).get(id)
    const bent = { ...pinSegment(createConnector({ objectId: a.id, side: 'right' }, { objectId: c.id, side: 'top' }, 3), lookup, 1, 360), labelPos: 0.25 }
    const reversed = reverseConnector(bent)
    expect(connectorPolyline(reversed, lookup)).toEqual([...connectorPolyline(bent, lookup)!].reverse())
    expect([reversed.startCap, reversed.endCap]).toEqual([bent.startCap, bent.endCap])
    expect(reversed.labelPos).toBe(0.75)
  })
})

describe('ends almost in line', () => {
  // A's right side faces B's left; B sits `dy` lower (sizes rounded to whole pixels leave such slivers).
  const routeWith = (dy: number) => {
    const a = shape(100, 100, 200, 100)
    const b = shape(500, 100 + dy, 200, 100)
    return route([a, b], { objectId: a.id, side: 'right' }, { objectId: b.id, side: 'left' })!
  }
  it('runs straight when the middles are a sliver apart (no loop, no step)', () => {
    for (const dy of [0.3, 0.5, 1, 2, 4]) {
      const pts = routeWith(dy)
      expect(pts.map((p) => [p.x, p.y]), `dy ${dy}`).toEqual([[300, 150], [500, 150]])
    }
  })
  it('still bends when they are really apart', () => {
    expect(routeWith(12).length).toBe(4)
  })
})
