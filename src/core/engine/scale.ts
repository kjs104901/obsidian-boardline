// Scaling several selected objects together: the selection's box is dragged by a corner or an
// edge, and everything in it grows or shrinks by the same factors about a fixed point (the
// opposite corner or edge, or the middle), keeping its place relative to the rest.

import { ACTOR_STEM, isConnector, isMindmap, isShape, type BoardObject, type Endpoint, type SegmentPins, type ShapeObject } from '../board/model'
import { scaleStroke } from './freehand'
import type { Point } from './geometry'
import type { MeasureAt } from './text'
import { autosizeShape } from './textLayout'

/** Shapes that size themselves (a table by its columns, a link by its text): scaling moves them. */
const KEEP_SIZE = new Set(['table', 'link'])
/** Shapes that keep their proportions (pictures, icons). */
const KEEP_RATIO = new Set(['image', 'icon'])

/** How far each axis can shrink: every scaled shape stays at least `min` across (1 if one already is smaller). */
export function minScales(objects: Iterable<BoardObject>, min: number): { x: number; y: number } {
  let x = 0
  let y = 0
  for (const o of objects) {
    if (!isShape(o) || KEEP_SIZE.has(o.shape) || o.shape === 'freehand') continue
    if (o.w > 0) x = Math.max(x, min / o.w)
    if (o.h > 0 && o.shape !== 'text') y = Math.max(y, min / o.h)
  }
  return { x: Math.min(1, x), y: Math.min(1, y) }
}

/**
 * `o` scaled by `sx` across and `sy` down about `anchor`. `scaled` holds the ids being scaled
 * together (a message's place on a lifeline scales with its actors).
 */
export function scaleObject(o: BoardObject, anchor: Point, sx: number, sy: number, scaled: ReadonlySet<string>, measureAt: MeasureAt): BoardObject {
  const atX = (v: number) => Math.round(anchor.x + (v - anchor.x) * sx)
  const atY = (v: number) => Math.round(anchor.y + (v - anchor.y) * sy)
  if (isMindmap(o)) return o.parentId ? o : { ...o, x: atX(o.x), y: atY(o.y) }
  if (isConnector(o)) {
    const end = (e: Endpoint): Endpoint => {
      if ('point' in e) return { point: { x: atX(e.point.x), y: atY(e.point.y) } }
      return e.dy !== undefined && scaled.has(e.objectId) ? { ...e, dy: Math.round(e.dy * sy) } : e
    }
    const pins = (p: SegmentPins): SegmentPins => ({ ...p, at: p.at.map((v) => (!v ? null : 'x' in v ? { x: atX(v.x) } : { y: atY(v.y) })) })
    return { ...o, from: end(o.from), to: end(o.to), ...(o.pins ? { pins: pins(o.pins) } : {}) }
  }
  return scaleShape(o, anchor, sx, sy, measureAt)
}

function scaleShape(o: ShapeObject, anchor: Point, sx: number, sy: number, measureAt: MeasureAt): ShapeObject {
  const cx = anchor.x + (o.x + o.w / 2 - anchor.x) * sx
  const cy = anchor.y + (o.y + o.h / 2 - anchor.y) * sy
  // Same size, moved with its middle.
  if (KEEP_SIZE.has(o.shape)) return { ...o, x: Math.round(cx - o.w / 2), y: Math.round(cy - o.h / 2) }
  if (KEEP_RATIO.has(o.shape)) {
    // Its proportions stay: the axis being stretched sets the size (the smaller when both are).
    const k = sx === 1 ? sy : sy === 1 ? sx : Math.min(sx, sy)
    const w = Math.max(1, Math.round(o.w * k))
    const h = Math.max(1, Math.round(o.h * k))
    return { ...o, x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h, idealW: w, idealH: h }
  }
  const x = Math.round(anchor.x + (o.x - anchor.x) * sx)
  const y = Math.round(anchor.y + (o.y - anchor.y) * sy)
  const w = Math.max(1, Math.round(o.w * sx))
  const h = Math.max(1, Math.round(o.h * sy))
  if (o.shape === 'freehand') return scaleStroke(o, x, y, w, h)
  // Text takes the width and wraps in it; its height follows the lines.
  if (o.shape === 'text') return autosizeShape({ ...o, x, y, w, idealW: w, fixedWidth: true }, measureAt)
  const stem = o.shape === 'actor' ? { stem: Math.round((o.stem ?? ACTOR_STEM) * sy) } : {}
  return autosizeShape({ ...o, x, y, w, h, idealW: w, idealH: h, ...stem }, measureAt)
}
