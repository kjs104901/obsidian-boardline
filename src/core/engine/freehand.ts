// Freehand strokes: pen (H) and marker (Shift+H). A pen stroke is 4px wide in the color, a
// marker stroke 20px at 30% opacity.

import { createShape, type ColorKey, type ShapeObject } from '../board/model'
import { distance, type Point } from './geometry'

export type PenKind = 'pen' | 'marker'

export const PEN_WIDTH: Record<PenKind, number> = { pen: 4, marker: 20 }
export const MARKER_OPACITY = 0.3

export const penOf = (o: ShapeObject): PenKind => o.pen ?? 'pen'
const half = (o: ShapeObject) => PEN_WIDTH[penOf(o)] / 2
const round = (v: number) => Math.round(v * 10) / 10

/** Keep the points that matter: Ramer–Douglas–Peucker with `tolerance` board px. */
export function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    let worst = -1
    let index = -1
    for (let i = a + 1; i < b; i++) {
      const d = distanceToSegment(points[i], points[a], points[b])
      if (d > worst) {
        worst = d
        index = i
      }
    }
    if (worst > tolerance) {
      keep[index] = 1
      stack.push([a, index], [index, b])
    }
  }
  return points.filter((_, i) => keep[i])
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = dx * dx + dy * dy
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len))
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy })
}

/** A freehand object around board points: the box hugs the stroke, points are relative to it. */
export function strokeShape(points: Point[], pen: PenKind, color: ColorKey, z: number, base?: ShapeObject): ShapeObject {
  const pad = PEN_WIDTH[pen] / 2
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const x = Math.floor(Math.min(...xs) - pad)
  const y = Math.floor(Math.min(...ys) - pad)
  const w = Math.ceil(Math.max(...xs) + pad) - x
  const h = Math.ceil(Math.max(...ys) + pad) - y
  const shape = base ?? { ...createShape('freehand', x, y, z), color, pen }
  return { ...shape, x, y, w, h, idealW: w, idealH: h, points: points.flatMap((p) => [round(p.x - x), round(p.y - y)]) }
}

/** The stroke's points in board coordinates. */
export function strokePoints(o: ShapeObject): Point[] {
  const v = o.points ?? []
  const out: Point[] = []
  for (let i = 0; i + 1 < v.length; i += 2) out.push({ x: o.x + v[i], y: o.y + v[i + 1] })
  return out
}

/** Smooth path through the points: curves between midpoints (a dot for a single point). */
export function strokePathData(points: Point[]): string {
  const n = (v: number) => String(round(v))
  if (points.length === 0) return ''
  const [first] = points
  if (points.length === 1) return `M${n(first.x)} ${n(first.y)}L${n(first.x)} ${n(first.y)}`
  let d = `M${n(first.x)} ${n(first.y)}`
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]
    const q = points[i + 1]
    d += `Q${n(p.x)} ${n(p.y)} ${n((p.x + q.x) / 2)} ${n((p.y + q.y) / 2)}`
  }
  const last = points[points.length - 1]
  return d + `L${n(last.x)} ${n(last.y)}`
}

/** The stroke stretched into the box (x, y, w, h); the line width stays the same. */
export function scaleStroke(o: ShapeObject, x: number, y: number, w: number, h: number): ShapeObject {
  const pad = half(o)
  const kx = o.w - 2 * pad > 0.5 ? (w - 2 * pad) / (o.w - 2 * pad) : 1
  const ky = o.h - 2 * pad > 0.5 ? (h - 2 * pad) / (o.h - 2 * pad) : 1
  const v = o.points ?? []
  const points: Point[] = []
  for (let i = 0; i + 1 < v.length; i += 2) points.push({ x: x + pad + (v[i] - pad) * kx, y: y + pad + (v[i + 1] - pad) * ky })
  return strokeShape(points, penOf(o), o.color, o.z, o)
}

/** Whether `p` is on the stroke (within `tolerance` of its edge). */
export function hitStroke(o: ShapeObject, p: Point, tolerance: number): boolean {
  const pts = strokePoints(o)
  const reach = half(o) + tolerance
  if (pts.length === 1) return distance(p, pts[0]) <= reach
  for (let i = 1; i < pts.length; i++) if (distanceToSegment(p, pts[i - 1], pts[i]) <= reach) return true
  return false
}
