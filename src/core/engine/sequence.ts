// Sequence diagrams: actors are boxes with a lifeline below;
// messages are connectors whose ends sit on lifelines at a height `dy` below the actor's top.

import { ACTOR_STEM, isShape, type BoardObject, type ShapeObject, type Side } from '../board/model'
import { GRID, snap, type Point, type Rect } from './geometry'

export { ACTOR_STEM }
/** Gap between an actor and one added beside it (four grid steps). */
export const ACTOR_GAP = 80
export const MIN_STEM = GRID * 4
/** Messages keep this far below the actor box. */
const MESSAGE_MARGIN = GRID

export function isActor(o: BoardObject | undefined | null): o is ShapeObject {
  return isShape(o) && o.shape === 'actor'
}

export function stemOf(a: ShapeObject): number {
  return a.stem ?? ACTOR_STEM
}

/** Box plus lifeline. */
export function actorBounds(a: ShapeObject): Rect {
  return { x: a.x, y: a.y, w: a.w, h: a.h + stemOf(a) }
}

export interface Lifeline {
  x: number
  top: number
  bottom: number
}

export function lifeline(a: ShapeObject): Lifeline {
  return { x: a.x + a.w / 2, top: a.y + a.h, bottom: a.y + a.h + stemOf(a) }
}

/** Grid-snapped message height for board y `y`, kept on the lifeline. */
export function messageDy(a: ShapeObject, y: number): number {
  const lo = a.h + MESSAGE_MARGIN
  const hi = a.h + stemOf(a)
  return Math.min(hi, Math.max(lo, snap(y - a.y)))
}

/** The actor whose lifeline (not box) passes within `tolerance` of `p`, topmost first. */
export function lifelineAt(objects: BoardObject[], p: Point, tolerance: number): ShapeObject | null {
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i]
    if (!isActor(o)) continue
    const l = lifeline(o)
    if (Math.abs(p.x - l.x) <= tolerance && p.y >= l.top && p.y <= l.bottom + tolerance) return o
  }
  return null
}

/** Nearest other actor in direction `dir` whose lifeline reaches board height `y`. */
export function neighbourActor(objects: BoardObject[], from: ShapeObject, y: number, dir: 1 | -1): ShapeObject | null {
  const x0 = lifeline(from).x
  let best: ShapeObject | null = null
  for (const o of objects) {
    if (!isActor(o) || o.id === from.id) continue
    const l = lifeline(o)
    if (y < l.top || y > l.bottom || (l.x - x0) * dir <= 0) continue
    if (!best || Math.abs(l.x - x0) < Math.abs(lifeline(best).x - x0)) best = o
  }
  return best
}

/** Where a new actor goes beside `a`: 96px away, stepping further past actors already there. */
export function actorSlot(a: ShapeObject, side: Side, objects: BoardObject[]): Point {
  const dir = side === 'left' ? -1 : 1
  const step = a.w + ACTOR_GAP
  const taken = (x: number) =>
    objects.some((o) => isActor(o) && o.id !== a.id && o.x < x + a.w && o.x + o.w > x && o.y < a.y + a.h && o.y + o.h > a.y)
  let x = a.x + dir * step
  while (taken(x)) x += dir * step
  return { x, y: a.y }
}
