// Scaling several selected objects together: the selection's box is dragged by a corner and
// everything in it grows or shrinks by the same factor about the opposite corner, so shapes keep
// their proportions and their places relative to each other.

import { ACTOR_STEM, isConnector, isMindmap, isShape, type BoardObject, type Endpoint, type SegmentPins, type ShapeObject } from '../board/model'
import { scaleStroke } from './freehand'
import type { Point } from './geometry'
import type { MeasureAt } from './text'
import { autosizeShape } from './textLayout'

/** Shapes that size themselves (a table by its columns, a link by its text): scaling moves them. */
const KEEP_SIZE = new Set(['table', 'link'])

/** The smallest factor that keeps every scaled shape at least `min` across (1 if one already is smaller). */
export function minScale(objects: Iterable<BoardObject>, min: number): number {
  let s = 0
  for (const o of objects) {
    if (!isShape(o) || KEEP_SIZE.has(o.shape) || o.shape === 'freehand') continue
    const side = o.shape === 'text' ? o.w : Math.min(o.w, o.h)
    if (side > 0) s = Math.max(s, min / side)
  }
  return Math.min(1, s)
}

/**
 * `o` scaled by `s` about `anchor`. `scaled` holds the ids being scaled together (a message's
 * place on a lifeline scales with its actors).
 */
export function scaleObject(o: BoardObject, anchor: Point, s: number, scaled: ReadonlySet<string>, measureAt: MeasureAt): BoardObject {
  const at = (v: number, a: number) => Math.round(a + (v - a) * s)
  if (isMindmap(o)) return o.parentId ? o : { ...o, x: at(o.x, anchor.x), y: at(o.y, anchor.y) }
  if (isConnector(o)) {
    const end = (e: Endpoint): Endpoint => {
      if ('point' in e) return { point: { x: at(e.point.x, anchor.x), y: at(e.point.y, anchor.y) } }
      return e.dy !== undefined && scaled.has(e.objectId) ? { ...e, dy: Math.round(e.dy * s) } : e
    }
    const pins = (p: SegmentPins): SegmentPins => ({ ...p, at: p.at.map((v) => (!v ? null : 'x' in v ? { x: at(v.x, anchor.x) } : { y: at(v.y, anchor.y) })) })
    return { ...o, from: end(o.from), to: end(o.to), ...(o.pins ? { pins: pins(o.pins) } : {}) }
  }
  return scaleShape(o, anchor, s, measureAt)
}

function scaleShape(o: ShapeObject, anchor: Point, s: number, measureAt: MeasureAt): ShapeObject {
  if (KEEP_SIZE.has(o.shape)) {
    // Same size, moved with its middle.
    const cx = anchor.x + (o.x + o.w / 2 - anchor.x) * s
    const cy = anchor.y + (o.y + o.h / 2 - anchor.y) * s
    return { ...o, x: Math.round(cx - o.w / 2), y: Math.round(cy - o.h / 2) }
  }
  const x = Math.round(anchor.x + (o.x - anchor.x) * s)
  const y = Math.round(anchor.y + (o.y - anchor.y) * s)
  const w = Math.max(1, Math.round(o.w * s))
  const h = Math.max(1, Math.round(o.h * s))
  if (o.shape === 'freehand') return scaleStroke(o, x, y, w, h)
  // Text takes the width and wraps in it; its height follows the lines.
  if (o.shape === 'text') return autosizeShape({ ...o, x, y, w, idealW: w, fixedWidth: true }, measureAt)
  const stem = o.shape === 'actor' ? { stem: Math.round((o.stem ?? ACTOR_STEM) * s) } : {}
  return autosizeShape({ ...o, x, y, w, h, idealW: w, idealH: h, ...stem }, measureAt)
}
