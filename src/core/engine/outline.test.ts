import { describe, expect, it } from 'vitest'
import { createShape, type ShapeKind } from '../board/model'
import { borderPoint, flattenPath, nearestBorder, positionOn } from './outline'

const shape = (kind: ShapeKind, angle?: number) => ({ ...createShape(kind, 100, 200, 1, { w: 200, h: 100 }), ...(angle ? { angle } : {}) })
const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 0)
  expect(a.y).toBeCloseTo(b.y, 0)
}

describe('flattening outlines', () => {
  it('keeps straight paths as they are, closing them', () => {
    expect(flattenPath('M0 0H10V5H0Z')).toEqual([
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 5 },
        { x: 0, y: 5 },
        { x: 0, y: 0 },
      ],
    ])
  })

  it('follows arcs round their center', () => {
    // The top half of a circle of radius 10 around (10, 0).
    const [line] = flattenPath('M0 0A10 10 0 0 1 20 0')
    for (const p of line) expect(Math.hypot(p.x - 10, p.y)).toBeCloseTo(10, 5)
    expect(Math.min(...line.map((p) => p.y))).toBeCloseTo(-10, 0)
  })
})

describe('points along a side', () => {
  it('sit on a rectangle side, clear of the rounded corners', () => {
    const r = shape('rect')
    close(borderPoint(r, 'top', 0.25), { x: 150, y: 200 })
    close(borderPoint(r, 'bottom', 0.75), { x: 250, y: 300 })
    close(borderPoint(r, 'left', 0.5), { x: 100, y: 250 })
    close(borderPoint(r, 'right', 0.2), { x: 300, y: 220 })
    // In a rounded corner the point is on the curve, inside the box's corner.
    const corner = borderPoint(r, 'top', 0)
    expect(corner.x).toBeCloseTo(100, 5)
    expect(corner.y).toBeGreaterThan(200)
  })

  it('sit on the curve of an ellipse', () => {
    const e = shape('ellipse')
    const p = borderPoint(e, 'top', 0.25)
    // (x-200)²/100² + (y-250)²/50² = 1 at x = 150, above the center.
    expect(p.x).toBeCloseTo(150, 5)
    expect(p.y).toBeCloseTo(250 - 50 * Math.sqrt(1 - 0.25), 0)
    close(borderPoint(e, 'right', 0.5), { x: 300, y: 250 })
  })

  it('sit on the slanted edges of a diamond', () => {
    const d = shape('diamond')
    close(borderPoint(d, 'top', 0.25), { x: 150, y: 225 })
    close(borderPoint(d, 'left', 0.75), { x: 150, y: 275 })
  })

  it('follow a rotated shape', () => {
    // A triangle turned a quarter: its point faces right, its base is the left side.
    const t = shape('triangle', 90)
    close(borderPoint(t, 'left', 0.3), { x: 100, y: 230 })
    expect(borderPoint(t, 'right', 0.5).x).toBeCloseTo(300, 0)
  })

  it('read the position of a board point, kept clear of the corners', () => {
    const r = shape('rect')
    expect(positionOn(r, 'top', { x: 150, y: 190 })).toBeCloseTo(0.25)
    expect(positionOn(r, 'left', { x: 0, y: 0 }, 10)).toBeCloseTo(0.1)
    expect(positionOn(r, 'top', { x: 999, y: 0 }, 10)).toBeCloseTo(0.95)
  })

  it('find the nearest side for a point near the border', () => {
    const r = shape('rect')
    const near = nearestBorder(r, { x: 160, y: 204 }, ['top', 'right', 'bottom', 'left'])
    expect(near?.side).toBe('top')
    expect(near?.at).toBeCloseTo(0.3)
    expect(near?.distance).toBeCloseTo(4)
    expect(nearestBorder(r, { x: 296, y: 280 }, ['top', 'right', 'bottom', 'left'])?.side).toBe('right')
  })
})
