import { describe, expect, it } from 'vitest'
import { rotatePathData, shapePathData } from './shapes'

describe('rotated shapes', () => {
  it('turn path data around a center', () => {
    expect(rotatePathData('M0 0H10V5Z', 5, 5, 90)).toBe('M10 0L10 10L5 10Z')
    expect(rotatePathData('M0 0L10 0', 0, 0, 180)).toBe('M0 0L-10 0')
  })

  it('draw unrotated in the swapped box and keep their bounds', () => {
    // A 96x192 box holding a parallelogram turned 90°: every point stays inside the box.
    const d = shapePathData('parallelogram', { x: 48, y: -48, w: 96, h: 192, angle: 90 })
    const nums = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))
    const xs = nums.filter((_, i) => i % 2 === 0)
    const ys = nums.filter((_, i) => i % 2 === 1)
    expect(Math.min(...xs)).toBe(48)
    expect(Math.max(...xs)).toBe(144)
    expect(Math.min(...ys)).toBe(-48)
    expect(Math.max(...ys)).toBe(144)
  })

  it('leave unrotated shapes alone', () => {
    const r = { x: 0, y: 0, w: 192, h: 96 }
    expect(shapePathData('trapezoid', { ...r, angle: 0 })).toBe(shapePathData('trapezoid', r))
    expect(shapePathData('trapezoid', { ...r, angle: 360 })).toBe(shapePathData('trapezoid', r))
  })
})
