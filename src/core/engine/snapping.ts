// Object alignment / equal-spacing snapping with grid fallback.
//
// Per axis, the moving rect offers three reference values: its min edge, max edge and center.
// Edges snap to other objects' edges, the center to their centers, and edges also to positions
// that repeat an existing gap between neighbours. The smallest move within `distance` wins;
// an axis with no candidate falls back to the grid.

import { snap, type Point, type Rect } from './geometry'

export type Axis = 'x' | 'y'

/** `align`: shared edge/center line. `spacing`: equal gaps, drawn as gap markers. */
export type Guide =
  | { kind: 'align'; axis: Axis; at: number; from: number; to: number }
  | { kind: 'spacing'; axis: Axis; gaps: { start: number; end: number; cross: number }[] }

/** full: objects, else the grid; grid: the grid only; objects: objects only; none: nothing. */
export type SnapMode = 'full' | 'grid' | 'objects' | 'none'

export interface SnapOptions {
  /** Max distance (board units) for object snapping. */
  distance: number
  grid: number
  mode: SnapMode
}

interface Candidate {
  delta: number
  spacing?: { start: number; end: number; cross: number }[]
}

const EPS = 0.5

function lo(r: Rect, axis: Axis) {
  return axis === 'x' ? r.x : r.y
}
function size(r: Rect, axis: Axis) {
  return axis === 'x' ? r.w : r.h
}
function hi(r: Rect, axis: Axis) {
  return lo(r, axis) + size(r, axis)
}
function mid(r: Rect, axis: Axis) {
  return lo(r, axis) + size(r, axis) / 2
}
const other = (axis: Axis): Axis => (axis === 'x' ? 'y' : 'x')

/** True if the rects overlap on the axis perpendicular to `axis` (i.e. they are neighbours along `axis`). */
function overlapsAcross(a: Rect, b: Rect, axis: Axis): boolean {
  const o = other(axis)
  return lo(a, o) < hi(b, o) && lo(b, o) < hi(a, o)
}

function alignmentCandidates(moving: Rect, others: Rect[], axis: Axis, distance: number): Candidate[] {
  const out: Candidate[] = []
  const edges = [lo(moving, axis), hi(moving, axis)]
  const center = mid(moving, axis)
  for (const o of others) {
    for (const target of [lo(o, axis), hi(o, axis)]) {
      for (const e of edges) {
        const d = target - e
        if (Math.abs(d) < distance) out.push({ delta: d })
      }
    }
    const d = mid(o, axis) - center
    if (Math.abs(d) < distance) out.push({ delta: d })
  }
  return out
}

/**
 * Positions that make the moving rect repeat a gap that already exists between two of its
 * neighbours (objects overlapping it across the axis), or sit centered between two of them.
 */
function spacingCandidates(moving: Rect, others: Rect[], axis: Axis, distance: number): Candidate[] {
  const o = other(axis)
  const row = others.filter((r) => overlapsAcross(moving, r, axis)).sort((a, b) => lo(a, axis) - lo(b, axis))
  const out: Candidate[] = []
  const w = size(moving, axis)
  const start = lo(moving, axis)
  const crossOf = (...rs: Rect[]) => {
    const top = Math.max(...rs.map((r) => lo(r, o)))
    const bottom = Math.min(...rs.map((r) => hi(r, o)))
    return top <= bottom ? (top + bottom) / 2 : mid(rs[0], o)
  }
  for (let i = 0; i < row.length; i++) {
    for (let j = i + 1; j < row.length; j++) {
      const a = row[i]
      const b = row[j]
      const gap = lo(b, axis) - hi(a, axis)
      if (gap <= 0) continue
      // Only adjacent pairs: nothing else sits between a and b.
      if (row.some((c, k) => k !== i && k !== j && lo(c, axis) >= hi(a, axis) && hi(c, axis) <= lo(b, axis))) continue
      // After b, before a, and centered between them.
      const positions = [
        { pos: hi(b, axis) + gap, gaps: [[hi(a, axis), lo(b, axis)], [hi(b, axis), hi(b, axis) + gap]] },
        { pos: lo(a, axis) - gap - w, gaps: [[lo(a, axis) - gap, lo(a, axis)], [hi(a, axis), lo(b, axis)]] },
      ]
      const inner = (gap - w) / 2
      if (inner > 0) positions.push({ pos: hi(a, axis) + inner, gaps: [[hi(a, axis), hi(a, axis) + inner], [lo(b, axis) - inner, lo(b, axis)]] })
      for (const p of positions) {
        const d = p.pos - start
        if (Math.abs(d) >= distance) continue
        const placed = axis === 'x' ? { ...moving, x: p.pos } : { ...moving, y: p.pos }
        const cross = crossOf(a, b, placed)
        out.push({ delta: d, spacing: p.gaps.map(([s, e]) => ({ start: s, end: e, cross })) })
      }
    }
  }
  return out
}

function best(cands: Candidate[]): Candidate | null {
  let found: Candidate | null = null
  for (const c of cands) {
    if (!found || Math.abs(c.delta) < Math.abs(found.delta) - 1e-9) found = c
    else if (!found.spacing && c.spacing && Math.abs(Math.abs(c.delta) - Math.abs(found.delta)) < 1e-9) found = c
  }
  return found
}

/** Alignment guide lines through the final rect's edges/center that match other objects. */
function alignGuides(rect: Rect, others: Rect[], axis: Axis): Guide[] {
  const o = other(axis)
  const lines = new Map<number, { from: number; to: number }>()
  const values = [lo(rect, axis), mid(rect, axis), hi(rect, axis)]
  for (const r of others) {
    const theirs = [lo(r, axis), mid(r, axis), hi(r, axis)]
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        // Center only matches center; edges match edges.
        if ((i === 1) !== (j === 1)) continue
        if (Math.abs(values[i] - theirs[j]) > EPS) continue
        const at = values[i]
        const cur = lines.get(at) ?? { from: lo(rect, o), to: hi(rect, o) }
        lines.set(at, { from: Math.min(cur.from, lo(r, o)), to: Math.max(cur.to, hi(r, o)) })
      }
    }
  }
  return [...lines].map(([at, span]) => ({ kind: 'align', axis, at, ...span }))
}

export interface SnapMoveResult {
  rect: Rect
  guides: Guide[]
}

/** Snap a moving rect (already offset by the raw pointer delta). */
export function snapMove(moving: Rect, others: Rect[], opts: SnapOptions): SnapMoveResult {
  if (opts.mode === 'none') return { rect: moving, guides: [] }
  let rect = { ...moving }
  const guides: Guide[] = []
  for (const axis of ['x', 'y'] as const) {
    const chosen =
      opts.mode === 'full' || opts.mode === 'objects'
        ? best([
            ...alignmentCandidates(moving, others, axis, opts.distance),
            ...spacingCandidates(moving, others, axis, opts.distance),
          ])
        : null
    const free = opts.mode === 'objects' ? Math.round(lo(moving, axis)) : snap(lo(moving, axis), opts.grid)
    const value = chosen ? Math.round(lo(moving, axis) + chosen.delta) : free
    rect = axis === 'x' ? { ...rect, x: value } : { ...rect, y: value }
    if (chosen?.spacing) guides.push({ kind: 'spacing', axis, gaps: chosen.spacing })
  }
  if (opts.mode !== 'grid') guides.push(...alignGuides(rect, others, 'x'), ...alignGuides(rect, others, 'y'))
  return { rect, guides }
}

/** Snap a single point (a resize corner) to other objects' edges/centers, else the grid. */
export function snapPoint(p: Point, others: Rect[], opts: SnapOptions): { point: Point; guides: Guide[] } {
  if (opts.mode === 'none') return { point: p, guides: [] }
  const point = { ...p }
  for (const axis of ['x', 'y'] as const) {
    let found: number | null = null
    if (opts.mode === 'full' || opts.mode === 'objects') {
      for (const r of others) {
        for (const t of [lo(r, axis), mid(r, axis), hi(r, axis)]) {
          const d = t - p[axis]
          if (Math.abs(d) < opts.distance && (found === null || Math.abs(d) < Math.abs(found))) found = d
        }
      }
    }
    point[axis] = found !== null ? Math.round(p[axis] + found) : opts.mode === 'objects' ? Math.round(p[axis]) : snap(p[axis], opts.grid)
  }
  const guides: Guide[] = []
  if (opts.mode !== 'grid') {
    const dot = { x: point.x, y: point.y, w: 0, h: 0 }
    guides.push(...alignGuides(dot, others, 'x'), ...alignGuides(dot, others, 'y'))
  }
  return { point, guides }
}
