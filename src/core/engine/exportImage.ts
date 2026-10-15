// PNG and SVG export of a board (or the selection). PNG reuses the canvas renderer;
// SVG is built from the same geometry (shape paths, routes, caps, text layout).

import { isConnector, isMindmap, type BoardObject, type ConnectorObject, type MindmapNode, type ShapeObject } from '../board/model'
import { toSvgColor } from '../theme/color'
import { baseColor, fillColor, setThemeMode, strokeColor, textColor, theme, themeMode, type ThemeMode } from '../theme/palette'
import { ARROW_LENGTH, capPrimitives, shortenEnd } from './caps'
import { SEQUENCE_LINE_WIDTH, connectorGeometry, isMessage, labelCenter, roundedPathData, type Lookup } from './connectors'
import type { Point, Rect } from './geometry'
import { branchCurve, foldBadge, levelStyle, outerEdge, type MindmapLayout } from './mindmap'
import { LIFELINE_WIDTH, Renderer, SHAPE_DASH, lifelineColor } from './renderer'
import { lifeline } from './sequence'
import { tableParts } from './table'
import { fontOf, imagePlaceholder, type Part } from './parts'
import { UNFILLED, roundRectData, shapePathData } from './shapes'
import { iconDrawing, type IconDrawing } from './icons'
import { LINK_GLYPHS, glyphColors, linkDrawing } from './linkObject'
import { MARKER_OPACITY, PEN_WIDTH, penOf, strokePathData, strokePoints } from './freehand'
import { ICON_BOX } from '../icons/iconData'
import { FONT_FAMILY, LABEL_PADDING, labelLayout, layoutShapeText, type MeasureAt, type ShapeTextLayout } from './textLayout'
import { Viewport } from './viewport'
import { richSvg } from './richLayout'
import { NOTE_FADE, NOTE_PADDING, noteDrawing, type NoteView } from './noteCard'
import { fontCss } from './text'

export interface ExportScene {
  /** Objects to draw, in z order. */
  objects: BoardObject[]
  lookup: Lookup
  mindmap: MindmapLayout
  /** Content bounds in board coordinates, before padding. */
  bounds: Rect
  /** Notes for note cards (boards that aren't open have none: their cards show only names). */
  note?: (link: string) => NoteView | undefined
}

export const EXPORT_PADDING = 40
/** Browsers refuse canvases beyond roughly these limits. */
const MAX_CANVAS_SIDE = 16384
const MAX_CANVAS_AREA = 120_000_000

function paddedBounds(b: Rect): Rect {
  return { x: b.x - EXPORT_PADDING, y: b.y - EXPORT_PADDING, w: b.w + 2 * EXPORT_PADDING, h: b.h + 2 * EXPORT_PADDING }
}

export interface PngOptions {
  /** Device pixels per board pixel (reduced for huge boards). */
  scale?: number
  /** Fill the background (default); off gives a transparent PNG. */
  background?: boolean
  /** Draw in this theme instead of the current one. */
  mode?: ThemeMode
}

/** Board image as PNG bytes. */
export async function exportPng(
  scene: ExportScene,
  measureAt: MeasureAt,
  image: (src: string) => CanvasImageSource | null = () => null,
  { scale = 2, background = true, mode }: PngOptions = {},
): Promise<Uint8Array> {
  const area = paddedBounds(scene.bounds)
  const fit = Math.min(scale, MAX_CANVAS_SIDE / area.w, MAX_CANVAS_SIDE / area.h, Math.sqrt(MAX_CANVAS_AREA / (area.w * area.h)))
  const canvas = document.createElement('canvas')
  const renderer = new Renderer(canvas, measureAt)
  renderer.resize(area.w, area.h, fit)
  const vp = new Viewport()
  vp.width = area.w
  vp.height = area.h
  vp.setState({ offsetX: area.x, offsetY: area.y, zoom: 1 })
  const current = themeMode()
  if (mode && mode !== current) setThemeMode(mode)
  try {
    renderScene(renderer, vp, scene, image, background)
  } finally {
    if (mode && mode !== current) setThemeMode(current)
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('PNG를 만들지 못했습니다')
  return new Uint8Array(await blob.arrayBuffer())
}

function renderScene(renderer: Renderer, vp: Viewport, scene: ExportScene, image: (src: string) => CanvasImageSource | null, background: boolean): void {
  renderer.render(vp, {
    background,
    linkBadges: false,
    objects: scene.objects,
    lookup: scene.lookup,
    selection: new Set(),
    hoverId: null,
    editingId: null,
    marquee: null,
    ghost: null,
    showHandles: false,
    guides: [],
    dots: null,
    previewConnector: null,
    targetId: null,
    connectorHandles: null,
    mindmap: scene.mindmap,
    grid: false,
    image,
    note: scene.note,
  })
}

// ---- SVG ---------------------------------------------------------------------------

const num = (v: number) => String(Math.round(v * 100) / 100)

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** `fill="#…"` / `stroke="#…"` with an opacity attribute when the color is translucent. */
function paint(attr: 'fill' | 'stroke', css: string): string {
  const c = toSvgColor(css)
  return `${attr}="${c.hex}"` + (c.opacity < 1 ? ` ${attr}-opacity="${num(c.opacity)}"` : '')
}

/** A shape's text as SVG. */
const shapeTextSvg = (l: ShapeTextLayout, color: string) => richSvg(l.rich, l.box.x, l.box.y, color, paint)

function textLines(lines: string[], x: number, firstCenterY: number, lineHeight: number, font: string, color: string, anchor: 'start' | 'middle'): string {
  return lines
    .map(
      (line, i) =>
        `<text x="${num(x)}" y="${num(firstCenterY + i * lineHeight)}" style="font: ${esc(font)}" ${paint('fill', color)} text-anchor="${anchor}" dominant-baseline="central">${esc(line)}</text>`,
    )
    .join('')
}

/** Board image as a standalone SVG document. Colors are converted to sRGB hex. */
export interface SvgOptions {
  /** Draw in this theme instead of the current one. */
  mode?: ThemeMode
}

export function exportSvg(scene: ExportScene, measureAt: MeasureAt, images = new Map<string, string>(), options: SvgOptions = {}): string {
  const current = themeMode()
  if (options.mode && options.mode !== current) setThemeMode(options.mode)
  try {
    return svgDocument(scene, measureAt, images)
  } finally {
    if (options.mode && options.mode !== current) setThemeMode(current)
  }
}

function svgDocument(scene: ExportScene, measureAt: MeasureAt, images: Map<string, string>): string {
  const area = paddedBounds(scene.bounds)
  const defs: string[] = []
  const body: string[] = []
  let clips = 0

  const parts = (list: Part[]) => {
    for (const p of list) {
      const stroke = (q: { stroke?: string; width?: number }) => (q.stroke ? ` ${paint('stroke', q.stroke)} stroke-width="${q.width ?? 1}" stroke-linecap="round" stroke-linejoin="round"` : '')
      const fill = (q: { fill?: string }) => (q.fill ? paint('fill', q.fill) : 'fill="none"')
      if (p.kind === 'rect') {
        const dash = p.dash ? ` stroke-dasharray="${p.dash.join(' ')}"` : ''
        body.push(`<rect x="${num(p.x)}" y="${num(p.y)}" width="${num(p.w)}" height="${num(p.h)}" rx="${num(Math.min(p.r ?? 0, p.w / 2, p.h / 2))}" ${fill(p)}${stroke(p)}${dash}/>`)
      } else if (p.kind === 'ellipse') {
        body.push(`<ellipse cx="${num(p.cx)}" cy="${num(p.cy)}" rx="${num(p.rx)}" ry="${num(p.ry)}" ${fill(p)}${stroke(p)}/>`)
      } else if (p.kind === 'path') {
        body.push(`<path d="${p.d}" ${fill(p)}${stroke(p)}/>`)
      } else if (p.kind === 'rich') {
        body.push(richSvg(p.layout, p.x, p.y, p.color, paint))
      } else {
        const deco = p.underline ? ' text-decoration="underline"' : ''
        body.push(
          `<text x="${num(p.x)}" y="${num(p.y)}" style="font: ${esc(fontOf(p.size, p.bold))}" ${paint('fill', p.color)} text-anchor="${p.align === 'center' ? 'middle' : 'start'}" dominant-baseline="central"${deco}>${esc(p.text)}</text>`,
        )
      }
    }
  }

  const icon = (drawing: IconDrawing | null) => {
    if (!drawing) return
    const { rect } = drawing
    const layers = drawing.layers.map((l) => `<path d="${l.d}" ${paint('fill', l.color)}/>`).join('')
    body.push(`<g transform="translate(${num(rect.x)} ${num(rect.y)}) scale(${num(rect.w / ICON_BOX)})">${layers}</g>`)
  }

  const shape = (o: ShapeObject) => {
    if (o.shape === 'table') {
      parts(tableParts(o, measureAt))
      return
    }
    if (o.shape === 'image') {
      const data = o.src ? images.get(o.src) : undefined
      const c = o.crop
      // A cropped picture: the whole of it as a unit square, framed by a viewBox on the part kept.
      if (data && c)
        body.push(
          `<svg x="${num(o.x)}" y="${num(o.y)}" width="${num(o.w)}" height="${num(o.h)}" viewBox="${c.x} ${c.y} ${c.w} ${c.h}" preserveAspectRatio="none"><image href="${data}" x="0" y="0" width="1" height="1" preserveAspectRatio="none"/></svg>`,
        )
      else if (data) body.push(`<image href="${data}" x="${num(o.x)}" y="${num(o.y)}" width="${num(o.w)}" height="${num(o.h)}" preserveAspectRatio="none"/>`)
      else parts(imagePlaceholder(o))
      return
    }
    if (o.shape === 'link') {
      const d = linkDrawing(o, measureAt)
      if (d.card) {
        const c = d.card.rect
        body.push(`<rect x="${num(c.x)}" y="${num(c.y)}" width="${num(c.w)}" height="${num(c.h)}" rx="8" ${paint('fill', d.card.fill)} ${paint('stroke', d.card.stroke)} stroke-width="1.5"/>`)
        const data = d.image ? images.get(d.image.src) : undefined
        if (d.image && data) {
          const r = d.image.rect
          const id = `clip-${clips++}`
          defs.push(`<clipPath id="${id}"><path d="M${num(r.x)} ${num(r.y + r.h)}V${num(r.y + 8)}Q${num(r.x)} ${num(r.y)} ${num(r.x + 8)} ${num(r.y)}H${num(r.x + r.w - 8)}Q${num(r.x + r.w)} ${num(r.y)} ${num(r.x + r.w)} ${num(r.y + 8)}V${num(r.y + r.h)}Z"/></clipPath>`)
          body.push(`<image href="${data}" x="${num(r.x)}" y="${num(r.y)}" width="${num(r.w)}" height="${num(r.h)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`)
        }
      }
      const r = d.icon.rect
      const iconData = d.icon.src ? images.get(d.icon.src) : undefined
      if (iconData) body.push(`<image href="${iconData}" x="${num(r.x)}" y="${num(r.y)}" width="${num(r.w)}" height="${num(r.h)}"/>`)
      else {
        const colors = glyphColors()
        body.push(`<rect x="${num(r.x)}" y="${num(r.y)}" width="${num(r.w)}" height="${num(r.h)}" rx="4" ${paint('fill', colors.background)}/>`)
        body.push(
          `<path d="${LINK_GLYPHS[d.icon.glyph]}" transform="translate(${num(r.x)} ${num(r.y)}) scale(${num(r.w / 24)})" fill="none" ${paint('stroke', colors.ink)} stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
        )
      }
      for (const t of d.texts) {
        const font = `${t.bold ? '600 ' : ''}${t.size}px ${FONT_FAMILY}`
        t.lines.forEach((line, i) => {
          const deco = t.underline ? ' text-decoration="underline"' : ''
          body.push(
            `<text x="${num(t.x)}" y="${num(t.y + i * t.lineHeight + t.lineHeight / 2)}" style="font: ${esc(font)}" ${paint('fill', t.color)} dominant-baseline="central"${deco}>${esc(line)}</text>`,
          )
        })
      }
      return
    }
    if (o.shape === 'note') {
      const d = noteDrawing(o, o.link ? scene.note?.(o.link) : undefined, measureAt)
      const fill = fillColor(o.color, 'outline')
      body.push(`<rect x="${num(o.x)}" y="${num(o.y)}" width="${num(o.w)}" height="${num(o.h)}" rx="8" ${paint('fill', fill)} ${paint('stroke', strokeColor(o.color))} stroke-width="1.5"/>`)
      body.push(`<text x="${num(d.title.x)}" y="${num(d.title.y)}" style="font: ${esc(fontCss(d.title.size))}" ${paint('fill', theme.textDim)} dominant-baseline="central">${esc(d.title.text)}</text>`)
      const r = d.inner
      if (d.picture) {
        const p = d.picture.rect
        body.push(`<image href="${d.picture.image.url}" x="${num(p.x)}" y="${num(p.y)}" width="${num(p.w)}" height="${num(p.h)}" preserveAspectRatio="none"/>`)
      } else if (d.message) body.push(`<text x="${num(r.x)}" y="${num(r.y + 16)}" style="font: ${esc(fontCss(14))}" ${paint('fill', theme.textDim)} dominant-baseline="central">${esc(d.message)}</text>`)
      if (d.rich) {
        const id = `clip-${clips++}`
        defs.push(`<clipPath id="${id}"><rect x="${num(o.x)}" y="${num(r.y)}" width="${num(o.w)}" height="${num(r.h)}"/></clipPath>`)
        body.push(`<g clip-path="url(#${id})">${richSvg(d.rich, r.x, r.y + NOTE_PADDING / 2, theme.text, paint)}</g>`)
        if (d.maxScroll > 0) {
          const fade = `fade-${clips++}`
          const c = toSvgColor(fill)
          defs.push(
            `<linearGradient id="${fade}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.hex}" stop-opacity="0"/><stop offset="1" stop-color="${c.hex}" stop-opacity="${num(c.opacity)}"/></linearGradient>`,
          )
          body.push(`<rect x="${num(o.x + 1)}" y="${num(r.y + r.h - NOTE_FADE)}" width="${num(o.w - 2)}" height="${NOTE_FADE}" fill="url(#${fade})"/>`)
        }
      }
      return
    }
    if (o.shape === 'freehand') {
      const opacity = penOf(o) === 'marker' ? ` stroke-opacity="${MARKER_OPACITY}"` : ''
      body.push(
        `<path d="${strokePathData(strokePoints(o))}" fill="none" ${paint('stroke', baseColor(o.color))} stroke-width="${PEN_WIDTH[penOf(o)]}" stroke-linecap="round" stroke-linejoin="round"${opacity}/>`,
      )
      return
    }
    if (o.shape === 'icon') {
      icon(iconDrawing(o, o))
      if (o.text) {
        body.push(shapeTextSvg(layoutShapeText(o, measureAt), theme.text))
      }
      return
    }
    const d = shapePathData(o.shape, o)
    let ink = textColor(o.color, o.deco)
    if (o.shape === 'section') {
      body.push(`<path d="${d}" ${paint('fill', theme.sectionFill)} ${paint('stroke', strokeColor(o.color))} stroke-width="1.5"/>`)
      ink = theme.textDim
    } else if (o.shape === 'sticky') {
      body.push(`<path d="${d}" ${paint('fill', fillColor(o.color, 'fill'))} filter="url(#sticky-shadow)"/>`)
      ink = textColor(o.color, 'fill')
    } else if (o.shape === 'text') {
      ink = strokeColor(o.color)
    } else {
      if (o.shape === 'actor') {
        const l = lifeline(o)
        body.push(
          `<path d="M${num(l.x)} ${num(l.top)}V${num(l.bottom)}" fill="none" ${paint('stroke', lifelineColor())} stroke-width="${LIFELINE_WIDTH}"/>`,
        )
      }
      if (o.deco !== 'transparent') {
        const fill = UNFILLED.includes(o.shape) ? 'fill="none"' : paint('fill', fillColor(o.color, o.deco))
        const dash = o.deco === 'dashed' ? ` stroke-dasharray="${SHAPE_DASH.join(' ')}"` : ''
        body.push(`<path d="${d}" ${fill} ${paint('stroke', strokeColor(o.color))} stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${dash}/>`)
      }
    }
    if (o.text.length === 0 && !o.icon) return
    const layout = layoutShapeText(o, measureAt)
    if (layout.icon) icon(iconDrawing(o, layout.icon))
    if (o.text.length === 0) return
    body.push(shapeTextSvg(layout, ink))
  }

  const node = (n: MindmapNode) => {
    const box = scene.mindmap.boxes.get(n.id)
    if (!box) return
    const parent = n.parentId ? scene.mindmap.boxes.get(n.parentId) : undefined
    if (parent) {
      const c = branchCurve(parent, box)
      const d =
        `M${num(c.from.x)} ${num(c.from.y)}L${num(c.from.x + c.leadIn)} ${num(c.from.y)}` +
        `C${num(c.c1.x)} ${num(c.c1.y)} ${num(c.c2.x)} ${num(c.c2.y)} ${num(c.to.x - c.leadIn)} ${num(c.to.y)}L${num(c.to.x)} ${num(c.to.y)}`
      let clip = ''
      if (parent.level === 0) {
        // Root branches start inside the root box; hide that part like the canvas does.
        const id = `root-clip-${clips++}`
        const outer = roundRectData({ x: c.from.x - 1e5, y: c.from.y - 1e5, w: 2e5, h: 2e5 }, 0)
        defs.push(`<clipPath id="${id}"><path clip-rule="evenodd" d="${outer}${roundRectData(parent, 6)}"/></clipPath>`)
        clip = ` clip-path="url(#${id})"`
      }
      body.push(`<path d="${d}" fill="none" ${paint('stroke', strokeColor(n.color))} stroke-width="4" stroke-linecap="round"${clip}/>`)
    }
    if (box.level === 0) body.push(`<path d="${roundRectData(box, 6)}" ${paint('fill', theme.mindmapRoot)}/>`)
    if (box.hidden) {
      const b = foldBadge(box)
      const ring = paint('stroke', strokeColor(scene.mindmap.children.get(n.id)?.[0]?.color ?? n.color))
      const count = box.hidden > 99 ? '99+' : String(box.hidden)
      body.push(`<path d="M${num(outerEdge(box))} ${num(b.cy)}H${num(box.left ? b.cx + b.r : b.cx - b.r)}" ${ring} stroke-width="2"/>`)
      body.push(`<circle cx="${num(b.cx)}" cy="${num(b.cy)}" r="${b.r}" ${paint('fill', theme.canvasBg)} ${ring} stroke-width="2"/>`)
      body.push(textLines([count], b.cx, b.cy, 0, `600 ${box.hidden > 99 ? 9 : 11}px ${FONT_FAMILY}`, theme.text, 'middle'))
    }
    const style = levelStyle(box.level)
    body.push(richSvg(box.text, box.x + style.padX, box.y + style.padY, theme.text, paint))
  }

  const connector = (c: ConnectorObject) => {
    const g = connectorGeometry(c, scene.lookup)
    if (!g) return
    const color = strokeColor(c.color)
    const linePts = c.endCap === 'arrow' ? shortenEnd(g.points, ARROW_LENGTH - 2) : g.points
    const dash = c.line === 'dashed' ? ' stroke-dasharray="12 10"' : ''
    const width = isMessage(c) ? SEQUENCE_LINE_WIDTH : 2
    body.push(`<path d="${roundedPathData(linePts)}" fill="none" ${paint('stroke', color)} stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"${dash}/>`)
    const pts = (ps: Point[]) => ps.map((p) => `${num(p.x)},${num(p.y)}`).join(' ')
    for (const [cap, atStart] of [[c.endCap, false], [c.startCap, true]] as const) {
      for (const p of capPrimitives(g.points, cap, atStart)) {
        if (p.kind === 'polygon') body.push(`<polygon points="${pts(p.points)}" ${paint('fill', color)}/>`)
        else if (p.kind === 'dot') body.push(`<circle cx="${num(p.center.x)}" cy="${num(p.center.y)}" r="${p.radius}" ${paint('fill', color)}/>`)
        else if (p.kind === 'ring')
          body.push(`<circle cx="${num(p.center.x)}" cy="${num(p.center.y)}" r="${p.radius}" fill="none" ${paint('stroke', color)} stroke-width="2"/>`)
        else {
          const d = p.segments.map(([a, b]) => `M${num(a.x)} ${num(a.y)}L${num(b.x)} ${num(b.y)}`).join('')
          body.push(`<path d="${d}" fill="none" ${paint('stroke', color)} stroke-width="2" stroke-linecap="round"/>`)
        }
      }
    }
    if (c.label.length === 0) return
    const { rich, w, h } = labelLayout(c.label, measureAt)
    const at = labelCenter(g, w)
    body.push(`<rect x="${num(at.x - w / 2)}" y="${num(at.y - h / 2)}" width="${num(w)}" height="${num(h)}" ${paint('fill', theme.canvasBg)}/>`)
    body.push(richSvg(rich, at.x - w / 2 + LABEL_PADDING, at.y - h / 2 + LABEL_PADDING / 2, theme.text, paint))
  }

  for (const o of scene.objects) {
    if (isConnector(o)) connector(o)
    else if (isMindmap(o)) node(o)
    else shape(o)
  }
  if (scene.objects.some((o) => o.type === 'shape' && o.shape === 'sticky')) {
    defs.push(`<filter id="sticky-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#000" flood-opacity="0.35"/></filter>`)
  }

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" width="${num(area.w)}" height="${num(area.h)}" viewBox="${num(area.x)} ${num(area.y)} ${num(area.w)} ${num(area.h)}">`,
    defs.length ? `<defs>${defs.join('')}</defs>` : '',
    `<rect x="${num(area.x)}" y="${num(area.y)}" width="${num(area.w)}" height="${num(area.h)}" ${paint('fill', theme.canvasBg)}/>`,
    ...body,
    `</svg>`,
    '',
  ].join('\n')
}
