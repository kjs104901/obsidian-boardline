// Connector end caps as plain primitives, drawn by the canvas renderer and the SVG export.

import type { EndCap } from '../board/model'
import type { Point } from './geometry'

export const ARROW_LENGTH = 11
const ARROW_HALF_WIDTH = 5.5

export type CapPrimitive =
  | { kind: 'polygon'; points: Point[] }
  | { kind: 'dot'; center: Point; radius: number }
  | { kind: 'ring'; center: Point; radius: number }
  | { kind: 'lines'; segments: [Point, Point][] }

/** Primitives for `cap` at the start or end of the visible polyline. */
export function capPrimitives(pts: Point[], cap: EndCap, atStart: boolean): CapPrimitive[] {
  if (cap === 'none' || pts.length < 2) return []
  const tip = atStart ? pts[0] : pts[pts.length - 1]
  const prev = atStart ? pts[1] : pts[pts.length - 2]
  const len = Math.hypot(tip.x - prev.x, tip.y - prev.y) || 1
  const ux = (tip.x - prev.x) / len
  const uy = (tip.y - prev.y) / len
  const at = (along: number, across: number): Point => ({ x: tip.x - ux * along - uy * across, y: tip.y - uy * along + ux * across })

  switch (cap) {
    case 'arrow':
      return [{ kind: 'polygon', points: [tip, at(ARROW_LENGTH, ARROW_HALF_WIDTH), at(ARROW_LENGTH, -ARROW_HALF_WIDTH)] }]
    case 'circle':
      return [{ kind: 'dot', center: at(5, 0), radius: 5 }]
    case 'diamond':
      return [{ kind: 'polygon', points: [at(0, 0), at(6, 5), at(12, 0), at(6, -5)] }]
  }
  // Fork / ER notations: crow's foot, bars and an optional ring.
  const segments: [Point, Point][] = []
  if (cap === 'fork' || cap === 'zero-many' || cap === 'one-many') {
    const base = at(12, 0)
    for (const side of [7, -7, 0]) segments.push([base, at(0, side)])
  }
  if (cap === 'one-one' || cap === 'one-many' || cap === 'zero-one') segments.push([at(14, 6), at(14, -6)])
  if (cap === 'one-one') segments.push([at(19, 6), at(19, -6)])
  const out: CapPrimitive[] = [{ kind: 'lines', segments }]
  if (cap === 'zero-one' || cap === 'zero-many') out.push({ kind: 'ring', center: at(22, 0), radius: 4 })
  return out
}

/** Shorten the last segment by `by` (so a filled arrow keeps a sharp tip). */
export function shortenEnd(pts: Point[], by: number): Point[] {
  if (pts.length < 2) return pts
  const a = pts[pts.length - 2]
  const b = pts[pts.length - 1]
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  if (len <= by) return pts
  const t = (len - by) / len
  return [...pts.slice(0, -1), { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }]
}
