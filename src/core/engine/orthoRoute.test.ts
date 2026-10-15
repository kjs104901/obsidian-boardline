import { describe, expect, it } from 'vitest'
import { routeBetweenSides, type Port } from './orthoRoute'

// A is a 200×100 box at the origin, joined from its bottom to the top of B (quick-add below),
// then B is moved around. Routes leave and enter along the sides' normals, keep 40 clear of
// the shapes and cross a gap between them in its middle.
const A = { x: 0, y: 0, w: 200, h: 100 }
const fromA: Port = { point: { x: 100, y: 100 }, dir: 'down', rect: A }
const topOf = (x: number, y: number): Port => ({ point: { x: x + 100, y }, dir: 'up', rect: { x, y, w: 200, h: 100 } })

describe('routes between pinned sides', () => {
  it('straight down when B is right below', () => {
    expect(routeBetweenSides(fromA, topOf(0, 200))).toEqual([
      { x: 100, y: 100 },
      { x: 100, y: 200 },
    ])
  })

  it('a Z through the middle of the gap when B is below and to the side', () => {
    expect(routeBetweenSides(fromA, topOf(300, 200))).toEqual([
      { x: 100, y: 100 },
      { x: 100, y: 150 },
      { x: 400, y: 150 },
      { x: 400, y: 200 },
    ])
  })

  it('B beside A: out 40, through the gap, over B and down into its top', () => {
    expect(routeBetweenSides(fromA, topOf(300, 0))).toEqual([
      { x: 100, y: 100 },
      { x: 100, y: 140 },
      { x: 250, y: 140 },
      { x: 250, y: -40 },
      { x: 400, y: -40 },
      { x: 400, y: 0 },
    ])
  })

  it('B above and to the right', () => {
    expect(routeBetweenSides(fromA, topOf(300, -200))).toEqual([
      { x: 100, y: 100 },
      { x: 100, y: 140 },
      { x: 250, y: 140 },
      { x: 250, y: -240 },
      { x: 400, y: -240 },
      { x: 400, y: -200 },
    ])
  })

  it('B right above A: around the side, 40 clear', () => {
    const route = routeBetweenSides(fromA, topOf(0, -200))!
    expect(route[0]).toEqual({ x: 100, y: 100 })
    expect(route[1]).toEqual({ x: 100, y: 140 })
    expect([240, -40]).toContain(route[2].x)
    expect(route.slice(-2)).toEqual([
      { x: 100, y: -240 },
      { x: 100, y: -200 },
    ])
  })

  it('never passes through either shape', () => {
    const inside = (p: { x: number; y: number }, r: typeof A) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h
    for (const [bx, by] of [[-300, 0], [-300, -200], [0, -160], [100, 100], [-100, 300], [400, -400]]) {
      const b = topOf(bx, by)
      const route = routeBetweenSides(fromA, b)!
      expect(route).not.toBeNull()
      for (let i = 1; i < route.length; i++) {
        const mid = { x: (route[i - 1].x + route[i].x) / 2, y: (route[i - 1].y + route[i].y) / 2 }
        expect(inside(mid, A) || inside(mid, b.rect!)).toBe(false)
      }
    }
  })
})
