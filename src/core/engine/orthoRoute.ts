// Elbow routes between two ends pinned to sides (quick-add pairs, connectors drawn from a
// connection dot), around both shapes:
// a line leaves its side and enters the other along the side's normal, keeps CLEAR (40) clear of the
// shapes when it goes around them, and runs down the middle of the gap between two shapes.
//
// Candidate lines (port axes, CLEAR outside each shape, middles of gaps) make a small grid; the
// route is the cheapest path on it (length plus a cost per bend) that crosses no shape.

import type { Point, Rect } from './geometry'

export type Dir = 'right' | 'left' | 'down' | 'up'

export interface Port {
  point: Point
  /** Outward normal of the side: the line leaves (or enters) along it. */
  dir: Dir
  rect: Rect | null
}

/** Clearance kept around shapes when going round them (connectors.ts STUB). */
const CLEAR = 40
/** A bend costs as much as this much extra length. */
const BEND = 30
const EPS = 0.5

const VEC: Record<Dir, Point> = { right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, down: { x: 0, y: 1 }, up: { x: 0, y: -1 } }
const DIRS: Dir[] = ['right', 'down', 'left', 'up']

/** Whether the segment a–b passes through the inside of `r`. */
function crosses(a: Point, b: Point, r: Rect): boolean {
  const x0 = Math.min(a.x, b.x)
  const x1 = Math.max(a.x, b.x)
  const y0 = Math.min(a.y, b.y)
  const y1 = Math.max(a.y, b.y)
  return x1 > r.x + EPS && x0 < r.x + r.w - EPS && y1 > r.y + EPS && y0 < r.y + r.h - EPS
}

/** Values of candidate lines along one axis. */
function candidates(a: Port, b: Port, axis: 'x' | 'y'): number[] {
  const lo = (r: Rect) => (axis === 'x' ? r.x : r.y)
  const hi = (r: Rect) => (axis === 'x' ? r.x + r.w : r.y + r.h)
  const values = new Set<number>([a.point[axis], b.point[axis], (a.point[axis] + b.point[axis]) / 2])
  const rects = [a.rect, b.rect].filter((r): r is Rect => !!r)
  const [ra, rb] = [a.rect, b.rect]
  // The middle of the gap between the two shapes; lines CLEAR outside them, except inside that gap.
  let gap: [number, number] | null = null
  if (ra && rb) {
    if (hi(ra) <= lo(rb)) gap = [hi(ra), lo(rb)]
    else if (hi(rb) <= lo(ra)) gap = [hi(rb), lo(ra)]
    if (gap) values.add((gap[0] + gap[1]) / 2)
  }
  for (const r of rects) {
    for (const v of [lo(r) - CLEAR, hi(r) + CLEAR]) if (!gap || v <= gap[0] || v >= gap[1]) values.add(v)
  }
  // Leaving a side: the stub CLEAR out along its normal (in a gap, its middle does instead).
  for (const p of [a, b]) {
    const v = VEC[p.dir][axis]
    const stub = p.point[axis] + v * CLEAR
    if (v && (!gap || stub <= gap[0] || stub >= gap[1])) values.add(stub)
  }
  return [...values].sort((m, n) => m - n)
}

/** The route from `a` to `b` (both pinned to sides), or null when the shapes leave no way. */
export function routeBetweenSides(a: Port, b: Port): Point[] | null {
  const xs = candidates(a, b, 'x')
  const ys = candidates(a, b, 'y')
  const obstacles = [a.rect, b.rect].filter((r): r is Rect => !!r)
  const key = (x: number, y: number) => `${x},${y}`
  const inside = (p: Point) => obstacles.some((r) => p.x > r.x + EPS && p.x < r.x + r.w - EPS && p.y > r.y + EPS && p.y < r.y + r.h - EPS)
  const nodes = new Map<string, Point>()
  for (const x of xs) for (const y of ys) if (!inside({ x, y })) nodes.set(key(x, y), { x, y })
  const start = a.point
  const goal = b.point
  nodes.set(key(start.x, start.y), start)
  nodes.set(key(goal.x, goal.y), goal)

  /** Next node from `p` along `d` (the nearest candidate line), if the way is clear. */
  const step = (p: Point, d: Dir): Point | null => {
    const v = VEC[d]
    const line = v.x ? xs : ys
    const here = v.x ? p.x : p.y
    const next = v.x > 0 || v.y > 0 ? line.find((c) => c > here + EPS) : [...line].reverse().find((c) => c < here - EPS)
    if (next === undefined) return null
    const q = v.x ? { x: next, y: p.y } : { x: p.x, y: next }
    if (!nodes.has(key(q.x, q.y))) return null
    if (obstacles.some((r) => crosses(p, q, r))) return null
    return q
  }

  // Dijkstra over (point, heading). The first move follows a's normal; the last arrives against b's.
  type State = { p: Point; d: Dir; cost: number; prev: string | null }
  const stateKey = (p: Point, d: Dir) => `${key(p.x, p.y)}|${d}`
  const best = new Map<string, State>()
  const open: State[] = []
  const first = step(start, a.dir)
  if (!first) return null
  const s0: State = { p: first, d: a.dir, cost: Math.abs(first.x - start.x) + Math.abs(first.y - start.y), prev: null }
  best.set(stateKey(first, a.dir), s0)
  open.push(s0)
  const arrive: Dir = ({ right: 'left', left: 'right', down: 'up', up: 'down' } as const)[b.dir]
  let found: State | null = null
  while (open.length) {
    open.sort((m, n) => m.cost - n.cost)
    const cur = open.shift()!
    if (best.get(stateKey(cur.p, cur.d)) !== cur) continue
    if (cur.p.x === goal.x && cur.p.y === goal.y) {
      if (cur.d === arrive) {
        found = cur
        break
      }
      continue
    }
    for (const d of DIRS) {
      if (VEC[d].x === -VEC[cur.d].x && VEC[d].y === -VEC[cur.d].y) continue
      const q = step(cur.p, d)
      if (!q) continue
      const cost = cur.cost + Math.abs(q.x - cur.p.x) + Math.abs(q.y - cur.p.y) + (d === cur.d ? 0 : BEND)
      const k = stateKey(q, d)
      const known = best.get(k)
      if (known && known.cost <= cost) continue
      const s: State = { p: q, d, cost, prev: stateKey(cur.p, cur.d) }
      best.set(k, s)
      open.push(s)
    }
  }
  if (!found) return null
  const path: Point[] = []
  for (let s: State | undefined = found; s; s = s.prev ? best.get(s.prev) : undefined) path.push(s.p)
  path.push(start)
  path.reverse()
  // Drop points in the middle of straight runs.
  const out: Point[] = []
  for (const p of path) {
    out.push(p)
    while (out.length >= 3) {
      const [m, n, o] = out.slice(-3)
      if (!((m.x === n.x && n.x === o.x) || (m.y === n.y && n.y === o.y))) break
      out.splice(out.length - 2, 1)
    }
  }
  return out
}
