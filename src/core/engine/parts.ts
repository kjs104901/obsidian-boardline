// Drawing parts: rects, ellipses, paths and text in board coordinates, drawn the same way by the
// canvas renderer and the SVG export (tables, and pictures that haven't loaded).

import type { ShapeObject } from '../board/model'
import { themeMode } from '../theme/palette'
import { FONT_FAMILY } from './text'
import type { RichLayout } from './richLayout'

export type Part =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; r?: number; fill?: string; stroke?: string; width?: number; dash?: number[] }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill?: string; stroke?: string; width?: number }
  | { kind: 'path'; d: string; fill?: string; stroke?: string; width?: number }
  | { kind: 'text'; x: number; y: number; text: string; size: number; color: string; align: 'left' | 'center'; bold?: boolean; underline?: boolean }
  /** Laid-out text with marks, its top-left at x/y. */
  | { kind: 'rich'; x: number; y: number; layout: RichLayout; color: string }

export const fontOf = (size: number, bold = false) => `${bold ? '600 ' : ''}${size}px ${FONT_FAMILY}`

/** A picture that is loading or can't be read: a gray surface with a picture icon in the middle. */
export function imagePlaceholder(o: ShapeObject): Part[] {
  const dark = themeMode() === 'dark'
  const surface = dark ? 'oklch(50% 0 0)' : 'oklch(92% 0 0)'
  const icon = 'oklch(74% 0 0)'
  const { x, y, w, h } = o
  const s = Math.min(w, h) * 0.3
  const ix = x + w / 2 - s / 2
  const iy = y + h / 2 - s / 2
  return [
    { kind: 'rect', x, y, w, h, fill: surface },
    { kind: 'rect', x: ix, y: iy, w: s, h: s, r: s * 0.12, fill: icon },
    {
      kind: 'path',
      d: `M${ix + s * 0.12} ${iy + s * 0.82}L${ix + s * 0.38} ${iy + s * 0.48}L${ix + s * 0.58} ${iy + s * 0.68}L${ix + s * 0.7} ${iy + s * 0.56}L${ix + s * 0.88} ${iy + s * 0.82}Z`,
      fill: surface,
    },
    { kind: 'ellipse', cx: ix + s * 0.33, cy: iy + s * 0.3, rx: s * 0.09, ry: s * 0.09, fill: surface },
  ]
}
