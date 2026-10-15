// Icons on the board: standalone icon objects (X) and icons inside shapes, drawn from the
// icon library's path data on canvas and in SVG export.

import type { ShapeObject } from '../board/model'
import { ICON_BOX, iconPaths, type IconStyle } from '../icons/iconData'
import { strokeColor, textColor, theme } from '../theme/palette'
import type { Rect } from './geometry'

export interface IconLayer {
  d: string
  color: string
}

export interface IconDrawing {
  /** Where the 256×256 icon box goes. */
  rect: Rect
  layers: IconLayer[]
}

/** Icon objects default to the duotone look, icons in shapes to solid. */
export function iconStyleOf(o: ShapeObject): IconStyle {
  return o.iconStyle ?? (o.shape === 'icon' ? 'color' : 'fill')
}

/**
 * The icon of `o` placed in `rect`: a shape's icon takes the text color, an icon object its own
 * color. In the duotone look the translucent layer takes the color and the lines the text color.
 * Null while the icon data is still loading.
 */
export function iconDrawing(o: ShapeObject, rect: Rect): IconDrawing | null {
  if (!o.icon) return null
  const style = iconStyleOf(o)
  const paths = iconPaths(o.icon, style)
  if (!paths) return null
  const standalone = o.shape === 'icon'
  const accent = strokeColor(o.color)
  const ink = standalone ? (style === 'color' ? theme.text : accent) : textColor(o.color, o.deco)
  return {
    rect,
    layers: paths.map((p) => (p.startsWith('~') ? { d: p.slice(1), color: style === 'color' ? accent : ink } : { d: p, color: ink })),
  }
}

const cache = new Map<string, Path2D>()

/** Draw an icon on a canvas context. */
export function drawIcon(ctx: CanvasRenderingContext2D, icon: IconDrawing): void {
  ctx.save()
  ctx.translate(icon.rect.x, icon.rect.y)
  ctx.scale(icon.rect.w / ICON_BOX, icon.rect.h / ICON_BOX)
  for (const l of icon.layers) {
    let path = cache.get(l.d)
    if (!path) {
      path = new Path2D(l.d)
      if (cache.size > 2000) cache.clear()
      cache.set(l.d, path)
    }
    ctx.fillStyle = l.color
    ctx.fill(path)
  }
  ctx.restore()
}
