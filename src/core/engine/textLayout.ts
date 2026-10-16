import type { Rect } from './geometry'
import { SHAPE_SPECS, isRichKind, type ShapeKind, type ShapeObject, type TextAlign, type TextSize } from '../board/model'
import { centeredText, layoutText, plainLayout, type RichLayout } from './richLayout'
import { FONT_FAMILY, fontCss, type Measure, type MeasureAt } from './text'
import { autosizeTable } from './table'
import { autosizeLink, linkDrawing } from './linkObject'

export { FONT_FAMILY, fontCss, wrapText, type Measure, type MeasureAt } from './text'

// Text on shapes: 16px on 24px lines, like a note in Obsidian.
export const SHAPE_FONT_SIZE = 16
export const SHAPE_LINE_HEIGHT = 24
/** Extra height added around wrapped text when a shape grows to fit it (4 top + 4 bottom). */
export const AUTOSIZE_PADDING = 12
export const shapeFont = () => `${SHAPE_FONT_SIZE}px ${FONT_FAMILY}`

/** Font size and line height of each text size step; m is the board's 16 on 24. */
export const TEXT_SIZE_PX: Record<TextSize, { size: number; line: number }> = {
  s: { size: 12, line: 18 },
  m: { size: SHAPE_FONT_SIZE, line: SHAPE_LINE_HEIGHT },
  l: { size: 20, line: 28 },
  xl: { size: 28, line: 36 },
  xxl: { size: 40, line: 48 },
}

// Connector labels.
export const LABEL_FONT_SIZE = 16
export const LABEL_LINE_HEIGHT = 24
export const LABEL_MAX_WIDTH = 260
export const LABEL_PADDING = 6
export const labelFont = () => `${LABEL_FONT_SIZE}px ${FONT_FAMILY}`

/** A line's label: its words (with marks) centered, and the backing box's size around them. */
export function labelLayout(label: string, measureAt: MeasureAt): { rich: RichLayout; w: number; h: number } {
  const rich = centeredText(label, LABEL_MAX_WIDTH, { size: LABEL_FONT_SIZE, line: LABEL_LINE_HEIGHT, inline: true }, measureAt)
  return { rich, w: Math.ceil(rich.width) + LABEL_PADDING * 2, h: Math.max(rich.height, LABEL_LINE_HEIGHT) + LABEL_PADDING }
}

export interface ShapeTextLayout {
  /** The text laid out from the box's top-left corner. */
  rich: RichLayout
  /** Box the text is laid out in (board coords). */
  box: Rect
  /** A shape's icon, above the text. */
  icon?: Rect
  /** The text size and line height (headings in it are bigger). */
  fontSize: number
  lineHeight: number
  align: TextAlign
}

/** A shape's Markdown text laid out at `wrap` wide, aligned within `alignWidth`. */
export const richText = layoutText

/** A text object's layout: wrapped at its wrap width, aligned within the width it takes up. */
function freeText(o: ShapeObject, measureAt: MeasureAt): RichLayout {
  const { size, line } = TEXT_SIZE_PX[o.textSize ?? 'm']
  const align = o.align ?? 'left'
  const wrap = textWrapWidth(o)
  if (align === 'left' || o.fixedWidth) return richText(o.text, wrap, { size, line, align }, measureAt)
  const natural = richText(o.text, wrap, { size, line, align: 'left' }, measureAt).width
  return richText(o.text, wrap, { size, line, align }, measureAt, Math.ceil(natural))
}

const plain = (lines: string[], size: number, line: number, align: TextAlign, width: number, measureAt: MeasureAt) => plainLayout(lines, { size, line, align }, width, measureAt)

/** Icons in shapes: 32×32 above the text, 4px apart, the pair centered. */
export const SHAPE_ICON_SIZE = 32
export const SHAPE_ICON_GAP = 4
/** Labels of icon objects sit under the icon and wrap at least at this width. */
const ICON_LABEL_WIDTH = 200

/** Free text objects wrap at this width unless their width was set by hand. */
export const TEXT_MAX_WIDTH = 600
/** Sticky notes shrink their font to fit, from the largest size down. */
const STICKY_SIZES = [24, 22, 20, 18, 16, 14, 12]
const STICKY_INSET = 16
export const SECTION_TITLE_SIZE = 14
const SECTION_TITLE_LINE = 20
/** Gap between a section's top edge and its title baseline box. */
const SECTION_TITLE_GAP = 6

/** Shapes whose text inset comes from slanted left and right sides. */
const SLANTED_SIDES: ShapeKind[] = ['parallelogram', 'parallelogram-flip', 'trapezoid', 'hexagon', 'triangle']

const quarterTurns = (o: ShapeObject) => Math.round((((o.angle ?? 0) % 360) + 360) % 360 / 90)

/** Left/right text inset; a shape turned on its side has its slanted sides at the top and bottom. */
function textInsetX(o: ShapeObject): number {
  const inset = SHAPE_SPECS[o.shape].textInsetX
  return quarterTurns(o) % 2 === 1 && SLANTED_SIDES.includes(o.shape) ? Math.min(inset, 8) : inset
}

export function textBoxWidth(o: ShapeObject): number {
  return Math.max(1, o.w - 2 * textInsetX(o))
}

/** Vertical middle of the text: a little low in triangles and clouds, below a cylinder's lid. */
function textCenterY(o: ShapeObject): number {
  const turns = quarterTurns(o)
  if (o.shape === 'triangle' && turns === 0) return o.y + o.h * 0.62
  if (o.shape === 'triangle' && turns === 2) return o.y + o.h * 0.38
  if (o.shape === 'cloud' && turns === 0) return o.y + o.h * 0.56
  if (o.shape === 'cylinder' && turns === 0) return o.y + o.h / 2 + 7
  // Above a document's wavy edge, inside the front sheet of a stack, below a sloped top.
  if (o.shape === 'document' && turns === 0) return o.y + o.h * 0.44
  if (o.shape === 'documents' && turns === 0) return o.y + o.h * 0.54
  if (o.shape === 'manual-input' && turns === 0) return o.y + o.h / 2 + Math.min(o.h * 0.3, 24) / 2
  return o.y + o.h / 2
}

export function layoutShapeText(o: ShapeObject, measureAt: MeasureAt): ShapeTextLayout {
  const { size, line } = TEXT_SIZE_PX[o.textSize ?? 'm']
  switch (o.shape) {
    case 'sticky': {
      // The largest size that fits, unless a size was picked.
      const inner = { x: o.x + STICKY_INSET, y: o.y + STICKY_INSET, w: o.w - 2 * STICKY_INSET, h: o.h - 2 * STICKY_INSET }
      const align = o.align ?? 'left'
      const sizes = o.textSize ? [size] : STICKY_SIZES
      let fit = { rich: richText('', inner.w, { size: sizes[0], line: 1, align }, measureAt), size: sizes[0], lh: Math.round(sizes[0] * 1.4) }
      for (const s of sizes) {
        const lh = Math.round(s * 1.4)
        fit = { rich: richText(o.text, inner.w, { size: s, line: lh, align }, measureAt), size: s, lh }
        if (fit.rich.height <= inner.h) break
      }
      return { rich: fit.rich, box: { ...inner, h: Math.max(fit.lh, fit.rich.height) }, fontSize: fit.size, lineHeight: fit.lh, align }
    }
    case 'text': {
      const rich = freeText(o, measureAt)
      return { rich, box: { x: o.x, y: o.y, w: Math.max(o.w, 1), h: Math.max(line, rich.height) }, fontSize: size, lineHeight: line, align: o.align ?? 'left' }
    }
    case 'section': {
      const title = o.text.replace(/\n/g, ' ')
      return {
        rich: plain(title ? [title] : [], SECTION_TITLE_SIZE, SECTION_TITLE_LINE, 'left', o.w, measureAt),
        box: { x: o.x, y: o.y - SECTION_TITLE_LINE - SECTION_TITLE_GAP, w: o.w, h: SECTION_TITLE_LINE },
        fontSize: SECTION_TITLE_SIZE,
        lineHeight: SECTION_TITLE_LINE,
        align: 'left',
      }
    }
    case 'link': {
      const title = linkDrawing(o, measureAt).texts[0]
      const measure = measureAt(title.size)
      const w = Math.max(40, ...title.lines.map((l) => measure(l)))
      return {
        rich: plain(title.lines, title.size, title.lineHeight, 'left', w, measureAt),
        box: { x: title.x, y: title.y, w: o.expanded ? o.x + o.w - 14 - title.x : w, h: Math.max(1, title.lines.length) * title.lineHeight },
        fontSize: title.size,
        lineHeight: title.lineHeight,
        align: 'left',
      }
    }
    case 'icon': {
      const width = Math.max(o.w, ICON_LABEL_WIDTH)
      const align = o.align ?? 'center'
      const rich = richText(o.text, width, { size, line, align }, measureAt)
      return { rich, box: { x: o.x + o.w / 2 - width / 2, y: o.y + o.h + SHAPE_ICON_GAP, w: width, h: Math.max(line, rich.height) }, fontSize: size, lineHeight: line, align }
    }
    default: {
      const width = textBoxWidth(o)
      const align = o.align ?? 'center'
      const rich = isRichKind(o.shape) ? richText(o.text, width, { size, line, align }, measureAt) : plain(o.text ? o.text.split('\n') : [], size, line, align, width, measureAt)
      const height = Math.max(line, rich.height)
      const center = textCenterY(o)
      if (o.icon) {
        const total = SHAPE_ICON_SIZE + (rich.height ? SHAPE_ICON_GAP + height : 0)
        const top = center - total / 2
        return {
          rich,
          box: { x: o.x + textInsetX(o), y: top + SHAPE_ICON_SIZE + SHAPE_ICON_GAP, w: width, h: height },
          icon: { x: o.x + o.w / 2 - SHAPE_ICON_SIZE / 2, y: top, w: SHAPE_ICON_SIZE, h: SHAPE_ICON_SIZE },
          fontSize: size,
          lineHeight: line,
          align,
        }
      }
      return { rich, box: { x: o.x + textInsetX(o), y: center - height / 2, w: width, h: height }, fontSize: size, lineHeight: line, align }
    }
  }
}

/**
 * Size after a text change. Flowchart shapes grow downward to fit (never below the ideal
 * height); free text hugs its content; stickies and sections keep their size.
 */
/** Where a text object's lines wrap: its set width, else the widest free text. */
export function textWrapWidth(o: ShapeObject): number {
  return o.fixedWidth ? Math.max(1, o.w - 2) : TEXT_MAX_WIDTH
}

export function autosizeShape(o: ShapeObject, measureAt: MeasureAt): ShapeObject {
  if (o.shape === 'image' || o.shape === 'icon') return o
  if (o.shape === 'link') return autosizeLink(o, measureAt)
  if (o.shape === 'table') return autosizeTable(o, measureAt)
  if (o.shape === 'sticky' || o.shape === 'section') return o
  if (o.shape === 'note') return o
  const { size, line } = TEXT_SIZE_PX[o.textSize ?? 'm']
  if (o.shape === 'text') {
    // A width set by hand stays and the text wraps in it; otherwise the text sets the width.
    const rich = richText(o.text, textWrapWidth(o), { size, line, align: 'left' }, measureAt)
    const w = o.fixedWidth ? o.w : Math.max(24, Math.ceil(rich.width) + 2)
    return { ...o, w, h: Math.max(line, rich.height) }
  }
  const text = layoutShapeText({ ...o, icon: undefined }, measureAt).rich.height
  const need = text + (o.icon ? SHAPE_ICON_SIZE + (text ? SHAPE_ICON_GAP : 0) : 0)
  return { ...o, h: need === 0 ? o.idealH : Math.max(o.idealH, need + AUTOSIZE_PADDING) }
}

/** Shape height after autosize (flowchart shapes). */
export function autosizedHeight(o: ShapeObject, measure: Measure): number {
  return autosizeShape(o, () => measure).h
}

const measurers = new Map<string, Measure>()

/** Cached canvas measurer for `size`px in the board font. */
export const measureAt: MeasureAt = (size, style = '') => {
  const font = fontCss(size, style)
  let m = measurers.get(font)
  if (!m) {
    m = createCanvasMeasure(font)
    measurers.set(font, m)
  }
  return m
}

/** Canvas-backed measurer with a small cache. */
export function createCanvasMeasure(font = shapeFont()): Measure {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is not available')
  ctx.font = font
  const cache = new Map<string, number>()
  return (s: string) => {
    let w = cache.get(s)
    if (w === undefined) {
      w = ctx.measureText(s).width
      if (cache.size > 5000) cache.clear()
      cache.set(s, w)
    }
    return w
  }
}
