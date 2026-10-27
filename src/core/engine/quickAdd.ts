// Quick-add placement: a new shape goes four grid steps away in the chosen direction; if that
// spot is taken it moves two steps past the blocking shapes, sideways. Sections are backdrops:
// quick add puts shapes on them, and the section a shape starts in grows to keep the new one.

import type { ShapeObject, Side } from '../board/model'
import { GRID, containsRect, unionRects, type Rect } from './geometry'
import { canHold } from './sections'

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
 * `spacing.gap` away and `spacing.aside` apart from what is in the way. Shapes in `connected`
 * are only stepped around, never joined.
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
  const others = shapes.filter((s) => s.id !== source.id && s.shape !== 'section')
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

/**
 * The sections under `source` grown where the new shape at `rect` would stick out of them
 * (so they still carry it), innermost first. Each grows past it by the room it leaves around
 * what it holds on that side, at least a grid step and at most `most`. Locked ones stay.
 */
export function growSections(source: ShapeObject, rect: Rect, shapes: ShapeObject[], most: number): ShapeObject[] {
  const holding = shapes
    .filter((o) => o.shape === 'section' && !o.locked && canHold(o, source, source))
    .sort((a, b) => a.w * a.h - b.w * b.h)
  const done: { before: ShapeObject; after: ShapeObject }[] = []
  for (const s of holding) {
    const inner = done.filter((d) => containsRect(s, d.before))
    const need = unionRects([rect, ...inner.map((d) => d.after)])!
    const held = [source, ...inner.map((d) => d.before)]
    const room = (gap: (r: Rect) => number) => Math.min(most, Math.max(GRID, Math.min(...held.map(gap))))
    const x0 = need.x < s.x ? need.x - room((r) => r.x - s.x) : s.x
    const y0 = need.y < s.y ? need.y - room((r) => r.y - s.y) : s.y
    const x1 = need.x + need.w > s.x + s.w ? need.x + need.w + room((r) => s.x + s.w - r.x - r.w) : s.x + s.w
    const y1 = need.y + need.h > s.y + s.h ? need.y + need.h + room((r) => s.y + s.h - r.y - r.h) : s.y + s.h
    const w = x1 - x0
    const h = y1 - y0
    done.push({ before: s, after: w === s.w && h === s.h ? s : { ...s, x: x0, y: y0, w, h, idealW: w, idealH: h } })
  }
  return done.filter((d) => d.after !== d.before).map((d) => d.after)
}
