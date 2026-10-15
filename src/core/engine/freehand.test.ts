import { describe, expect, it } from 'vitest'
import { hitStroke, scaleStroke, simplify, strokePathData, strokePoints, strokeShape } from './freehand'

describe('freehand strokes', () => {
  it('drop points that lie on the line', () => {
    const line = [0, 1, 2, 3, 4].map((x) => ({ x: x * 10, y: 0 }))
    expect(simplify(line, 0.5)).toEqual([line[0], line[4]])
    const corner = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]
    expect(simplify(corner, 0.5)).toEqual(corner)
  })

  it('hug the stroke with half the line width around it (pen 4, marker 20)', () => {
    const pen = strokeShape([{ x: 10, y: 20 }, { x: 110, y: 70 }], 'pen', 'blue', 1)
    expect([pen.x, pen.y, pen.w, pen.h]).toEqual([8, 18, 104, 54])
    expect(strokePoints(pen)).toEqual([{ x: 10, y: 20 }, { x: 110, y: 70 }])
    const marker = strokeShape([{ x: 0, y: 0 }, { x: 100, y: 0 }], 'marker', 'yellow', 1)
    expect([marker.x, marker.y, marker.w, marker.h]).toEqual([-10, -10, 120, 20])
  })

  it('smooth through midpoints', () => {
    expect(strokePathData([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }])).toBe('M0 0Q10 0 10 5L10 10')
  })

  it('stretch without changing the line width, and are hit near the line', () => {
    const s = strokeShape([{ x: 0, y: 0 }, { x: 100, y: 100 }], 'pen', 'blue', 1)
    const big = scaleStroke(s, s.x, s.y, 204, 104)
    expect(strokePoints(big)).toEqual([{ x: 0, y: 0 }, { x: 200, y: 100 }])
    expect(hitStroke(s, { x: 50, y: 52 }, 1)).toBe(true)
    expect(hitStroke(s, { x: 50, y: 70 }, 1)).toBe(false)
  })
})
