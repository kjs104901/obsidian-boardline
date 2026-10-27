// Which section an object belongs to (what moves, copies and exports with a section), and
// where a new section goes in the drawing order.

import type { BoardObject, ShapeObject } from '../board/model'
import { containsRect, type Rect } from './geometry'

const area = (r: Rect) => r.w * r.h

/**
 * Whether section `s` may hold `o` (whose box is `r`) when `o` lies inside it. Objects are held
 * by sections beneath them, so a section pasted on top of another doesn't take what was there
 * before; a section is held by a bigger one around it, whichever is drawn first.
 */
export function canHold(s: ShapeObject, o: BoardObject, r: Rect): boolean {
  if (s.id === o.id || !containsRect(s, r)) return false
  if (o.type === 'shape' && o.shape === 'section') return area(s) > area(r) || (area(s) === area(r) && s.z < o.z)
  return s.z < o.z
}

/** The section holding `o` (whose box is `r`): the smallest that may, the one on top when they are alike. */
export function ownerOf(o: BoardObject, r: Rect, sections: ShapeObject[]): ShapeObject | null {
  let owner: ShapeObject | null = null
  for (const s of sections) {
    if (!canHold(s, o, r)) continue
    if (!owner || area(s) < area(owner) || (area(s) === area(owner) && s.z > owner.z)) owner = s
  }
  return owner
}

/**
 * Drawing order for a new section at `r`: behind everything else, but over the sections it lies
 * in (their see-through fill would cover it), and so over the other sections beneath it too.
 */
export function newSectionZ(r: Rect, objects: BoardObject[]): number {
  const zs = objects.map((o) => o.z)
  const bottom = Math.min(0, ...zs) - 1
  const around = objects.filter((o): o is ShapeObject => o.type === 'shape' && o.shape === 'section' && containsRect(o, r) && area(o) > area(r))
  if (around.length === 0) return bottom
  const under = Math.max(...around.map((s) => s.z))
  const next = Math.min(...zs.filter((z) => z > under))
  return Number.isFinite(next) ? (under + next) / 2 : under + 1
}
