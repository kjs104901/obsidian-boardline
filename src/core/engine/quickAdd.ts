// Quick-add placement: a new shape goes four grid steps away in the chosen direction; if that
// spot is taken it moves two steps past the blocking shapes, sideways.

import type { ShapeObject, Side } from '../board/model'
import { GRID, unionRects, type Rect } from './geometry'

export const QUICK_ADD_GAP = 80
export const QUICK_ADD_SIBLING_GAP = 40
const MAX_ATTEMPTS = 30

/** Direction to step aside when the spot is taken: rows grow downwards, columns to the right. */
const ASIDE: Record<Side, Side> = { right: 'bottom', left: 'bottom', bottom: 'right', top: 'right' }

export interface QuickAddPlan {
  rect: Rect
  /** An unconnected shape already sitting at the spot: connect to it instead of creating one. */
  existingId: string | null
}

/** Place a rect of `size` next to `from` on `side`, `gap` away. */
function placeNext(from: Rect, size: { w: number; h: number }, side: Side, gap: number, base: Rect): Rect {
  switch (side) {
    case 'right':
      return { ...base, x: from.x + from.w + gap, w: size.w, h: size.h }
    case 'left':
      return { ...base, x: from.x - gap - size.w, w: size.w, h: size.h }
    case 'bottom':
      return { ...base, y: from.y + from.h + gap, w: size.w, h: size.h }
    case 'top':
      return { ...base, y: from.y - gap - size.h, w: size.w, h: size.h }
  }
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/**
 * Room beside `source` on `side` for a shape the size of `size` (the source itself by default),
 * `spacing.gap` away and `spacing.aside` apart from what is in the way.
 */
export function planQuickAdd(
  source: ShapeObject,
  side: Side,
  shapes: ShapeObject[],
  connected: ReadonlySet<string>,
  size: { w: number; h: number } = source,
  spacing = { gap: QUICK_ADD_GAP, aside: QUICK_ADD_SIBLING_GAP },
): QuickAddPlan {
  // A shape of another size lines up with the source's middle (on the grid).
  const across = (from: number, len: number, own: number) => from + Math.round((len - own) / 2 / GRID) * GRID
  const base = { ...source, x: across(source.x, source.w, size.w), y: across(source.y, source.h, size.h) }
  let rect = placeNext(source, { w: size.w, h: size.h }, side, spacing.gap, base)
  const others = shapes.filter((s) => s.id !== source.id)
  let blocking = others.filter((o) => overlaps(o, rect))

  const reusable = blocking.find((o) => !connected.has(o.id))
  if (reusable) return { rect: reusable, existingId: reusable.id }

  const aside = ASIDE[side]
  for (let i = 0; i < MAX_ATTEMPTS && blocking.length > 0; i++) {
    rect = placeNext(unionRects(blocking)!, size, aside, spacing.aside, rect)
    const more = others.filter((o) => overlaps(o, rect) && !blocking.includes(o))
    if (more.length === 0) break
    blocking = [...blocking, ...more]
  }
  return { rect, existingId: null }
}
