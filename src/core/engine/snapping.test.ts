import { describe, expect, it } from 'vitest'
import { snapMove, snapPoint, type SnapOptions } from './snapping'

const full: SnapOptions = { distance: 12, grid: 12, mode: 'full' }
const rect = (x: number, y: number, w = 192, h = 96) => ({ x, y, w, h })

describe('snapMove', () => {
  // A 12px grid here, to show object snaps winning over grid lines close by.
  it('snaps an edge to an off-grid edge of another object', () => {
    const a = rect(684, 252, 192, 128) // bottom = 380 (off grid)
    const moving = rect(697, 383) // top 3px below a's bottom, x 13px from a's left
    const { rect: r, guides } = snapMove(moving, [a], full)
    expect(r.y).toBe(380) // object snap wins over grid (384)
    expect(r.x).toBe(696) // 13px > distance -> grid
    expect(guides.some((g) => g.kind === 'align' && g.axis === 'y' && g.at === 380)).toBe(true)
  })

  it('repeats an existing gap (equal spacing) before falling back to the grid', () => {
    const a = rect(300, 300, 192, 128) // bottom 428
    const b = rect(300, 528) // gap 100, bottom 624
    const moving = rect(300, 722) // would be 720 on the grid
    const { rect: r, guides } = snapMove(moving, [a, b], full)
    expect(r.y).toBe(724)
    const spacing = guides.find((g) => g.kind === 'spacing')
    expect(spacing && spacing.kind === 'spacing' && spacing.gaps.map((g) => g.end - g.start)).toEqual([100, 100])
  })

  it('aligns centers with centers', () => {
    const a = rect(0, 0, 100, 100) // center x 50
    const moving = rect(9, 300, 80, 40) // center x 49
    expect(snapMove(moving, [a], full).rect.x).toBe(10)
  })

  it('centers between two neighbours', () => {
    const a = rect(0, 0, 100, 50)
    const b = rect(400, 0, 100, 50)
    const moving = rect(197, 0, 100, 50) // centered is x=200; the grid would give 192
    expect(snapMove(moving, [a, b], full).rect.x).toBe(200)
  })

  it('uses only the grid in grid mode and nothing in none mode', () => {
    const a = rect(684, 252, 192, 128)
    const moving = rect(697, 383)
    expect(snapMove(moving, [a], { ...full, mode: 'grid' }).rect).toMatchObject({ x: 696, y: 384 })
    expect(snapMove(moving, [a], { ...full, mode: 'none' }).rect).toMatchObject({ x: 697, y: 383 })
  })
})

describe('snapPoint', () => {
  it('snaps a resize corner to object edges, otherwise to the grid', () => {
    const a = rect(0, 0, 100, 103) // bottom 103 (off grid)
    const { point } = snapPoint({ x: 205, y: 101 }, [a], full)
    expect(point).toEqual({ x: 204, y: 103 })
  })
})
