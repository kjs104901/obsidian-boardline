import { describe, expect, it } from 'vitest'
import { GRID, rectFromPoints, rectsIntersect, snap, unionRects } from './geometry'

describe('snap', () => {
  it('rounds to the nearest 20px grid line', () => {
    expect(GRID).toBe(20)
    expect(snap(394)).toBe(400)
    expect(snap(355)).toBe(360)
    expect(snap(149)).toBe(140)
    expect(snap(657)).toBe(660)
  })

  it('rounds ties upward, also for negatives', () => {
    expect(snap(10)).toBe(20)
    expect(snap(-10)).toBe(0)
    expect(snap(-11)).toBe(-20)
  })
})

describe('rects', () => {
  it('builds a rect from any two corners', () => {
    expect(rectFromPoints({ x: 10, y: 50 }, { x: 0, y: 20 })).toEqual({ x: 0, y: 20, w: 10, h: 30 })
  })

  it('unions and intersects', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 }
    const b = { x: 20, y: 5, w: 10, h: 10 }
    expect(unionRects([a, b])).toEqual({ x: 0, y: 0, w: 30, h: 15 })
    expect(unionRects([])).toBeNull()
    expect(rectsIntersect(a, b)).toBe(false)
    expect(rectsIntersect(a, { x: 5, y: 5, w: 1, h: 1 })).toBe(true)
  })
})

describe('pinch', () => {
  it('keeps the board point under the fingers and zooms by their spread', async () => {
    const { pinchView } = await import('./viewport')
    const start = { offsetX: 100, offsetY: 50, zoom: 1 }
    // Fingers 100px apart around (200, 200), spread to 200px and moved right by 40px.
    const next = pinchView(start, { x: 200, y: 200 }, 100, { x: 240, y: 200 }, 200)
    expect(next.zoom).toBe(2)
    // The board point that was under the midpoint (300, 250) is under the new midpoint.
    expect(240 / next.zoom + next.offsetX).toBeCloseTo(300)
    expect(200 / next.zoom + next.offsetY).toBeCloseTo(250)
    // Zoom stays within limits.
    expect(pinchView(start, { x: 0, y: 0 }, 100, { x: 0, y: 0 }, 10000).zoom).toBe(4)
  })
})
