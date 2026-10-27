import {
  isConnector,
  isMindmap,
  type BoardObject,
  type ColorKey,
  type ConnectorObject,
  type EndCap,
  type MindmapNode,
  type ShapeKind,
  type ShapeObject,
  type Side,
} from '../board/model'
import { baseColor, fillColor, strokeColor, textColor, theme } from '../theme/palette'
import { ARROW_LENGTH, capPrimitives, shortenEnd } from './caps'
import {
  SEQUENCE_LINE_WIDTH,
  connectorGeometry,
  connectorReach,
  isMessage,
  labelCenter,
  roundedPath,
  sidePoint,
  type ConnectorGeometry,
  type ConnectorHandles,
  type Lookup,
} from './connectors'
import { GRID, expandRect, rectContains, rectsIntersect, type Point, type Rect } from './geometry'
import { borderPoint } from './outline'
import { branchCurve, foldBadge, levelStyle, outerEdge, type MindmapLayout, type NodeBox } from './mindmap'
import { actorBounds, lifeline } from './sequence'
import { cellRect, layoutTable, tableParts, type CellRange } from './table'
import { fontOf, imagePlaceholder, type Part } from './parts'
import { UNFILLED, shapePath } from './shapes'
import type { ShapeTextLayout } from './textLayout'
import { drawRich } from './richLayout'
import { NOTE_FADE, NOTE_PADDING, noteDrawing, type NoteView } from './noteCard'
import { fontCss } from './text'
import { withAlpha } from '../theme/color'
import { drawIcon, iconDrawing } from './icons'
import { MARKER_OPACITY, PEN_WIDTH, penOf, strokePathData, strokePoints } from './freehand'
import { LINK_GLYPHS, glyphColors, linkBadge, linkDrawing } from './linkObject'
import type { Guide } from './snapping'
import { LABEL_FONT_SIZE, LABEL_PADDING, FONT_FAMILY, labelLayout, layoutShapeText, type MeasureAt } from './textLayout'
import type { Viewport } from './viewport'
import { createElement } from '@boardline/dom'

export const HANDLE_SIZE = 8
/** Connection dot radius (screen px) and the larger radius when hovered. */
export const DOT_RADIUS = 4.5
export const DOT_HOVER_RADIUS = 8
/** Handles on a selected connector: round ends, bar-shaped segment grips. */
export const CONNECTOR_END_RADIUS = 5
export const SEGMENT_HANDLE_LENGTH = 18
export const SEGMENT_HANDLE_WIDTH = 6
const STROKE_WIDTH = 2
/** Note cards' corners (as Obsidian's cards). */
const NOTE_RADIUS = 8
/** Dashed outline style of shapes. */
export const SHAPE_DASH = [8, 6]
/** Lifelines: solid 4px neutral gray, whatever the actor's color. */
export const LIFELINE_WIDTH = SEQUENCE_LINE_WIDTH
export const lifelineColor = () => strokeColor('gray')
const CONNECTOR_WIDTH = 2

export interface RenderState {
  objects: BoardObject[]
  lookup: Lookup
  selection: ReadonlySet<string>
  hoverId: string | null
  /** Search matches, outlined in the highlight color. */
  highlights?: ReadonlySet<string>
  /** Object whose text/label is shown by the DOM editor instead of the canvas. */
  editingId: string | null
  marquee: Rect | null
  ghost: { shape: ShapeKind; rect: Rect } | null
  /** The shape a creation tool would add (under the pointer, or being dragged out): see-through, with its size. */
  placing?: ShapeObject | null
  showHandles: boolean
  /** Several selected objects scaled together: their box, with corner handles. */
  groupBox?: Rect | null
  guides: Guide[]
  /** Connection (or add-actor) dots on the single selected shape; all four sides by default. */
  /** Side dots; `at`: a line end pinned along the hovered side there instead of its middle. */
  dots: { shape: ShapeObject; hover: Side | null; sides?: Side[]; at?: number } | null
  /** Dragging a mind map node: its outline at the pointer and the node it would attach to. */
  reparent?: { ghost: Rect; target: NodeBox | null; left?: boolean } | null
  /** Selected actor: lifeline length handle, and the "add message" circle under the pointer. */
  actorHandles?: { stemEnd: Point; message: Point | null } | null
  /** The selected mind map node's "+" buttons: add a child, add a sibling. */
  nodeAdd?: { child: Point; sibling: Point | null; left: Point | null; hover: 'child' | 'sibling' | 'left' | null } | null
  /** Temporary connector (dragging a new one, or a quick-add preview). */
  previewConnector: ConnectorObject | null
  /** Shape highlighted as the drop target of a new connector. */
  targetId: string | null
  /** End and segment handles of the single selected connector. */
  connectorHandles: ConnectorHandles | null
  mindmap: MindmapLayout
  /** Draw the dot grid (off for image export). */
  grid?: boolean
  /** Fill the canvas background (off for transparent PNGs). */
  background?: boolean
  /** Badges on linked shapes (off in exports). */
  linkBadges?: boolean
  /** Presenting: everything outside this board rect is dimmed. */
  spotlight?: Rect | null
  /** Decoded images by `src`; null while loading. */
  image?: (src: string) => CanvasImageSource | null
  /** Notes for note cards, by link. */
  note?: (link: string) => NoteView | undefined
  /** How far a note card's text is scrolled. */
  noteScroll?: (id: string) => number
  /** Selected table cell (outlined), and whether its text is being edited. */
  tableCell?: { id: string; row: number; col: number; editing: boolean; range?: CellRange | null } | null
  /** "+" buttons beside the selected table (add a column / a row), and the grips of the selected cell's row and column. */
  tableHandles?: { addCol: Rect; addRow: Rect; rowGrip: Rect | null; colGrip: Rect | null } | null
  /** The ring being drawn with the lasso. */
  lasso?: Point[] | null
  /** A picture being cropped: where its whole picture is, and the frame of the part kept. */
  crop?: { id: string; full: Rect; area: Rect } | null
  /** A table row or column being dragged by its grip: which one, and the gap it would go into. */
  tableMove?: { id: string; what: 'row' | 'col'; from: number; slot: number } | null
}

/**
 * Sections drawn under `p` before an object at `z` (bottom first): a line's label backing is
 * filled like the board and then like each of them, so it matches what is around it.
 */
export function sectionsUnder(objects: BoardObject[], p: Point, z: number): ShapeObject[] {
  return objects.filter((o): o is ShapeObject => o.type === 'shape' && o.shape === 'section' && o.z < z && rectContains(o, p))
}

export class Renderer {
  private ctx: CanvasRenderingContext2D
  private dpr = 1
  private imageSource: (src: string) => CanvasImageSource | null = () => null
  private noteSource: NonNullable<RenderState['note']> = () => undefined
  private noteScroll: NonNullable<RenderState['noteScroll']> = () => 0
  private tableCell: RenderState['tableCell'] = null
  private cropView: RenderState['crop'] = null
  /** The zoom being drawn at (text too small to read is left out). */
  private zoom = 1
  /** What is being drawn (for label backings over sections). */
  private objects: BoardObject[] = []

  constructor(
    private canvas: HTMLCanvasElement,
    private measureAt: MeasureAt,
  ) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D is not available')
    this.ctx = ctx
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.dpr = dpr
    this.canvas.width = Math.max(1, Math.round(cssWidth * dpr))
    this.canvas.height = Math.max(1, Math.round(cssHeight * dpr))
    this.canvas.style.width = `${cssWidth}px`
    this.canvas.style.height = `${cssHeight}px`
  }

  render(vp: Viewport, s: RenderState): void {
    const { ctx, dpr } = this
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (s.background === false) ctx.clearRect(0, 0, vp.width, vp.height)
    else {
      ctx.fillStyle = theme.canvasBg
      ctx.fillRect(0, 0, vp.width, vp.height)
    }
    if (s.grid !== false) this.drawGrid(vp)
    this.imageSource = s.image ?? (() => null)
    this.noteSource = s.note ?? (() => undefined)
    this.noteScroll = s.noteScroll ?? (() => 0)
    this.tableCell = s.tableCell ?? null
    this.cropView = s.crop ?? null
    this.objects = s.objects

    // Board space: 1 unit = 1 board px.
    ctx.setTransform(dpr * vp.zoom, 0, 0, dpr * vp.zoom, -vp.offsetX * vp.zoom * dpr, -vp.offsetY * vp.zoom * dpr)
    this.zoom = vp.zoom
    // Only what can show on screen is drawn (big boards have most of it elsewhere).
    const view = expandRect(vp.visibleRect(), 32 / vp.zoom)
    for (const o of s.objects) {
      if (!this.onScreen(o, s, view)) continue
      if (isConnector(o)) this.drawConnector(o, s.lookup, o.id !== s.editingId, s.selection.has(o.id) ? theme.selection : null)
      else if (isMindmap(o)) this.drawMindmapNode(o, s.mindmap, o.id !== s.editingId)
      else {
        this.drawShape(o, o.id !== s.editingId)
        if (o.link && o.shape !== 'link' && o.shape !== 'note' && s.linkBadges !== false) this.drawLinkBadge(o)
      }
    }
    if (s.spotlight) {
      const v = vp.visibleRect()
      const r = s.spotlight
      ctx.save()
      ctx.globalAlpha = 0.86
      ctx.fillStyle = theme.canvasBg
      ctx.beginPath()
      ctx.rect(v.x - 1, v.y - 1, v.w + 2, v.h + 2)
      ctx.rect(r.x, r.y, r.w, r.h)
      ctx.fill('evenodd')
      ctx.restore()
    }
    if (s.placing) this.drawPlacing(vp, s.placing)
    if (s.previewConnector) this.drawConnector(s.previewConnector, s.lookup, false, null, 0.75)
    if (s.ghost) this.drawGhost(vp, s.ghost.shape, s.ghost.rect)
    if (s.targetId) {
      const t = s.lookup(s.targetId)
      if (t && !isConnector(t) && !isMindmap(t)) this.strokeOutline(vp, t, 1)
    }
    if (s.highlights) {
      for (const id of s.highlights) {
        if (s.selection.has(id)) continue
        const o = s.lookup(id)
        if (isConnector(o)) this.drawConnector(o, s.lookup, false, theme.highlight, 0.9)
        else if (isMindmap(o)) this.strokeBox(vp, s.mindmap.boxes.get(o.id), 1, theme.highlight)
        else if (o) this.strokeOutline(vp, o, 1, theme.highlight)
      }
    }
    if (s.hoverId && !s.selection.has(s.hoverId)) {
      const o = s.lookup(s.hoverId)
      if (isConnector(o)) this.drawConnector(o, s.lookup, false, theme.selection, 0.5)
      else if (isMindmap(o)) this.strokeBox(vp, s.mindmap.boxes.get(o.id), 0.55)
      else if (o) this.strokeOutline(vp, o, 0.55)
    }
    for (const o of s.objects) {
      if (!s.selection.has(o.id) || isConnector(o) || s.crop?.id === o.id) continue
      if (isMindmap(o)) this.strokeBox(vp, s.mindmap.boxes.get(o.id), 1)
      else this.strokeOutline(vp, o, 1)
    }
    if (s.marquee) {
      ctx.fillStyle = theme.selectionFill
      ctx.fillRect(s.marquee.x, s.marquee.y, s.marquee.w, s.marquee.h)
      ctx.strokeStyle = theme.selection
      ctx.lineWidth = 1 / vp.zoom
      ctx.strokeRect(s.marquee.x, s.marquee.y, s.marquee.w, s.marquee.h)
    }
    if (s.lasso && s.lasso.length > 1) {
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(s.lasso[0].x, s.lasso[0].y)
      for (const p of s.lasso) ctx.lineTo(p.x, p.y)
      ctx.closePath()
      ctx.fillStyle = theme.selectionFill
      ctx.fill()
      ctx.strokeStyle = theme.selection
      ctx.lineWidth = 1.5 / vp.zoom
      ctx.setLineDash([5 / vp.zoom, 4 / vp.zoom])
      ctx.stroke()
      ctx.restore()
    }
    this.drawGuides(vp, s.guides)
    if (s.showHandles) {
      const selected = s.objects.filter((o) => s.selection.has(o.id))
      const only = selected[0]
      // Tables and links size themselves, so they have no resize handles.
      if (selected.length === 1 && !isConnector(only) && !isMindmap(only) && !only.locked && only.shape !== 'table' && only.shape !== 'link') this.drawHandles(vp, only)
      if (s.groupBox) this.drawGroupBox(vp, s.groupBox)
    }
    if (s.connectorHandles) this.drawConnectorHandles(vp, s.connectorHandles)
    if (s.tableCell) this.drawActiveCell(vp, s)
    if (s.tableHandles) this.drawTableHandles(vp, s.tableHandles)
    if (s.tableMove) this.drawTableMove(vp, s)
    if (s.crop) this.drawCropFrame(vp, s.crop)
    if (s.reparent) this.drawReparent(vp, s.reparent.ghost, s.reparent.target, !!s.reparent.left)
    if (s.dots) this.drawDots(vp, s.dots.shape, s.dots.hover, s.dots.sides, s.dots.at)
    if (s.actorHandles) this.drawActorHandles(vp, s.actorHandles.stemEnd, s.actorHandles.message)
    if (s.nodeAdd) {
      this.drawPlus(vp, s.nodeAdd.child, s.nodeAdd.hover === 'child')
      if (s.nodeAdd.sibling) this.drawPlus(vp, s.nodeAdd.sibling, s.nodeAdd.hover === 'sibling')
      if (s.nodeAdd.left) this.drawPlus(vp, s.nodeAdd.left, s.nodeAdd.hover === 'left')
    }
  }

  private drawActiveCell(vp: Viewport, s: RenderState): void {
    const c = s.tableCell!
    const o = s.lookup(c.id)
    if (!o || o.type !== 'shape' || o.shape !== 'table') return
    const l = layoutTable(o, this.measureAt)
    if (!l.rows[c.row] || !l.cols[c.col]) return
    const r = cellRect(l, c)
    const { ctx } = this
    ctx.save()
    const range = c.range
    if (range && (range.r0 !== range.r1 || range.c0 !== range.c1) && l.rows[range.r1] && l.cols[range.c1]) {
      // A range: tinted, outlined, the cell typing goes to outlined more strongly.
      const a = cellRect(l, { row: range.r0, col: range.c0 })
      const b = cellRect(l, { row: range.r1, col: range.c1 })
      ctx.fillStyle = theme.selectionFill
      ctx.fillRect(a.x, a.y, b.x + b.w - a.x, b.y + b.h - a.y)
      ctx.strokeStyle = theme.selection
      ctx.lineWidth = 1 / vp.zoom
      ctx.strokeRect(a.x, a.y, b.x + b.w - a.x, b.y + b.h - a.y)
    }
    ctx.strokeStyle = theme.selection
    ctx.lineWidth = 2 / vp.zoom
    ctx.strokeRect(r.x, r.y, r.w, r.h)
    ctx.restore()
  }

  /** Cropping: the whole picture faded, the part kept at full strength. */
  private drawCropping(img: CanvasImageSource, v: { full: Rect; area: Rect }): void {
    const { ctx } = this
    const f = v.full
    ctx.save()
    ctx.globalAlpha = 0.3
    ctx.drawImage(img, f.x, f.y, f.w, f.h)
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.rect(v.area.x, v.area.y, v.area.w, v.area.h)
    ctx.clip()
    ctx.drawImage(img, f.x, f.y, f.w, f.h)
    ctx.restore()
  }

  /** The crop frame: the picture's edge, the frame with thirds, and its corner and edge handles. */
  private drawCropFrame(vp: Viewport, v: { full: Rect; area: Rect }): void {
    const { ctx } = this
    const { area: a, full: f } = v
    ctx.save()
    ctx.strokeStyle = theme.selection
    ctx.lineWidth = 1 / vp.zoom
    ctx.setLineDash([4 / vp.zoom, 4 / vp.zoom])
    ctx.strokeRect(f.x, f.y, f.w, f.h)
    ctx.setLineDash([])
    ctx.globalAlpha = 0.5
    ctx.beginPath()
    for (const t of [1 / 3, 2 / 3]) {
      ctx.moveTo(a.x + a.w * t, a.y)
      ctx.lineTo(a.x + a.w * t, a.y + a.h)
      ctx.moveTo(a.x, a.y + a.h * t)
      ctx.lineTo(a.x + a.w, a.y + a.h * t)
    }
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.lineWidth = 2 / vp.zoom
    ctx.strokeRect(a.x, a.y, a.w, a.h)
    const s = HANDLE_SIZE / vp.zoom
    ctx.fillStyle = theme.handleFill
    ctx.lineWidth = 1.5 / vp.zoom
    for (const [hx, hy] of cropHandles(a)) {
      ctx.fillRect(hx - s / 2, hy - s / 2, s, s)
      ctx.strokeRect(hx - s / 2, hy - s / 2, s, s)
    }
    ctx.restore()
  }

  /** The dragged row or column tinted, and a line where it would go. */
  private drawTableMove(vp: Viewport, s: RenderState): void {
    const m = s.tableMove!
    const o = s.lookup(m.id)
    if (!o || o.type !== 'shape' || o.shape !== 'table') return
    const l = layoutTable(o, this.measureAt)
    const { ctx } = this
    ctx.save()
    ctx.fillStyle = theme.selectionFill
    ctx.strokeStyle = theme.selection
    ctx.lineWidth = 3 / vp.zoom
    ctx.beginPath()
    if (m.what === 'row') {
      const r = l.rows[m.from]
      if (r) ctx.fillRect(o.x, r.y, o.w, r.h)
      const y = m.slot < l.rows.length ? l.rows[m.slot].y - 1 : o.y + o.h - 1
      ctx.moveTo(o.x - 6 / vp.zoom, y)
      ctx.lineTo(o.x + o.w + 6 / vp.zoom, y)
    } else {
      const c = l.cols[m.from]
      if (c) ctx.fillRect(c.x, o.y, c.w, o.h)
      const x = m.slot < l.cols.length ? l.cols[m.slot].x - 1 : o.x + o.w - 1
      ctx.moveTo(x, o.y - 6 / vp.zoom)
      ctx.lineTo(x, o.y + o.h + 6 / vp.zoom)
    }
    ctx.stroke()
    ctx.restore()
  }

  private drawTableHandles(vp: Viewport, h: NonNullable<RenderState['tableHandles']>): void {
    const { ctx } = this
    ctx.save()
    // Grips: a rounded tab with two rows of dots, along the row's left or the column's top.
    for (const [r, along] of [
      [h.rowGrip, 'y'],
      [h.colGrip, 'x'],
    ] as const) {
      if (!r) continue
      ctx.fillStyle = theme.handleFill
      ctx.strokeStyle = theme.selection
      ctx.lineWidth = 1 / vp.zoom
      ctx.beginPath()
      ctx.roundRect(r.x, r.y, r.w, r.h, 4 / vp.zoom)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = theme.selection
      const cx = r.x + r.w / 2
      const cy = r.y + r.h / 2
      const d = 2.5 / vp.zoom
      for (const i of [-1, 0, 1]) {
        for (const j of [-0.5, 0.5]) {
          ctx.beginPath()
          const x = along === 'y' ? cx + j * 2 * d : cx + i * 2 * d
          const y = along === 'y' ? cy + i * 2 * d : cy + j * 2 * d
          ctx.arc(x, y, 0.9 / vp.zoom, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
    for (const r of [h.addCol, h.addRow]) {
      ctx.fillStyle = theme.handleFill
      ctx.strokeStyle = theme.selection
      ctx.lineWidth = 1 / vp.zoom
      ctx.beginPath()
      ctx.roundRect(r.x, r.y, r.w, r.h, 4 / vp.zoom)
      ctx.fill()
      ctx.stroke()
      const cx = r.x + r.w / 2
      const cy = r.y + r.h / 2
      const a = 5 / vp.zoom
      ctx.lineWidth = 1.6 / vp.zoom
      ctx.beginPath()
      ctx.moveTo(cx - a, cy)
      ctx.lineTo(cx + a, cy)
      ctx.moveTo(cx, cy - a)
      ctx.lineTo(cx, cy + a)
      ctx.stroke()
    }
    ctx.restore()
  }

  private drawReparent(vp: Viewport, ghost: Rect, target: NodeBox | null, left: boolean): void {
    const { ctx } = this
    ctx.save()
    ctx.strokeStyle = theme.selection
    ctx.lineWidth = 1.5 / vp.zoom
    ctx.setLineDash([6 / vp.zoom, 4 / vp.zoom])
    ctx.beginPath()
    ctx.roundRect(ghost.x, ghost.y, ghost.w, ghost.h, 6)
    ctx.stroke()
    if (target) {
      // Where the branch would come from.
      ctx.beginPath()
      ctx.moveTo(left ? target.x : target.x + target.w, target.attachY)
      ctx.lineTo(left ? ghost.x + ghost.w : ghost.x, ghost.y + ghost.h / 2)
      ctx.stroke()
      ctx.setLineDash([])
      this.strokeBox(vp, target, 1)
    }
    ctx.restore()
  }

  /** A round "+" button (adding mind map nodes). */
  private drawPlus(vp: Viewport, at: Point, hover: boolean): void {
    const { ctx } = this
    const r = (hover ? DOT_HOVER_RADIUS : DOT_HOVER_RADIUS * 0.8) / vp.zoom
    ctx.save()
    ctx.fillStyle = theme.selection
    ctx.beginPath()
    ctx.arc(at.x, at.y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = theme.handleFill
    ctx.lineWidth = 1.5 / vp.zoom
    ctx.lineCap = 'round'
    const a = r * 0.5
    ctx.beginPath()
    ctx.moveTo(at.x - a, at.y)
    ctx.lineTo(at.x + a, at.y)
    ctx.moveTo(at.x, at.y - a)
    ctx.lineTo(at.x, at.y + a)
    ctx.stroke()
    ctx.restore()
  }

  private drawActorHandles(vp: Viewport, stemEnd: Point, message: Point | null): void {
    const { ctx } = this
    ctx.save()
    ctx.fillStyle = theme.handleFill
    ctx.strokeStyle = theme.selection
    ctx.lineWidth = 1.5 / vp.zoom
    ctx.beginPath()
    ctx.arc(stemEnd.x, stemEnd.y, CONNECTOR_END_RADIUS / vp.zoom, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    if (message) {
      // Purple circle with an arrow: click or drag to add a message here.
      const r = DOT_HOVER_RADIUS / vp.zoom
      ctx.fillStyle = theme.selection
      ctx.beginPath()
      ctx.arc(message.x, message.y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = theme.handleFill
      ctx.lineWidth = 1.5 / vp.zoom
      const a = r * 0.5
      ctx.beginPath()
      ctx.moveTo(message.x - a, message.y)
      ctx.lineTo(message.x + a, message.y)
      ctx.moveTo(message.x + a * 0.3, message.y - a * 0.6)
      ctx.lineTo(message.x + a, message.y)
      ctx.lineTo(message.x + a * 0.3, message.y + a * 0.6)
      ctx.stroke()
    }
    ctx.restore()
  }

  private drawConnectorHandles(vp: Viewport, h: ConnectorHandles): void {
    const { ctx } = this
    ctx.save()
    ctx.fillStyle = theme.handleFill
    ctx.strokeStyle = theme.selection
    ctx.lineWidth = 1.5 / vp.zoom
    for (const p of h.ends) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, CONNECTOR_END_RADIUS / vp.zoom, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    const long = SEGMENT_HANDLE_LENGTH / vp.zoom
    const thin = SEGMENT_HANDLE_WIDTH / vp.zoom
    for (const seg of h.segments) {
      // A vertical segment (constant x) gets an upright grip.
      const w = seg.axis === 'x' ? thin : long
      const hh = seg.axis === 'x' ? long : thin
      ctx.beginPath()
      ctx.roundRect(seg.at.x - w / 2, seg.at.y - hh / 2, w, hh, thin / 2)
      ctx.fill()
      ctx.stroke()
    }
    ctx.restore()
  }

  private drawGrid(vp: Viewport): void {
    const { ctx } = this
    // Thin the dots out when zoomed out so the screen spacing stays readable.
    let step = GRID
    while (step * vp.zoom < 10) step *= 2
    // One fill with a tiled pattern: a dot per tile corner, the tile scaled to the dots' screen
    // spacing and lined up with the grid (dot by dot, a big screen took ~15 ms a frame).
    const spacing = step * vp.zoom
    const pattern = this.gridPattern(spacing)
    if (!pattern) return
    const ox = (((-vp.offsetX * vp.zoom) % spacing) + spacing) % spacing
    const oy = (((-vp.offsetY * vp.zoom) % spacing) + spacing) % spacing
    pattern.setTransform(new DOMMatrix().translate(ox, oy).scale(spacing / GRID_TILE))
    ctx.fillStyle = pattern
    ctx.fillRect(0, 0, vp.width, vp.height)
  }

  private gridTile: { spacing: number; color: string; pattern: CanvasPattern | null } | null = null

  /** The dot tile for this spacing (screen px), made again when the spacing or the color changes. */
  private gridPattern(spacing: number): CanvasPattern | null {
    const color = theme.gridDot
    const key = Math.round(spacing * 100) / 100
    if (this.gridTile?.spacing === key && this.gridTile.color === color) return this.gridTile.pattern
    const tile = createElement(this.canvas.ownerDocument, 'canvas')
    tile.width = GRID_TILE
    tile.height = GRID_TILE
    const tc = tile.getContext('2d')
    // A 1.5px dot on screen, split over the tile's four corners so the tiles join it up.
    const half = (1.5 * GRID_TILE) / spacing / 2
    if (tc) {
      tc.fillStyle = color
      for (const [x, y] of [
        [0, 0],
        [GRID_TILE - half, 0],
        [0, GRID_TILE - half],
        [GRID_TILE - half, GRID_TILE - half],
      ])
        tc.fillRect(x, y, half, half)
    }
    const pattern = this.ctx.createPattern(tile, 'repeat')
    this.gridTile = { spacing: key, color, pattern }
    return pattern
  }

  private drawShape(o: ShapeObject, withText: boolean): void {
    if (o.shape === 'table') {
      const c = this.tableCell
      this.drawParts(tableParts(o, this.measureAt, c && c.id === o.id && c.editing ? c : null))
      return
    }
    if (o.shape === 'image') {
      const img = o.src ? this.imageSource(o.src) : null
      if (!img) this.drawParts(imagePlaceholder(o))
      else if (this.cropView?.id === o.id) this.drawCropping(img, this.cropView)
      else drawPicture(this.ctx, img, o)
      return
    }
    const { ctx } = this
    if (o.shape === 'freehand') {
      this.drawStroke(o)
      return
    }
    if (o.shape === 'link') {
      this.drawLink(o, withText)
      return
    }
    if (o.shape === 'note') {
      this.drawNote(o)
      return
    }
    if (o.shape === 'icon') {
      const icon = iconDrawing(o, o)
      if (icon) drawIcon(ctx, icon)
      if (withText && o.text) this.drawShapeText(layoutShapeText(o, this.measureAt), theme.text)
      return
    }
    const path = shapePath(o.shape, o)
    let ink = textColor(o.color, o.deco)
    if (o.shape === 'section') {
      ctx.fillStyle = theme.sectionFill
      ctx.fill(path)
      ctx.lineWidth = 1.5
      ctx.strokeStyle = strokeColor(o.color)
      ctx.stroke(path)
      ink = theme.textDim
    } else if (o.shape === 'sticky') {
      ctx.save()
      ctx.shadowColor = 'oklch(0% 0 0 / 35%)'
      ctx.shadowBlur = 10
      ctx.shadowOffsetY = 3
      ctx.fillStyle = fillColor(o.color, 'fill')
      ctx.fill(path)
      ctx.restore()
      ink = textColor(o.color, 'fill')
    } else if (o.shape === 'text') {
      ink = strokeColor(o.color)
    } else {
      if (o.shape === 'actor') this.drawLifeline(o)
      if (o.deco !== 'transparent') {
        if (!UNFILLED.includes(o.shape)) {
          ctx.fillStyle = fillColor(o.color, o.deco)
          ctx.fill(path)
        }
        ctx.save()
        ctx.lineWidth = STROKE_WIDTH
        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'
        ctx.strokeStyle = strokeColor(o.color)
        if (o.deco === 'dashed') ctx.setLineDash(SHAPE_DASH)
        ctx.stroke(path)
        ctx.restore()
      }
    }
    if (!o.icon && (!withText || o.text.length === 0)) return
    const layout = layoutShapeText(o, this.measureAt)
    const icon = layout.icon ? iconDrawing(o, layout.icon) : null
    if (icon) drawIcon(ctx, icon)
    if (withText && o.text.length > 0) this.drawShapeText(layout, ink)
  }

  /** A note card: the name above, the text inside, faded where it is cut off. */
  private drawNote(o: ShapeObject): void {
    const { ctx } = this
    const d = noteDrawing(o, o.link ? this.noteSource(o.link) : undefined, this.measureAt, this.noteScroll(o.id))
    const fill = fillColor(o.color, 'outline')
    const card = new Path2D()
    card.roundRect(o.x, o.y, o.w, o.h, NOTE_RADIUS)
    ctx.fillStyle = fill
    ctx.fill(card)
    ctx.lineWidth = 1.5
    ctx.strokeStyle = strokeColor(o.color)
    ctx.stroke(card)
    ctx.font = fontCss(d.title.size)
    ctx.fillStyle = theme.textDim
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(d.title.text, d.title.x, d.title.y)
    const r = d.inner
    if (d.picture) {
      const p = d.picture.rect
      ctx.drawImage(d.picture.image.source, p.x, p.y, p.w, p.h)
      return
    }
    if (d.message) {
      ctx.font = fontCss(14)
      ctx.fillText(d.message, r.x, r.y + 16)
      return
    }
    if (!d.rich) return
    ctx.save()
    ctx.beginPath()
    ctx.rect(o.x, r.y, o.w, r.h)
    ctx.clip()
    drawRich(ctx, d.rich, r.x, r.y + NOTE_PADDING / 2 - d.scroll, theme.text)
    // Fades into the card where text goes on above or below.
    const fade = (y0: number, y1: number) => {
      const g = ctx.createLinearGradient(0, y0, 0, y1)
      g.addColorStop(0, withAlpha(fill, 0))
      g.addColorStop(1, fill)
      ctx.fillStyle = g
      ctx.fillRect(o.x + 1, Math.min(y0, y1), o.w - 2, Math.abs(y1 - y0))
    }
    if (d.scroll < d.maxScroll) fade(r.y + r.h - NOTE_FADE, r.y + r.h)
    if (d.scroll > 0) fade(r.y + NOTE_FADE, r.y)
    ctx.restore()
  }

  private drawLink(o: ShapeObject, withText: boolean): void {
    const { ctx } = this
    const d = linkDrawing(o, this.measureAt)
    ctx.save()
    if (d.card) {
      const path = new Path2D()
      path.roundRect(d.card.rect.x, d.card.rect.y, d.card.rect.w, d.card.rect.h, 8)
      ctx.fillStyle = d.card.fill
      ctx.fill(path)
      if (d.image) {
        const img = this.imageSource(d.image.src)
        if (img) {
          ctx.save()
          const clip = new Path2D()
          clip.roundRect(d.image.rect.x, d.image.rect.y, d.image.rect.w, d.image.rect.h, [8, 8, 0, 0])
          ctx.clip(clip)
          drawCover(ctx, img, d.image.rect)
          ctx.restore()
        }
      }
      ctx.lineWidth = 1.5
      ctx.strokeStyle = d.card.stroke
      ctx.stroke(path)
    }
    const icon = d.icon.src ? this.imageSource(d.icon.src) : null
    const r = d.icon.rect
    if (icon) ctx.drawImage(icon, r.x, r.y, r.w, r.h)
    else {
      const colors = glyphColors()
      ctx.fillStyle = colors.background
      ctx.beginPath()
      ctx.roundRect(r.x, r.y, r.w, r.h, 4)
      ctx.fill()
      ctx.save()
      ctx.translate(r.x, r.y)
      ctx.scale(r.w / 24, r.h / 24)
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 1.8
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.stroke(new Path2D(LINK_GLYPHS[d.icon.glyph]))
      ctx.restore()
    }
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    for (const t of d.texts) {
      if (t.title && !withText) continue
      ctx.font = `${t.bold ? '600 ' : ''}${t.size}px ${FONT_FAMILY}`
      ctx.fillStyle = t.color
      t.lines.forEach((line, i) => {
        const y = t.y + i * t.lineHeight + t.lineHeight / 2
        ctx.fillText(line, t.x, y)
        if (t.underline) ctx.fillRect(t.x, y + t.size * 0.55, ctx.measureText(line).width, 1)
      })
    }
    ctx.restore()
  }

  /** Small circle with a chain on shapes that carry a link. */
  private drawLinkBadge(o: ShapeObject): void {
    const { ctx } = this
    const b = linkBadge(o)
    ctx.save()
    ctx.fillStyle = theme.selection
    ctx.beginPath()
    ctx.arc(b.cx, b.cy, b.r, 0, Math.PI * 2)
    ctx.fill()
    ctx.translate(b.cx - b.r * 0.75, b.cy - b.r * 0.75)
    ctx.scale((b.r * 1.5) / 24, (b.r * 1.5) / 24)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.stroke(new Path2D(LINK_GLYPHS.web))
    ctx.restore()
  }

  private drawStroke(o: ShapeObject): void {
    const { ctx } = this
    ctx.save()
    ctx.lineWidth = PEN_WIDTH[penOf(o)]
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = baseColor(o.color)
    if (penOf(o) === 'marker') ctx.globalAlpha = MARKER_OPACITY
    ctx.stroke(new Path2D(strokePathData(strokePoints(o))))
    ctx.restore()
  }

  private drawShapeText(layout: ShapeTextLayout, ink: string): void {
    if (this.unreadable(layout.fontSize)) return
    drawRich(this.ctx, layout.rich, layout.box.x, layout.box.y, ink)
  }

  /** Text this small on screen can't be read: it isn't drawn (zoomed far out on a big board). */
  private unreadable(size: number): boolean {
    return size * this.zoom < MIN_TEXT_PX
  }

  /** Whether `o` can show within `view` (board space), from where it can be at most. */
  private onScreen(o: BoardObject, s: RenderState, view: Rect): boolean {
    if (isConnector(o)) {
      const reach = connectorReach(o, s.lookup)
      return !reach || rectsIntersect(reach, view)
    }
    if (isMindmap(o)) {
      const b = s.mindmap.boxes.get(o.id)
      if (!b) return false
      // Its branch comes from the parent; a folded count sits beside it.
      const p = o.parentId ? s.mindmap.boxes.get(o.parentId) : undefined
      const x = Math.min(b.x, p?.x ?? b.x) - 40
      const y = Math.min(b.y, p?.y ?? b.y) - 4
      const r = Math.max(b.x + b.w, p ? p.x + p.w : b.x + b.w) + 40
      const btm = Math.max(b.y + b.h, p ? p.y + p.h : b.y + b.h) + 4
      return rectsIntersect({ x, y, w: r - x, h: btm - y }, view)
    }
    return rectsIntersect(drawBounds(o), view)
  }

  private drawParts(parts: Part[]): void {
    const { ctx } = this
    ctx.save()
    for (const p of parts) {
      if (p.kind === 'rich') {
        if (!this.unreadable(p.layout.spans[0]?.size ?? 16)) drawRich(ctx, p.layout, p.x, p.y, p.color)
        continue
      }
      if (p.kind === 'text') {
        ctx.font = fontOf(p.size, p.bold)
        ctx.fillStyle = p.color
        ctx.textAlign = p.align
        ctx.textBaseline = 'middle'
        ctx.fillText(p.text, p.x, p.y)
        if (p.underline) {
          const w = ctx.measureText(p.text).width
          const x0 = p.align === 'center' ? p.x - w / 2 : p.x
          ctx.fillRect(x0, p.y + p.size * 0.55, w, 1)
        }
        continue
      }
      const path = new Path2D()
      if (p.kind === 'rect') path.roundRect(p.x, p.y, p.w, p.h, p.r ?? 0)
      else if (p.kind === 'ellipse') path.ellipse(p.cx, p.cy, p.rx, p.ry, 0, 0, Math.PI * 2)
      else path.addPath(new Path2D(p.d))
      if (p.fill) {
        ctx.fillStyle = p.fill
        ctx.fill(path)
      }
      if (p.stroke) {
        ctx.strokeStyle = p.stroke
        ctx.lineWidth = p.width ?? 1
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.setLineDash(p.kind === 'rect' && p.dash ? p.dash : [])
        ctx.stroke(path)
      }
    }
    ctx.restore()
  }

  private drawLifeline(a: ShapeObject): void {
    const { ctx } = this
    const l = lifeline(a)
    ctx.save()
    ctx.strokeStyle = lifelineColor()
    ctx.lineWidth = LIFELINE_WIDTH
    ctx.beginPath()
    ctx.moveTo(l.x, l.top)
    ctx.lineTo(l.x, l.bottom)
    ctx.stroke()
    ctx.restore()
  }

  /** A mind map node: its incoming branch, then the root box or the text. */
  private drawMindmapNode(n: MindmapNode, layout: MindmapLayout, withText: boolean): void {
    const box = layout.boxes.get(n.id)
    if (!box) return
    const { ctx } = this
    const parent = n.parentId ? layout.boxes.get(n.parentId) : undefined
    if (parent) {
      const c = branchCurve(parent, box)
      ctx.save()
      if (parent.level === 0) {
        // Root branches start inside the root box; hide that part.
        const clip = new Path2D()
        clip.rect(c.from.x - 1e5, c.from.y - 1e5, 2e5, 2e5)
        clip.roundRect(parent.x, parent.y, parent.w, parent.h, 6)
        ctx.clip(clip, 'evenodd')
      }
      ctx.strokeStyle = strokeColor(n.color)
      ctx.lineWidth = 4
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(c.from.x, c.from.y)
      ctx.lineTo(c.from.x + c.leadIn, c.from.y)
      ctx.bezierCurveTo(c.c1.x, c.c1.y, c.c2.x, c.c2.y, c.to.x - c.leadIn, c.to.y)
      ctx.lineTo(c.to.x, c.to.y)
      ctx.stroke()
      ctx.restore()
    }
    if (box.level === 0) {
      ctx.fillStyle = theme.mindmapRoot
      ctx.beginPath()
      ctx.roundRect(box.x, box.y, box.w, box.h, 6)
      ctx.fill()
    }
    if (box.hidden) this.drawFoldBadge(box, layout.children.get(n.id)?.[0]?.color ?? n.color, n.z)
    if (!withText) return
    const style = levelStyle(box.level)
    if (!this.unreadable(style.fontSize)) drawRich(ctx, box.text, box.x + style.padX, box.y + style.padY, theme.text)
  }

  /** A folded node's count: a short branch out to a ringed number. */
  private drawFoldBadge(box: NodeBox, color: ColorKey, z: number): void {
    const { ctx } = this
    const b = foldBadge(box)
    ctx.save()
    ctx.strokeStyle = strokeColor(color)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(outerEdge(box), b.cy)
    ctx.lineTo(box.left ? b.cx + b.r : b.cx - b.r, b.cy)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(b.cx, b.cy, b.r, 0, Math.PI * 2)
    ctx.fillStyle = theme.canvasBg
    ctx.fill()
    ctx.fillStyle = theme.sectionFill
    sectionsUnder(this.objects, { x: b.cx, y: b.cy }, z).forEach(() => ctx.fill())
    ctx.stroke()
    ctx.fillStyle = theme.text
    ctx.font = fontOf(box.hidden! > 99 ? 9 : 11, true)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(box.hidden! > 99 ? '99+' : String(box.hidden), b.cx, b.cy + 0.5)
    ctx.restore()
  }

  private strokeBox(vp: Viewport, box: NodeBox | undefined, alpha: number, color = theme.selection): void {
    if (!box) return
    const { ctx } = this
    const r = expandRect(box, 3)
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.strokeStyle = color
    ctx.lineWidth = 2 / vp.zoom
    ctx.beginPath()
    ctx.roundRect(r.x, r.y, r.w, r.h, 6)
    ctx.stroke()
    ctx.restore()
  }

  private drawConnector(c: ConnectorObject, lookup: Lookup, withLabel: boolean, highlight: string | null, alpha = 1): void {
    const g = connectorGeometry(c, lookup)
    if (!g) return
    const { ctx } = this
    const color = highlight ?? strokeColor(c.color)
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = isMessage(c) ? SEQUENCE_LINE_WIDTH : CONNECTOR_WIDTH
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    if (c.line === 'dashed') ctx.setLineDash([12, 10])
    const pts = g.points
    // Stop the line short of filled end caps so the cap tip stays sharp.
    const linePts = c.endCap === 'arrow' ? shortenEnd(pts, ARROW_LENGTH - 2) : pts
    ctx.stroke(roundedPath(linePts))
    ctx.setLineDash([])
    this.drawCap(pts, c.endCap, false)
    this.drawCap(pts, c.startCap, true)
    if (withLabel && c.label.length > 0) this.drawLabel(c.label, g, c.z)
    ctx.restore()
  }

  private drawCap(pts: Point[], cap: EndCap, atStart: boolean): void {
    const { ctx } = this
    for (const p of capPrimitives(pts, cap, atStart)) {
      ctx.beginPath()
      switch (p.kind) {
        case 'polygon':
          p.points.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)))
          ctx.closePath()
          ctx.fill()
          break
        case 'dot':
          ctx.arc(p.center.x, p.center.y, p.radius, 0, Math.PI * 2)
          ctx.fill()
          break
        case 'ring':
          ctx.arc(p.center.x, p.center.y, p.radius, 0, Math.PI * 2)
          ctx.stroke()
          break
        case 'lines':
          for (const [a, b] of p.segments) {
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
          }
          ctx.stroke()
          break
      }
    }
  }

  private drawLabel(label: string, g: ConnectorGeometry, z: number): void {
    const { ctx } = this
    if (this.unreadable(LABEL_FONT_SIZE)) return
    const { rich, w, h } = labelLayout(label, this.measureAt)
    const at = labelCenter(g, w)
    ctx.fillStyle = theme.canvasBg
    ctx.fillRect(at.x - w / 2, at.y - h / 2, w, h)
    ctx.fillStyle = theme.sectionFill
    sectionsUnder(this.objects, at, z).forEach(() => ctx.fillRect(at.x - w / 2, at.y - h / 2, w, h))
    drawRich(ctx, rich, at.x - w / 2 + LABEL_PADDING, at.y - h / 2 + LABEL_PADDING / 2, theme.text)
  }

  private strokeOutline(vp: Viewport, o: ShapeObject, alpha: number, color = theme.selection): void {
    const { ctx } = this
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.strokeStyle = color
    ctx.lineWidth = 2 / vp.zoom
    ctx.stroke(shapePath(o.shape, o))
    if (o.shape !== 'rect') {
      ctx.lineWidth = 1 / vp.zoom
      ctx.strokeRect(o.x, o.y, o.w, o.h)
    }
    ctx.restore()
  }

  /** The box around several selected objects, with a handle at each corner to scale them. */
  private drawGroupBox(vp: Viewport, r: Rect): void {
    const { ctx } = this
    const s = HANDLE_SIZE / vp.zoom
    ctx.strokeStyle = theme.selection
    ctx.lineWidth = 1 / vp.zoom
    ctx.strokeRect(r.x, r.y, r.w, r.h)
    ctx.fillStyle = theme.handleFill
    ctx.lineWidth = 1.5 / vp.zoom
    for (const [hx, hy] of corners(r)) {
      ctx.fillRect(hx - s / 2, hy - s / 2, s, s)
      ctx.strokeRect(hx - s / 2, hy - s / 2, s, s)
    }
  }

  private drawHandles(vp: Viewport, o: ShapeObject): void {
    const { ctx } = this
    const s = HANDLE_SIZE / vp.zoom
    ctx.fillStyle = theme.handleFill
    ctx.strokeStyle = theme.selection
    ctx.lineWidth = 1.5 / vp.zoom
    for (const [hx, hy] of o.shape === 'text' ? textHandles(o) : corners(o)) {
      ctx.fillRect(hx - s / 2, hy - s / 2, s, s)
      ctx.strokeRect(hx - s / 2, hy - s / 2, s, s)
    }
  }

  private drawDots(vp: Viewport, o: ShapeObject, hover: Side | null, sides: Side[] = SIDES, at?: number): void {
    const { ctx } = this
    const spots: [Side, Point, boolean][] = sides.map((side) => [side, sidePoint(o, side), side === hover && at === undefined])
    if (hover && at !== undefined) spots.push([hover, borderPoint(o, hover, at), true])
    for (const [, p, hovered] of spots) {
      const r = (hovered ? DOT_HOVER_RADIUS : DOT_RADIUS) / vp.zoom
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.fillStyle = theme.selection
      ctx.fill()
      if (hovered) {
        // "+" mark inside the hovered dot.
        const a = r * 0.5
        ctx.strokeStyle = theme.handleFill
        ctx.lineWidth = 1.5 / vp.zoom
        ctx.beginPath()
        ctx.moveTo(p.x - a, p.y)
        ctx.lineTo(p.x + a, p.y)
        ctx.moveTo(p.x, p.y - a)
        ctx.lineTo(p.x, p.y + a)
        ctx.stroke()
      }
    }
  }

  /** Alignment lines and equal-spacing markers (thin red). */
  private drawGuides(vp: Viewport, guides: Guide[]): void {
    if (guides.length === 0) return
    const { ctx } = this
    const tick = 4 / vp.zoom
    ctx.save()
    ctx.strokeStyle = theme.guide
    ctx.lineWidth = 1 / vp.zoom
    ctx.beginPath()
    for (const g of guides) {
      if (g.kind === 'align') {
        if (g.axis === 'x') {
          ctx.moveTo(g.at, g.from)
          ctx.lineTo(g.at, g.to)
        } else {
          ctx.moveTo(g.from, g.at)
          ctx.lineTo(g.to, g.at)
        }
        continue
      }
      for (const gap of g.gaps) {
        if (g.axis === 'x') {
          ctx.moveTo(gap.start, gap.cross)
          ctx.lineTo(gap.end, gap.cross)
          ctx.moveTo(gap.start, gap.cross - tick)
          ctx.lineTo(gap.start, gap.cross + tick)
          ctx.moveTo(gap.end, gap.cross - tick)
          ctx.lineTo(gap.end, gap.cross + tick)
        } else {
          ctx.moveTo(gap.cross, gap.start)
          ctx.lineTo(gap.cross, gap.end)
          ctx.moveTo(gap.cross - tick, gap.start)
          ctx.lineTo(gap.cross + tick, gap.start)
          ctx.moveTo(gap.cross - tick, gap.end)
          ctx.lineTo(gap.cross + tick, gap.end)
        }
      }
    }
    ctx.stroke()
    ctx.restore()
  }

  /** A shape about to be added, as it will look but see-through, its size under its bottom-right corner (not for text). */
  private drawPlacing(vp: Viewport, o: ShapeObject): void {
    const { ctx } = this
    ctx.save()
    ctx.globalAlpha = 0.5
    this.drawShape(o, true)
    ctx.restore()
    if (o.shape === 'text') return
    ctx.save()
    ctx.font = fontOf(11 / vp.zoom, true)
    ctx.fillStyle = theme.selection
    ctx.textAlign = 'right'
    ctx.textBaseline = 'top'
    ctx.fillText(`${Math.round(o.w)} x ${Math.round(o.h)}`, o.x + o.w, o.y + o.h + 6 / vp.zoom)
    ctx.restore()
  }

  private drawGhost(vp: Viewport, shape: ShapeKind, rect: Rect): void {
    const { ctx } = this
    ctx.save()
    ctx.setLineDash([6 / vp.zoom, 4 / vp.zoom])
    ctx.strokeStyle = theme.selection
    ctx.lineWidth = 1.5 / vp.zoom
    ctx.stroke(shapePath(shape, rect))
    ctx.restore()
  }
}

export const SIDES: Side[] = ['top', 'right', 'bottom', 'left']

export type Corner = 'nw' | 'ne' | 'sw' | 'se'

/** What a resize drags: a corner, or a whole edge. */
export type ResizeHandle = Corner | 'n' | 's' | 'e' | 'w'

/** Size of the grid's dot tile (scaled to the dots' spacing when drawn). */
const GRID_TILE = 64

/** Smallest text (screen px) worth drawing. */
const MIN_TEXT_PX = 3

/**
 * Where a shape draws at most (board space): its box with room for outlines, shadows, link
 * badges, a section's title above it, an icon's label below, an actor's lifeline.
 */
export function drawBounds(o: ShapeObject): Rect {
  if (o.shape === 'actor') return expandRect(actorBounds(o), 24)
  if (o.shape === 'section') return { x: o.x - 8, y: o.y - 48, w: Math.max(o.w, 600) + 16, h: o.h + 56 }
  if (o.shape === 'icon') return { x: o.x - 160, y: o.y - 24, w: o.w + 320, h: o.h + 96 }
  return expandRect(o, 24)
}

/** A crop frame's handles: corners and the middle of each edge, as [x, y, handle]. */
export function cropHandles(a: Rect): [number, number, ResizeHandle][] {
  const cx = a.x + a.w / 2
  const cy = a.y + a.h / 2
  const r = a.x + a.w
  const b = a.y + a.h
  return [
    [a.x, a.y, 'nw'],
    [cx, a.y, 'n'],
    [r, a.y, 'ne'],
    [r, cy, 'e'],
    [r, b, 'se'],
    [cx, b, 's'],
    [a.x, b, 'sw'],
    [a.x, cy, 'w'],
  ]
}

/** A picture's pixel size (a loaded image, or a bitmap). */
function sourceSize(img: CanvasImageSource): { w: number; h: number } {
  if ('naturalWidth' in img && img.naturalWidth) return { w: img.naturalWidth, h: img.naturalHeight }
  const sized = img as { width: number; height: number }
  return { w: sized.width, h: sized.height }
}

/** A picture in its box, showing the part its crop keeps. */
export function drawPicture(ctx: CanvasRenderingContext2D, img: CanvasImageSource, o: ShapeObject): void {
  const c = o.crop
  if (!c) {
    ctx.drawImage(img, o.x, o.y, o.w, o.h)
    return
  }
  const { w, h } = sourceSize(img)
  ctx.drawImage(img, c.x * w, c.y * h, c.w * w, c.h * h, o.x, o.y, o.w, o.h)
}

/** Text objects only set their width: a handle in the middle of each side edge. */
export function textHandles(r: Rect): [number, number, ResizeHandle][] {
  return [
    [r.x, r.y + r.h / 2, 'w'],
    [r.x + r.w, r.y + r.h / 2, 'e'],
  ]
}

export function corners(r: Rect): [number, number, Corner][] {
  return [
    [r.x, r.y, 'nw'],
    [r.x + r.w, r.y, 'ne'],
    [r.x, r.y + r.h, 'sw'],
    [r.x + r.w, r.y + r.h, 'se'],
  ]
}

/** Draw an image filling `r`, cropped to keep its proportions (CSS object-fit: cover). */
function drawCover(ctx: CanvasRenderingContext2D, img: CanvasImageSource, r: Rect): void {
  const iw = (img as { width: number }).width
  const ih = (img as { height: number }).height
  if (!iw || !ih) return
  const k = Math.max(r.w / iw, r.h / ih)
  const sw = r.w / k
  const sh = r.h / k
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, r.x, r.y, r.w, r.h)
}
