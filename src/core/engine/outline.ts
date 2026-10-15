// Points on a shape's outline, for line ends pinned anywhere along a side: the outline path
// flattened into short straight pieces, and the spot where a line leaving a side at a given
// position meets it (for a rectangle, the side itself; for an ellipse or a diamond, the curve).

import type { ShapeObject, Side } from '../board/model'
import { distance, type Point } from './geometry'
import { shapePathData } from './shapes'

/** Pieces a quarter turn of an arc, or one curve, is cut into. */
const ARC_STEPS_PER_QUARTER = 6
const CURVE_STEPS = 12

/** Absolute SVG path data (M L H V C Q A Z) as polylines, one per subpath. */
export function flattenPath(d: string): Point[][] {
  const out: Point[][] = []
  let line: Point[] = []
  let p: Point = { x: 0, y: 0 }
  let start: Point = p
  const to = (q: Point) => {
    line.push(q)
    p = q
  }
  for (const [, cmd, args] of d.matchAll(/([MLHVCQAZ])([^MLHVCQAZ]*)/g)) {
    const v = (args.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number)
    switch (cmd) {
      case 'M':
        if (line.length > 1) out.push(line)
        line = []
        to({ x: v[0], y: v[1] })
        start = p
        for (let i = 2; i < v.length; i += 2) to({ x: v[i], y: v[i + 1] })
        break
      case 'L':
        for (let i = 0; i < v.length; i += 2) to({ x: v[i], y: v[i + 1] })
        break
      case 'H':
        to({ x: v[0], y: p.y })
        break
      case 'V':
        to({ x: p.x, y: v[0] })
        break
      case 'C':
        for (let i = 0; i + 5 < v.length; i += 6) {
          const [a, b, c, e] = [p, { x: v[i], y: v[i + 1] }, { x: v[i + 2], y: v[i + 3] }, { x: v[i + 4], y: v[i + 5] }]
          for (let s = 1; s <= CURVE_STEPS; s++) {
            const t = s / CURVE_STEPS
            const u = 1 - t
            to({
              x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * e.x,
              y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * e.y,
            })
          }
        }
        break
      case 'Q':
        for (let i = 0; i + 3 < v.length; i += 4) {
          const [a, b, e] = [p, { x: v[i], y: v[i + 1] }, { x: v[i + 2], y: v[i + 3] }]
          for (let s = 1; s <= CURVE_STEPS; s++) {
            const t = s / CURVE_STEPS
            const u = 1 - t
            to({ x: u * u * a.x + 2 * u * t * b.x + t * t * e.x, y: u * u * a.y + 2 * u * t * b.y + t * t * e.y })
          }
        }
        break
      case 'A':
        for (let i = 0; i + 6 < v.length; i += 7) for (const q of arcPoints(p, v[i], v[i + 1], v[i + 2], v[i + 3] !== 0, v[i + 4] !== 0, { x: v[i + 5], y: v[i + 6] })) to(q)
        break
      case 'Z':
        to(start)
        break
    }
  }
  if (line.length > 1) out.push(line)
  return out
}

/** An SVG arc from `a` to `b` as points after `a` (the endpoint-to-center conversion of SVG 1.1, F.6.5). */
function arcPoints(a: Point, rx: number, ry: number, rotation: number, large: boolean, sweep: boolean, b: Point): Point[] {
  rx = Math.abs(rx)
  ry = Math.abs(ry)
  if (rx === 0 || ry === 0 || (a.x === b.x && a.y === b.y)) return [b]
  const phi = (rotation * Math.PI) / 180
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const hx = (a.x - b.x) / 2
  const hy = (a.y - b.y) / 2
  const x1 = cos * hx + sin * hy
  const y1 = -sin * hx + cos * hy
  // Radii too small to reach are scaled up just enough.
  const fit = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
  if (fit > 1) {
    rx *= Math.sqrt(fit)
    ry *= Math.sqrt(fit)
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den))
  const cx1 = (k * rx * y1) / ry
  const cy1 = (-k * ry * x1) / rx
  const cx = cos * cx1 - sin * cy1 + (a.x + b.x) / 2
  const cy = sin * cx1 + cos * cy1 + (a.y + b.y) / 2
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
  const start = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry)
  let sweepAngle = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry)
  if (!sweep && sweepAngle > 0) sweepAngle -= 2 * Math.PI
  else if (sweep && sweepAngle < 0) sweepAngle += 2 * Math.PI
  const steps = Math.max(2, Math.ceil((Math.abs(sweepAngle) / (Math.PI / 2)) * ARC_STEPS_PER_QUARTER))
  const pts: Point[] = []
  for (let s = 1; s < steps; s++) {
    const t = start + (sweepAngle * s) / steps
    pts.push({ x: cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, y: cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos })
  }
  pts.push(b)
  return pts
}

/** A shape's outline as polylines, kept per object (objects are replaced, never changed, when edited). */
const outlines = new WeakMap<ShapeObject, Point[][]>()

function outlineOf(o: ShapeObject): Point[][] {
  let lines = outlines.get(o)
  if (!lines) {
    lines = flattenPath(shapePathData(o.shape, o))
    outlines.set(o, lines)
  }
  return lines
}

const across = (side: Side) => side === 'top' || side === 'bottom'

/**
 * Where a line pinned to `side` at `at` (0 its top or left end, 1 the other) meets the outline:
 * the outermost crossing of the outline on the line through that spot square to the side, so a
 * line leaving the side straight out leaves the shape right there.
 */
export function borderPoint(o: ShapeObject, side: Side, at: number): Point {
  const lines = outlineOf(o)
  const vertical = across(side)
  const along = (q: Point) => (vertical ? q.x : q.y)
  const off = (q: Point) => (vertical ? q.y : q.x)
  // Within the outline's own extent (a star or a diamond doesn't fill its box to the corners).
  let lo = Infinity
  let hi = -Infinity
  for (const line of lines) for (const q of line) [lo, hi] = [Math.min(lo, along(q)), Math.max(hi, along(q))]
  const pos = vertical ? o.x + at * o.w : o.y + at * o.h
  const u = lines.length ? Math.max(lo, Math.min(hi, pos)) : pos
  const outward = side === 'top' || side === 'left' ? -1 : 1
  let best: number | null = null
  const take = (v: number) => {
    if (best === null || v * outward > best * outward) best = v
  }
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]
      const b = line[i]
      const [ua, ub] = [along(a), along(b)]
      if (u < Math.min(ua, ub) || u > Math.max(ua, ub)) continue
      if (ua === ub) {
        take(off(a))
        take(off(b))
      } else take(off(a) + ((u - ua) / (ub - ua)) * (off(b) - off(a)))
    }
  }
  if (best === null) best = side === 'top' ? o.y : side === 'bottom' ? o.y + o.h : side === 'left' ? o.x : o.x + o.w
  return vertical ? { x: u, y: best } : { x: best, y: u }
}

/** Position (0..1) along `side` of a board point, kept `margin` (board px) clear of the corners. */
export function positionOn(o: ShapeObject, side: Side, p: Point, margin = 0): number {
  const len = across(side) ? o.w : o.h
  if (len <= 0) return 0.5
  const m = Math.min(0.5, margin / len)
  const raw = across(side) ? (p.x - o.x) / o.w : (p.y - o.y) / o.h
  return Math.max(m, Math.min(1 - m, raw))
}

/** The spot on the outline nearest to `p` among the given sides, and how far it is. */
export function nearestBorder(o: ShapeObject, p: Point, sides: readonly Side[], margin = 0): { side: Side; at: number; point: Point; distance: number } | null {
  let best: { side: Side; at: number; point: Point; distance: number } | null = null
  for (const side of sides) {
    const at = positionOn(o, side, p, margin)
    const point = borderPoint(o, side, at)
    const d = distance(p, point)
    if (!best || d < best.distance) best = { side, at, point, distance: d }
  }
  return best
}
