// Link objects: a chip (the site icon, then the page title underlined) or a larger preview
// card with the description and picture.

import type { ShapeObject } from '../board/model'
import { hostOf, parseLink } from '../board/links'
import { fillColor, strokeColor, theme } from '../theme/palette'
import type { Rect } from './geometry'
import { wrapText, type MeasureAt } from './text'

export const LINK_ICON = 20
export const LINK_GAP = 8
const CHIP_FONT = 16
const CHIP_LINE = 24
/** Chip titles wrap at this width. */
const CHIP_MAX_TEXT = 420

const CARD_W = 320
const CARD_IMAGE_H = 168
const CARD_PAD = 14
const TITLE_FONT = 16
const TITLE_LINE = 22
const DESC_FONT = 14
const DESC_LINE = 20
const SITE_FONT = 12
const SITE_LINE = 18
const SITE_ICON = 16

export interface LinkText {
  lines: string[]
  x: number
  y: number
  size: number
  lineHeight: number
  color: string
  bold?: boolean
  underline?: boolean
  /** The editable title. */
  title?: boolean
}

export interface LinkDrawing {
  card?: { rect: Rect; fill: string; stroke: string }
  image?: { src: string; rect: Rect }
  icon: { rect: Rect; src?: string; glyph: 'web' | 'board' | 'doc' }
  texts: LinkText[]
}

/** The text a link shows: its own title, else the address' host. */
export function linkTitle(o: ShapeObject): string {
  if (o.text) return o.text
  const t = o.link ? parseLink(o.link) : null
  return t?.kind === 'web' ? hostOf(t.url) : t?.kind === 'doc' ? t.path.replace(/\.md$/i, '') : t ? '보드' : '링크'
}

const clamp = (lines: string[], max: number) => (lines.length > max ? [...lines.slice(0, max - 1), lines[max - 1].replace(/.?$/, '…')] : lines)

/** Where everything of a link object goes. */
export function linkDrawing(o: ShapeObject, measureAt: MeasureAt): LinkDrawing {
  const glyph: 'web' | 'board' | 'doc' = o.link?.startsWith('boardline://doc/') ? 'doc' : o.link?.startsWith('boardline:') ? 'board' : 'web'
  if (!o.expanded) {
    const measure = measureAt(CHIP_FONT)
    const lines = wrapText(linkTitle(o), CHIP_MAX_TEXT, measure)
    return {
      icon: { rect: { x: o.x, y: o.y, w: LINK_ICON, h: LINK_ICON }, src: o.src, glyph },
      texts: [{ lines, x: o.x + LINK_ICON + LINK_GAP, y: o.y, size: CHIP_FONT, lineHeight: CHIP_LINE, color: theme.text, underline: true, title: true }],
    }
  }
  const inner = CARD_W - 2 * CARD_PAD
  let y = o.y
  const image = o.preview?.image ? { src: o.preview.image, rect: { x: o.x, y: o.y, w: CARD_W, h: CARD_IMAGE_H } } : undefined
  if (image) y += CARD_IMAGE_H
  y += CARD_PAD
  const title = clamp(wrapText(linkTitle(o), inner, measureAt(TITLE_FONT)), 2)
  const texts: LinkText[] = [{ lines: title, x: o.x + CARD_PAD, y, size: TITLE_FONT, lineHeight: TITLE_LINE, color: theme.text, bold: true, title: true }]
  y += title.length * TITLE_LINE
  if (o.preview?.description) {
    const desc = clamp(wrapText(o.preview.description, inner, measureAt(DESC_FONT)), 3)
    y += 4
    texts.push({ lines: desc, x: o.x + CARD_PAD, y, size: DESC_FONT, lineHeight: DESC_LINE, color: theme.textDim })
    y += desc.length * DESC_LINE
  }
  y += 8
  const target = o.link ? parseLink(o.link) : null
  const site = o.preview?.site || (target?.kind === 'web' ? hostOf(target.url) : target?.kind === 'doc' ? '문서 링크' : '보드 링크')
  const icon = { rect: { x: o.x + CARD_PAD, y: y + (SITE_LINE - SITE_ICON) / 2, w: SITE_ICON, h: SITE_ICON }, src: o.src, glyph }
  texts.push({ lines: [site], x: o.x + CARD_PAD + SITE_ICON + 6, y, size: SITE_FONT, lineHeight: SITE_LINE, color: theme.textDim })
  y += SITE_LINE + CARD_PAD
  return {
    card: { rect: { x: o.x, y: o.y, w: CARD_W, h: y - o.y }, fill: fillColor(o.color, 'outline'), stroke: strokeColor(o.color) },
    image,
    icon,
    texts,
  }
}

/** Size of a link object from its content. */
export function autosizeLink(o: ShapeObject, measureAt: MeasureAt): ShapeObject {
  const d = linkDrawing(o, measureAt)
  if (d.card) return { ...o, w: d.card.rect.w, h: d.card.rect.h, idealW: d.card.rect.w, idealH: d.card.rect.h }
  const t = d.texts[0]
  const measure = measureAt(CHIP_FONT)
  const w = Math.ceil(LINK_ICON + LINK_GAP + Math.max(1, ...t.lines.map((l) => measure(l))))
  const h = Math.max(LINK_ICON, t.lines.length * CHIP_LINE)
  return { ...o, w, h, idealW: w, idealH: h }
}

/** Glyphs in a 24×24 box, drawn as strokes: a chain link, or a board. */
export const LINK_GLYPHS: Record<'web' | 'board' | 'doc', string> = {
  web: 'M10.5 13.5l3-3M9 8.5l1.6-1.6a3 3 0 0 1 4.3 4.3L13.4 12.8M15 15.5l-1.6 1.6a3 3 0 0 1-4.3-4.3L10.6 11.2',
  board: 'M6.5 6.5h11v11h-11zM9 10h2.5M9 13h6',
  doc: 'M8 5.5h5.5L16.5 8.5v10H8zM13.5 5.5v3h3M10 12h4.5M10 15h4.5',
}

/** Background of the glyph square. */
export const glyphColors = () => ({ background: strokeColor('gray'), ink: theme.canvasBg })

/** Badge on shapes that carry a link: a circle inside the top right corner. */
export function linkBadge(o: ShapeObject): { cx: number; cy: number; r: number } {
  const r = 9
  return { cx: o.x + o.w - r - 5, cy: o.y + r + 5, r }
}
