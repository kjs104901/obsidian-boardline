// Connector geometry: endpoint resolution, elbow routing, trimming, rounded paths, measurements.
// Distances are in grid steps (20px) where they shape the route.

import { isShape, type BoardObject, type ConnectorObject, type Endpoint, type SegmentPin, type SegmentPins, type Side } from '../board/model'
import { GRID, type Point, type Rect } from './geometry'
import { routeBetweenSides } from './orthoRoute'

/** Outer margin around shapes: stubs leave a shape by at least this much (two grid steps). */
export const STUB = 40
/** Gap between a connector end and the shape outline. */
export const END_GAP = 6
export const CORNER_RADIUS = 12
/** Within this offset the router keeps a connector straight instead of adding a jog. */
export const STRAIGHT_TOLERANCE = 20

export type Dir = 'right' | 'left' | 'down' | 'up'

const SIDE_DIR: Record<Side, Dir> = { top: 'up', right: 'right', bottom: 'down', left: 'left' }
export const OPPOSITE_SIDE: Record<Side, Side> = { top: 'bottom', right: 'left', bottom: 'top', left: 'right' }

export function sidePoint(r: Rect, side: Side): Point {
  switch (side) {
    case 'top':
      return { x: r.x + r.w / 2, y: r.y }
    case 'bottom':
      return { x: r.x + r.w / 2, y: r.y + r.h }
    case 'left':
      return { x: r.x, y: r.y + r.h / 2 }
    case 'right':
      return { x: r.x + r.w, y: r.y + r.h / 2 }
  }
}

export const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

export interface ResolvedEnd {
  point: Point
  /** Direction the line leaves this end (outward normal of a pinned side). */
  dir: Dir | null
  rect: Rect | null
}

export type Lookup = (id: string) => BoardObject | undefined

/** Resolve an endpoint against the current objects; null if it points at a missing shape. */
export function resolveEnd(e: Endpoint, lookup: Lookup): ResolvedEnd | null {
  if ('point' in e) return { point: e.point, dir: null, rect: null }
  const o = lookup(e.objectId)
  if (!isShape(o)) return null
  // A point on an actor's lifeline behaves like a free point that follows the actor.
  if (e.dy !== undefined) return { point: { x: o.x + o.w / 2, y: o.y + e.dy }, dir: null, rect: null }
  return e.side ? { point: sidePoint(o, e.side), dir: SIDE_DIR[e.side], rect: o } : { point: center(o), dir: null, rect: o }
}

// ---- normalization: rotate/mirror so the source leaves towards +x -------------------

interface Frame {
  fwd: (p: Point) => Point
  back: (p: Point) => Point
}

const FRAMES: Record<Dir, Frame> = {
  right: { fwd: (p) => p, back: (p) => p },
  left: { fwd: (p) => ({ x: -p.x, y: p.y }), back: (p) => ({ x: -p.x, y: p.y }) },
  down: { fwd: (p) => ({ x: p.y, y: p.x }), back: (p) => ({ x: p.y, y: p.x }) },
  up: { fwd: (p) => ({ x: -p.y, y: p.x }), back: (p) => ({ x: p.y, y: -p.x }) },
}

function mapRect(r: Rect, f: (p: Point) => Point): Rect {
  const a = f({ x: r.x, y: r.y })
  const b = f({ x: r.x + r.w, y: r.y + r.h })
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }
}

function mapDir(d: Dir, frame: Frame): Dir {
  const unit = { right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, down: { x: 0, y: 1 }, up: { x: 0, y: -1 } }[d]
  const o = frame.fwd({ x: 0, y: 0 })
  const v = frame.fwd(unit)
  const dx = v.x - o.x
  const dy = v.y - o.y
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
}

/** Pick an exit direction for an end without a pinned side, facing the other end. */
function facingDir(from: Point, to: Point): Dir {
  const dx = to.x - from.x
  const dy = to.y - from.y
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'down' : 'up'
}

const right = (r: Rect) => r.x + r.w
const bottom = (r: Rect) => r.y + r.h

/**
 * Elbow route in the normalized frame: source at `s` leaving towards +x.
 * Returns the polyline ending on the target outline (or at a free target point).
 */
function routeNormalized(s: Point, src: Rect | null, t: ResolvedEnd): Point[] {
  // Free target point.
  if (!t.rect) {
    const p = t.point
    if (p.x >= s.x) {
      if (Math.abs(p.y - s.y) < 1) return [s, p]
      const mx = Math.round((s.x + p.x) / 2)
      return [s, { x: mx, y: s.y }, { x: mx, y: p.y }, p]
    }
    const sx = s.x + STUB
    return [s, { x: sx, y: s.y }, { x: sx, y: p.y }, p]
  }

  const r = t.rect
  // Target pinned to a side that faces the source (quick-add pairs).
  if (t.dir === 'left' && t.point.x >= s.x) {
    const p = t.point
    if (Math.abs(p.y - s.y) < 2) return [s, p]
    const mx = Math.round((s.x + p.x) / 2)
    return [s, { x: mx, y: s.y }, { x: mx, y: p.y }, p]
  }
  if (t.dir) return stubRoute(s, t.point, t.dir)

  // Floating target aimed at its center.
  const c = center(r)
  const yInside = s.y >= r.y && s.y <= bottom(r)

  if (r.x > s.x) {
    if (Math.abs(c.y - s.y) <= STRAIGHT_TOLERANCE && yInside) return [s, { x: r.x, y: s.y }]
    if (r.x - s.x >= 2 * STRAIGHT_TOLERANCE) {
      const mx = Math.round((s.x + r.x) / 2)
      return [s, { x: mx, y: s.y }, { x: mx, y: c.y }, { x: r.x, y: c.y }]
    }
    if (yInside) return [s, { x: r.x, y: s.y }]
  }

  // Target ahead but overlapping the exit column: go to its center x, then turn into it.
  if (c.x - s.x >= STUB && !yInside) {
    const edgeY = s.y < r.y ? r.y : bottom(r)
    return [s, { x: c.x, y: s.y }, { x: c.x, y: edgeY }]
  }

  // Target behind (or too close): leave by the stub, then come back.
  const stubX = Math.max(s.x + STUB, right(r) + STUB)
  const crossesSource = src && c.y > src.y && c.y < bottom(src) && right(r) <= src.x
  if (crossesSource) {
    // Same row behind the source: go around it (below when level or lower).
    const below = c.y >= src.y + src.h / 2
    const y = below ? bottom(src) + STUB : src.y - STUB
    const edgeY = y > c.y ? bottom(r) : r.y
    return [s, { x: stubX, y: s.y }, { x: stubX, y }, { x: c.x, y }, { x: c.x, y: edgeY }]
  }
  if (right(r) <= stubX - STUB) return [s, { x: stubX, y: s.y }, { x: stubX, y: c.y }, { x: right(r), y: c.y }]
  // Target spans past the stub: approach it vertically from the source's side.
  const edgeY = c.y < s.y ? bottom(r) : r.y
  const midY = Math.round((s.y + edgeY) / 2)
  return [s, { x: stubX, y: s.y }, { x: stubX, y: midY }, { x: c.x, y: midY }, { x: c.x, y: edgeY }]
}

/** Fallback for pinned-to-pinned ends that don't face each other: stub out of both, join with one bend. */
function stubRoute(s: Point, t: Point, tDir: Dir): Point[] {
  const a = { x: s.x + STUB, y: s.y }
  const off = { right: { x: STUB, y: 0 }, left: { x: -STUB, y: 0 }, down: { x: 0, y: STUB }, up: { x: 0, y: -STUB } }[tDir]
  const b = { x: t.x + off.x, y: t.y + off.y }
  return [s, a, { x: a.x, y: b.y }, b, t]
}

/** Remove repeated points and points in the middle of straight runs. */
export function simplify(points: Point[]): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue
    out.push(p)
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3)
      const collinear = (Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01) || (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01)
      if (!collinear) break
      out.splice(out.length - 2, 1)
    }
  }
  return out
}

/** A route before dragged segments are applied. */
interface Route {
  points: Point[]
  /** Elbow routes take dragged segments; straight lines and self messages don't. */
  pinnable: boolean
  startAttached: boolean
  endAttached: boolean
  /** The user's own route (see currentRoute), not the automatic one with segments moved. */
  own?: boolean
}

function autoRoute(c: ConnectorObject, lookup: Lookup): Route | null {
  const from = resolveEnd(c.from, lookup)
  const to = resolveEnd(c.to, lookup)
  if (!from || !to) return null
  const fixed = (points: Point[]): Route => ({ points, pinnable: false, startAttached: false, endAttached: false })
  // A message from an actor to itself loops out to the right and back.
  if (isSelfMessage(c)) {
    const a = from.point
    const b = { x: to.point.x, y: Math.max(to.point.y, a.y + GRID * 2) }
    return fixed([a, { x: a.x + SELF_LOOP, y: a.y }, { x: a.x + SELF_LOOP, y: b.y }, b])
  }
  const fromAim = to.rect && !to.dir ? center(to.rect) : to.point
  if (c.kind === 'straight') return fixed(straightLine(from, to))
  if (c.kind === 'curved') return fixed(curvedLine(from, to))
  const attached = { pinnable: true, startAttached: !!from.rect, endAttached: !!to.rect }

  // Both ends pinned to sides: go round the shapes (they keep their sides when moved).
  if (from.dir && to.dir && from.rect && to.rect) {
    const around = routeBetweenSides({ point: from.point, dir: from.dir, rect: from.rect }, { point: to.point, dir: to.dir, rect: to.rect })
    if (around) return { points: around, ...attached }
  }

  const dir = from.dir ?? facingDir(from.point, fromAim)
  const start = from.rect && !from.dir ? sidePoint(from.rect, DIR_SIDE[dir]) : from.point
  const frame = FRAMES[dir]
  const tn: ResolvedEnd = {
    point: frame.fwd(to.point),
    dir: to.dir ? mapDir(to.dir, frame) : null,
    rect: to.rect ? mapRect(to.rect, frame.fwd) : null,
  }
  const pts = routeNormalized(frame.fwd(start), from.rect ? mapRect(from.rect, frame.fwd) : null, tn)
  return { points: simplify(pts.map(frame.back)), ...attached }
}

/** Untrimmed polyline of a connector, or null if an end is missing. */
export function connectorPolyline(c: ConnectorObject, lookup: Lookup): Point[] | null {
  const r = currentRoute(c, lookup)
  if (!r) return null
  return c.pins && r.pinnable ? simplify(r.points) : r.points
}

/**
 * The route as drawn. With dragged segments it is either the automatic route with those
 * segments moved (`pins.at` lines up with it), or a route the user shaped themselves (an end's
 * segment dragged aside adds a jog): every segment has its value, the ends' segments follow
 * the ends, and the legs leaving attached ends keep going out at least JOG. Points line up
 * with `pins.at` (segment i runs from point i to i + 1); some segments may be empty.
 */
function currentRoute(c: ConnectorObject, lookup: Lookup): Route | null {
  const r = autoRoute(c, lookup)
  if (!r || !c.pins || !r.pinnable) return r
  const at = c.pins.at
  if (at.length > 0 && !pinsFor(r.points, c.pins)) {
    const own = at.every((p): p is SegmentPin => p !== null) ? ownRoute(r, at) : null
    // A route that no longer fits the ends is routed afresh.
    return own ? { ...r, points: own, own: true } : r
  }
  return { ...r, points: placePins(r.points, c.pins, r.startAttached, r.endAttached) }
}

// ---- dragged segments --------------------------------------------------------------

/** Shortest leg kept between an attached end and a pinned segment. */
export const MIN_LEG = 20
/** An end's segment dragged aside leaves the end this far before it turns (one grid step). */
export const JOG = 20

/** Coordinate a segment holds constant: vertical segments keep x, horizontal ones keep y. */
export function segmentAxis(a: Point, b: Point): 'x' | 'y' | null {
  if (Math.abs(a.x - b.x) < 0.01) return 'x'
  if (Math.abs(a.y - b.y) < 0.01) return 'y'
  return null
}

const pinAxis = (p: SegmentPin): 'x' | 'y' => ('x' in p ? 'x' : 'y')
const pinValue = (p: SegmentPin): number => ('x' in p ? p.x : p.y)
const pinOf = (axis: 'x' | 'y', v: number): SegmentPin => (axis === 'x' ? { x: v } : { y: v })
const across = (axis: 'x' | 'y'): 'x' | 'y' => (axis === 'x' ? 'y' : 'x')

/** The per-segment pins if they still fit the route (same segments, same axes), else null. */
function pinsFor(pts: Point[], pins: SegmentPins): (SegmentPin | null)[] | null {
  const at = pins.at
  if (at.length !== pts.length - 1) return null
  return at.every((p, i) => !p || segmentAxis(pts[i], pts[i + 1]) === pinAxis(p)) ? at : null
}

/** Every segment of a route as the value it keeps (the route has no empty or collinear segments). */
function segmentsOf(pts: Point[]): SegmentPin[] | null {
  const out: SegmentPin[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const axis = segmentAxis(pts[i], pts[i + 1])
    if (!axis) return null
    out.push(pinOf(axis, pts[i][axis]))
  }
  return out
}

/** A route the user shaped (see currentRoute), between the ends of the automatic one `r`. */
function ownRoute(r: Route, at: SegmentPin[]): Point[] | null {
  const n = at.length
  const auto = r.points
  const start = auto[0]
  const end = auto[auto.length - 1]
  if (n === 1) return segmentAxis(start, end) === pinAxis(at[0]) ? [start, end] : null
  const axes = at.map(pinAxis)
  for (let i = 1; i < n; i++) if (axes[i] === axes[i - 1]) return null
  const values = at.map(pinValue)
  values[0] = start[axes[0]]
  values[n - 1] = end[axes[n - 1]]
  // Leaving an attached end the way the automatic route does (out of its shape), at least JOG.
  const leaveFrom = (endPoint: Point, next: Point, i: number, j: number) => {
    const axis = axes[i]
    const run = across(axis)
    if (segmentAxis(endPoint, next) !== axis) return false
    const out = Math.sign(next[run] - endPoint[run])
    if (n < 3) return out === 0 || Math.sign(values[j] - endPoint[run]) === out
    if ((values[j] - endPoint[run]) * out < JOG) values[j] = endPoint[run] + out * JOG
    return true
  }
  if (r.startAttached && auto.length > 1 && !leaveFrom(start, auto[1], 0, 1)) return null
  if (r.endAttached && auto.length > 1 && !leaveFrom(end, auto[auto.length - 2], n - 1, n - 2)) return null
  const pts = [start]
  for (let i = 0; i < n - 1; i++) {
    pts.push(axes[i] === 'x' ? { x: values[i], y: values[i + 1] } : { x: values[i + 1], y: values[i] })
  }
  pts.push(end)
  return pts
}

/**
 * Move interior segments to their pinned coordinates, keeping the route's points (so segment
 * i stays segment i, possibly empty). Legs leaving an attached end keep pointing the way they
 * left (at least MIN_LEG long); a pin that can't satisfy that is ignored. The first and last
 * segments follow their ends.
 */
export function placePins(pts: Point[], pins: SegmentPins, startAttached: boolean, endAttached: boolean): Point[] {
  const out = pts.map((p) => ({ ...p }))
  const n = out.length
  const at = pinsFor(pts, pins)
  if (!at) return out
  for (let i = 1; i < n - 2; i++) {
    const axis = segmentAxis(out[i], out[i + 1])
    const pin = at[i]
    if (!axis || !pin) continue
    const want = pinValue(pin)
    let lo = -Infinity
    let hi = Infinity
    const keepLeg = (end: Point, inner: Point) => {
      const dir = Math.sign(inner[axis] - end[axis])
      if (dir > 0) lo = Math.max(lo, end[axis] + MIN_LEG)
      else if (dir < 0) hi = Math.min(hi, end[axis] - MIN_LEG)
    }
    if (i === 1 && startAttached) keepLeg(out[0], out[1])
    if (i + 1 === n - 2 && endAttached) keepLeg(out[n - 1], out[n - 2])
    if (lo > hi) continue
    const v = Math.min(hi, Math.max(lo, want))
    out[i][axis] = v
    out[i + 1][axis] = v
  }
  return out
}

export function applyPins(pts: Point[], pins: SegmentPins, startAttached: boolean, endAttached: boolean): Point[] {
  return simplify(placePins(pts, pins, startAttached, endAttached))
}

/**
 * An end's segment moved aside to `value`: the line still leaves the end, goes
 * JOG, turns, and runs along `value` to where the segment used to end. A route of one segment
 * jogs at both ends.
 */
function jog(pts: Point[], index: number, axis: 'x' | 'y', value: number): Point[] {
  const run = across(axis)
  const n = pts.length
  const leg = (from: Point, toward: Point): Point => {
    const len = toward[run] - from[run]
    return { ...from, [run]: from[run] + Math.sign(len) * Math.min(JOG, Math.abs(len) / 2) }
  }
  const moved = (p: Point): Point => ({ ...p, [axis]: value })
  if (n === 2) {
    const a = leg(pts[0], pts[1])
    const b = leg(pts[1], pts[0])
    return [pts[0], a, moved(a), moved(b), b, pts[1]]
  }
  if (index === 0) {
    const a = leg(pts[0], pts[1])
    return [pts[0], a, moved(a), moved(pts[1]), ...pts.slice(2)]
  }
  const a = leg(pts[n - 1], pts[n - 2])
  return [...pts.slice(0, n - 2), moved(pts[n - 2]), moved(a), a, pts[n - 1]]
}

/** The connector with segment `index` of its route dragged to `value` (other dragged segments stay). */
export function pinSegment(c: ConnectorObject, lookup: Lookup, index: number, value: number): ConnectorObject {
  const auto = autoRoute(c, lookup)
  const cur = currentRoute(c, lookup)
  if (!auto || !cur || !cur.pinnable) return c
  const pts = cur.points
  const last = pts.length - 2
  if (index < 0 || index > last) return c
  const axis = segmentAxis(pts[index], pts[index + 1])
  if (!axis) return c
  // An end's own segment: jog out of the end; the route becomes the user's own.
  if (index === 0 || index === last) {
    const own = segmentsOf(simplify(jog(pts, index, axis, value)))
    return own ? { ...c, pins: { at: own } } : c
  }
  // A route the user shaped keeps every segment; the dragged one takes the new value.
  if (cur.own) {
    const own = segmentsOf(pts)
    if (!own) return c
    own[index] = pinOf(axis, value)
    return { ...c, pins: { at: own } }
  }
  const ap = auto.points
  const kept = c.pins ? pinsFor(ap, c.pins) : null
  const at = ap.slice(1).map((_, i): SegmentPin | null => (i === index ? pinOf(axis, value) : (kept?.[i] ?? null)))
  return { ...c, pins: { at } }
}

/** Pins of a connector moved by (dx, dy) along with both its ends. */
export function shiftPins(pins: SegmentPins, dx: number, dy: number): SegmentPins {
  return { at: pins.at.map((p) => (!p ? null : 'x' in p ? { x: p.x + dx } : { y: p.y + dy })) }
}

export interface SegmentHandle {
  /** Middle of the segment. */
  at: Point
  axis: 'x' | 'y'
  /** Current coordinate on `axis`. */
  value: number
  /** Position along the route (0 = the segment leaving the start). */
  index: number
}

export interface ConnectorHandles {
  /** Start and end of the line (on the outline for attached ends). */
  ends: [Point, Point]
  /** One handle per segment of an elbow route. */
  segments: SegmentHandle[]
}

/** Shortest segment that gets a handle. */
const MIN_HANDLE_SEGMENT = 24

/**
 * Handles of a selected connector. A segment under the label (`label`, its box) gets one handle
 * on each side of it, in the middle of the part left showing.
 */
export function connectorHandles(c: ConnectorObject, lookup: Lookup, label?: Rect | null): ConnectorHandles | null {
  const r = currentRoute(c, lookup)
  if (!r || r.points.length < 2) return null
  const pts = r.points
  const segments: SegmentHandle[] = []
  if (c.kind === 'elbow' && r.pinnable) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      const axis = segmentAxis(a, b)
      if (!axis) continue
      const run = across(axis)
      const lo = Math.min(a[run], b[run])
      const hi = Math.max(a[run], b[run])
      // The parts of the segment the label leaves showing.
      let parts: [number, number][] = [[lo, hi]]
      if (label) {
        const side = axis === 'x' ? [label.x, label.x + label.w] : [label.y, label.y + label.h]
        const along = run === 'x' ? [label.x, label.x + label.w] : [label.y, label.y + label.h]
        if (a[axis] >= side[0] && a[axis] <= side[1] && along[1] > lo && along[0] < hi) {
          parts = [[lo, along[0]], [along[1], hi]]
        }
      }
      for (const [p, q] of parts) {
        if (q - p < MIN_HANDLE_SEGMENT) continue
        const at = run === 'x' ? { x: (p + q) / 2, y: a.y } : { x: a.x, y: (p + q) / 2 }
        segments.push({ at, axis, value: a[axis], index: i })
      }
    }
  }
  return { ends: [pts[0], pts[pts.length - 1]], segments }
}

const DIR_SIDE: Record<Dir, Side> = { up: 'top', right: 'right', down: 'bottom', left: 'left' }

/** Width of a self message's loop. */
const SELF_LOOP = 40
/** Space between a self message's loop and its label. */
const LABEL_GAP = 6

function isSelfMessage(c: ConnectorObject): boolean {
  return 'objectId' in c.from && 'objectId' in c.to && c.from.objectId === c.to.objectId && c.from.dy !== undefined && c.to.dy !== undefined
}

/** Ends on a shape's outline keep a gap; free points and lifeline points don't. */
function endGap(e: Endpoint): number {
  if (!('objectId' in e)) return 0
  return e.dy === undefined ? END_GAP : MESSAGE_GAP
}

/** Messages stop this far from the lifeline's center (its 2px half-width plus 4px). */
const MESSAGE_GAP = 6
/** Sequence diagram lines (lifelines and messages) are 4px wide. */
export const SEQUENCE_LINE_WIDTH = 4

/** A message between lifelines (both ends anchored by height). */
export function isMessage(c: ConnectorObject): boolean {
  return 'objectId' in c.from && 'objectId' in c.to && c.from.dy !== undefined && c.to.dy !== undefined
}

/** Straight connector: from the pinned point (or center) towards the target, clipped to outlines. */
function straightLine(from: ResolvedEnd, to: ResolvedEnd): Point[] {
  const a = from.rect && !from.dir ? center(from.rect) : from.point
  const b = to.rect && !to.dir ? center(to.rect) : to.point
  const start = from.rect && !from.dir ? clipToRect(b, a, from.rect) : a
  const end = to.rect && !to.dir ? clipToRect(start, b, to.rect) : b
  return [start, end]
}

/** Pieces a curved line is drawn (and hit, and labelled) with: smooth at any zoom. */
const CURVE_STEPS = 32
const DIR_VEC: Record<Dir, Point> = { right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, down: { x: 0, y: 1 }, up: { x: 0, y: -1 } }

/**
 * A curved line: a cubic Bézier that leaves each attached end straight out of its side (a
 * floating end from the side facing the other end; a free point heads for the other end), its
 * handles a third of the distance long (at least 40px). As a fine polyline.
 */
function curvedLine(from: ResolvedEnd, to: ResolvedEnd): Point[] {
  const aimAt = (e: ResolvedEnd) => (e.rect && !e.dir ? center(e.rect) : e.point)
  const end = (e: ResolvedEnd, other: ResolvedEnd): { p: Point; dir: Dir | null } => {
    if (e.dir || !e.rect) return { p: e.point, dir: e.dir }
    const dir = facingDir(center(e.rect), aimAt(other))
    return { p: sidePoint(e.rect, DIR_SIDE[dir]), dir }
  }
  const a = end(from, to)
  const b = end(to, from)
  const dist = Math.hypot(b.p.x - a.p.x, b.p.y - a.p.y)
  const reach = Math.max(40, dist / 3)
  const toward = (p: Point, q: Point): Point => (dist > 0 ? { x: (q.x - p.x) / dist, y: (q.y - p.y) / dist } : { x: 0, y: 0 })
  const va = a.dir ? DIR_VEC[a.dir] : toward(a.p, b.p)
  const vb = b.dir ? DIR_VEC[b.dir] : toward(b.p, a.p)
  const c1 = { x: a.p.x + va.x * reach, y: a.p.y + va.y * reach }
  const c2 = { x: b.p.x + vb.x * reach, y: b.p.y + vb.y * reach }
  const pts: Point[] = []
  for (let i = 0; i <= CURVE_STEPS; i++) {
    const t = i / CURVE_STEPS
    const u = 1 - t
    pts.push({
      x: u * u * u * a.p.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.p.x,
      y: u * u * u * a.p.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.p.y,
    })
  }
  return pts
}

/** Point where the segment from `outside` to `inside` (a rect's center) crosses the rect border. */
function clipToRect(outside: Point, inside: Point, r: Rect): Point {
  const dx = outside.x - inside.x
  const dy = outside.y - inside.y
  if (dx === 0 && dy === 0) return inside
  const tx = dx !== 0 ? r.w / 2 / Math.abs(dx) : Infinity
  const ty = dy !== 0 ? r.h / 2 / Math.abs(dy) : Infinity
  const t = Math.min(tx, ty, 1)
  return { x: inside.x + dx * t, y: inside.y + dy * t }
}

// ---- measurements ------------------------------------------------------------------

export function polylineLength(pts: Point[]): number {
  let len = 0
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  return len
}

export function pointAtLength(pts: Point[], target: number): Point {
  let acc = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const seg = Math.hypot(b.x - a.x, b.y - a.y)
    if (acc + seg >= target && seg > 0) {
      const t = (target - acc) / seg
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
    acc += seg
  }
  return pts[pts.length - 1]
}

/** How far along the polyline the point nearest `p` is. */
export function lengthAtPoint(pts: Point[], p: Point): number {
  let acc = 0
  let best = Infinity
  let at = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const seg = Math.hypot(dx, dy)
    const t = seg > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (seg * seg))) : 0
    const d = Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y)
    if (d < best) {
      best = d
      at = acc + seg * t
    }
    acc += seg
  }
  return at
}

/** Shorten the polyline by `startCut` at the start and `endCut` at the end. */
export function trim(pts: Point[], startCut: number, endCut: number): Point[] {
  const len = polylineLength(pts)
  if (len <= startCut + endCut + 1) return pts
  const out: Point[] = [pointAtLength(pts, startCut)]
  let acc = 0
  for (let i = 1; i < pts.length - 1; i++) {
    acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    if (acc > startCut && acc < len - endCut) out.push(pts[i])
  }
  out.push(pointAtLength(pts, len - endCut))
  return out
}

export function distanceToPolyline(p: Point, pts: Point[]): number {
  let best = Infinity
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const l2 = dx * dx + dy * dy
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)))
  }
  return best
}

export function polylineBounds(pts: Point[]): Rect {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

/**
 * SVG path data with rounded corners (radius 15, limited by half of the adjacent segments).
 * Shared by the canvas (through Path2D) and SVG export.
 */
export function roundedPathData(pts: Point[]): string {
  if (pts.length === 0) return ''
  const n = (v: number) => Math.round(v * 100) / 100
  let d = `M${n(pts[0].x)} ${n(pts[0].y)}`
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const c = pts[i + 1]
    const la = Math.hypot(b.x - a.x, b.y - a.y)
    const lc = Math.hypot(c.x - b.x, c.y - b.y)
    const r = Math.min(CORNER_RADIUS, la / 2, lc / 2)
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (r <= 0 || la === 0 || lc === 0 || Math.abs(cross) < 1e-9) {
      d += `L${n(b.x)} ${n(b.y)}`
      continue
    }
    // Tangent points sit r / tan(θ/2) from the corner, θ being the angle between the legs.
    const cos = ((a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y)) / (la * lc)
    const theta = Math.acos(Math.max(-1, Math.min(1, cos)))
    const t = Math.min(r / Math.tan(theta / 2), la / 2, lc / 2)
    const p1 = { x: b.x + ((a.x - b.x) / la) * t, y: b.y + ((a.y - b.y) / la) * t }
    const p2 = { x: b.x + ((c.x - b.x) / lc) * t, y: b.y + ((c.y - b.y) / lc) * t }
    const radius = t * Math.tan(theta / 2)
    d += `L${n(p1.x)} ${n(p1.y)}A${n(radius)} ${n(radius)} 0 0 ${cross > 0 ? 1 : 0} ${n(p2.x)} ${n(p2.y)}`
  }
  const last = pts[pts.length - 1]
  return d + `L${n(last.x)} ${n(last.y)}`
}

export function roundedPath(pts: Point[]): Path2D {
  return new Path2D(roundedPathData(pts))
}

export interface ConnectorGeometry {
  /** Visible polyline: trimmed by END_GAP at attached ends. */
  points: Point[]
  /** Label anchor: on the visible line, the middle unless moved (left-middle of the label when `labelBeside`). */
  labelAt: Point
  /** The label sits to the right of `labelAt` instead of centered on it (self messages). */
  labelBeside?: boolean
}

/** Center of a label box `width` wide. */
export function labelCenter(g: ConnectorGeometry, width: number): Point {
  return g.labelBeside ? { x: g.labelAt.x + width / 2, y: g.labelAt.y } : g.labelAt
}

/**
 * Geometry by line, with the objects at its ends it was worked out for: a line's route depends
 * only on itself and them, and every object is replaced (never changed) when edited.
 */
const geometries = new WeakMap<ConnectorObject, { from: BoardObject | undefined; to: BoardObject | undefined; g: ConnectorGeometry | null }>()

export function connectorGeometry(c: ConnectorObject, lookup: Lookup): ConnectorGeometry | null {
  const from = 'objectId' in c.from ? lookup(c.from.objectId) : undefined
  const to = 'objectId' in c.to ? lookup(c.to.objectId) : undefined
  const known = geometries.get(c)
  if (known && known.from === from && known.to === to) return known.g
  const g = computeGeometry(c, lookup)
  geometries.set(c, { from, to, g })
  return g
}

/**
 * Where a line can be at most, from its ends alone (without routing it): the ends' boxes with
 * room for going round them and for a label. Null when that can't be told (dragged segments).
 */
export function connectorReach(c: ConnectorObject, lookup: Lookup): Rect | null {
  if (c.pins) return null
  const box = (e: Endpoint): Rect | null => {
    if ('point' in e) return { x: e.point.x, y: e.point.y, w: 0, h: 0 }
    const o = lookup(e.objectId)
    if (!isShape(o)) return null
    // A lifeline point (dy) can be anywhere down the actor's lifeline.
    return e.dy !== undefined ? { x: o.x, y: o.y, w: o.w, h: Math.max(o.h, e.dy) } : o
  }
  const a = box(c.from)
  const b = box(c.to)
  if (!a || !b) return null
  const pad = c.label ? 160 : 70
  const x = Math.min(a.x, b.x) - pad
  const y = Math.min(a.y, b.y) - pad
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) + pad - x, h: Math.max(a.y + a.h, b.y + b.h) + pad - y }
}

function computeGeometry(c: ConnectorObject, lookup: Lookup): ConnectorGeometry | null {
  const raw = connectorPolyline(c, lookup)
  if (!raw || raw.length < 2) return null
  const points = trim(raw, endGap(c.from), endGap(c.to))
  if (isSelfMessage(c) && points.length === 4) {
    // Beside the loop's far side, so the label doesn't cover it.
    return { points, labelAt: { x: points[1].x + LABEL_GAP, y: (points[1].y + points[2].y) / 2 }, labelBeside: true }
  }
  return { points, labelAt: pointAtLength(points, polylineLength(points) * (c.labelPos ?? 0.5)) }
}
