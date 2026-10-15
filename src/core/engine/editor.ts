import { isImageFile, mimeOf } from '../board/assets'
import { copyObjects, isClipboardPayload, pasteObjects, type ClipboardPayload } from '../board/clipboard'
import { BoardDocument, createOp, deleteOp, updateOp, type Op } from '../board/document'
import {
  BRANCH_COLORS,
  FLOW_SHAPES,
  SHAPE_SPECS,
  TEXT_SIZES,
  createConnector,
  createMindmapNode,
  createShape,
  endpointObjectId,
  hasTextStyle,
  imageSrcs,
  isConnector,
  isFlowShape,
  isMindmap,
  isShape,
  newId,
  type BoardObject,
  type ColorKey,
  type ConnectorObject,
  type Endpoint,
  type MindmapNode,
  type ShapeKind,
  type ShapeObject,
  type Side,
  type TextAlign,
  type TextSize,
} from '../board/model'
import {
  OPPOSITE_SIDE,
  connectorGeometry,
  connectorHandles,
  distanceToPolyline,
  connectorReach,
  labelCenter,
  lengthAtPoint,
  pinSegment,
  polylineBounds,
  polylineLength,
  shiftPins,
  sidePoint,
  center,
  type ConnectorGeometry,
  type Lookup,
  type SegmentHandle,
} from './connectors'
import {
  GRID,
  LARGE_NUDGE,
  distance,
  expandRect,
  pointInPolygon,
  rectFromPoints,
  rectsIntersect,
  snap,
  unionRects,
  type Point,
  type Rect,
} from './geometry'
import { MM_MAX_TEXT_WIDTH, descendants, foldBadge, layoutMindmaps, levelStyle, outerEdge, type MindmapLayout, type NodeBox } from './mindmap'
import { matches, objectText, replaceInObject } from '../board/search'
import { FONT_EVENT, THEME_EVENT } from '../theme/events'
import { ICONS_EVENT, loadIconSet, type IconStyle } from '../icons/iconData'
import { iconStyleOf } from './icons'
import { linkBadge } from './linkObject'
import { boardLink, parseLink } from '../board/links'
import { hitStroke, scaleStroke, simplify, strokePoints, strokeShape, type PenKind } from './freehand'
import { textColor, theme } from '../theme/palette'
import { autoLayout, layoutOps, type LayoutDirection } from './autoLayout'
import { ImageCache, type AssetLoader } from './images'
import {
  autosizeTable,
  cellAt,
  cellFont,
  cellTextBox,
  colBorderAt,
  deleteCol,
  deleteRow,
  fitCol,
  gridText,
  hasHeader,
  insertCol,
  insertRow,
  layoutTable,
  moveCol,
  moveRow,
  parseGrid,
  pasteCells,
  resizeCol,
  setCell,
  setCellColors,
  setColAligns,
  stepCell,
  tableCells,
  tableCols,
  TABLE_COL_WIDTH,
  TABLE_FONT,
  TABLE_LINE,
  type Cell,
  type CellRange,
} from './table'
import { MIN_STEM, actorBounds, actorSlot, isActor, lifeline, lifelineAt, messageDy, neighbourActor } from './sequence'
import { exportPng, exportSvg, type ExportScene, type PngOptions } from './exportImage'
import { labelBoxOf, previewSvg, sceneOf, standaloneScene } from './scene'
import { buildDiagram, mermaidKind, parseMermaid } from '../board/mermaidImport'
import { toMermaid } from './mermaid'
import { applyStyle, saveDefaultStyle, styleOf, withDefaultStyle, type Style } from '../board/styles'
import { planQuickAdd, type QuickAddPlan } from './quickAdd'
import {
  CONNECTOR_END_RADIUS,
  DOT_HOVER_RADIUS,
  HANDLE_SIZE,
  Renderer,
  type RenderState,
  SEGMENT_HANDLE_LENGTH,
  SEGMENT_HANDLE_WIDTH,
  SIDES,
  corners,
  cropHandles,
  drawBounds,
  type ResizeHandle,
} from './renderer'
import { UNFILLED, shapePath } from './shapes'
import { snapMove, snapPoint, type Guide, type SnapMode, type SnapOptions } from './snapping'
import {
  FONT_FAMILY,
  labelFont,
  LABEL_FONT_SIZE,
  LABEL_LINE_HEIGHT,
  LABEL_PADDING,
  labelLayout,
  textWrapWidth,
  SHAPE_LINE_HEIGHT,
  autosizeShape,
  createCanvasMeasure,
  layoutShapeText,
  measureAt,
  type Measure,
} from './textLayout'
import { toggleListText, toggleTaskLine, type ListKind } from './text'
import { RichField } from './richField'
import { boardToMarkdown } from '../board/toMarkdown'
import { NoteCache, noteDrawing, type NoteReader } from './noteCard'
import { hasMarkAll, setMarkAll, type MarkName } from './richText'
import { MAX_ZOOM, Viewport, pinchView, type ViewportState } from './viewport'

/** `icon` names the icon a shape tool for icon objects places. */
export type Tool =
  | { kind: 'select' }
  | { kind: 'shape'; shape: ShapeKind; icon?: string; iconStyle?: IconStyle }
  | { kind: 'mindmap' }
  | { kind: 'connector' }
  /** Hand: drag to move the view. */
  | { kind: 'hand' }
  /** Drawing mode: pen (H), marker (Shift+H), eraser, or the lasso (selects what it rings). */
  | { kind: 'draw'; pen: PenKind | 'eraser' | 'lasso' }

export interface EditorStatus {
  tool: Tool
  selectionCount: number
  /** Current state of the selected objects (for the selection toolbar). */
  selected: BoardObject[]
  /** Selection bounds in host (screen) coordinates; null while dragging or editing text. */
  selectionBox: Rect | null
  /** Markdown text being typed: where (screen coordinates) and the marks at the caret. */
  textEditing: { id: string; box: Rect; marks: Record<MarkName, boolean> } | null
  /** Selected cell when a table is selected. */
  tableCell: (Cell & { range: CellRange }) | null
  /** A picture is being cropped (Enter keeps the frame, Esc goes back). */
  cropping: boolean
  zoom: number
  canUndo: boolean
  canRedo: boolean
}

export interface EditorOptions {
  initialViewport?: ViewportState
  /** Reads image files referenced by the board. */
  loadAsset?: AssetLoader
  /** Reads the files note cards show (notes, boards, canvases). */
  readNote?: NoteReader
  /** Files dragged in from Obsidian's file explorer: how to get their links (null when it isn't files). */
  draggedFiles?: (e: DragEvent) => (() => Promise<string[]>) | null
  /** Stores a pasted/dropped/imported image in the workspace. */
  storeImage?: (file: Blob) => Promise<{ src: string; width: number; height: number }>
  onStatus?: (s: EditorStatus) => void
  onViewportChange?: (s: ViewportState) => void
  /** Open a link (a web address or boardline://board/…). */
  onOpenLink?: (link: string) => void
  /** A link was pasted: make a link object for it at `at`. */
  onPasteLink?: (link: string, at: Point) => void
  /** Short message for the user. */
  onNotice?: (text: string) => void
  /**
   * A right click: where (host coordinates, and on the board), and whether it was on an
   * object (which is then selected) or on the empty board (the selection is cleared).
   */
  onContextMenu?: (screen: Point, board: Point, onObject: boolean) => void
  /**
   * Whether keys, copy and paste are for this board now. Default: always; a board inside
   * Obsidian answers only while its view has the focus.
   */
  isActive?: () => boolean
}

/** Pointer travel (screen px) before a press becomes a drag. */
const DRAG_THRESHOLD = 3
const MIN_SHAPE_SIZE = GRID * 2
/** A selected shape resizes from anywhere within this many screen px of an edge. */
const EDGE_GRAB = 4
const RESIZE_CURSOR: Record<ResizeHandle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
}
/** Pointer distance (screen px) that still counts as hitting a connector line. */
const LINE_HIT = 6

const PREVIEW_ID = '__preview__'
/** How far (board px) from a node's right edge a dragged mind map node still attaches to it. */
const REPARENT_REACH = 320
const GHOST_ID = '__ghost__'

type Interaction =
  | { kind: 'idle' }
  /** `click`: where a read-only press started (a click there follows a link). */
  | { kind: 'pan'; last: Point; click?: Point }
  | { kind: 'draw'; pen: PenKind; points: Point[] }
  | { kind: 'erase'; hits: Set<string> }
  /** Ringing objects to select them (the drawing panel's lasso, or Alt+drag on the empty board). */
  | { kind: 'lasso'; points: Point[]; base: Set<string>; fromDraw: boolean }
  | { kind: 'press'; downScreen: Point; downBoard: Point; hitId: string | null; shift: boolean; alt: boolean; touch: boolean }
  | {
      kind: 'move'
      downBoard: Point
      originals: Map<string, BoardObject>
      bbox: Rect | null
      rigid: ReadonlySet<string>
      /** Messages that slide up/down their lifelines (their actors stay put). */
      slide: ReadonlySet<string>
      /** Alt+drag: the moved objects are copies just made; the move joins that undo step. */
      copies?: boolean
    }
  /** Dragging a mind map node to another parent, another place among its siblings, or out. */
  | { kind: 'reparent'; nodeId: string; current: Point; target: { parentId: string; index: number; left: boolean } | null }
  /** Pressed an add-actor dot; the actor is added on release. */
  | { kind: 'addActor'; actorId: string; side: Side }
  /** Pressed a table's "+" button. */
  | { kind: 'tableAdd'; id: string; what: 'row' | 'col' }
  /** Dragging a table column's right border. */
  | { kind: 'colResize'; original: ShapeObject; col: number; downX: number }
  /** Dragging a table row or column by its grip; `slot` is the gap (0…count) it would go into. */
  | { kind: 'tableMove'; id: string; what: 'row' | 'col'; from: number; slot: number; downScreen: Point; dragging: boolean }
  /** Dragging the end of a lifeline to change its length. */
  | { kind: 'stem'; original: ShapeObject }
  /** From the "add message" circle: click sends to the next actor, drag picks the target. */
  | { kind: 'message'; actorId: string; dy: number; downScreen: Point; dragging: boolean; current: Point; targetId: string | null }
  | { kind: 'resize'; corner: ResizeHandle; original: ShapeObject; downScreen: Point; downBoard: Point; dragging: boolean }
  | { kind: 'marquee'; downBoard: Point; current: Point; base: Set<string> }
  | { kind: 'create'; shape: ShapeKind; downScreen: Point; downBoard: Point; current: Point; dragging: boolean }
  /** Mind map tool: the root is placed on release, so the click can't steal the editor's focus. */
  | { kind: 'place'; at: Point }
  /** New connector: from a connection dot (side set) or with the connector tool (from a shape or a point). */
  | {
      kind: 'connect'
      from: Endpoint
      sourceId: string | null
      side: Side | null
      downScreen: Point
      dragging: boolean
      targetId: string | null
      /** The target's side when the end is over one of its dots. */
      targetSide: Side | null
      freePoint: Point
    }
  /** Dragging an end of the selected connector to another shape or into free space. */
  | {
      kind: 'endpoint'
      original: ConnectorObject
      end: 'from' | 'to'
      downScreen: Point
      dragging: boolean
      targetId: string | null
      side: Side | null
    }
  /** Dragging a crop frame's handle, or the frame itself ('move'). */
  | { kind: 'crop'; handle: ResizeHandle | 'move'; start: Rect; down: Point }
  /** Sliding a line's label along the line. */
  | { kind: 'labelMove'; original: ConnectorObject; downScreen: Point; dragging: boolean }
  /** Dragging an interior elbow segment across its axis. */
  | { kind: 'segment'; original: ConnectorObject; axis: 'x' | 'y'; value: number; index: number; downBoard: Point }

interface TextEditing {
  id: string
  kind: 'shape' | 'label' | 'node' | 'cell'
  original: BoardObject
  /** Markdown text (shapes) is typed in a RichField, the rest in a textarea. */
  field: HTMLTextAreaElement | RichField
  /** Stops following the caret (for the toolbar's mark buttons). */
  unwatch?: () => void
  /** Table cell being edited (kind 'cell'). */
  cell?: Cell
}

const TEXT_MARK_LABEL: Record<MarkName, string> = { bold: '굵게', italic: '기울임', strike: '취소선', highlight: '강조', code: '코드' }

/** Offset of each successive paste/duplicate (two grid steps). */
const PASTE_STEP = GRID * 2

/** What this window copied last (fallback when the system clipboard drops our format). */
let clipboard: { payload: ClipboardPayload; text: string } | null = null
/** Repeated pastes of the same content step further away. */
let lastPaste: { key: string; count: number } | null = null
/** Clipboard format carrying copied board objects (also works between boards and windows). */
const CLIPBOARD_MIME = 'application/x-boardline'
/** Style picked up with Ctrl+Alt+C, shared by every board. */
let copiedStyle: Style | null = null
/** Space between a section made by "wrap in section" and its contents. */
const WRAP_PADDING = GRID * 4
/** Largest size (either side) an inserted image starts at. */
const IMAGE_MAX = 480

const SHAPE_KEYS: Record<string, ShapeKind> = {
  r: 'rect',
  u: 'pill',
  o: 'ellipse',
  d: 'diamond',
  b: 'brace',
  p: 'parallelogram',
  g: 'triangle',
  f: 'hexagon',
  y: 'cylinder',
  j: 'cloud',
  v: 'star',
  n: 'sticky',
  t: 'text',
  '.': 'section',
  q: 'actor',
  e: 'table',
}
/** Sides of an actor that add another actor. */
const ACTOR_SIDES: Side[] = ['left', 'right']

/**
 * Shapes a line can join: everything but actors (their messages hang off the lifeline) and pen
 * strokes. A section takes a line on its border or title, so a line end let go
 * over the empty inside stays free.
 */
/** A Map that counts its changes (what is worked out from it is kept until it changes). */
class VersionedMap<K, V> extends Map<K, V> {
  version = 0

  set(key: K, value: V): this {
    this.version++
    return super.set(key, value)
  }

  delete(key: K): boolean {
    this.version++
    return super.delete(key)
  }

  clear(): void {
    this.version++
    super.clear()
  }
}

/** The cells of `range` emptied. */
function clearCells(t: ShapeObject, range: CellRange): ShapeObject {
  return { ...t, cells: tableCells(t).map((row, r) => row.map((text, c) => (r >= range.r0 && r <= range.r1 && c >= range.c0 && c <= range.c1 ? '' : text))) }
}

/** The node folded or unfolded (unfolded nodes don't keep the field). */
function unfolded(n: MindmapNode, fold: boolean): MindmapNode {
  const { collapsed: _collapsed, ...rest } = n
  return fold ? { ...rest, collapsed: true } : rest
}

function canConnect(o: ShapeObject): boolean {
  return o.shape !== 'actor' && o.shape !== 'freehand'
}

/** Kinds quick add copies (blank); beside anything else (a picture, link, table, section, note) it puts a box. */
const COPIED_BY_QUICK_ADD = new Set<ShapeKind>([...FLOW_SHAPES, 'sticky', 'text', 'icon'])
const ALIGN_KEYS: Record<string, 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'> = {
  KeyA: 'left',
  KeyH: 'hcenter',
  KeyD: 'right',
  KeyW: 'top',
  KeyV: 'vcenter',
  KeyS: 'bottom',
}
const ARROW_SIDE: Record<string, Side> = { ArrowUp: 'top', ArrowRight: 'right', ArrowDown: 'bottom', ArrowLeft: 'left' }

/**
 * Interactive board editor: owns the canvas, viewport, selection and tools.
 * The document stays the source of truth; drags render through a preview map and are
 * committed as one transaction when the pointer is released.
 */
export class BoardEditor {
  readonly viewport = new Viewport()
  private canvas: HTMLCanvasElement
  private overlay: HTMLDivElement
  private renderer: Renderer
  private measureLabel: Measure
  /** Text measurers for mind map levels 0, 1 and 2+. */
  private tool: Tool = { kind: 'select' }
  private selection = new Set<string>()
  private preview = new VersionedMap<string, BoardObject>()
  /** What the current objects and their mind map layout were last worked out from. */
  private derived: { ordered: BoardObject[] | null; previewVersion: number; current: BoardObject[]; layoutFor: BoardObject[] | null; layout: MindmapLayout | null } = {
    ordered: null,
    previewVersion: -1,
    current: [],
    layoutFor: null,
    layout: null,
  }
  private hoverId: string | null = null
  /** Objects matched by the find bar. */
  private highlights = new Set<string>()
  /** Selected cell of the selected table (arrows, Tab and typing act on it). */
  private activeCell: ({ id: string } & Cell) | null = null
  /** A picture being cropped: its whole picture's rect and the frame of the part kept (board space). */
  private cropping: { id: string; full: Rect; area: Rect } | null = null
  /** The other corner of a range of cells (Shift+arrows, Shift+click, a grip's click). */
  private cellAnchor: ({ id: string } & Cell) | null = null
  /** Board height on the selected actor's lifeline where a message would start. */
  private hoverMessageDy: number | null = null
  /** Connection dot under the pointer on the selected shape (shows the quick-add preview). */
  private hoverDot: Side | null = null
  /** The selected mind map node's "+" button under the pointer. */
  private hoverNodeAdd: 'child' | 'sibling' | 'left' | null = null
  private interaction: Interaction = { kind: 'idle' }
  private editing: TextEditing | null = null
  private spaceHeld = false
  /** Held backtick disables snapping entirely. */
  private backtickHeld = false
  /** Board settings: snap to the grid, to other objects. */
  private snapGrid = true
  private snapObjects = true
  /** Read-only view (setReadOnly). */
  private readOnly = false
  private guides: Guide[] = []
  private frame = 0
  private disposers: (() => void)[] = []
  private images: ImageCache
  private notes: NoteCache
  /** How far each note card's text is scrolled (not saved). */
  private noteScrolls = new Map<string, number>()

  constructor(
    private host: HTMLElement,
    readonly doc: BoardDocument,
    private opts: EditorOptions = {},
  ) {
    // Keys and clipboard come from the window the board is in (Obsidian can pop boards out).
    const win = host.ownerDocument.defaultView ?? window
    this.canvas = host.ownerDocument.createElement('canvas')
    this.canvas.className = 'bl-board-canvas'
    this.canvas.tabIndex = 0
    this.overlay = host.ownerDocument.createElement('div')
    this.overlay.className = 'bl-board-overlay'
    host.append(this.canvas, this.overlay)
    this.measureLabel = createCanvasMeasure(labelFont())
    this.renderer = new Renderer(this.canvas, measureAt)
    this.images = new ImageCache(opts.loadAsset, () => this.requestRender())
    this.notes = new NoteCache(opts.readNote, () => this.requestRender())
    if (opts.initialViewport) this.viewport.setState(opts.initialViewport)

    this.listen(this.canvas, 'pointerdown', (e) => this.onPointerDown(e as PointerEvent))
    this.listen(this.canvas, 'pointermove', (e) => this.onPointerMove(e as PointerEvent))
    this.listen(this.canvas, 'pointerup', (e) => this.onPointerUp(e as PointerEvent))
    this.listen(this.canvas, 'pointercancel', (e) => {
      this.endTouch(e as PointerEvent)
      this.cancelInteraction()
    })
    this.listen(this.canvas, 'pointerleave', () => this.setHoverDot(null))
    this.listen(this.canvas, 'dblclick', (e) => this.onDoubleClick(e as MouseEvent))
    this.listen(this.canvas, 'contextmenu', (e) => this.onContextMenu(e as MouseEvent))
    this.listen(this.canvas, 'wheel', (e) => this.onWheel(e as WheelEvent), { passive: false })
    this.listen(win, 'keydown', (e) => this.onKeyDown(e as KeyboardEvent))
    this.listen(win, 'copy', (e) => this.onCopy(e as ClipboardEvent, false))
    this.listen(win, 'cut', (e) => this.onCopy(e as ClipboardEvent, true))
    this.listen(win, 'paste', (e) => this.onPaste(e as ClipboardEvent))
    this.listen(window, THEME_EVENT, () => this.renderNow())
    this.listen(window, FONT_EVENT, () => this.onFontChange())
    this.listen(window, ICONS_EVENT, () => this.requestRender())
    this.listen(this.canvas, 'dragover', (e) => this.onDragOver(e as DragEvent))
    this.listen(this.canvas, 'drop', (e) => this.onDrop(e as DragEvent))
    this.listen(win, 'keyup', (e) => this.onKeyUp(e as KeyboardEvent))
    this.disposers.push(doc.subscribe(() => this.onDocChange()))

    const ro = new ResizeObserver(() => this.resize())
    ro.observe(host)
    this.disposers.push(() => ro.disconnect())
    this.resize()
    // Don't steal focus from a field the UI just focused (e.g. the new board's title).
    const focused = host.ownerDocument.activeElement
    if (!focused || focused === host.ownerDocument.body) this.canvas.focus()
    this.emitStatus()
  }

  destroy(): void {
    this.commitEditing()
    cancelAnimationFrame(this.frame)
    for (const d of this.disposers) d()
    this.images.dispose()
    this.canvas.remove()
    this.overlay.remove()
  }

  // ---- public commands ----------------------------------------------------

  /** The board font changed: measure text again and redraw. */
  private onFontChange(): void {
    this.derived.layoutFor = null
    this.measureLabel = createCanvasMeasure(labelFont())
    this.renderer = new Renderer(this.canvas, measureAt)
    this.resize()
  }

  /** Give keyboard focus back to the board. */
  focus(): void {
    this.canvas.focus()
  }

  setTool(tool: Tool): void {
    this.commitEditing()
    this.tool = tool
    // Picking a creation tool drops the selection, so its toolbar can't sit in the way.
    if (tool.kind !== 'select' && tool.kind !== 'hand' && this.selection.size > 0) {
      this.selection.clear()
      this.requestRender()
    }
    this.canvas.style.cursor = this.toolCursor()
    this.emitStatus()
  }

  private toolCursor(): string {
    if (this.readOnly) return 'grab'
    return this.tool.kind === 'select' ? 'default' : this.tool.kind === 'hand' ? 'grab' : 'crosshair'
  }

  /** Turn snapping to the grid and to other objects on or off (Ctrl and ` still override it). */
  setSnapping(s: { grid: boolean; objects: boolean }): void {
    this.snapGrid = s.grid
    this.snapObjects = s.objects
  }

  /** Read-only: dragging moves the view, a click follows a link, and nothing can be changed. */
  setReadOnly(on: boolean): void {
    if (on === this.readOnly) return
    this.commitEditing()
    this.readOnly = on
    if (on) {
      this.interaction = { kind: 'idle' }
      this.preview.clear()
      this.selection.clear()
      this.hoverId = null
      this.hoverDot = null
      this.setTool({ kind: 'select' })
    }
    this.canvas.style.cursor = this.toolCursor()
    this.requestRender()
    this.emitStatus()
  }

  isReadOnly(): boolean {
    return this.readOnly
  }

  undo(): void {
    if (this.readOnly) return
    this.commitEditing()
    this.finishCrop(false)
    const tx = this.doc.undo()
    if (tx) this.selectExisting(tx.ops.map((o) => o.id))
  }

  redo(): void {
    if (this.readOnly) return
    this.commitEditing()
    this.finishCrop(false)
    const tx = this.doc.redo()
    if (tx) this.selectExisting(tx.ops.map((o) => o.id))
  }

  /** Delete the selection; connectors attached to deleted shapes go with them. */
  deleteSelection(): void {
    this.finishCrop(false)
    const ids = new Set(this.selection)
    const { children } = this.layout()
    for (const id of this.selection) if (isMindmap(this.doc.get(id))) for (const d of descendants(id, children)) ids.add(d)
    for (const o of this.doc.objects.values()) {
      if (!isConnector(o)) continue
      const a = endpointObjectId(o.from)
      const b = endpointObjectId(o.to)
      if ((a && ids.has(a)) || (b && ids.has(b))) ids.add(o.id)
    }
    const ops = [...ids]
      .map((id) => this.doc.get(id))
      .filter(isDefined)
      .filter((o) => !o.locked)
      .map(deleteOp)
    for (const op of ops) this.selection.delete(op.id)
    this.commit('삭제', ops)
  }

  // ---- text style ---------------------------------------------------------------

  /** Shapes a text style change goes to: the one being typed in, else the selected ones. */
  private textStyled(): ShapeObject[] {
    const ids = this.editing ? (this.editing.kind === 'shape' ? [this.editing.id] : []) : [...this.selection]
    return ids.map((id) => this.doc.get(id)).filter(hasTextStyle).filter((o) => !o.locked)
  }

  /** Restyle the text being typed in, or every selected shape with styled text, as one step. */
  private restyleText(label: string, fn: (o: ShapeObject) => ShapeObject): void {
    const ed = this.editing
    if (!ed) {
      this.updateSelected(label, (o) => (hasTextStyle(o) ? autosizeShape(fn(o), measureAt) : o))
      return
    }
    const base = this.doc.get(ed.id)
    if (ed.kind !== 'shape' || !hasTextStyle(base)) return
    const next = autosizeShape(fn(base), measureAt)
    this.commit(label, [updateOp(base, next)])
    // The text typed so far is committed on top of the new look when editing ends.
    ed.original = next
    this.onTextInput()
    this.layoutTextarea()
    this.emitStatus()
  }

  /**
   * A mark (bold, italic…) on the text being typed in (the selected part), or on all the text
   * of the selected shapes (off when all of it has the mark already).
   */
  toggleTextStyle(mark: MarkName): void {
    const ed = this.editing
    if (ed) {
      if (!(ed.field instanceof RichField)) return
      ed.field.toggleMark(mark)
      this.onTextInput()
      this.emitStatus()
      return
    }
    const targets = this.textStyled()
    const words = this.markedWords()
    if (targets.length + words.length === 0) return
    const texts = [...targets.map((o) => o.text), ...words.map((o) => (isConnector(o) ? o.label : o.text))]
    const on = !texts.every((t) => hasMarkAll(t, mark))
    this.updateSelected(TEXT_MARK_LABEL[mark], (o) =>
      hasTextStyle(o)
        ? autosizeShape({ ...o, text: setMarkAll(o.text, mark, on) }, measureAt)
        : isMindmap(o) && !o.locked
          ? { ...o, text: setMarkAll(o.text, mark, on) }
          : isConnector(o) && o.label && !o.locked
            ? { ...o, label: setMarkAll(o.label, mark, on) }
            : o,
    )
  }

  /** One text size step bigger (1) or smaller (-1). */
  stepTextSize(dir: 1 | -1): void {
    this.restyleText('글자 크기', (o) => {
      const i = Math.min(TEXT_SIZES.length - 1, Math.max(0, TEXT_SIZES.indexOf(o.textSize ?? 'm') + dir))
      const { textSize: _old, ...rest } = o
      return TEXT_SIZES[i] === 'm' ? rest : { ...rest, textSize: TEXT_SIZES[i] }
    })
  }

  setTextSize(size: TextSize): void {
    this.restyleText('글자 크기', (o) => {
      const { textSize: _old, ...rest } = o
      return size === 'm' ? rest : { ...rest, textSize: size }
    })
  }

  setTextAlign(align: TextAlign): void {
    this.restyleText('글자 정렬', (o) => ({ ...o, align }))
  }

  /** Bullets, numbers or task boxes in front of every line, taken off again when all lines have them. */
  toggleList(kind: ListKind): void {
    const ed = this.editing
    if (ed) {
      if (!(ed.field instanceof RichField)) return
      ed.field.value = toggleListText(ed.field.value, kind)
      ed.field.caretToEnd()
      this.onTextInput()
      this.layoutTextarea()
      return
    }
    if (this.textStyled().length === 0) return
    this.updateSelected(kind === 'bullet' ? '글머리 기호' : kind === 'number' ? '번호 매기기' : '할 일 목록', (o) => (hasTextStyle(o) ? autosizeShape({ ...o, text: toggleListText(o.text, kind) }, measureAt) : o))
  }

  /** Selected mind map nodes and labeled lines (their words take marks; not while typing). */
  private markedWords(): BoardObject[] {
    if (this.editing) return []
    return this.selectedObjects().filter((o) => !o.locked && (isMindmap(o) || (isConnector(o) && !!o.label)))
  }

  /** Text style keys, in the text being typed or on the selection; true when handled. */
  private onTextStyleKey(e: KeyboardEvent): boolean {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return false
    const shapes = this.textStyled().length > 0
    if (!shapes && !(this.editing?.field instanceof RichField) && this.markedWords().length === 0) return false
    const k = e.code
    if (!e.shiftKey && k === 'KeyB') this.toggleTextStyle('bold')
    else if (!e.shiftKey && k === 'KeyI') this.toggleTextStyle('italic')
    else if (e.shiftKey && k === 'KeyX') this.toggleTextStyle('strike')
    else if (e.shiftKey && k === 'KeyH') this.toggleTextStyle('highlight')
    else if (!e.shiftKey && k === 'KeyE') this.toggleTextStyle('code')
    // Sizes and lists are for shapes' text only.
    else if (!shapes) return false
    else if (e.shiftKey && k === 'Period') this.stepTextSize(1)
    else if (e.shiftKey && k === 'Comma') this.stepTextSize(-1)
    else if (e.shiftKey && k === 'Digit8') this.toggleList('bullet')
    else if (e.shiftKey && k === 'Digit7') this.toggleList('number')
    else if (e.shiftKey && k === 'Digit9') this.toggleList('task')
    else return false
    return true
  }

  /** Apply a change to every selected object as one undoable step (selection toolbar). */
  updateSelected(label: string, fn: (o: BoardObject) => BoardObject): void {
    this.commitEditing()
    const ops = [...this.selection]
      .map((id) => this.doc.get(id))
      .filter(isDefined)
      .filter((o) => !o.locked)
      .map((o) => updateOp(o, fn(o)))
    this.commit(label, ops)
  }

  /**
   * Ctrl+C / Ctrl+X: board objects go on the system clipboard in our own format (pasted by any
   * board), with their text as plain text for other apps.
   */
  private onCopy(e: ClipboardEvent, cut: boolean): void {
    if (this.editing || isTypingTarget(e.target) || !this.host.isConnected || this.selection.size === 0 || !this.active()) return
    const cell = this.selectedCell()
    if (cell) {
      // Selected cells copy (and cut) their text, a range as tab-separated rows.
      const r = cell.range
      e.clipboardData?.setData('text/plain', gridText(tableCells(cell.table).slice(r.r0, r.r1 + 1).map((row) => row.slice(r.c0, r.c1 + 1))))
      e.preventDefault()
      if (cut && !this.readOnly && !cell.table.locked) this.commit('칸 잘라내기', [updateOp(cell.table, autosizeTable(clearCells(cell.table, r), measureAt))])
      return
    }
    const payload = copyObjects(this.selection, this.doc.ordered(), this.lookup, (id) => this.layout().boxes.get(id))
    const text = this.plainTextOf(payload.objects)
    clipboard = { payload, text }
    lastPaste = null
    e.clipboardData?.setData(CLIPBOARD_MIME, JSON.stringify(payload))
    e.clipboardData?.setData('text/plain', text)
    e.preventDefault()
    if (cut) this.deleteSelection()
  }

  /** Text of objects in reading order, one per line (for pasting into other apps). */
  private plainTextOf(objects: BoardObject[]): string {
    const layout = this.layout()
    const withRect = objects.map((o) => ({ o, r: this.rectOf(o, layout) ?? { x: 0, y: 0, w: 0, h: 0 } }))
    withRect.sort((a, b) => Math.round(a.r.y / 24) - Math.round(b.r.y / 24) || a.r.x - b.r.x)
    // A table goes as tab-separated rows, which spreadsheets (and boards) read back as a table.
    const text = (o: BoardObject) => (isShape(o) && o.shape === 'table' ? gridText(tableCells(o)) : objectText(o))
    return withRect.map(({ o }) => text(o)).filter((t) => t.trim()).join('\n')
  }

  /** Ctrl+V: board objects, else images, else plain text as a text object. */
  private onPaste(e: ClipboardEvent): void {
    if (this.readOnly || this.editing || isTypingTarget(e.target) || !this.host.isConnected || !this.active()) return
    const data = e.clipboardData
    if (!data) return
    e.preventDefault()
    const raw = data.getData(CLIPBOARD_MIME)
    let payload: ClipboardPayload | null = null
    try {
      const parsed = raw ? JSON.parse(raw) : null
      if (isClipboardPayload(parsed)) payload = parsed
    } catch {
      payload = null
    }
    const text = data.getData('text/plain')
    if (!payload && clipboard && text === clipboard.text) payload = clipboard.payload
    // Text pasted on a selected cell fills it (and the cells after it, from a spreadsheet).
    const cell = this.selectedCell()
    if (cell && !cell.table.locked && text) {
      this.pasteIntoCells(cell, text)
      return
    }
    if (payload) {
      const key = raw || clipboard?.text || ''
      lastPaste = lastPaste?.key === key ? { key, count: lastPaste.count + 1 } : { key, count: 1 }
      this.insertCopies(payload, lastPaste.count * PASTE_STEP, '붙여넣기')
      return
    }
    const files = [...data.files].filter(isImageFile)
    if (files.length > 0) {
      void this.insertImages(files, this.viewCenter())
      return
    }
    const pasted = text.trim()
    if (mermaidKind(pasted)) {
      void this.importMermaid(pasted).then((ok) => this.opts.onNotice?.(ok ? 'Mermaid에서 가져왔습니다' : 'Mermaid를 읽지 못했습니다'))
      return
    }
    const grid = parseGrid(text)
    if (grid) {
      this.insertTable(grid, this.viewCenter())
      return
    }
    if (this.opts.onPasteLink && !pasted.includes('\n') && parseLink(pasted)) {
      this.opts.onPasteLink(pasted, this.viewCenter())
      return
    }
    if (text.trim()) this.insertText(text, this.viewCenter())
  }

  /**
   * Paste what is on the clipboard at `at` (the context menu): objects copied from a board,
   * a picture, Mermaid, a link or text. False when there is nothing it can read.
   */
  async pasteAt(at: Point): Promise<boolean> {
    if (this.readOnly) return false
    let text = ''
    try {
      for (const item of await navigator.clipboard.read()) {
        const image = item.types.find((t) => t.startsWith('image/'))
        if (image) {
          await this.insertImages([await item.getType(image)], at)
          return true
        }
        if (item.types.includes('text/plain')) text = await (await item.getType('text/plain')).text()
      }
    } catch {
      text = await navigator.clipboard.readText().catch(() => '')
    }
    // Objects copied in this window (the clipboard's own format can't be read from here).
    if (clipboard && text === clipboard.text) {
      const shapes = clipboard.payload.objects.filter(isShape)
      const box = unionRects(shapes)
      const dx = box ? snap(at.x - (box.x + box.w / 2)) : PASTE_STEP
      const dy = box ? snap(at.y - (box.y + box.h / 2)) : PASTE_STEP
      this.insertPayload(clipboard.payload, dx, dy, '붙여넣기')
      return true
    }
    const pasted = text.trim()
    if (!pasted) return false
    if (mermaidKind(pasted)) return this.importMermaid(pasted)
    const grid = parseGrid(text)
    if (grid) {
      this.insertTable(grid, at)
      return true
    }
    if (this.opts.onPasteLink && !pasted.includes('\n') && parseLink(pasted)) this.opts.onPasteLink(pasted, at)
    else this.insertText(text, at)
    return true
  }

  /** The selected (not edited) table cell, with its table and the selected range. */
  private selectedCell(): (Cell & { table: ShapeObject; range: CellRange }) | null {
    const c = this.activeCell
    const t = c && this.selection.size === 1 && this.selection.has(c.id) ? this.doc.get(c.id) : undefined
    return c && isShape(t) && t.shape === 'table' ? { table: t, row: c.row, col: c.col, range: this.cellRange()! } : null
  }

  /** The selected cells: from the anchor (Shift) to the selected cell, or just that cell. */
  private cellRange(): CellRange | null {
    const c = this.activeCell
    if (!c) return null
    const a = this.cellAnchor?.id === c.id ? this.cellAnchor : c
    return { r0: Math.min(a.row, c.row), c0: Math.min(a.col, c.col), r1: Math.max(a.row, c.row), c1: Math.max(a.col, c.col) }
  }

  /** The selected table and its selected cells (all of them when none is selected), after typing ends. */
  private tableAndRange(): { t: ShapeObject; range: CellRange; picked: boolean } | null {
    this.commitEditing()
    const t = this.selectedTable()
    if (!t || t.locked) return null
    const r = this.activeCell?.id === t.id ? this.cellRange() : null
    return { t, range: r ?? { r0: 0, c0: 0, r1: tableCells(t).length - 1, c1: tableCols(t).length - 1 }, picked: !!r }
  }

  /** Fill the selected cells (gray takes the fill off); false when no cell is selected. */
  setCellColor(color: ColorKey): boolean {
    const sel = this.tableAndRange()
    if (!sel?.picked) return false
    this.commit('칸 색', [updateOp(sel.t, setCellColors(sel.t, sel.range, color))])
    return true
  }

  /** Align the text in the selected cells' columns (every column with no cell selected). */
  setCellAlign(align: TextAlign): void {
    const sel = this.tableAndRange()
    if (!sel) return
    const cols = Array.from({ length: sel.range.c1 - sel.range.c0 + 1 }, (_, i) => sel.range.c0 + i)
    this.commit('칸 정렬', [updateOp(sel.t, autosizeTable(setColAligns(sel.t, cols, align), measureAt))])
  }

  private pasteIntoCells(cell: Cell & { table: ShapeObject; range: CellRange }, text: string): void {
    const grid = parseGrid(text, true) ?? [[text.replace(/\n+$/, '')]]
    const next = pasteCells(cell.table, { row: cell.range.r0, col: cell.range.c0 }, grid)
    this.commit('칸에 붙여넣기', [updateOp(cell.table, autosizeTable(next, measureAt))])
    this.requestRender()
    this.emitStatus()
  }

  /** A table of pasted rows (a spreadsheet's or a Markdown table), centered at `at`, its first cell selected. */
  private insertTable(grid: string[][], at: Point): void {
    this.commitEditing()
    const width = Math.max(...grid.map((r) => r.length))
    const base = withDefaultStyle(createShape('table', 0, 0, this.doc.maxZ() + 1))
    const sized = autosizeTable(
      { ...base, cols: Array.from({ length: width }, () => TABLE_COL_WIDTH), cells: grid.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? '')) },
      measureAt,
    )
    const table = { ...sized, x: snap(at.x - sized.w / 2), y: snap(at.y - sized.h / 2) }
    this.commit('표 붙여넣기', [createOp(table)])
    this.selection = new Set([table.id])
    this.activeCell = { id: table.id, row: 0, col: 0 }
    this.afterSelectionChange()
  }

  selectAll(): void {
    this.selection = new Set(this.doc.objects.keys())
    this.afterSelectionChange()
  }

  /** A new shape of `kind` centered at `at`, its text being typed (the context menu's "add here"). */
  addShapeAt(kind: ShapeKind, at: Point): void {
    if (this.readOnly) return
    this.commitEditing()
    const spec = SHAPE_SPECS[kind]
    let shape = withDefaultStyle(createShape(kind, snap(at.x - spec.w / 2), snap(at.y - spec.h / 2), this.doc.maxZ() + 1))
    if (isContainer(shape)) shape = { ...shape, z: Math.min(0, ...[...this.doc.objects.values()].map((o) => o.z)) - 1 }
    this.commit('도형 추가', [createOp(shape)])
    this.selection = new Set([shape.id])
    if (shape.shape === 'table') {
      this.activeCell = { id: shape.id, row: 0, col: 0 }
      this.emitStatus()
    } else this.startEditing(shape.id)
  }

  private viewCenter(): Point {
    const v = this.viewport.visibleRect()
    return { x: v.x + v.w / 2, y: v.y + v.h / 2 }
  }

  /** Pasted text becomes a free text object centered at `at`. */
  private insertText(text: string, at: Point): void {
    this.commitEditing()
    const base = { ...withDefaultStyle(createShape('text', 0, 0, this.doc.maxZ() + 1)), text: text.replace(/\r\n/g, '\n').trimEnd() }
    const sized = autosizeShape(base, measureAt)
    const shape = { ...sized, x: snap(at.x - sized.w / 2), y: snap(at.y - sized.h / 2) }
    this.commit('텍스트 붙여넣기', [createOp(shape)])
    this.selection = new Set([shape.id])
    this.afterSelectionChange()
  }

  /** Images (pasted, dropped or imported) at `at`, side by side; each fits in 480px. */
  async insertImages(files: Blob[], at: Point): Promise<void> {
    const store = this.opts.storeImage
    if (!store || files.length === 0) return
    this.commitEditing()
    const stored = await Promise.all(files.map((f) => store(f)))
    let x = at.x
    const shapes = stored.map((img, i) => {
      const k = Math.min(1, IMAGE_MAX / Math.max(img.width, img.height))
      const w = Math.max(GRID, Math.round(img.width * k))
      const h = Math.max(GRID, Math.round(img.height * k))
      const left = i === 0 ? snap(at.x - w / 2) : snap(x)
      x = left + w + GRID * 2
      const shape = createShape('image', left, snap(at.y - h / 2), this.doc.maxZ() + 1 + i, { w, h })
      return { ...shape, src: img.src }
    })
    this.commit('이미지 추가', shapes.map(createOp))
    this.selection = new Set(shapes.map((s) => s.id))
    this.afterSelectionChange()
  }

  /** I: pick image files to place in the middle of the view. */
  importImages(): void {
    const input = this.host.ownerDocument.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.multiple = true
    input.addEventListener('change', () => {
      const files = [...(input.files ?? [])].filter(isImageFile)
      void this.insertImages(files, this.viewCenter())
    })
    input.click()
  }

  private onDragOver(e: DragEvent): void {
    if (e.dataTransfer?.types.includes('Files') || this.opts.draggedFiles?.(e)) {
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
  }

  private onDrop(e: DragEvent): void {
    if (this.readOnly) return
    const dragged = this.opts.draggedFiles?.(e)
    if (dragged) {
      e.preventDefault()
      const sp = this.screenPoint(e)
      const at = this.viewport.toBoard(sp.x, sp.y)
      void dragged().then((links) => this.addFiles(links, at, true))
      return
    }
    const files = [...(e.dataTransfer?.files ?? [])].filter(isImageFile)
    if (files.length === 0) return
    e.preventDefault()
    const sp = this.screenPoint(e)
    void this.insertImages(files, this.viewport.toBoard(sp.x, sp.y))
  }

  duplicateSelection(): void {
    if (this.selection.size === 0) return
    this.insertCopies(copyObjects(this.selection, this.doc.ordered(), this.lookup, (id) => this.layout().boxes.get(id)), PASTE_STEP, '복제')
  }

  private insertCopies(payload: ClipboardPayload, offset: number, label: string): void {
    this.insertPayload(payload, offset, offset, label)
  }

  private insertPayload(payload: ClipboardPayload, dx: number, dy: number, label: string): void {
    this.commitEditing()
    const objects = pasteObjects(payload, dx, dy, this.doc.maxZ() + 1).map((o) => {
      const { locked: _locked, ...rest } = o
      return rest as BoardObject
    })
    this.commit(label, objects.map(createOp))
    this.selection = new Set(objects.map((o) => o.id))
    this.afterSelectionChange()
  }

  zoomBy(factor: number): void {
    this.viewport.zoomAt(this.viewport.width / 2, this.viewport.height / 2, factor)
    this.viewportChanged()
  }

  resetZoom(): void {
    this.zoomBy(1 / this.viewport.zoom)
  }

  /** Shift+1: the whole board; Shift+2: the selection. Fits with a margin, never past 100% / 200%. */
  zoomToFit(selectionOnly: boolean): void {
    const layout = this.layout()
    const objects = this.doc.ordered().filter((o) => !selectionOnly || this.selection.has(o.id))
    const bounds = unionRects(objects.map((o) => this.rectOf(o, layout)).filter((r): r is Rect => r !== null))
    if (!bounds) return
    const margin = 48
    const zoom = Math.min(
      this.viewport.width / (bounds.w + 2 * margin),
      this.viewport.height / (bounds.h + 2 * margin),
      selectionOnly ? 2 : 1,
    )
    this.viewport.setState({ zoom, offsetX: 0, offsetY: 0 })
    const z = this.viewport.zoom
    this.viewport.setState({
      zoom: z,
      offsetX: bounds.x + bounds.w / 2 - this.viewport.width / z / 2,
      offsetY: bounds.y + bounds.h / 2 - this.viewport.height / z / 2,
    })
    this.viewportChanged()
  }

  // ---- object access ------------------------------------------------------

  /** Document objects with in-progress drag previews applied, in drawing order. */
  /** The objects as drawn (previews in place of what they preview), kept until either changes. Shared: don't change the array. */
  private currentObjects(): BoardObject[] {
    const ordered = this.doc.ordered()
    const d = this.derived
    if (ordered !== d.ordered || this.preview.version !== d.previewVersion) {
      d.ordered = ordered
      d.previewVersion = this.preview.version
      d.current = this.preview.size ? ordered.map((o) => this.preview.get(o.id) ?? o) : ordered
    }
    return d.current
  }

  private readonly lookup: Lookup = (id) => this.preview.get(id) ?? this.doc.get(id)

  private shapes(): ShapeObject[] {
    return this.currentObjects().filter(isShape)
  }

  /** Mind map layout of the current objects (previews included). */
  private layout(): MindmapLayout {
    const current = this.currentObjects()
    const d = this.derived
    if (current !== d.layoutFor || !d.layout) {
      d.layoutFor = current
      d.layout = layoutMindmaps(current.filter(isMindmap), measureAt)
    }
    return d.layout
  }

  /** Bounding rect of any object (mind map nodes from the layout, connectors from their line). */
  private rectOf(o: BoardObject, layout: MindmapLayout): Rect | null {
    if (isActor(o)) return actorBounds(o)
    if (isShape(o)) return o
    if (isMindmap(o)) return layout.boxes.get(o.id) ?? null
    const g = connectorGeometry(o, this.lookup)
    return g ? polylineBounds(g.points) : null
  }

  private singleSelectedNode(): MindmapNode | null {
    if (this.selection.size !== 1) return null
    const o = this.lookup([...this.selection][0])
    return isMindmap(o) ? o : null
  }

  private singleSelectedShape(): ShapeObject | null {
    if (this.selection.size !== 1) return null
    const o = this.lookup([...this.selection][0])
    return isShape(o) ? o : null
  }

  private selectedConnector(): ConnectorObject | null {
    if (this.selection.size !== 1) return null
    const o = this.lookup([...this.selection][0])
    return isConnector(o) ? o : null
  }

  private selectedTable(): ShapeObject | null {
    const o = this.singleSelectedShape()
    return o && o.shape === 'table' ? o : null
  }

  /**
   * The "+" buttons beside a table (a column at the right, a row below) and, while a cell is
   * selected, grips to drag its row (on the left) and its column (on top) to another place.
   */
  private tableHandleRects(t: ShapeObject): { addCol: Rect; addRow: Rect; rowGrip: Rect | null; colGrip: Rect | null } {
    const g = 8 / this.viewport.zoom
    const s = 20 / this.viewport.zoom
    const c = this.activeCell?.id === t.id ? this.activeCell : null
    const l = c ? layoutTable(t, measureAt) : null
    const row = c && l && l.rows.length > 1 ? l.rows[c.row] : null
    const col = c && l && l.cols.length > 1 ? l.cols[c.col] : null
    const gs = 12 / this.viewport.zoom
    const gg = 6 / this.viewport.zoom
    return {
      addCol: { x: t.x + t.w + g, y: t.y, w: s, h: t.h },
      addRow: { x: t.x, y: t.y + t.h + g, w: t.w, h: s },
      rowGrip: row ? { x: t.x - gg - gs, y: row.y, w: gs, h: row.h } : null,
      colGrip: col ? { x: col.x, y: t.y - gg - gs, w: col.w, h: gs } : null,
    }
  }

  /** The gap (0…count) a dragged row or column would go into, from the pointer. */
  private tableMoveSlot(t: ShapeObject, what: 'row' | 'col', p: Point): number {
    const l = layoutTable(t, measureAt)
    const mids = what === 'row' ? l.rows.map((r) => r.y + r.h / 2) : l.cols.map((c) => c.x + c.w / 2)
    const at = what === 'row' ? p.y : p.x
    const i = mids.findIndex((m) => at < m)
    return i < 0 ? mids.length : i
  }

  private selectedActor(): ShapeObject | null {
    const o = this.singleSelectedShape()
    return isActor(o) ? o : null
  }

  /** The single selected shape if it can be connected / quick-added from. */
  private connectableSelection(): ShapeObject | null {
    const o = this.singleSelectedShape()
    return o && canConnect(o) ? o : null
  }

  /** Ids in the same group as `id` (just `id` when ungrouped). */
  private groupOf(id: string): string[] {
    const o = this.doc.get(id)
    if (!isShape(o) || !o.groupId) return [id]
    return [...this.doc.objects.values()].filter((x) => isShape(x) && x.groupId === o.groupId).map((x) => x.id)
  }

  /** Shapes already linked to `id` by a connector, in either direction. */
  private connectedTo(id: string): Set<string> {
    const out = new Set<string>()
    for (const o of this.doc.objects.values()) {
      if (!isConnector(o)) continue
      const a = endpointObjectId(o.from)
      const b = endpointObjectId(o.to)
      if (a === id && b) out.add(b)
      if (b === id && a) out.add(a)
    }
    return out
  }

  // ---- rendering ----------------------------------------------------------

  private requestRender(): void {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.renderNow()
    })
  }

  private renderNow(): void {
    if (this.presenting) {
      // Presenting: just the board, no grid, selection or handles.
      this.renderer.render(this.viewport, {
        objects: this.currentObjects(),
        lookup: this.lookup,
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
        image: (src) => this.images.get(src),
        note: (link) => this.notes.get(link),
        mindmap: this.layout(),
        grid: false,
        linkBadges: false,
        spotlight: this.spotlight,
      })
      return
    }
    const it = this.interaction
    let ghost: { shape: ShapeKind; rect: Rect } | null = null
    let previewConnector: ConnectorObject | null = null
    let lookup = this.lookup
    let targetId: string | null = null

    if (it.kind === 'create' && it.dragging) ghost = { shape: it.shape, rect: this.creationRect(it) }
    if (it.kind === 'endpoint' && it.dragging) targetId = it.targetId
    if (it.kind === 'connect' && it.dragging) {
      targetId = it.targetId
      previewConnector = this.tempConnector(it.from, targetId ? { objectId: targetId, ...(it.targetSide ? { side: it.targetSide } : {}) } : { point: it.freePoint })
    }
    const source = this.connectableSelection()
    const inCell = !!source && this.activeCell?.id === source.id
    const showDots = !!source && !inCell && !this.cropping && this.tool.kind === 'select' && !this.editing && (it.kind === 'idle' || it.kind === 'connect')
    if (source && showDots && this.hoverDot && it.kind === 'idle') {
      // Quick-add preview: where the new shape would go and the connector to it (none for stickies).
      const { plan, template } = this.planQuickAdd(source, this.hoverDot)
      const ghostShape: ShapeObject = { ...template, id: GHOST_ID, x: plan.rect.x, y: plan.rect.y, w: plan.rect.w, h: plan.rect.h }
      if (!plan.existingId) ghost = { shape: template.shape, rect: plan.rect }
      const targetIdForPreview = plan.existingId ?? GHOST_ID
      if (source.shape !== 'sticky') previewConnector = this.tempConnector({ objectId: source.id, side: this.hoverDot }, { objectId: targetIdForPreview, side: OPPOSITE_SIDE[this.hoverDot] })
      lookup = (id) => (id === GHOST_ID ? ghostShape : this.lookup(id))
    }

    // Selected actor: add-actor dots, lifeline handle, and the add-message circle.
    const actor = this.selectedActor()
    const actorIdle = !!actor && this.tool.kind === 'select' && !this.editing && (it.kind === 'idle' || it.kind === 'addActor')
    let actorHandles: { stemEnd: Point; message: Point | null } | null = null
    if (actor && actorIdle) {
      const l = lifeline(actor)
      const message = this.hoverMessageDy !== null ? { x: l.x, y: actor.y + this.hoverMessageDy } : null
      actorHandles = { stemEnd: { x: l.x, y: l.bottom }, message }
      if (this.hoverDot && ACTOR_SIDES.includes(this.hoverDot)) {
        const slot = actorSlot(actor, this.hoverDot, this.doc.ordered())
        ghost = { shape: 'actor', rect: { ...slot, w: actor.w, h: actor.h } }
      } else if (message && it.kind === 'idle') {
        const next = this.messageTarget(actor, message.y)
        if (next) previewConnector = this.tempConnector({ objectId: actor.id, dy: this.hoverMessageDy! }, { objectId: next.id, dy: messageDy(next, message.y) })
      }
    }
    const nodeAdd = it.kind === 'idle' ? this.nodeAddButtons() : null
    if (it.kind === 'message' && it.dragging) {
      const from = this.lookup(it.actorId)
      if (isActor(from)) {
        const y = from.y + it.dy
        const target = it.targetId ? this.lookup(it.targetId) : undefined
        const to: Endpoint = isActor(target) ? { objectId: target.id, dy: messageDy(target, target.id === from.id ? it.current.y : y) } : { point: it.current }
        previewConnector = this.tempConnector({ objectId: from.id, dy: it.dy }, to)
        targetId = it.targetId
      }
    }

    let reparent: RenderState['reparent'] = null
    if (it.kind === 'reparent') {
      const layout = this.layout()
      const box = layout.boxes.get(it.nodeId)
      const target = it.target ? layout.boxes.get(it.target.parentId) ?? null : null
      const left = !!it.target?.left
      if (box) reparent = { ghost: { x: left ? it.current.x + 8 - box.w : it.current.x - 8, y: it.current.y - box.h / 2, w: box.w, h: box.h }, target, left }
    }

    const conn = this.selectedConnector()
    // Typing a label keeps the line's handles up (they step around the label box).
    const labelling = this.editing?.kind === 'label' && this.editing.id === conn?.id
    const showConnectorHandles =
      !!conn && this.tool.kind === 'select' && (!this.editing || labelling) && (it.kind === 'idle' || it.kind === 'press' || it.kind === 'segment')
    // While an end is dragged over a shape, its side dots show where the end can pin.
    const dragged = (it.kind === 'endpoint' || it.kind === 'connect') && it.dragging ? it : null
    const endTarget = dragged?.targetId ? this.lookup(dragged.targetId) : undefined
    const endSide = dragged?.kind === 'endpoint' ? dragged.side : dragged?.kind === 'connect' ? dragged.targetSide : null
    const dots =
      isShape(endTarget)
        ? { shape: endTarget, hover: endSide }
        : showDots && source
          ? { shape: source, hover: this.hoverDot }
          : actor && actorIdle
            ? { shape: actor, hover: this.hoverDot, sides: ACTOR_SIDES }
            : null

    let objects = this.currentObjects()
    if (it.kind === 'draw') objects = [...objects, strokeShape(it.points, it.pen, this.penColors[it.pen], Infinity)]
    if (it.kind === 'erase') objects = objects.filter((o) => !it.hits.has(o.id))
    const lasso = it.kind === 'lasso' ? it.points : null
    this.renderer.render(this.viewport, {
      objects,
      lookup,
      selection: this.selection,
      hoverId: this.hoverId,
      highlights: this.highlights,
      editingId: this.editing?.id ?? null,
      marquee: it.kind === 'marquee' ? rectFromPoints(it.downBoard, it.current) : null,
      lasso,
      ghost,
      showHandles: it.kind !== 'move' && it.kind !== 'connect' && !this.editing && !this.cropping,
      crop: this.cropping,
      guides: this.guides,
      dots,
      previewConnector,
      targetId,
      connectorHandles: showConnectorHandles && conn && !conn.locked ? connectorHandles(conn, this.lookup, this.handleLabelBox(conn)) : null,
      image: (src) => this.images.get(src),
      note: (link) => this.notes.get(link),
      noteScroll: (id) => this.noteScrolls.get(id) ?? 0,
      actorHandles,
      nodeAdd: nodeAdd && { child: nodeAdd.child, sibling: nodeAdd.sibling, left: nodeAdd.left, hover: this.hoverNodeAdd },
      reparent,
      tableCell: this.activeCell ? { ...this.activeCell, editing: this.editing?.kind === 'cell', range: this.cellRange() } : null,
      tableHandles: (() => {
        const t = this.selectedTable()
        return t && !t.locked && this.tool.kind === 'select' && (it.kind === 'idle' || it.kind === 'press' || it.kind === 'colResize') ? this.tableHandleRects(t) : null
      })(),
      tableMove: it.kind === 'tableMove' && it.dragging ? { id: it.id, what: it.what, from: it.from, slot: it.slot } : null,
      mindmap: this.layout(),
    })
    if (this.editing) this.layoutTextarea()
  }

  private tempConnector(from: Endpoint, to: Endpoint): ConnectorObject {
    return { ...createConnector(from, to, 0), id: PREVIEW_ID }
  }

  private resize(): void {
    const { width, height } = this.host.getBoundingClientRect()
    this.viewport.width = width
    this.viewport.height = height
    this.renderer.resize(width, height, this.host.ownerDocument.defaultView?.devicePixelRatio || 1)
    this.renderNow()
  }

  // ---- hit testing --------------------------------------------------------

  /** Topmost object under the point: shapes by outline, connectors by line distance or label. */
  private hitTest(p: Point): string | null {
    const ctx = hitContext()
    const tolerance = LINE_HIT / this.viewport.zoom
    const objects = this.currentObjects()
    const layout = this.layout()
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i]
      if (isMindmap(o)) {
        const box = layout.boxes.get(o.id)
        if (box && rectContainsPoint(box, p)) return o.id
        continue
      }
      if (isConnector(o)) {
        const reach = connectorReach(o, this.lookup)
        if (reach && !rectContainsPoint(reach, p)) continue
        const g = connectorGeometry(o, this.lookup)
        if (!g) continue
        if (distanceToPolyline(p, g.points) <= tolerance) return o.id
        if (o.label && rectContainsPoint(this.labelBox(o.label, g), p)) return o.id
        continue
      }
      if (!rectContainsPoint(expandRect(drawBounds(o), tolerance), p)) continue
      if (isContainer(o)) {
        // Sections are picked by their title or border, so empty space inside stays a canvas.
        const title = layoutShapeText(o, measureAt).box
        const titleHit = { ...title, w: Math.max(80, this.measureLabel(o.text) + 8) }
        ctx.lineWidth = tolerance * 2
        if (rectContainsPoint(titleHit, p) || ctx.isPointInStroke(shapePath(o.shape, o), p.x, p.y)) return o.id
        continue
      }
      if (o.shape === 'actor') {
        const l = lifeline(o)
        if (Math.abs(p.x - l.x) <= tolerance && p.y >= l.top && p.y <= l.bottom) return o.id
      }
      if (o.shape === 'freehand') {
        if (hitStroke(o, p, tolerance)) return o.id
        continue
      }
      if (o.shape === 'icon' && o.text) {
        const label = layoutShapeText(o, measureAt).box
        if (rectContainsPoint(label, p)) return o.id
      }
      const path = shapePath(o.shape, o)
      ctx.lineWidth = tolerance * 2
      if (o.deco === 'transparent' || UNFILLED.includes(o.shape)) {
        // Only the outline and the text pick a transparent shape.
        const text = o.text ? layoutShapeText(o, measureAt).box : null
        if (ctx.isPointInStroke(path, p.x, p.y) || (text && rectContainsPoint(text, p))) return o.id
        continue
      }
      if (ctx.isPointInPath(path, p.x, p.y) || ctx.isPointInStroke(path, p.x, p.y)) return o.id
    }
    return null
  }

  /** Lifeline-length handle of the selected actor. */
  private hitStemHandle(p: Point): boolean {
    const a = this.selectedActor()
    if (!a || this.tool.kind !== 'select' || this.editing) return false
    const l = lifeline(a)
    return distance(p, { x: l.x, y: l.bottom }) <= (CONNECTOR_END_RADIUS + 4) / this.viewport.zoom
  }

  /** Board height of the add-message circle if the pointer is on the selected actor's lifeline. */
  private messageDyAt(p: Point): number | null {
    const a = this.selectedActor()
    if (!a || this.tool.kind !== 'select' || this.editing) return null
    const l = lifeline(a)
    if (Math.abs(p.x - l.x) > (DOT_HOVER_RADIUS + 4) / this.viewport.zoom || p.y < l.top || p.y > l.bottom) return null
    return messageDy(a, p.y)
  }

  /** Where a message from `a` at board height `y` goes by default: the next actor right, else left. */
  private messageTarget(a: ShapeObject, y: number): ShapeObject | null {
    const objects = this.doc.ordered()
    return neighbourActor(objects, a, y, 1) ?? neighbourActor(objects, a, y, -1)
  }

  /**
   * Where a line end dragged to `p` lands: a shape (with the side of the dot it is near), else
   * null. The shape at the other end only takes it on one of its other dots, which makes a line
   * from a shape back to itself; that needs the other end on a side too.
   */
  private endTarget(p: Point, otherId: string | null, otherSide: Side | null): { id: string; side: Side | null } | null {
    const r = (DOT_HOVER_RADIUS + 6) / this.viewport.zoom
    // The closest dot in reach; on a small shape the middle can be closer still, which leaves
    // the side to the router.
    const near = (o: ShapeObject, skip: Side | null) => {
      let best: Side | null = null
      let bestDist = Math.min(r, distance(p, center(o)))
      for (const side of SIDES) {
        const d = distance(p, sidePoint(o, side))
        if (side !== skip && d <= bestDist) [best, bestDist] = [side, d]
      }
      return best
    }
    const self = otherId ? this.lookup(otherId) : undefined
    if (isShape(self) && otherSide && !isContainer(self)) {
      const side = near(self, otherSide)
      if (side) return { id: self.id, side }
    }
    const id = this.hitShape(p, otherId ?? '')
    const target = id ? this.lookup(id) : undefined
    return isShape(target) ? { id: target.id, side: near(target, null) } : null
  }

  /** The shape a line end let go at `p` joins (topmost first). */
  private hitShape(p: Point, excludeId: string): string | null {
    const ctx = hitContext()
    const shapes = this.shapes()
    const band = (DOT_HOVER_RADIUS + 4) / this.viewport.zoom
    for (let i = shapes.length - 1; i >= 0; i--) {
      const o = shapes[i]
      if (o.id === excludeId || !canConnect(o)) continue
      if (isContainer(o)) {
        // Only the border and the title, so the inside stays room for free ends.
        ctx.lineWidth = band * 2
        const title = { x: o.x, y: o.y - band, w: Math.max(80, this.measureLabel(o.text) + 8), h: band * 2 + SHAPE_LINE_HEIGHT }
        if (ctx.isPointInStroke(shapePath(o.shape, o), p.x, p.y) || rectContainsPoint(title, p)) return o.id
        continue
      }
      if (ctx.isPointInPath(shapePath(o.shape, o), p.x, p.y)) return o.id
    }
    return null
  }

  private labelBox(label: string, g: ConnectorGeometry): Rect {
    return labelBoxOf(label, g)
  }

  /** The topmost line whose label is under `p`; not a self message's. */
  private labelUnder(p: Point): ConnectorObject | null {
    const objects = this.currentObjects()
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i]
      if (!isConnector(o) || !o.label) continue
      const reach = connectorReach(o, this.lookup)
      if (reach && !rectContainsPoint(reach, p)) continue
      const g = connectorGeometry(o, this.lookup)
      if (g && !g.labelBeside && rectContainsPoint(this.labelBox(o.label, g), p)) return o
    }
    return null
  }

  /** Box of a connector's label, or of the one being typed into it (its handles step around it). */
  private handleLabelBox(c: ConnectorObject): Rect | null {
    const ed = this.editing
    const text = ed?.kind === 'label' && ed.id === c.id ? ed.field.value || ed.field.placeholder : c.label
    const g = text ? connectorGeometry(c, this.lookup) : null
    return g ? this.labelBox(text, g) : null
  }

  /**
   * Resize handle under the point on the selected shape: a corner square, or anywhere along an
   * edge (a band EDGE_GRAB px either side of it). Side dots take precedence (checked first).
   * Text objects only have their left and right edges; images and icons keep their proportions,
   * so they only resize from the corners.
   */
  private hitHandle(p: Point): ResizeHandle | null {
    const o = this.singleSelectedShape()
    if (!o || o.shape === 'table' || o.shape === 'link') return null
    const zoom = this.viewport.zoom
    const r = (HANDLE_SIZE / 2 + 3) / zoom
    const band = EDGE_GRAB / zoom
    const alongX = p.x > o.x && p.x < o.x + o.w
    const alongY = p.y > o.y - r && p.y < o.y + o.h + r
    if (o.shape === 'text') {
      if (!alongY) return null
      if (Math.abs(p.x - o.x) <= Math.max(band, r)) return 'w'
      if (Math.abs(p.x - (o.x + o.w)) <= Math.max(band, r)) return 'e'
      return null
    }
    for (const [x, y, corner] of corners(o)) {
      if (Math.abs(p.x - x) <= r && Math.abs(p.y - y) <= r) return corner
    }
    if (o.shape === 'image' || o.shape === 'icon') return null
    if (alongX && Math.abs(p.y - o.y) <= band) return 'n'
    if (alongX && Math.abs(p.y - (o.y + o.h)) <= band) return 's'
    if (p.y > o.y && p.y < o.y + o.h && Math.abs(p.x - o.x) <= band) return 'w'
    if (p.y > o.y && p.y < o.y + o.h && Math.abs(p.x - (o.x + o.w)) <= band) return 'e'
    return null
  }

  /** End or segment handle of the selected connector under the point. */
  private hitConnectorHandle(p: Point): { end: 'from' | 'to' } | { segment: SegmentHandle } | null {
    const c = this.selectedConnector()
    if (!c || this.tool.kind !== 'select' || this.editing) return null
    const h = connectorHandles(c, this.lookup, this.handleLabelBox(c))
    if (!h) return null
    const zoom = this.viewport.zoom
    const r = (CONNECTOR_END_RADIUS + 4) / zoom
    if (distance(p, h.ends[1]) <= r) return { end: 'to' }
    if (distance(p, h.ends[0]) <= r) return { end: 'from' }
    const along = (SEGMENT_HANDLE_LENGTH / 2 + 3) / zoom
    const across = (SEGMENT_HANDLE_WIDTH / 2 + 4) / zoom
    for (const segment of h.segments) {
      const dx = Math.abs(p.x - segment.at.x)
      const dy = Math.abs(p.y - segment.at.y)
      if (segment.axis === 'x' ? dx <= across && dy <= along : dy <= across && dx <= along) return { segment }
    }
    return null
  }

  private hitDot(p: Point): Side | null {
    const actor = this.selectedActor()
    const o = actor ?? this.connectableSelection()
    if (!o || this.tool.kind !== 'select' || this.editing) return null
    const r = (DOT_HOVER_RADIUS + 2) / this.viewport.zoom
    for (const side of actor ? ACTOR_SIDES : SIDES) {
      if (distance(p, sidePoint(o, side)) <= r) return side
    }
    return null
  }

  // ---- pointer ------------------------------------------------------------

  private screenPoint(e: MouseEvent): Point {
    const r = this.canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  // ---- touch: two fingers pinch and pan ------------------------------------

  /** Fingers on the board (screen points by pointer id). */
  private touches = new Map<number, Point>()
  private pinch: { start: ViewportState; mid: Point; dist: number } | null = null

  private touchGeometry(): { mid: Point; dist: number } {
    const [a, b] = [...this.touches.values()]
    return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: distance(a, b) }
  }

  /** A finger went down; true when it starts (or joins) a pinch and the press is used up. */
  private startTouch(e: PointerEvent, sp: Point): boolean {
    if (e.pointerType !== 'touch') return false
    this.touches.set(e.pointerId, sp)
    if (this.touches.size < 2) return false
    if (this.touches.size === 2) {
      // Whatever the first finger started (a drag, a stroke) gives way to the pinch.
      this.cancelInteraction()
      const { mid, dist } = this.touchGeometry()
      this.pinch = { start: this.viewport.state(), mid, dist }
    }
    return true
  }

  private moveTouch(e: PointerEvent, sp: Point): boolean {
    if (e.pointerType !== 'touch' || !this.touches.has(e.pointerId)) return false
    this.touches.set(e.pointerId, sp)
    if (!this.pinch || this.touches.size < 2) return false
    const { mid, dist } = this.touchGeometry()
    this.viewport.setState(pinchView(this.pinch.start, this.pinch.mid, this.pinch.dist, mid, dist))
    this.viewportChanged()
    return true
  }

  /** A finger lifted; true while it was part of a pinch (the other finger then does nothing). */
  private endTouch(e: PointerEvent): boolean {
    if (!this.touches.delete(e.pointerId)) return false
    if (!this.pinch) return false
    if (this.touches.size === 0) this.pinch = null
    return true
  }

  private onPointerDown(e: PointerEvent): void {
    this.canvas.focus()
    if (this.editing) this.commitEditing()
    const sp = this.screenPoint(e)
    const bp = this.viewport.toBoard(sp.x, sp.y)
    this.canvas.setPointerCapture(e.pointerId)
    if (this.startTouch(e, sp) || this.pinch) return

    if (e.button === 1 || (e.button === 0 && this.spaceHeld)) {
      this.interaction = { kind: 'pan', last: sp }
      this.canvas.style.cursor = 'grabbing'
      return
    }
    if (e.button !== 0) return
    if (this.readOnly) {
      this.interaction = { kind: 'pan', last: sp, click: sp }
      this.canvas.style.cursor = 'grabbing'
      return
    }

    if (this.tool.kind === 'hand') {
      this.interaction = { kind: 'pan', last: sp }
      this.canvas.style.cursor = 'grabbing'
      return
    }
    if (this.cropping) {
      const handle = this.cropHandleAt(bp)
      if (handle) {
        this.interaction = { kind: 'crop', handle, start: { ...this.cropping.area }, down: bp }
        return
      }
      this.finishCrop()
    }
    if (this.tool.kind === 'select' && !this.editing) {
      const folded = this.foldBadgeAt(bp)
      if (folded && !folded.locked) {
        this.setFolded([folded], false)
        return
      }
      const badge = this.linkBadgeAt(bp)
      const hit = e.ctrlKey || e.metaKey ? this.lookup(this.hitTest(bp) ?? '') : undefined
      const link = badge?.link ?? (isShape(hit) ? hit.link : undefined)
      if (link) {
        this.opts.onOpenLink?.(link)
        return
      }
    }
    if (this.tool.kind === 'draw') {
      if (this.tool.pen === 'eraser') {
        this.interaction = { kind: 'erase', hits: new Set() }
        this.eraseAt(bp)
      } else if (this.tool.pen === 'lasso') {
        this.interaction = { kind: 'lasso', points: [bp], base: e.shiftKey ? new Set(this.selection) : new Set(), fromDraw: true }
      } else this.interaction = { kind: 'draw', pen: this.tool.pen, points: [bp] }
      this.requestRender()
      return
    }
    if (this.tool.kind === 'shape') {
      this.interaction = { kind: 'create', shape: this.tool.shape, downScreen: sp, downBoard: bp, current: bp, dragging: false }
      return
    }
    if (this.tool.kind === 'mindmap') {
      this.interaction = { kind: 'place', at: { x: this.gridSnap(bp.x), y: this.gridSnap(bp.y) } }
      return
    }
    if (this.tool.kind === 'connector') {
      // Connector tool (C): from a shape (floating end) or from a snapped point.
      const sourceId = this.hitShape(bp, '')
      const start = snapPoint(bp, this.snapTargets(new Set()), this.snapOptions(e)).point
      this.interaction = {
        kind: 'connect',
        from: sourceId ? { objectId: sourceId } : { point: start },
        sourceId,
        side: null,
        downScreen: sp,
        dragging: false,
        targetId: null,
        targetSide: null,
        freePoint: bp,
      }
      return
    }
    const table = this.selectedTable()
    if (table && !table.locked) {
      const h = this.tableHandleRects(table)
      const c = this.activeCell
      const grip = h.rowGrip && rectContainsPoint(h.rowGrip, bp) ? 'row' : h.colGrip && rectContainsPoint(h.colGrip, bp) ? 'col' : null
      if (grip && c) {
        const from = grip === 'row' ? c.row : c.col
        this.interaction = { kind: 'tableMove', id: table.id, what: grip, from, slot: from, downScreen: sp, dragging: false }
        return
      }
      if (rectContainsPoint(h.addCol, bp) || rectContainsPoint(h.addRow, bp)) {
        this.interaction = { kind: 'tableAdd', id: table.id, what: rectContainsPoint(h.addCol, bp) ? 'col' : 'row' }
        return
      }
      const border = colBorderAt(layoutTable(table, measureAt), bp, 4 / this.viewport.zoom)
      if (border !== null) {
        this.interaction = { kind: 'colResize', original: table, col: border, downX: bp.x }
        return
      }
    }
    // A line's label slides along the line when dragged (a click just selects the line).
    const labeled = this.labelUnder(bp)
    if (labeled && !labeled.locked && !e.altKey) {
      if (!this.selection.has(labeled.id)) {
        this.selection = new Set([labeled.id])
        this.afterSelectionChange()
      }
      this.interaction = { kind: 'labelMove', original: labeled, downScreen: sp, dragging: false }
      return
    }
    const handle = this.hitConnectorHandle(bp)
    const conn = this.selectedConnector()
    if (handle && conn && !conn.locked) {
      this.interaction =
        'end' in handle
          ? { kind: 'endpoint', original: conn, end: handle.end, downScreen: sp, dragging: false, targetId: null, side: null }
          : { kind: 'segment', original: conn, axis: handle.segment.axis, value: handle.segment.value, index: handle.segment.index, downBoard: bp }
      this.emitStatus()
      return
    }
    const add = this.hitNodeAdd(bp)
    const node = this.singleSelectedNode()
    if (add && node) {
      // The new node's text box keeps the focus the click would give the canvas.
      e.preventDefault()
      this.hoverNodeAdd = null
      if (add === 'sibling') this.addSiblingNode(node.id)
      else this.addChildNode(node.id, add === 'left')
      return
    }
    const actor = this.selectedActor()
    if (actor) {
      const side = this.hitDot(bp)
      if (side) {
        this.interaction = { kind: 'addActor', actorId: actor.id, side }
        return
      }
      if (!actor.locked && this.hitStemHandle(bp)) {
        this.interaction = { kind: 'stem', original: actor }
        return
      }
      const dy = this.messageDyAt(bp)
      if (dy !== null) {
        this.interaction = { kind: 'message', actorId: actor.id, dy, downScreen: sp, dragging: false, current: bp, targetId: null }
        return
      }
    }
    const dot = this.hitDot(bp)
    const source = this.connectableSelection()
    if (dot && source) {
      this.interaction = {
        kind: 'connect',
        from: { objectId: source.id, side: dot },
        sourceId: source.id,
        side: dot,
        downScreen: sp,
        dragging: false,
        targetId: null,
        targetSide: null,
        freePoint: bp,
      }
      return
    }
    const corner = this.hitHandle(bp)
    const resizable = this.singleSelectedShape()
    if (corner && resizable && !resizable.locked) {
      this.interaction = { kind: 'resize', corner, original: resizable, downScreen: sp, downBoard: bp, dragging: false }
      return
    }
    this.interaction = { kind: 'press', downScreen: sp, downBoard: bp, hitId: this.hitTest(bp), shift: e.shiftKey, alt: e.altKey, touch: e.pointerType === 'touch' }
  }

  private onPointerMove(e: PointerEvent): void {
    const sp = this.screenPoint(e)
    if (this.moveTouch(e, sp) || this.pinch) return
    const bp = this.viewport.toBoard(sp.x, sp.y)
    const it = this.interaction
    switch (it.kind) {
      case 'idle':
        this.updateHover(bp)
        return
      case 'place':
        return
      case 'pan':
        this.viewport.panByScreen(sp.x - it.last.x, sp.y - it.last.y)
        it.last = sp
        this.viewportChanged()
        return
      case 'press':
        if (distance(sp, it.downScreen) < DRAG_THRESHOLD) return
        if (it.touch && !it.hitId) {
          // A finger on empty board moves the view (a mouse would draw a selection box).
          this.interaction = { kind: 'pan', last: it.downScreen }
          this.onPointerMove(e)
          return
        }
        this.beginDrag(it)
        this.onPointerMove(e)
        return
      case 'draw': {
        const last = it.points[it.points.length - 1]
        if (distance(last, bp) * this.viewport.zoom >= 1) {
          it.points.push(bp)
          this.requestRender()
        }
        return
      }
      case 'erase':
        this.eraseAt(bp)
        return
      case 'lasso': {
        const last = it.points[it.points.length - 1]
        if (distance(last, bp) * this.viewport.zoom >= 2) {
          it.points.push(bp)
          this.requestRender()
        }
        return
      }
      case 'move':
        this.updateMove(it, bp, e)
        return
      case 'resize':
        // Small elements are mostly corner handles; only a real drag resizes.
        if (!it.dragging && distance(sp, it.downScreen) < DRAG_THRESHOLD) return
        it.dragging = true
        this.updateResize(it, bp, e)
        return
      case 'marquee':
        it.current = bp
        this.updateMarquee(it)
        return
      case 'create':
        it.current = bp
        if (distance(sp, it.downScreen) >= DRAG_THRESHOLD) it.dragging = true
        this.requestRender()
        return
      case 'addActor':
      case 'tableAdd':
        return
      case 'crop': {
        const cr = this.cropping
        if (!cr) return
        const f = cr.full
        const s0 = it.start
        const dx = bp.x - it.down.x
        const dy = bp.y - it.down.y
        const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
        if (it.handle === 'move') {
          cr.area = { ...s0, x: clamp(s0.x + dx, f.x, f.x + f.w - s0.w), y: clamp(s0.y + dy, f.y, f.y + f.h - s0.h) }
        } else {
          const min = 16
          let x0 = s0.x
          let y0 = s0.y
          let x1 = s0.x + s0.w
          let y1 = s0.y + s0.h
          if (it.handle.includes('w')) x0 = clamp(x0 + dx, f.x, x1 - min)
          if (it.handle.includes('e')) x1 = clamp(x1 + dx, x0 + min, f.x + f.w)
          if (it.handle.includes('n')) y0 = clamp(y0 + dy, f.y, y1 - min)
          if (it.handle.includes('s')) y1 = clamp(y1 + dy, y0 + min, f.y + f.h)
          cr.area = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
        }
        this.requestRender()
        return
      }
      case 'labelMove': {
        if (!it.dragging && distance(sp, it.downScreen) < DRAG_THRESHOLD) return
        it.dragging = true
        const g = connectorGeometry(it.original, this.lookup)
        const len = g ? polylineLength(g.points) : 0
        if (!g || len <= 0) return
        // Kept off the very ends; it settles back in the middle near it.
        const pos = Math.max(0.05, Math.min(0.95, lengthAtPoint(g.points, bp) / len))
        const { labelPos: _old, ...rest } = it.original
        this.preview.set(it.original.id, Math.abs(pos - 0.5) < 0.03 ? rest : { ...rest, labelPos: Math.round(pos * 1000) / 1000 })
        this.canvas.style.cursor = 'grabbing'
        this.requestRender()
        return
      }
      case 'tableMove': {
        const t = this.lookup(it.id)
        if (!isShape(t)) return
        if (distance(sp, it.downScreen) >= DRAG_THRESHOLD) it.dragging = true
        it.slot = this.tableMoveSlot(t, it.what, bp)
        this.canvas.style.cursor = 'grabbing'
        this.requestRender()
        return
      }
      case 'colResize': {
        const t = it.original
        const width = tableCols(t)[it.col] + (bp.x - it.downX)
        this.preview.set(t.id, autosizeTable(resizeCol(t, it.col, width), measureAt))
        this.requestRender()
        return
      }
      case 'reparent':
        it.current = bp
        it.target = this.reparentTarget(it.nodeId, bp)
        this.requestRender()
        return
      case 'stem': {
        const a = it.original
        const stem = Math.max(MIN_STEM, this.gridSnap(bp.y - (a.y + a.h)))
        this.preview.set(a.id, { ...a, stem })
        this.requestRender()
        return
      }
      case 'message': {
        if (!it.dragging && distance(sp, it.downScreen) < DRAG_THRESHOLD) return
        it.dragging = true
        it.current = bp
        const tolerance = (DOT_HOVER_RADIUS + 4) / this.viewport.zoom
        const onLine = lifelineAt(this.doc.ordered(), bp, tolerance)
        const onBox = this.hitShape(bp, '')
        it.targetId = onLine?.id ?? (isActor(this.lookup(onBox ?? '')) ? onBox : null)
        this.requestRender()
        return
      }
      case 'endpoint':
        if (!it.dragging && distance(sp, it.downScreen) < DRAG_THRESHOLD) return
        if (!it.dragging) {
          it.dragging = true
          this.emitStatus() // hides the selection toolbar while dragging
        }
        this.updateEndpoint(it, bp, e)
        return
      case 'segment':
        this.updateSegment(it, bp, e)
        return
      case 'connect':
        if (!it.dragging && distance(sp, it.downScreen) < DRAG_THRESHOLD) return
        it.dragging = true
        this.hoverDot = null
        const target = this.endTarget(bp, it.sourceId, it.side)
        it.targetId = target?.id ?? null
        it.targetSide = target?.side ?? null
        if (!it.targetId) {
          // A free end snaps like a resize corner (object lines, else grid).
          const r = snapPoint(bp, this.snapTargets(new Set()), this.snapOptions(e))
          it.freePoint = r.point
          this.guides = r.guides
        } else {
          this.guides = []
        }
        this.requestRender()
        return
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (this.endTouch(e)) {
      if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId)
      return
    }
    const it = this.interaction
    this.interaction = { kind: 'idle' }
    this.guides = []
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId)
    switch (it.kind) {
      case 'pan':
        this.canvas.style.cursor = this.spaceHeld ? 'grab' : this.toolCursor()
        if (it.click && distance(it.last, it.click) < DRAG_THRESHOLD) this.followLinkAt(this.viewport.toBoard(it.click.x, it.click.y))
        break
      case 'draw': {
        // A stroke keeps the shape of the drag within half a screen pixel.
        const points = simplify(it.points, 0.5 / this.viewport.zoom)
        const stroke = strokeShape(points, it.pen, this.penColors[it.pen], this.doc.maxZ() + 1)
        this.commit(it.pen === 'marker' ? '형광펜' : '펜', [createOp(stroke)])
        break
      }
      case 'erase': {
        const ops = [...it.hits].map((id) => this.doc.get(id)).filter(isDefined).map(deleteOp)
        this.commit('지우기', ops)
        break
      }
      case 'lasso':
        this.selection = new Set([...it.base, ...this.lassoed(it.points)])
        // From the drawing panel: on to selecting, so what was ringed can be moved right away.
        if (it.fromDraw && this.selection.size > 0) this.setTool({ kind: 'select' })
        this.afterSelectionChange()
        break
      case 'press':
        if (this.selectCellAt(it.hitId, it.shift, it.downBoard)) break
        this.toggleTask(it.hitId, it.shift, it.downBoard)
        this.clickSelect(it.hitId, it.shift)
        break
      case 'move':
        this.reorderActors(it)
        this.commitPreview('이동', it.originals, it.copies)
        break
      case 'resize':
        if (it.dragging) this.commitPreview('크기 조절', new Map([[it.original.id, it.original]]))
        break
      case 'create':
        this.finishCreate(it)
        break
      case 'place':
        this.createMindmapRoot(it.at)
        break
      case 'connect':
        if (!it.dragging) {
          if (it.sourceId && it.side) this.quickAdd(it.sourceId, it.side)
        } else this.finishConnect(it)
        break
      case 'endpoint':
        if (it.dragging) this.commitPreview('연결선 끝 옮기기', new Map([[it.original.id, it.original]]))
        break
      case 'addActor':
        this.addActorBeside(it.actorId, it.side)
        break
      case 'tableAdd':
        this.tableEdit(it.what === 'col' ? 'colEnd' : 'rowEnd')
        break
      case 'crop':
        this.emitStatus()
        break
      case 'labelMove':
        if (it.dragging) this.commitPreview('라벨 옮기기', new Map([[it.original.id, it.original]]))
        this.canvas.style.cursor = ''
        break
      case 'tableMove': {
        // The gap after the dragged one is where it already is.
        if (it.dragging) this.moveTablePart(it.what, it.from, it.slot > it.from ? it.slot - 1 : it.slot)
        else {
          // A click selects the whole row or column.
          const t = this.lookup(it.id)
          if (isShape(t)) {
            const last = { row: tableCells(t).length - 1, col: tableCols(t).length - 1 }
            this.cellAnchor = it.what === 'row' ? { id: it.id, row: it.from, col: 0 } : { id: it.id, row: 0, col: it.from }
            this.activeCell = it.what === 'row' ? { id: it.id, row: it.from, col: last.col } : { id: it.id, row: last.row, col: it.from }
            this.emitStatus()
          }
        }
        this.canvas.style.cursor = ''
        break
      }
      case 'colResize':
        this.commitPreview('열 너비', new Map([[it.original.id, it.original]]))
        break
      case 'reparent':
        this.finishReparent(it)
        break
      case 'stem':
        this.commitPreview('생명선 길이', new Map([[it.original.id, it.original]]))
        break
      case 'message':
        this.finishMessage(it)
        break
      case 'segment':
        this.commitPreview('연결선 구간 옮기기', new Map([[it.original.id, it.original]]))
        break
      case 'marquee':
        break
    }
    this.requestRender()
    this.emitStatus()
  }

  private cancelInteraction(): void {
    this.preview.clear()
    this.guides = []
    this.interaction = { kind: 'idle' }
    this.requestRender()
  }

  private onContextMenu(e: MouseEvent): void {
    e.preventDefault()
    if (this.presenting || !this.opts.onContextMenu) return
    this.commitEditing()
    this.canvas.focus()
    const sp = this.screenPoint(e)
    const bp = this.viewport.toBoard(sp.x, sp.y)
    const id = this.hitTest(bp)
    // The menu is about what was clicked: it joins the selection, or replaces one it isn't in.
    if (id && !this.selection.has(id)) this.selection = new Set(this.groupOf(id))
    else if (!id) this.selection.clear()
    // On a table the menu is about the cell under the pointer (its row and column).
    const t = id ? this.doc.get(id) : undefined
    const cell = isShape(t) && t.shape === 'table' && this.selection.size === 1 ? cellAt(layoutTable(t, measureAt), bp) : null
    const r = this.activeCell?.id === id ? this.cellRange() : null
    const inRange = !!cell && !!r && cell.row >= r.r0 && cell.row <= r.r1 && cell.col >= r.c0 && cell.col <= r.c1
    if (cell && id && !inRange) {
      this.activeCell = { id, ...cell }
      this.cellAnchor = null
    }
    this.afterSelectionChange()
    this.opts.onContextMenu(sp, bp, !!id)
  }

  private onDoubleClick(e: MouseEvent): void {
    if (this.readOnly || this.tool.kind !== 'select') return
    const sp = this.screenPoint(e)
    const id = this.hitTest(this.viewport.toBoard(sp.x, sp.y))
    if (!id) return
    this.selection = new Set([id])
    const o = this.doc.get(id)
    if (isShape(o) && o.shape === 'image') {
      this.startCrop()
      return
    }
    if (isShape(o) && (o.shape === 'link' || o.shape === 'note') && o.link) {
      this.opts.onOpenLink?.(o.link)
      return
    }
    if (isShape(o) && o.shape === 'table') {
      const bp = this.viewport.toBoard(sp.x, sp.y)
      const border = o.locked ? null : colBorderAt(layoutTable(o, measureAt), bp, 4 / this.viewport.zoom)
      if (border !== null) {
        this.commit('열 너비 맞추기', [updateOp(o, autosizeTable(fitCol(o, border, measureAt), measureAt))])
        return
      }
      const cell = cellAt(layoutTable(o, measureAt), bp)
      if (cell) this.startCellEditing(id, cell)
      return
    }
    this.startEditing(id)
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault()
    const sp = this.screenPoint(e)
    const plain = !e.ctrlKey && !e.metaKey && !this.spaceHeld && !e.shiftKey
    if (plain && this.scrollNote(this.viewport.toBoard(sp.x, sp.y), e.deltaY / this.viewport.zoom)) return
    if (e.ctrlKey || e.metaKey || this.spaceHeld) {
      this.viewport.zoomAt(sp.x, sp.y, Math.exp(-e.deltaY * 0.0015))
    } else if (e.shiftKey && e.deltaX === 0) {
      this.viewport.panByScreen(-e.deltaY, 0)
    } else {
      this.viewport.panByScreen(-e.deltaX, -e.deltaY)
    }
    this.viewportChanged()
  }

  private setHoverDot(side: Side | null): void {
    if (side === this.hoverDot) return
    this.hoverDot = side
    this.requestRender()
  }

  private updateHover(bp: Point): void {
    const crop = this.cropping && !this.spaceHeld ? this.cropHandleAt(bp) : null
    if (this.cropping && !this.spaceHeld) {
      const cursors: Record<string, string> = { move: 'move', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize' }
      this.canvas.style.cursor = crop ? cursors[crop] : 'default'
      return
    }
    if (this.readOnly) {
      if (!this.spaceHeld) this.canvas.style.cursor = this.linkAt(bp) ? 'pointer' : 'grab'
      return
    }
    if (this.tool.kind === 'select' && !this.spaceHeld && (this.linkBadgeAt(bp) || (!this.readOnly && this.foldBadgeAt(bp)))) {
      this.canvas.style.cursor = 'pointer'
      return
    }
    const table = this.selectedTable()
    if (table && this.tool.kind === 'select' && !this.spaceHeld) {
      const h = this.tableHandleRects(table)
      const onGrip = (!!h.rowGrip && rectContainsPoint(h.rowGrip, bp)) || (!!h.colGrip && rectContainsPoint(h.colGrip, bp))
      const onPlus = rectContainsPoint(h.addCol, bp) || rectContainsPoint(h.addRow, bp)
      const onBorder = !onPlus && !onGrip && colBorderAt(layoutTable(table, measureAt), bp, 4 / this.viewport.zoom) !== null
      if (onGrip || onPlus || onBorder) {
        this.canvas.style.cursor = onGrip ? 'grab' : onPlus ? 'pointer' : 'col-resize'
        return
      }
    }
    const nodeAdd = this.hitNodeAdd(bp)
    if (nodeAdd !== this.hoverNodeAdd) {
      this.hoverNodeAdd = nodeAdd
      this.requestRender()
    }
    if (nodeAdd) {
      if (!this.spaceHeld) this.canvas.style.cursor = 'pointer'
      return
    }
    const actor = this.selectedActor()
    if (actor) {
      const side = this.hitDot(bp)
      const onStem = !side && this.hitStemHandle(bp)
      const dy = side || onStem ? null : this.messageDyAt(bp)
      if (dy !== this.hoverMessageDy) {
        this.hoverMessageDy = dy
        this.requestRender()
      }
      if (side || onStem || dy !== null) {
        this.setHoverDot(side)
        if (!this.spaceHeld) this.canvas.style.cursor = onStem ? 'ns-resize' : 'pointer'
        if (this.hoverId) {
          this.hoverId = null
          this.requestRender()
        }
        return
      }
    } else if (this.hoverMessageDy !== null) {
      this.hoverMessageDy = null
      this.requestRender()
    }
    const labeled = this.tool.kind === 'select' && !this.spaceHeld ? this.labelUnder(bp) : null
    if (labeled && !labeled.locked) {
      this.canvas.style.cursor = 'move'
      return
    }
    const handle = this.hitConnectorHandle(bp)
    if (handle) {
      if (!this.spaceHeld) this.canvas.style.cursor = 'end' in handle ? 'grab' : handle.segment.axis === 'x' ? 'ew-resize' : 'ns-resize'
      if (this.hoverId) {
        this.hoverId = null
        this.requestRender()
      }
      return
    }
    const dot = this.hitDot(bp)
    this.setHoverDot(dot)
    const corner = dot ? null : this.hitHandle(bp)
    const hit = dot || corner ? null : this.hitTest(bp)
    if (this.tool.kind === 'select' && !this.spaceHeld) {
      this.canvas.style.cursor = dot
        ? 'pointer'
        : corner
          ? RESIZE_CURSOR[corner]
          : hit
            ? 'move'
            : 'default'
    }
    if (hit !== this.hoverId) {
      this.hoverId = hit
      this.requestRender()
    }
  }

  private beginDrag(it: Extract<Interaction, { kind: 'press' }>): void {
    const hit = it.hitId ? this.doc.get(it.hitId) : undefined
    const onlyHit = this.selection.size === 0 || (this.selection.size === 1 && this.selection.has(hit?.id ?? ''))
    if (isMindmap(hit) && hit.parentId && !it.shift && onlyHit && !hit.locked) {
      // A child node is re-attached rather than moved; the root moves the whole map.
      this.selection = new Set([hit.id])
      this.interaction = { kind: 'reparent', nodeId: hit.id, current: it.downBoard, target: null }
      this.hoverId = null
      this.emitStatus()
      return
    }
    if (it.hitId) {
      if (!this.selection.has(it.hitId)) {
        const group = this.groupOf(it.hitId)
        this.selection = it.shift ? new Set([...this.selection, ...group]) : new Set(group)
      }
      // Alt+drag leaves the selection where it is and drags a copy of it.
      const copies = it.alt && this.copyInPlace()
      // Shapes move; mind map nodes move their whole tree (via the root);
      // connectors only carry their free (unattached) ends along.
      const layout = this.layout()
      const originals = new Map<string, BoardObject>()
      for (const id of this.selection) {
        const o = this.doc.get(id)
        if (isMindmap(o)) {
          const root = this.doc.get(layout.rootOf.get(id) ?? id)
          if (root) originals.set(root.id, root)
        } else if (isShape(o) || (isConnector(o) && ('point' in o.from || 'point' in o.to))) originals.set(id, o!)
      }
      for (const [id, o] of originals) if (o.locked) originals.delete(id)
      if (originals.size === 0) {
        // Only locked objects under the pointer: drag a selection box instead.
        const base = it.shift ? new Set(this.selection) : new Set<string>()
        this.interaction = { kind: 'marquee', downBoard: it.downBoard, current: it.downBoard, base }
        this.emitStatus()
        return
      }
      // A section carries everything that lies inside it (a copied one brought copies of it).
      for (const o of copies ? [] : [...originals.values()]) {
        if (!isShape(o) || !isContainer(o)) continue
        for (const inner of this.doc.ordered()) {
          if (originals.has(inner.id) || inner.id === o.id || isConnector(inner) || inner.locked) continue
          if (isMindmap(inner) && inner.parentId) continue
          const r = this.rectOf(inner, layout)
          if (r && containsRect(o, r)) originals.set(inner.id, inner)
        }
      }
      const rects = [...originals.values()].filter((o) => !isConnector(o)).map((o) => this.rectOf(o, layout)).filter(isDefined)
      // Pinned segments travel with a connector whose attached ends all move.
      const rigid = new Set<string>()
      for (const o of this.doc.objects.values()) {
        if (!isConnector(o) || !o.pins) continue
        const attached = [endpointObjectId(o.from), endpointObjectId(o.to)].filter((id): id is string => id !== null)
        // Free ends only move when the connector itself is part of the selection.
        const hasFreeEnd = attached.length < 2
        if (attached.every((id) => originals.has(id)) && (!hasFreeEnd || originals.has(o.id))) {
          originals.set(o.id, o)
          rigid.add(o.id)
        }
      }
      // Selected messages whose actors stay put slide up and down their lifelines.
      const slide = new Set<string>()
      for (const id of this.selection) {
        const o = this.doc.get(id)
        if (!isConnector(o) || !('objectId' in o.from) || !('objectId' in o.to)) continue
        if (o.from.dy === undefined || o.to.dy === undefined) continue
        if (originals.has(o.from.objectId) || originals.has(o.to.objectId)) continue
        originals.set(o.id, o)
        slide.add(o.id)
      }
      this.interaction = { kind: 'move', downBoard: it.downBoard, originals, bbox: unionRects(rects as Rect[]), rigid, slide, copies }
    } else if (it.alt) {
      const base = it.shift ? new Set(this.selection) : new Set<string>()
      this.interaction = { kind: 'lasso', points: [it.downBoard], base, fromDraw: false }
    } else {
      const base = it.shift ? new Set(this.selection) : new Set<string>()
      this.interaction = { kind: 'marquee', downBoard: it.downBoard, current: it.downBoard, base }
    }
    this.hoverId = null
    this.hoverDot = null
    this.emitStatus()
  }

  /**
   * A single actor dragged sideways within its row that passes another actor takes that
   * actor's slot: the row keeps its x positions and only the order changes.
   */
  private reorderActors(it: Extract<Interaction, { kind: 'move' }>): void {
    const moved = [...it.originals.values()].filter((o) => !isConnector(o))
    if (moved.length !== 1 || !isActor(moved[0])) return
    const before = moved[0]
    const after = this.preview.get(before.id)
    if (!isActor(after) || after.y !== before.y || after.x === before.x) return
    const row = this.doc.ordered().filter((o): o is ShapeObject => isActor(o) && o.y === before.y)
    if (row.length < 2) return
    const slots = row.map((a) => a.x).sort((a, b) => a - b)
    const oldOrder = [...row].sort((a, b) => a.x - b.x).map((a) => a.id)
    const centerAfter = (a: ShapeObject) => (a.id === before.id ? after.x : a.x) + a.w / 2
    const newOrder = [...row].sort((a, b) => centerAfter(a) - centerAfter(b)).map((a) => a.id)
    if (newOrder.every((id, i) => id === oldOrder[i])) return
    newOrder.forEach((id, i) => {
      const a = row.find((r) => r.id === id)!
      if (a.x === slots[i] && id !== before.id) return
      if (!it.originals.has(id)) it.originals.set(id, a)
      this.preview.set(id, { ...(id === before.id ? after : a), x: slots[i] })
    })
  }

  /** Move a message up or down its lifelines by `dy`, staying on them. */
  private slideMessage(c: ConnectorObject, dy: number): ConnectorObject {
    const shift = (e: Endpoint): Endpoint => {
      if (!('objectId' in e) || e.dy === undefined) return e
      const a = this.doc.get(e.objectId)
      return isActor(a) ? { ...e, dy: messageDy(a, a.y + e.dy + dy) } : e
    }
    return { ...c, from: shift(c.from), to: shift(c.to) }
  }

  /** Drag a connector end onto a shape (near a side dot it pins to that side, elsewhere it floats) or into free space. */
  private updateEndpoint(it: Extract<Interaction, { kind: 'endpoint' }>, bp: Point, e: MouseEvent): void {
    const c = it.original
    const other = it.end === 'from' ? c.to : c.from
    const target = this.endTarget(bp, endpointObjectId(other), 'side' in other ? (other.side ?? null) : null)
    let end: Endpoint
    if (target) {
      it.side = target.side
      it.targetId = target.id
      end = it.side ? { objectId: target.id, side: it.side } : { objectId: target.id }
      this.guides = []
    } else {
      const r = snapPoint(bp, this.snapTargets(new Set()), this.snapOptions(e))
      it.side = null
      it.targetId = null
      end = { point: r.point }
      this.guides = r.guides
    }
    // A moved end starts a fresh route.
    const { pins: _pins, ...rest } = c
    this.preview.set(c.id, { ...rest, [it.end]: end })
    this.requestRender()
  }

  /** Drag an interior elbow segment across its axis; it snaps to the grid and stays pinned. */
  private updateSegment(it: Extract<Interaction, { kind: 'segment' }>, bp: Point, e: MouseEvent): void {
    const raw = it.value + (bp[it.axis] - it.downBoard[it.axis])
    const mode = this.snapOptions(e).mode
    const value = mode === 'full' || mode === 'grid' ? snap(raw) : Math.round(raw)
    this.preview.set(it.original.id, pinSegment(it.original, this.lookup, it.index, value))
    this.requestRender()
  }

  /** Every change the editor makes goes through here; a read-only view makes none. */
  private commit(label: string, ops: Op[], mergeWithLast = false): void {
    if (this.readOnly) return
    this.doc.commit(label, ops, mergeWithLast)
  }

  /** A coordinate on the grid while grid snapping is on (` held: as it is). */
  private gridSnap(v: number): number {
    return this.snapGrid && !this.backtickHeld ? snap(v) : Math.round(v)
  }

  /** The link of the object under `p`, if it has one. */
  private linkAt(p: Point): string | null {
    const id = this.hitTest(p)
    const o = id ? this.doc.get(id) : undefined
    return isShape(o) && o.link ? o.link : null
  }

  /** Read-only click: follow the link of the object there. */
  private followLinkAt(p: Point): void {
    const link = this.linkAt(p)
    if (link) this.opts.onOpenLink?.(link)
  }

  /** Snap behaviour: the board settings, overridden while dragging by Ctrl (grid only) and ` (off). */
  private snapOptions(e: MouseEvent): SnapOptions {
    const chosen: SnapMode = this.snapGrid ? (this.snapObjects ? 'full' : 'grid') : this.snapObjects ? 'objects' : 'none'
    const mode: SnapMode = this.backtickHeld ? 'none' : e.ctrlKey || e.metaKey ? 'grid' : chosen
    return { mode, grid: GRID, distance: Math.max(12 / this.viewport.zoom, GRID / 2) }
  }

  /** Visible shapes that can act as snap targets, excluding the ones being edited. */
  private snapTargets(exclude: ReadonlySet<string> | Map<string, unknown>): Rect[] {
    const view = this.viewport.visibleRect()
    return this.doc.ordered().filter((o): o is ShapeObject => isShape(o) && !exclude.has(o.id) && rectsIntersect(o, view))
  }

  /** Move the selection with object/spacing/grid snapping. */
  private updateMove(it: Extract<Interaction, { kind: 'move' }>, bp: Point, e: MouseEvent): void {
    const rawDx = bp.x - it.downBoard.x
    const rawDy = bp.y - it.downBoard.y
    let dx: number
    let dy: number
    if (it.bbox) {
      const raw = { ...it.bbox, x: it.bbox.x + rawDx, y: it.bbox.y + rawDy }
      const { rect, guides } = snapMove(raw, this.snapTargets(it.originals), this.snapOptions(e))
      dx = rect.x - it.bbox.x
      dy = rect.y - it.bbox.y
      this.guides = guides
    } else {
      dx = this.gridSnap(rawDx)
      dy = this.gridSnap(rawDy)
    }
    // Shift: only along the way the pointer went furthest (Obsidian's canvas).
    if (e.shiftKey) {
      if (Math.abs(rawDx) >= Math.abs(rawDy)) dy = 0
      else dx = 0
      this.guides = this.guides.filter((g) => g.axis === (dy === 0 ? 'x' : 'y'))
    }
    for (const [id, o] of it.originals) {
      this.preview.set(id, it.slide.has(id) && isConnector(o) ? this.slideMessage(o, dy) : translate(o, dx, dy, it.rigid.has(id)))
    }
    this.requestRender()
  }

  private updateResize(it: Extract<Interaction, { kind: 'resize' }>, bp: Point, e: MouseEvent): void {
    const o = it.original
    const c = it.corner
    // An edge changes one dimension; a corner both.
    const sizesW = c !== 'n' && c !== 's'
    const sizesH = c !== 'e' && c !== 'w'
    const fixed: Point = {
      x: c === 'nw' || c === 'sw' || c === 'w' ? o.x + o.w : o.x,
      y: c === 'nw' || c === 'ne' || c === 'n' ? o.y + o.h : o.y,
    }
    const snapped = snapPoint(bp, this.snapTargets(new Set([o.id])), this.snapOptions(e))
    const moving = snapped.point
    this.guides = snapped.guides.filter((g) => (g.axis === 'x' ? sizesW : sizesH))
    let w = sizesW ? Math.max(MIN_SHAPE_SIZE, Math.abs(moving.x - fixed.x)) : o.w
    let h = sizesH ? Math.max(MIN_SHAPE_SIZE, Math.abs(moving.y - fixed.y)) : o.h
    if (o.shape === 'image' || o.shape === 'icon') {
      // Images and icons keep their proportions; the larger relative change wins.
      const ratio = o.w / o.h
      if (w / o.w >= h / o.h) h = Math.max(MIN_SHAPE_SIZE, Math.round(w / ratio))
      else w = Math.max(MIN_SHAPE_SIZE, Math.round(h * ratio))
    }
    const x = sizesW && moving.x < fixed.x ? fixed.x - w : sizesW ? fixed.x : o.x
    const y = sizesH && moving.y < fixed.y ? fixed.y - h : sizesH ? fixed.y : o.y
    if (o.shape === 'text') {
      // Text takes the width and wraps in it; its height follows the lines.
      this.preview.set(o.id, autosizeShape({ ...o, x, w, idealW: w, fixedWidth: true }, measureAt))
      this.requestRender()
      return
    }
    const resized = { ...o, x, y, w, idealW: w, idealH: h, h }
    this.preview.set(o.id, o.shape === 'freehand' ? scaleStroke(o, x, y, w, h) : autosizeShape(resized, measureAt))
    this.requestRender()
  }

  /**
   * What a lasso rings: shapes, nodes and sections by their middle, pen strokes when most of
   * their points are inside, lines when both ends are (with their groups).
   */
  private lassoed(ring: Point[]): Set<string> {
    const out = new Set<string>()
    if (ring.length < 3) return out
    const layout = this.layout()
    for (const o of this.currentObjects()) {
      let hit = false
      if (isShape(o) && o.shape === 'freehand') {
        const pts = strokePoints(o)
        hit = pts.filter((p) => pointInPolygon(p, ring)).length >= pts.length * 0.6
      } else if (isShape(o) || isMindmap(o)) {
        const r = this.rectOf(o, layout)
        hit = !!r && pointInPolygon({ x: r.x + r.w / 2, y: r.y + r.h / 2 }, ring)
      } else {
        const g = connectorGeometry(o, this.lookup)
        hit = !!g && pointInPolygon(g.points[0], ring) && pointInPolygon(g.points[g.points.length - 1], ring)
      }
      if (hit) for (const id of this.groupOf(o.id)) out.add(id)
    }
    return out
  }

  private updateMarquee(it: Extract<Interaction, { kind: 'marquee' }>): void {
    const area = rectFromPoints(it.downBoard, it.current)
    const next = new Set(it.base)
    const layout = this.layout()
    for (const o of this.currentObjects()) {
      if (isShape(o) || isMindmap(o)) {
        const r = this.rectOf(o, layout)
        // Sections are large backdrops, so they are only picked when fully enclosed.
        const hit = isShape(o) && isContainer(o) ? r && containsRect(area, r) : r && rectsIntersect(area, r)
        if (hit) for (const id of this.groupOf(o.id)) next.add(id)
        continue
      }
      // Connectors are picked when they lie completely inside the area.
      const g = connectorGeometry(o, this.lookup)
      if (g && containsRect(area, polylineBounds(g.points))) next.add(o.id)
    }
    this.selection = next
    this.requestRender()
    this.emitStatus()
  }

  /** A click on a task's box ("- [ ] ") in a shape's text checks it, or unchecks it. */
  private toggleTask(hitId: string | null, shift: boolean, p: Point): void {
    const o = hitId ? this.doc.get(hitId) : undefined
    if (shift || this.readOnly || !hasTextStyle(o) || o.locked) return
    const layout = layoutShapeText(o, measureAt)
    const box = layout.rich.decos.find(
      (d) => d.kind === 'box' && rectContainsPoint({ x: layout.box.x + d.x - 3, y: layout.box.y + d.y - 3, w: d.size + 6, h: d.size + 6 }, p),
    )
    if (box?.kind !== 'box') return
    const text = toggleTaskLine(o.text, box.line)
    if (text !== o.text) this.commit(box.checked ? '할 일 풀기' : '할 일 완료', [updateOp(o, { ...o, text })])
  }

  private clickSelect(hitId: string | null, shift: boolean): void {
    if (!hitId) {
      if (!shift) this.selection.clear()
    } else if (shift) {
      const group = this.groupOf(hitId)
      if (this.selection.has(hitId)) for (const id of group) this.selection.delete(id)
      else for (const id of group) this.selection.add(id)
    } else {
      this.selection = new Set(this.groupOf(hitId))
    }
  }

  private commitPreview(label: string, originals: Map<string, BoardObject>, mergeWithLast = false): void {
    const ops: Op[] = []
    for (const [id, before] of originals) {
      const after = this.preview.get(id)
      if (after) ops.push(updateOp(before, after))
    }
    this.preview.clear()
    this.commit(label, ops, mergeWithLast)
  }

  /**
   * Copies of the selection (and of what lies inside selected sections) right on top of it,
   * selected instead: the start of an Alt+drag.
   */
  private copyInPlace(): boolean {
    const layout = this.layout()
    const ids = new Set(this.selection)
    for (const id of this.selection) {
      const o = this.doc.get(id)
      if (!isShape(o) || !isContainer(o)) continue
      for (const inner of this.doc.ordered()) {
        if (inner.id === o.id || isConnector(inner) || (isMindmap(inner) && inner.parentId)) continue
        const r = this.rectOf(inner, layout)
        if (r && containsRect(o, r)) ids.add(inner.id)
      }
    }
    const payload = copyObjects(ids, this.doc.ordered(), this.lookup, (id) => layout.boxes.get(id))
    const copies = pasteObjects(payload, 0, 0, this.doc.maxZ() + 1).map((o) => {
      const { locked: _locked, ...rest } = o
      return rest as BoardObject
    })
    if (copies.length === 0) return false
    this.commit('복제', copies.map(createOp))
    this.selection = new Set(copies.map((o) => o.id))
    return true
  }

  // ---- creation -----------------------------------------------------------

  /** Click: default size at the snapped click point. Drag: snapped start and size. */
  private creationRect(it: Extract<Interaction, { kind: 'create' }>): Rect {
    const start = { x: this.gridSnap(it.downBoard.x), y: this.gridSnap(it.downBoard.y) }
    const end = { x: this.gridSnap(it.current.x), y: this.gridSnap(it.current.y) }
    const r = rectFromPoints(start, end)
    return { ...r, w: Math.max(MIN_SHAPE_SIZE, r.w), h: Math.max(MIN_SHAPE_SIZE, r.h) }
  }

  private finishCreate(it: Extract<Interaction, { kind: 'create' }>): void {
    const z = this.doc.maxZ() + 1
    let shape: ShapeObject
    if (it.shape === 'text') {
      // The click marks the middle of the first line.
      shape = createShape('text', snap(it.downBoard.x), snap(it.downBoard.y) - SHAPE_LINE_HEIGHT / 2, z)
    } else if (it.shape === 'icon') {
      // A clicked icon is centered on the click; a dragged one is square.
      const tool = this.tool.kind === 'shape' ? this.tool : null
      const r = it.dragging ? this.creationRect(it) : null
      const size = r ? Math.max(r.w, r.h) : SHAPE_SPECS.icon.w
      const x = r ? r.x : snap(it.downBoard.x - size / 2)
      const y = r ? r.y : snap(it.downBoard.y - size / 2)
      shape = { ...createShape('icon', x, y, z, { w: size, h: size }), icon: tool?.icon ?? 'star' }
      if (tool?.iconStyle && tool.iconStyle !== 'color') shape.iconStyle = tool.iconStyle
    } else if (it.dragging && it.shape !== 'actor' && it.shape !== 'table') {
      const r = this.creationRect(it)
      shape = createShape(it.shape, r.x, r.y, z, { w: r.w, h: r.h })
    } else {
      shape = createShape(it.shape, snap(it.downBoard.x), snap(it.downBoard.y), z)
    }
    shape = withDefaultStyle(shape)
    // Sections sit behind everything.
    if (isContainer(shape)) shape = { ...shape, z: Math.min(0, ...[...this.doc.objects.values()].map((o) => o.z)) - 1 }
    this.commit('도형 추가', [createOp(shape)])
    this.selection = new Set([shape.id])
    this.setTool({ kind: 'select' })
    if (shape.shape === 'table') {
      this.activeCell = { id: shape.id, row: 0, col: 0 }
      this.emitStatus()
    } else if (shape.shape === 'icon') {
      this.emitStatus()
    } else this.startEditing(shape.id)
  }

  /** Add an actor 96px beside `actorId` (same size, lifeline and color) and name it. */
  private addActorBeside(actorId: string, side: Side): ShapeObject | null {
    const a = this.doc.get(actorId)
    if (!isActor(a)) return null
    const slot = actorSlot(a, side, this.doc.ordered())
    const actor: ShapeObject = { ...a, id: newId(), x: slot.x, y: slot.y, text: '', z: this.doc.maxZ() + 1, groupId: undefined }
    this.commit('액터 추가', [createOp(actor)])
    this.selection = new Set([actor.id])
    this.startEditing(actor.id)
    return actor
  }

  /** Message from the add-message circle: to the dropped-on actor, or (click) the next actor. */
  private finishMessage(it: Extract<Interaction, { kind: 'message' }>): void {
    const from = this.doc.get(it.actorId)
    if (!isActor(from)) return
    const y = from.y + it.dy
    let target: ShapeObject | null
    let toDy: number
    if (it.dragging) {
      const t = it.targetId ? this.doc.get(it.targetId) : undefined
      if (!isActor(t)) return
      target = t
      toDy = messageDy(t, t.id === from.id ? it.current.y : y)
    } else {
      target = this.messageTarget(from, y)
      if (!target) return
      toDy = messageDy(target, y)
    }
    const message: ConnectorObject = {
      ...createConnector({ objectId: from.id, dy: it.dy }, { objectId: target.id, dy: toDy }, this.doc.maxZ() + 1),
      color: 'gray',
    }
    this.commit('메시지 추가', [createOp(message)])
    this.selection = new Set([message.id])
    this.hoverMessageDy = null
    this.startEditing(message.id)
  }

  /** Dropped a dragged connector: attach to the target shape (floating end) or leave a free end. */
  private finishConnect(it: Extract<Interaction, { kind: 'connect' }>): void {
    const to: Endpoint = it.targetId ? { objectId: it.targetId, ...(it.targetSide ? { side: it.targetSide } : {}) } : { point: it.freePoint }
    // Two free ends that barely moved aren't a connector.
    if ('point' in it.from && 'point' in to && distance(it.from.point, to.point) < GRID) return
    const connector = withDefaultStyle(createConnector(it.from, to, this.doc.maxZ() + 1))
    if (this.tool.kind === 'connector') this.setTool({ kind: 'select' })
    this.commit('연결선 추가', [createOp(connector)])
    this.selection = new Set([connector.id])
    this.startEditing(connector.id)
  }

  /**
   * Quick add: clone the source shape without text QUICK_ADD_GAP away,
   * or connect to an unconnected shape already there, joined by pinned side-to-side connector.
   */
  quickAdd(sourceId: string, side: Side): void {
    const source = this.doc.get(sourceId)
    if (!isShape(source)) return
    this.commitEditing()
    const { plan, template } = this.planQuickAdd(source, side)
    const ops: Op[] = []
    let targetId = plan.existingId
    let z = this.doc.maxZ() + 1
    if (!targetId) {
      const shape: ShapeObject = { ...template, id: crypto.randomUUID(), x: plan.rect.x, y: plan.rect.y, h: template.idealH, text: '', z: z++ }
      ops.push(createOp(shape))
      targetId = shape.id
    }
    if (source.shape !== 'sticky') ops.push(createOp(withDefaultStyle(createConnector({ objectId: source.id, side }, { objectId: targetId, side: OPPOSITE_SIDE[side] }, z))))
    this.commit('빠른 추가', ops)
    this.selection = new Set([targetId])
    this.hoverDot = null
    if (!plan.existingId) this.startEditing(targetId)
    this.requestRender()
    this.emitStatus()
  }

  /**
   * Where quick add from `source` on `side` goes, and the shape it would put there. Stickies
   * line up a grid step apart without lines between them, making room rather than joining a
   * sticky already there.
   */
  private planQuickAdd(source: ShapeObject, side: Side): { plan: QuickAddPlan; template: ShapeObject } {
    const shapes = this.shapes()
    if (source.shape === 'sticky') return { plan: planQuickAdd(source, side, shapes, new Set(shapes.map((o) => o.id)), source, { gap: GRID, aside: GRID }), template: source }
    const template = COPIED_BY_QUICK_ADD.has(source.shape) ? source : withDefaultStyle(createShape('rect', source.x, source.y, source.z))
    return { plan: planQuickAdd(source, side, shapes, this.connectedTo(source.id), template), template }
  }

  /** Ctrl+G groups the selected shapes; Ctrl+Shift+G ungroups them. */
  setGroup(group: boolean): void {
    const shapes = [...this.selection].map((id) => this.doc.get(id)).filter(isShape)
    if (group && shapes.length < 2) return
    const groupId = group ? crypto.randomUUID() : undefined
    const ops = shapes.map((o) => {
      const { groupId: _old, ...rest } = o
      return updateOp(o, groupId ? { ...rest, groupId } : rest)
    })
    this.commit(group ? '그룹' : '그룹 해제', ops)
  }

  // ---- find -----------------------------------------------------------------

  /** Objects whose text contains `query`, in reading order (top to bottom, then left to right). */
  findMatches(query: string): string[] {
    const layout = this.layout()
    const found: { id: string; r: Rect }[] = []
    for (const o of this.doc.ordered()) {
      if (!matches(objectText(o), query)) continue
      // A node folded away sorts where the node that hides it is (revealing it unfolds it).
      let r = this.rectOf(o, layout)
      for (let n: BoardObject | undefined = o; !r && isMindmap(n) && n.parentId; ) {
        n = this.doc.get(n.parentId)
        r = n ? this.rectOf(n, layout) : null
      }
      if (r) found.push({ id: o.id, r })
    }
    // Objects whose tops are within a row height of each other read left to right.
    const row = (r: Rect) => Math.round(r.y / 24)
    found.sort((a, b) => row(a.r) - row(b.r) || a.r.x - b.r.x)
    return found.map((f) => f.id)
  }

  /**
   * Replace `query` with `replacement` in the text of `ids` (find and replace), as one step;
   * returns how many were replaced. Locked objects keep theirs.
   */
  replaceText(ids: string[], query: string, replacement: string): number {
    if (this.readOnly) return 0
    this.commitEditing()
    let total = 0
    const ops: Op[] = []
    for (const id of ids) {
      const o = this.doc.get(id)
      if (!o || o.locked) continue
      const { object, count } = replaceInObject(o, query, replacement)
      if (!count) continue
      total += count
      const sized = isShape(object) ? (object.shape === 'table' ? autosizeTable(object, measureAt) : autosizeShape(object, measureAt)) : object
      ops.push(updateOp(o, sized))
    }
    if (ops.length) this.commit('바꾸기', ops)
    return total
  }

  setHighlights(ids: string[]): void {
    this.highlights = new Set(ids)
    this.requestRender()
  }

  /** Select an object and scroll it into view, zooming out if it doesn't fit. */
  revealObject(id: string): void {
    if (!this.readOnly) this.unfoldAround(id)
    const o = this.doc.get(id)
    const r = o && this.rectOf(o, this.layout())
    if (!r) return
    this.commitEditing()
    this.selection = new Set([id])
    const margin = 64 / this.viewport.zoom
    const view = this.viewport.visibleRect()
    const fits = r.w + 2 * margin <= view.w && r.h + 2 * margin <= view.h
    if (!fits) {
      const zoom = Math.min(this.viewport.width / (r.w + 128), this.viewport.height / (r.h + 128), this.viewport.zoom)
      this.viewport.setState({ ...this.viewport.state(), zoom })
    }
    const inside = fits && r.x >= view.x + margin && r.y >= view.y + margin && r.x + r.w <= view.x + view.w - margin && r.y + r.h <= view.y + view.h - margin
    if (!inside) {
      const z = this.viewport.zoom
      this.viewport.setState({ zoom: z, offsetX: r.x + r.w / 2 - this.viewport.width / z / 2, offsetY: r.y + r.h / 2 - this.viewport.height / z / 2 })
    }
    this.viewportChanged()
  }

  // ---- tables ---------------------------------------------------------------

  /** Click on a cell of the already selected table: select that cell. */
  private selectCellAt(hitId: string | null, shift: boolean, p: Point): boolean {
    const t = this.selectedTable()
    if (!t || hitId !== t.id) return false
    const cell = cellAt(layoutTable(t, measureAt), p)
    if (!cell) return false
    // Shift+click: a range from the selected cell.
    if (shift) {
      if (this.activeCell?.id !== t.id) return false
      if (this.cellAnchor?.id !== t.id) this.cellAnchor = { ...this.activeCell }
    } else this.cellAnchor = null
    this.activeCell = { id: t.id, ...cell }
    this.requestRender()
    this.emitStatus()
    return true
  }

  /** Edit one cell in place; Tab / Shift+Tab move on, Esc keeps the cell selected. */
  private startCellEditing(id: string, cell: Cell, initial?: string): void {
    this.commitEditing()
    const o = this.doc.get(id)
    if (!isShape(o) || o.shape !== 'table' || o.locked) return
    this.selection = new Set([id])
    this.activeCell = { id, ...cell }
    this.cellAnchor = null
    const field = new RichField(this.host.ownerDocument, { lists: false })
    const ta = field.el
    ta.className = 'bl-board-text-editor rich cell'
    ta.spellcheck = false
    field.value = initial ?? tableCells(o)[cell.row]?.[cell.col] ?? ''
    this.overlay.append(ta)
    this.editing = { id, kind: 'cell', original: o, field, cell }
    ta.addEventListener('input', () => this.onTextInput())
    ta.addEventListener('keydown', (e) => {
      if (e.isComposing) {
        e.stopPropagation()
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        this.commitEditing()
        const t = this.doc.get(id)
        const next = isShape(t) ? stepCell(t, cell, e.shiftKey ? -1 : 1) : null
        if (next) this.startCellEditing(id, next)
        else this.canvas.focus()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        this.commitEditing()
        this.canvas.focus()
      } else if (this.onTextStyleKey(e)) {
        e.preventDefault()
      }
      e.stopPropagation()
    })
    ta.addEventListener('blur', () => this.commitEditing())
    this.layoutTextarea()
    ta.focus()
    field.caretToEnd()
    this.requestRender()
    this.emitStatus()
  }

  /** Keys while a cell is selected (not edited). Returns whether the key was used. */
  private onCellKey(e: KeyboardEvent): boolean {
    const c = this.activeCell!
    const t = this.doc.get(c.id)
    if (!isShape(t) || t.shape !== 'table' || !this.selection.has(c.id) || this.selection.size !== 1) {
      this.activeCell = null
      return false
    }
    const rows = tableCells(t).length
    const cols = tableCols(t).length
    // Alt+arrows: the row up / down, the column left / right.
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.key.startsWith('Arrow')) {
      const up = e.key === 'ArrowUp' || e.key === 'ArrowLeft'
      if (!t.locked) this.moveTablePart(e.key === 'ArrowUp' || e.key === 'ArrowDown' ? 'row' : 'col', e.key === 'ArrowUp' || e.key === 'ArrowDown' ? c.row : c.col, (e.key === 'ArrowUp' || e.key === 'ArrowDown' ? c.row : c.col) + (up ? -1 : 1))
      e.preventDefault()
      return true
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return false
    const move = (row: number, col: number, extend = false) => {
      if (!extend) this.cellAnchor = null
      else if (this.cellAnchor?.id !== c.id) this.cellAnchor = { ...c }
      this.activeCell = { id: c.id, row: Math.max(0, Math.min(rows - 1, row)), col: Math.max(0, Math.min(cols - 1, col)) }
      this.requestRender()
      this.emitStatus()
    }
    const range = this.cellRange()!
    const many = range.r0 !== range.r1 || range.c0 !== range.c1
    switch (e.key) {
      case 'ArrowUp':
        move(c.row - 1, c.col, e.shiftKey)
        break
      case 'ArrowDown':
        move(c.row + 1, c.col, e.shiftKey)
        break
      case 'ArrowLeft':
        move(c.row, c.col - 1, e.shiftKey)
        break
      case 'ArrowRight':
        move(c.row, c.col + 1, e.shiftKey)
        break
      case 'Tab': {
        const next = stepCell(t, c, e.shiftKey ? -1 : 1)
        if (next) move(next.row, next.col)
        break
      }
      case 'Enter':
      case 'F2':
        this.startCellEditing(c.id, c)
        break
      case 'Delete':
      case 'Backspace':
        if (!t.locked) this.commit('칸 지우기', [updateOp(t, autosizeTable(clearCells(t, range), measureAt))])
        break
      case 'Escape':
        // A range shrinks to its cell first.
        if (many) this.cellAnchor = null
        else this.activeCell = null
        this.requestRender()
        this.emitStatus()
        break
      default:
        if (e.key === 'Process') {
          // IME: open the editor so the composition lands in the cell.
          this.startCellEditing(c.id, c, '')
          return true
        }
        if (e.key.length !== 1) return false
        // Typing replaces the cell's text, starting with this character.
        this.startCellEditing(c.id, c, e.key)
        break
    }
    e.preventDefault()
    return true
  }

  /** Rows and columns of the selected table, around the selected cell (else at the end). */
  tableEdit(
    op: 'rowAbove' | 'rowBelow' | 'colLeft' | 'colRight' | 'rowEnd' | 'colEnd' | 'deleteRow' | 'deleteCol' | 'header' | 'rowUp' | 'rowDown' | 'colBack' | 'colOn' | 'fit',
  ): void {
    this.commitEditing()
    const t = this.selectedTable()
    if (!t) return
    const rows = tableCells(t).length
    const cols = tableCols(t).length
    const c = this.activeCell?.id === t.id ? this.activeCell : null
    const row = c?.row ?? rows - 1
    const col = c?.col ?? cols - 1
    let next: ShapeObject | null = null
    let cell: Cell | null = c
    switch (op) {
      case 'rowUp':
      case 'rowDown':
        this.moveTablePart('row', row, row + (op === 'rowUp' ? -1 : 1))
        return
      case 'colBack':
      case 'colOn':
        this.moveTablePart('col', col, col + (op === 'colBack' ? -1 : 1))
        return
      case 'rowAbove':
        next = insertRow(t, row)
        cell = { row, col }
        break
      case 'rowBelow':
      case 'rowEnd':
        next = insertRow(t, op === 'rowEnd' ? rows : row + 1)
        cell = { row: op === 'rowEnd' ? rows : row + 1, col: op === 'rowEnd' ? 0 : col }
        break
      case 'colLeft':
        next = insertCol(t, col)
        cell = { row, col }
        break
      case 'colRight':
      case 'colEnd':
        next = insertCol(t, op === 'colEnd' ? cols : col + 1)
        cell = { row: op === 'colEnd' ? 0 : row, col: op === 'colEnd' ? cols : col + 1 }
        break
      case 'deleteRow':
        next = deleteRow(t, row)
        cell = { row: Math.min(row, rows - 2), col }
        break
      case 'deleteCol':
        next = deleteCol(t, col)
        cell = { row, col: Math.min(col, cols - 2) }
        break
      case 'header':
        next = { ...t, header: !hasHeader(t) }
        break
      case 'fit': {
        // The selected cells' columns (all of them with no cell selected) as wide as their text.
        const r = c ? this.cellRange()! : { c0: 0, c1: cols - 1 }
        next = t
        for (let i = r.c0; i <= r.c1; i++) next = fitCol(next, i, measureAt)
        if (c) {
          this.commit('열 너비 맞추기', [updateOp(t, autosizeTable(next, measureAt))])
          this.requestRender()
          this.emitStatus()
          return
        }
        break
      }
    }
    if (!next) return
    this.commit('표 바꾸기', [updateOp(t, autosizeTable(next, measureAt))])
    this.activeCell = cell ? { id: t.id, ...cell } : null
    this.cellAnchor = null
    this.requestRender()
    this.emitStatus()
  }

  /** Move the selected table's row or column `from` to `to`; the selected cell goes with it. */
  private moveTablePart(what: 'row' | 'col', from: number, to: number): void {
    const t = this.selectedTable()
    if (!t || t.locked) return
    const next = what === 'row' ? moveRow(t, from, to) : moveCol(t, from, to)
    if (!next) return
    this.commit(what === 'row' ? '행 옮기기' : '열 옮기기', [updateOp(t, autosizeTable(next, measureAt))])
    const c = this.activeCell?.id === t.id ? this.activeCell : { id: t.id, row: 0, col: 0 }
    this.activeCell = what === 'row' ? { ...c, row: to } : { ...c, col: to }
    this.cellAnchor = null
    this.requestRender()
    this.emitStatus()
  }

  // ---- more menu ------------------------------------------------------------

  private selectedObjects(): BoardObject[] {
    return [...this.selection].map((id) => this.doc.get(id)).filter(isDefined)
  }

  /**
   * Icon button: give the selected flowchart shapes (or icon objects) this icon, or take the
   * icon off shapes with null. Shapes grow to fit the icon above their text.
   */
  setIcon(name: string | null, style?: IconStyle): void {
    this.commitEditing()
    const ops = this.selectedObjects()
      .filter((o): o is ShapeObject => isShape(o) && (FLOW_SHAPES.includes(o.shape) || o.shape === 'icon') && !o.locked)
      .filter((o) => name !== null || o.shape !== 'icon')
      .map((o) => {
        const { icon: _icon, iconStyle: _style, ...rest } = o
        const next: ShapeObject = name === null ? rest : { ...rest, icon: name, ...(style ?? o.iconStyle ? { iconStyle: style ?? o.iconStyle } : {}) }
        return updateOp(o, o.shape === 'icon' ? next : autosizeShape(next, measureAt))
      })
    this.commit(name ? '아이콘' : '아이콘 없애기', ops)
  }

  // ---- presenting ---------------------------------------------------------------

  private presenting = false
  private flight = 0
  /** The slide being presented (the rest is dimmed). */
  private spotlight: Rect | null = null

  /**
   * Slides in reading order: sections (with their titles), row by row and
   * left to right within a row; the whole board when there are none.
   */
  slides(): Rect[] {
    const frames = this.slideSections()
    if (frames.length === 0) {
      const all = this.doc.ordered()
      const layout = this.layout()
      const b = unionRects(all.map((o) => this.rectOf(o, layout)).filter((r): r is Rect => r !== null))
      return b ? [b] : []
    }
    return frames.map((f) => this.sectionRect(f))
  }

  /** The sections in presenting order: the order set by hand, then the rest row by row. */
  slideSections(): ShapeObject[] {
    const frames = this.doc.ordered().filter((o): o is ShapeObject => isShape(o) && isContainer(o))
    const set = (this.doc.meta.slides ?? []).map((id) => frames.find((f) => f.id === id)).filter(isDefined)
    const sorted = frames.filter((f) => !set.includes(f)).sort((a, b) => a.y - b.y)
    const rows: ShapeObject[][] = []
    for (const f of sorted) {
      const row = rows[rows.length - 1]
      // Same row when it starts above the middle of the row's first frame.
      if (row && f.y < row[0].y + row[0].h / 2) row.push(f)
      else rows.push([f])
    }
    return [...set, ...rows.flatMap((row) => row.sort((a, b) => a.x - b.x))]
  }

  /** Present the sections in this order (section ids). */
  setSlideOrder(ids: string[]): void {
    if (this.readOnly) return
    this.doc.setMeta({ slides: ids })
    this.emitStatus()
  }

  /** Select a section and bring it into view. */
  showSection(id: string): void {
    const o = this.doc.get(id)
    if (!isShape(o)) return
    this.selection = new Set([id])
    this.afterSelectionChange()
    this.flyTo(this.sectionRect(o))
  }

  /** A section with its title above it. */
  private sectionRect(f: ShapeObject): Rect {
    return f.text ? unionRects([f, layoutShapeText(f, measureAt).box])! : f
  }

  /** Presenting hides the grid, selection and handles, and ignores the keyboard. */
  setPresenting(on: boolean): void {
    this.commitEditing()
    this.presenting = on
    this.spotlight = null
    if (on) {
      this.selection.clear()
      this.hoverId = null
      this.emitStatus()
    }
    this.canvas.style.cursor = on ? 'default' : this.toolCursor()
    this.requestRender()
  }

  /** Move the view to show `r` with `margin` screen px around it, animated over `ms`. */
  flyTo(r: Rect, margin = 32, ms = 380): void {
    const pad = 16
    this.spotlight = this.presenting ? { x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad } : null
    const zoom = Math.min(MAX_ZOOM, (this.viewport.width - 2 * margin) / r.w, (this.viewport.height - 2 * margin) / r.h)
    const to = { zoom, offsetX: r.x + r.w / 2 - this.viewport.width / zoom / 2, offsetY: r.y + r.h / 2 - this.viewport.height / zoom / 2 }
    const from = this.viewport.state()
    const start = performance.now()
    const id = ++this.flight
    const step = (now: number) => {
      if (id !== this.flight) return
      const t = ms <= 0 ? 1 : Math.min(1, (now - start) / ms)
      const k = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
      // Zoom moves evenly on a log scale; the center follows the screen center.
      const z = Math.exp(Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * k)
      const cx = from.offsetX + this.viewport.width / from.zoom / 2
      const cy = from.offsetY + this.viewport.height / from.zoom / 2
      const tx = to.offsetX + this.viewport.width / to.zoom / 2
      const ty = to.offsetY + this.viewport.height / to.zoom / 2
      const x = cx + (tx - cx) * k
      const y = cy + (ty - cy) * k
      this.viewport.setState({ zoom: z, offsetX: x - this.viewport.width / z / 2, offsetY: y - this.viewport.height / z / 2 })
      this.renderNow()
      if (t < 1) requestAnimationFrame(step)
      else this.viewportChanged()
    }
    requestAnimationFrame(step)
  }

  viewState(): ViewportState {
    return this.viewport.state()
  }

  setViewState(s: ViewportState): void {
    this.flight++
    this.viewport.setState(s)
    this.viewportChanged()
  }

  // ---- Mermaid import -------------------------------------------------------------

  /**
   * Turn Mermaid text (flowchart, sequence diagram or mind map) into board objects centered
   * at `at`, as one undoable step, and select them. False when it isn't a diagram we read.
   */
  async importMermaid(text: string, at = this.viewCenter()): Promise<boolean> {
    const diagram = parseMermaid(text)
    if (!diagram) return false
    this.commitEditing()
    const objects = await buildDiagram(diagram, { autosize: (s) => autosizeShape(s, measureAt), layout: autoLayout })
    const scene = standaloneScene(objects)
    if (!scene) return false
    const b = scene.bounds
    let dx = snap(at.x - (b.x + b.w / 2))
    let dy = snap(at.y - (b.y + b.h / 2))
    // Keep clear of what is already on the board: else go to the right of it.
    const layout = this.layout()
    const existing = [...this.doc.objects.values()].map((o) => this.rectOf(o, layout)).filter((r): r is Rect => r !== null)
    const target = { x: b.x + dx - GRID * 2, y: b.y + dy - GRID * 2, w: b.w + GRID * 4, h: b.h + GRID * 4 }
    const all = unionRects(existing)
    if (all && existing.some((r) => rectsIntersect(r, target))) {
      dx = snap(all.x + all.w + GRID * 8 - b.x)
      dy = snap(all.y - b.y)
    }
    const top = this.doc.maxZ()
    const bottom = Math.min(0, ...[...this.doc.objects.values()].map((o) => o.z))
    const placed = objects.map((o) => {
      const moved = translate(o, dx, dy)
      // Sections go under everything, the rest on top.
      return { ...moved, z: isShape(o) && o.shape === 'section' ? bottom - 1 + o.z : top + o.z }
    })
    this.commit('Mermaid 가져오기', placed.map(createOp))
    this.selection = new Set(placed.map((o) => o.id))
    this.afterSelectionChange()
    const view = this.viewport.visibleRect()
    const r = { x: b.x + dx, y: b.y + dy, w: b.w, h: b.h }
    if (r.x < view.x || r.y < view.y || r.x + r.w > view.x + view.w || r.y + r.h > view.y + view.h) this.zoomToFit(true)
    return true
  }

  // ---- links ----------------------------------------------------------------

  /** Shape whose link badge is under `p`, topmost first. */
  private linkBadgeAt(p: Point): ShapeObject | null {
    const objects = this.currentObjects()
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i]
      if (!isShape(o) || !o.link || o.shape === 'link' || o.shape === 'note') continue
      const b = linkBadge(o)
      if (distance(p, { x: b.cx, y: b.cy }) <= b.r + 2 / this.viewport.zoom) return o
    }
    return null
  }

  /** Give the selected shapes a link, or take it off with null (link objects keep theirs). */
  setLink(link: string | null): void {
    this.updateSelected(link ? '링크 걸기' : '링크 없애기', (o) => {
      if (!isShape(o) || o.shape === 'link') return o
      const { link: _link, ...rest } = o
      return link ? { ...rest, link } : rest
    })
  }

  /**
   * Files from the workspace (vault) side by side from `at`, selected: pictures as images of
   * the file itself (no copy is made), notes, boards and canvases as cards. They move down out
   * of the way of other objects, unless they were dropped right there (`exact`).
   */
  async addFiles(links: string[], at = this.viewCenter(), exact = false): Promise<void> {
    if (this.readOnly || links.length === 0) return
    this.commitEditing()
    const items = await Promise.all(
      links.map(async (link) => {
        const target = parseLink(link)
        if (target?.kind !== 'doc' || !mimeOf(target.path).startsWith('image/')) return { link, w: SHAPE_SPECS.note.w, h: SHAPE_SPECS.note.h }
        await this.images.ready([target.path])
        const img = this.images.get(target.path)
        const [iw, ih] = img ? [img.naturalWidth, img.naturalHeight] : [IMAGE_MAX, IMAGE_MAX * 0.75]
        const k = Math.min(1, IMAGE_MAX / Math.max(iw, ih))
        return { src: target.path, w: Math.max(GRID, Math.round(iw * k)), h: Math.max(GRID, Math.round(ih * k)) }
      }),
    )
    const width = items.reduce((sum, it) => sum + it.w, 0) + GRID * 2 * (items.length - 1)
    const height = Math.max(...items.map((it) => it.h))
    const want = { x: snap(at.x - items[0].w / 2), y: snap(at.y - height / 2), w: width, h: height }
    const spot = exact ? want : this.freeSpot(want)
    let x = spot.x
    let z = this.doc.maxZ() + 1
    const shapes = items.map((it) => {
      const base = createShape('src' in it ? 'image' : 'note', x, spot.y, z++, { w: it.w, h: it.h })
      x = snap(x + it.w + GRID * 2)
      return 'src' in it ? { ...base, src: it.src } : { ...withDefaultStyle(base), link: it.link }
    })
    this.commit('파일 넣기', shapes.map(createOp))
    this.selection = new Set(shapes.map((o) => o.id))
    this.afterSelectionChange()
  }

  /** Files changed somewhere (those at `paths`, or any): read the cards' files again. */
  refreshNotes(paths?: string[]): void {
    this.notes.refresh(paths)
    // Pictures too: a changed file is read again, and one that was missing may be there now.
    this.images.refresh(paths)
  }

  /** A selected note card under the pointer scrolls its text; false when there is nothing to scroll. */
  private scrollNote(p: Point, dy: number): boolean {
    const o = this.singleSelectedShape()
    if (!o || o.shape !== 'note' || !o.link || !rectContainsPoint(o, p)) return false
    const d = noteDrawing(o, this.notes.get(o.link), measureAt, this.noteScrolls.get(o.id) ?? 0)
    if (d.maxScroll === 0) return false
    this.noteScrolls.set(o.id, Math.min(d.maxScroll, Math.max(0, d.scroll + dy)))
    this.requestRender()
    return true
  }

  /** Notes of the note cards among `objects`, read (for exports). */
  private async notesReady(objects: BoardObject[]): Promise<void> {
    await this.notes.ready(objects.flatMap((o) => (isShape(o) && o.shape === 'note' && o.link ? [o.link] : [])))
  }

  /** New link object (one line: icon and title) centered at `at`, selected. */
  insertLinkObject(fields: Pick<ShapeObject, 'link' | 'text' | 'src' | 'preview'>, at = this.viewCenter()): void {
    this.commitEditing()
    const base = { ...createShape('link', 0, 0, this.doc.maxZ() + 1), ...clean(fields) }
    const sized = autosizeShape(base, measureAt)
    const spot = this.freeSpot({ x: snap(at.x - sized.w / 2), y: snap(at.y - sized.h / 2), w: sized.w, h: sized.h })
    const link = { ...sized, x: spot.x, y: spot.y }
    this.commit('링크 추가', [createOp(link)])
    this.selection = new Set([link.id])
    this.afterSelectionChange()
  }

  /** `r` moved down in grid steps until it overlaps nothing (new objects shouldn't hide others). */
  private freeSpot(r: Rect): Point {
    const layout = this.layout()
    // Sections are meant to have things on them.
    const taken = [...this.doc.objects.values()]
      .filter((o) => !(isShape(o) && isContainer(o)))
      .map((o) => this.rectOf(o, layout))
      .filter((x): x is Rect => x !== null)
    let y = r.y
    for (let i = 0; i < 40; i++) {
      const box = { x: r.x - GRID, y: y - GRID, w: r.w + GRID * 2, h: r.h + GRID * 2 }
      const hit = taken.filter((t) => rectsIntersect(t, box))
      if (hit.length === 0) return { x: r.x, y }
      y = snap(Math.max(...hit.map((t) => t.y + t.h)) + GRID * 2)
    }
    return { x: r.x, y }
  }

  /** Point an existing link object somewhere else (new address, title, icon and preview). */
  updateLinkObject(id: string, fields: Pick<ShapeObject, 'link' | 'text' | 'src' | 'preview'>): void {
    const o = this.doc.get(id)
    if (!isShape(o) || o.shape !== 'link' || o.locked) return
    const { src: _src, preview: _preview, ...rest } = o
    this.commit('링크 바꾸기', [updateOp(o, autosizeShape({ ...rest, ...clean(fields) }, measureAt))])
  }

  /** Show the selected link objects as a card with the preview, or as one line again. */
  toggleLinkCard(): void {
    const links = this.selectedObjects().filter((o): o is ShapeObject => isShape(o) && o.shape === 'link' && !o.locked)
    const expand = !links.every((o) => o.expanded)
    this.commit(
      expand ? '카드로 보기' : '한 줄로 보기',
      links.map((o) => {
        const { expanded: _e, ...rest } = o
        return updateOp(o, autosizeShape(expand ? { ...rest, expanded: true } : rest, measureAt))
      }),
    )
  }

  /** The link of the single selected object (its own link, else a link to it). */
  selectionLink(): string | null {
    const only = this.selection.size === 1 ? this.doc.get([...this.selection][0]) : undefined
    return isShape(only) && only.link ? only.link : null
  }

  /**
   * Ctrl+L: put a link to the selected object (or, with nothing selected, this board) on the
   * clipboard; with `view`, a link to the current view of the board.
   */
  async copyLink(view: boolean): Promise<void> {
    const only = this.selection.size === 1 ? [...this.selection][0] : undefined
    const v = this.viewport.visibleRect()
    const link = view
      ? boardLink(this.doc.meta.id, undefined, { x: v.x + v.w / 2, y: v.y + v.h / 2, zoom: this.viewport.zoom })
      : boardLink(this.doc.meta.id, only)
    try {
      await navigator.clipboard.writeText(link)
      this.opts.onNotice?.(view ? '지금 보이는 위치의 링크를 복사했습니다' : only ? '객체 링크를 복사했습니다' : '보드 링크를 복사했습니다')
    } catch {
      this.opts.onNotice?.('링크를 복사하지 못했습니다')
    }
  }

  /** Go where a board link points: an object (selected), or a saved view. */
  showTarget(target: { objectId?: string; view?: { x: number; y: number; zoom: number } }): void {
    if (target.objectId && this.doc.get(target.objectId)) {
      this.revealObject(target.objectId)
      return
    }
    if (target.view) {
      const zoom = Math.min(4, Math.max(0.1, target.view.zoom))
      this.viewport.setState({ zoom, offsetX: target.view.x - this.viewport.width / zoom / 2, offsetY: target.view.y - this.viewport.height / zoom / 2 })
      this.viewportChanged()
    }
  }

  /**
   * Crop the selected picture: the whole picture shows faded around the part kept, whose
   * frame is dragged by its handles or moved; Enter (or a click elsewhere) keeps it, Esc
   * goes back.
   */
  startCrop(): void {
    this.commitEditing()
    const o = this.singleSelectedShape()
    if (!o || o.shape !== 'image' || o.locked || this.readOnly) return
    const c = o.crop ?? { x: 0, y: 0, w: 1, h: 1 }
    const fw = o.w / c.w
    const fh = o.h / c.h
    this.cropping = { id: o.id, full: { x: o.x - c.x * fw, y: o.y - c.y * fh, w: fw, h: fh }, area: { x: o.x, y: o.y, w: o.w, h: o.h } }
    this.requestRender()
    this.emitStatus()
  }

  /** End cropping: keep the framed part (or go back as it was). */
  finishCrop(keep = true): void {
    const cr = this.cropping
    if (!cr) return
    this.cropping = null
    const o = this.doc.get(cr.id)
    if (keep && isShape(o)) {
      const { full: f, area: a } = cr
      const round = (v: number) => Math.round(v * 1e6) / 1e6
      const crop = { x: round((a.x - f.x) / f.w), y: round((a.y - f.y) / f.h), w: round(a.w / f.w), h: round(a.h / f.h) }
      const whole = crop.x <= 0 && crop.y <= 0 && crop.w >= 1 && crop.h >= 1
      const { crop: _old, ...rest } = o
      const box = { x: Math.round(a.x), y: Math.round(a.y), w: Math.round(a.w), h: Math.round(a.h) }
      const next: ShapeObject = { ...rest, ...box, idealW: box.w, idealH: box.h, ...(whole ? {} : { crop }) }
      if (JSON.stringify(next) !== JSON.stringify(o)) this.commit('이미지 자르기', [updateOp(o, next)])
    }
    this.requestRender()
    this.emitStatus()
  }

  /** While cropping: the frame back around the whole picture. */
  cropToWhole(): void {
    if (!this.cropping) return
    this.cropping.area = { ...this.cropping.full }
    this.requestRender()
  }

  /** The selected cropped picture shown whole again, where its whole picture was. */
  uncrop(): void {
    this.commitEditing()
    const o = this.singleSelectedShape()
    if (!o || o.shape !== 'image' || !o.crop || o.locked || this.readOnly) return
    const c = o.crop
    const w = Math.round(o.w / c.w)
    const h = Math.round(o.h / c.h)
    const { crop: _old, ...rest } = o
    this.commit('자르기 없애기', [updateOp(o, { ...rest, x: Math.round(o.x - c.x * w), y: Math.round(o.y - c.y * h), w, h, idealW: w, idealH: h })])
  }

  /** Under `p` while cropping: a frame handle, inside the frame ('move'), or nothing. */
  private cropHandleAt(p: Point): ResizeHandle | 'move' | null {
    const cr = this.cropping
    if (!cr) return null
    const reach = (HANDLE_SIZE / 2 + 4) / this.viewport.zoom
    for (const [x, y, h] of cropHandles(cr.area)) if (Math.abs(p.x - x) <= reach && Math.abs(p.y - y) <= reach) return h
    return rectContainsPoint(cr.area, p) ? 'move' : null
  }

  /** "Add text" (T button, Enter): edit the text of the single selected object. */
  editSelection(): void {
    if (this.selection.size !== 1) return
    const id = [...this.selection][0]
    const o = this.doc.get(id)
    if (isShape(o) && o.shape === 'table') this.startCellEditing(id, this.activeCell ?? { row: 0, col: 0 })
    else if (isShape(o) && o.shape === 'note' && o.link) this.opts.onOpenLink?.(o.link)
    else if (isShape(o) && o.shape === 'image') this.startCrop()
    else this.startEditing(id)
  }

  /** Colors of the pen and the marker (blue and yellow to begin with). */
  private penColors: Record<PenKind, ColorKey> = { pen: 'blue', marker: 'yellow' }

  penColor(pen: PenKind): ColorKey {
    return this.penColors[pen]
  }

  setPenColor(pen: PenKind, color: ColorKey): void {
    this.penColors = { ...this.penColors, [pen]: color }
    this.emitStatus()
  }

  /** Eraser: strokes under the pointer go (on release, as one step). */
  private eraseAt(p: Point): void {
    const it = this.interaction
    if (it.kind !== 'erase') return
    const reach = 8 / this.viewport.zoom
    for (const o of this.doc.objects.values()) {
      if (isShape(o) && o.shape === 'freehand' && !o.locked && !it.hits.has(o.id) && hitStroke(o, p, reach)) {
        it.hits.add(o.id)
        this.requestRender()
      }
    }
  }

  /** Menu "Copy" / "Cut": the copy and cut events do the work (onCopy). */
  copySelection(cut: boolean): void {
    this.commitEditing()
    this.host.ownerDocument.execCommand(cut ? 'cut' : 'copy')
  }

  /** Shift+L: lock the selection, or unlock it when all of it is locked. */
  toggleLock(): void {
    this.commitEditing()
    const objects = this.selectedObjects()
    if (objects.length === 0) return
    const lock = !objects.every((o) => o.locked)
    const ops = objects.map((o) => {
      const { locked: _locked, ...rest } = o
      return updateOp(o, (lock ? { ...rest, locked: true } : rest) as BoardObject)
    })
    this.commit(lock ? '잠금' : '잠금 해제', ops)
  }

  /** Turn the selected flowchart shapes 90° clockwise around their centers. */
  rotateSelected(): void {
    const ops = this.selectedObjects()
      .filter((o): o is ShapeObject => isFlowShape(o) && !o.locked)
      .map((s) => {
        const angle = ((s.angle ?? 0) + 90) % 360
        const { angle: _angle, ...rest } = s
        const x = Math.round(s.x + s.w / 2 - s.h / 2)
        const y = Math.round(s.y + s.h / 2 - s.w / 2)
        const next: ShapeObject = { ...rest, x, y, w: s.h, h: s.w, idealW: s.idealH, idealH: s.idealW }
        return updateOp(s, angle ? { ...next, angle } : next)
      })
    this.commit('회전', ops)
  }

  /** Ctrl+Alt+C: remember the style of the (first) selected object. */
  copyStyle(): boolean {
    const first = this.selectedObjects()[0]
    if (!first) return false
    copiedStyle = styleOf(first)
    return true
  }

  /** Ctrl+Alt+V: give the selection the copied style. */
  pasteStyle(): void {
    const style = copiedStyle
    if (style) this.updateSelected('스타일 붙여넣기', (o) => applyStyle(o, style))
  }

  canPasteStyle(): boolean {
    return copiedStyle !== null
  }

  /** Ctrl+Shift+D: new objects of the selected kind start with its style. */
  saveDefaultStyle(): boolean {
    const first = this.selectedObjects()[0]
    return first ? saveDefaultStyle(first) : false
  }

  /** Put a section behind the selection, 48px around it. */
  wrapInSection(): void {
    this.commitEditing()
    const layout = this.layout()
    const b = unionRects(this.selectedObjects().map((o) => this.rectOf(o, layout)).filter((r): r is Rect => r !== null))
    if (!b) return
    const x = snap(b.x - WRAP_PADDING)
    const y = snap(b.y - WRAP_PADDING)
    const w = snap(b.x + b.w + WRAP_PADDING) - x
    const h = snap(b.y + b.h + WRAP_PADDING) - y
    const z = Math.min(0, ...[...this.doc.objects.values()].map((o) => o.z)) - 1
    const section = withDefaultStyle(createShape('section', x, y, z, { w, h }))
    this.commit('섹션으로 감싸기', [createOp(section)])
    this.selection = new Set([section.id])
    this.afterSelectionChange()
    this.startEditing(section.id, true)
  }

  /** Move (and size) the selected shapes onto the 12px grid. */
  snapSelectionToGrid(): void {
    const ops = this.selectedObjects()
      .filter((o): o is ShapeObject => isShape(o) && !o.locked)
      .map((s) => {
        const sized = s.shape === 'text' || s.shape === 'table'
        const w = sized ? s.w : Math.max(GRID, snap(s.w))
        const h = sized ? s.h : Math.max(GRID, snap(s.h))
        return updateOp(s, { ...s, x: snap(s.x), y: snap(s.y), w, h, idealW: sized ? s.idealW : w, idealH: sized ? s.idealH : h })
      })
    this.commit('격자에 맞추기', ops)
  }

  /**
   * "Copy as": the selection (or the board) on the system clipboard as an image, SVG or
   * Mermaid text. Returns false when there is nothing to copy or the clipboard refused.
   */
  async copyAs(format: 'png' | 'png-bg' | 'png-dark' | 'png-light' | 'svg' | 'mermaid' | 'markdown'): Promise<boolean> {
    this.commitEditing()
    const scene = this.exportScene()
    if (!scene) return false
    try {
      if (format === 'mermaid' || format === 'markdown') {
        await navigator.clipboard.writeText(format === 'mermaid' ? toMermaid(scene.objects) : boardToMarkdown(scene.objects))
        return true
      }
      if (format === 'svg') {
        const svg = new TextDecoder().decode((await this.exportImage('svg')) ?? new Uint8Array())
        await navigator.clipboard.writeText(svg)
        return true
      }
      const options: PngOptions =
        format === 'png' ? { background: false } : format === 'png-bg' ? {} : { mode: format === 'png-dark' ? 'dark' : 'light' }
      // The clipboard item takes a promise so the click still counts as the user's gesture.
      const blob = this.exportImage('png', options).then((bytes) => new Blob([new Uint8Array(bytes ?? [])], { type: 'image/png' }))
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      return true
    } catch (err) {
      console.error('copy as', format, err)
      return false
    }
  }

  // ---- align and distribute -------------------------------------------------

  /** Line up the selected shapes on their common bounds' edge or center. */
  align(how: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'): void {
    const shapes = [...this.selection].map((id) => this.doc.get(id)).filter((o): o is ShapeObject => isShape(o))
    const b = unionRects(shapes)
    if (!b || shapes.length < 2) return
    // Locked shapes still count for the edges but stay put.
    const ops = shapes.filter((s) => !s.locked).map((s) => {
      const x = how === 'left' ? b.x : how === 'right' ? b.x + b.w - s.w : how === 'hcenter' ? Math.round(b.x + (b.w - s.w) / 2) : s.x
      const y = how === 'top' ? b.y : how === 'bottom' ? b.y + b.h - s.h : how === 'vcenter' ? Math.round(b.y + (b.h - s.h) / 2) : s.y
      return updateOp(s, { ...s, x, y })
    })
    this.commit('정렬', ops)
  }

  /** Equal gaps between the selected shapes, keeping the first and last in place. */
  distribute(axis: 'h' | 'v'): void {
    const shapes = [...this.selection].map((id) => this.doc.get(id)).filter((o): o is ShapeObject => isShape(o) && !o.locked)
    if (shapes.length < 3) return
    const pos = (s: ShapeObject) => (axis === 'h' ? s.x : s.y)
    const size = (s: ShapeObject) => (axis === 'h' ? s.w : s.h)
    const sorted = [...shapes].sort((a, b) => pos(a) - pos(b))
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const span = pos(last) + size(last) - pos(first)
    const gap = (span - sorted.reduce((sum, s) => sum + size(s), 0)) / (sorted.length - 1)
    let at = pos(first)
    const ops = sorted.map((s) => {
      const p = Math.round(at)
      at += size(s) + gap
      return updateOp(s, axis === 'h' ? { ...s, x: p } : { ...s, y: p })
    })
    this.commit('간격 맞추기', ops)
  }

  // ---- stacking order -------------------------------------------------------

  /** Move the selection to the front/back, or one step forward/backward, as one undoable step. */
  reorder(how: 'front' | 'back' | 'forward' | 'backward'): void {
    const ordered = this.doc.ordered()
    const sel = (o: BoardObject) => this.selection.has(o.id)
    if (!ordered.some(sel)) return
    let list = [...ordered]
    if (how === 'front') list = [...list.filter((o) => !sel(o)), ...list.filter(sel)]
    else if (how === 'back') list = [...list.filter(sel), ...list.filter((o) => !sel(o))]
    else if (how === 'forward') {
      for (let i = list.length - 2; i >= 0; i--) if (sel(list[i]) && !sel(list[i + 1])) [list[i], list[i + 1]] = [list[i + 1], list[i]]
    } else {
      for (let i = 1; i < list.length; i++) if (sel(list[i]) && !sel(list[i - 1])) [list[i - 1], list[i]] = [list[i], list[i - 1]]
    }
    // Hand the existing z values out in the new order.
    const zs = ordered.map((o) => o.z)
    const ops: Op[] = []
    list.forEach((o, i) => {
      if (o.z !== zs[i]) ops.push(updateOp(o, { ...o, z: zs[i] }))
    })
    this.commit('순서 바꾸기', ops)
  }

  // ---- auto layout ----------------------------------------------------------

  /**
   * Lay out shapes with ELK: two or more selected shapes, else the connected group of the one
   * selected shape, else every shape that has a connector. One undoable step.
   */
  async autoLayout(direction: LayoutDirection): Promise<boolean> {
    this.commitEditing()
    const ops = await layoutOps(this.doc, [...this.selection], direction)
    if (ops.length === 0) return false
    this.commit('자동 정렬', ops)
    return true
  }

  // ---- export ---------------------------------------------------------------

  /**
   * What an export shows: the selection (whole mind map trees, plus connectors whose attached
   * ends are all included) or, with nothing selected, the whole board.
   */
  exportScene(): ExportScene | null {
    return this.sceneFor(this.selection.size ? this.selection : null)
  }

  /** Scene of `chosen` (with whole mind maps and the connectors between them), or of everything. */
  private sceneFor(chosen: Iterable<string> | null): ExportScene | null {
    const layout = this.layout()
    const all = this.doc.ordered()
    let ids: Set<string>
    if (!chosen) {
      ids = new Set(all.map((o) => o.id))
    } else {
      ids = new Set()
      for (const id of chosen) {
        const o = this.doc.get(id)
        if (!o) continue
        if (isMindmap(o)) {
          const root = layout.rootOf.get(id) ?? id
          ids.add(root)
          for (const d of descendants(root, layout.children)) ids.add(d)
        } else ids.add(id)
      }
      for (const o of all) {
        if (!isConnector(o)) continue
        const attached = [endpointObjectId(o.from), endpointObjectId(o.to)].filter((id): id is string => id !== null)
        if (attached.length > 0 && attached.every((id) => ids.has(id))) ids.add(o.id)
      }
    }
    const scene = sceneOf(all.filter((o) => ids.has(o.id)), this.lookup, layout)
    return scene && { ...scene, note: (link) => this.notes.get(link) }
  }

  /** SVG picture of a set of objects that aren't on the board (a version from the history). */
  previewSvg(objects: BoardObject[]): string | null {
    return previewSvg(objects)
  }

  /** Replace the whole board with `objects` as one undoable step (restoring a version). */
  /** Objects changed from outside the board's own tools (links following a moved file), as one step. */
  updateObjects(objects: BoardObject[], label: string): void {
    const ops = objects.flatMap((o) => {
      const before = this.doc.get(o.id)
      return before ? [updateOp(before, o)] : []
    })
    if (ops.length) this.commit(label, ops)
  }

  replaceAll(objects: BoardObject[], label: string): void {
    this.commitEditing()
    const next = new Map(objects.map((o) => [o.id, o]))
    const ops: Op[] = []
    for (const o of this.doc.objects.values()) {
      const after = next.get(o.id)
      ops.push(after ? updateOp(o, after) : deleteOp(o))
    }
    for (const o of objects) if (!this.doc.get(o.id)) ops.push(createOp(o))
    this.selection.clear()
    this.commit(label, ops)
  }

  /** The whole board as a light PNG, for notes that embed it (X.board.png). */
  async boardPicture(): Promise<Uint8Array | null> {
    const scene = this.sceneFor(null)
    if (!scene) return null
    await Promise.all([this.images.ready(new Set(scene.objects.flatMap(imageSrcs))), this.notesReady(scene.objects)])
    const styles = new Set(scene.objects.flatMap((o) => (isShape(o) && o.icon ? [iconStyleOf(o)] : [])))
    await Promise.all([...styles].map(loadIconSet))
    return exportPng(scene, measureAt, (src) => this.images.get(src), { mode: 'light' })
  }

  /** The selection (or the whole board) as the body of a Markdown note; null when there is nothing. */
  exportMarkdown(): string | null {
    this.commitEditing()
    const scene = this.exportScene()
    return scene ? boardToMarkdown(scene.objects) : null
  }

  /** Render the export scene as PNG or SVG bytes; null when there is nothing to export. */
  async exportImage(format: 'png' | 'svg', png: PngOptions = {}): Promise<Uint8Array | null> {
    this.commitEditing()
    const scene = this.exportScene()
    if (!scene) return null
    const iconStyles = new Set(scene.objects.flatMap((o) => (isShape(o) && o.icon ? [iconStyleOf(o)] : [])))
    await Promise.all([...[...iconStyles].map(loadIconSet), this.notesReady(scene.objects)])
    const srcs = new Set(scene.objects.flatMap(imageSrcs))
    if (format === 'png') {
      await this.images.ready(srcs)
      return exportPng(scene, measureAt, (src) => this.images.get(src), png)
    }
    const data = new Map<string, string>()
    for (const src of srcs) {
      const url = await this.images.dataUrl(src)
      if (url) data.set(src, url)
    }
    return new TextEncoder().encode(exportSvg(scene, measureAt, data))
  }

  // ---- mind map -----------------------------------------------------------

  private createMindmapRoot(at: Point): void {
    const root = createMindmapNode(null, at.x, at.y, 0, 'gray', this.doc.maxZ() + 1)
    this.commit('마인드맵 추가', [createOp(root)])
    this.selection = new Set([root.id])
    this.setTool({ kind: 'select' })
    this.startEditing(root.id)
  }

  /** Branch color for a new node under `parent`: level-1 nodes take the next palette color. */
  private branchColorFor(parent: MindmapNode): MindmapNode['color'] {
    if (parent.parentId) return parent.color
    const count = (this.layout().children.get(parent.id) ?? []).length
    return BRANCH_COLORS[count % BRANCH_COLORS.length]
  }

  /** Where the selected mind map node's "+" buttons are: a child to its right, a sibling below. */
  private nodeAddButtons(): { child: Point; sibling: Point | null; left: Point | null } | null {
    const node = this.singleSelectedNode()
    if (!node || node.locked || this.readOnly || this.tool.kind !== 'select' || this.editing) return null
    const box = this.layout().boxes.get(node.id)
    if (!box) return null
    const gap = (DOT_HOVER_RADIUS + 8) / this.viewport.zoom
    const past = box.hidden ? 2 * foldBadge(box).r + 8 : 0
    const out = box.left ? -1 : 1
    return {
      child: { x: outerEdge(box) + out * (past + gap), y: box.attachY },
      sibling: node.parentId ? { x: box.x + box.w / 2, y: box.y + box.h + gap } : null,
      left: node.parentId ? null : { x: box.x - gap, y: box.attachY },
    }
  }

  private hitNodeAdd(p: Point): 'child' | 'sibling' | 'left' | null {
    const b = this.nodeAddButtons()
    if (!b) return null
    const r = (DOT_HOVER_RADIUS + 2) / this.viewport.zoom
    if (distance(p, b.child) <= r) return 'child'
    if (b.left && distance(p, b.left) <= r) return 'left'
    return b.sibling && distance(p, b.sibling) <= r ? 'sibling' : null
  }

  addChildNode(parentId: string, left = false): void {
    this.commitEditing(true)
    const parent = this.doc.get(parentId)
    if (!isMindmap(parent)) return
    const siblings = this.layout().children.get(parentId) ?? []
    const order = siblings.length ? siblings[siblings.length - 1].order + 1 : 0
    const made = createMindmapNode(parentId, 0, 0, order, this.branchColorFor(parent), this.doc.maxZ() + 1)
    // Only a root's own branches carry a side.
    const node: MindmapNode = left && !parent.parentId ? { ...made, side: 'left' } : made
    this.commit('노드 추가', [createOp(node), ...(parent.collapsed ? [updateOp(parent, unfolded(parent, false))] : [])])
    this.selection = new Set([node.id])
    this.startEditing(node.id)
  }

  /** New sibling right after `id` (between it and the next sibling). */
  addSiblingNode(id: string): void {
    this.commitEditing(true)
    const node = this.doc.get(id)
    if (!isMindmap(node) || !node.parentId) return
    const parent = this.doc.get(node.parentId)
    if (!isMindmap(parent)) return
    const siblings = this.layout().children.get(parent.id) ?? []
    const next = siblings[siblings.findIndex((s) => s.id === id) + 1]
    const order = next ? (node.order + next.order) / 2 : node.order + 1
    const made = createMindmapNode(parent.id, 0, 0, order, this.branchColorFor(parent), this.doc.maxZ() + 1)
    const sibling: MindmapNode = node.side ? { ...made, side: node.side } : made
    this.commit('노드 추가', [createOp(sibling)])
    this.selection = new Set([sibling.id])
    this.startEditing(sibling.id)
  }

  /**
   * Where a dragged node would attach: the nearest node whose right half the pointer is past
   * (its children sit to its right), ordered among that node's children by height.
   */
  private reparentTarget(nodeId: string, p: Point): { parentId: string; index: number; left: boolean } | null {
    const layout = this.layout()
    const excluded = new Set([nodeId, ...descendants(nodeId, layout.children)])
    let best: { box: NodeBox; d: number; left: boolean } | null = null
    for (const box of layout.boxes.values()) {
      if (excluded.has(box.id)) continue
      // Past the middle on the side its branches grow (a root: either side).
      const mid = box.x + box.w / 2
      const left = box.level === 0 ? p.x < mid : !!box.left
      if (left ? p.x > mid : p.x < mid) continue
      const d = Math.hypot(p.x - (left ? box.x : box.x + box.w), p.y - box.attachY)
      if (!best || d < best.d) best = { box, d, left }
    }
    if (!best || best.d > REPARENT_REACH) return null
    const { box, left } = best
    // Among the children on that side, by height.
    const siblings = (layout.children.get(box.id) ?? []).filter((s) => s.id !== nodeId && (box.level !== 0 || (s.side === 'left') === left))
    const index = siblings.filter((s) => {
      const b = layout.boxes.get(s.id)
      return b !== undefined && b.y + b.h / 2 < p.y
    }).length
    return { parentId: box.id, index, left }
  }

  /** Drop: re-attach to the target (taking its branch color), or out on its own as a new map. */
  private finishReparent(it: Extract<Interaction, { kind: 'reparent' }>): void {
    const node = this.doc.get(it.nodeId)
    if (!isMindmap(node)) return
    const layout = this.layout()
    const subtree = descendants(node.id, layout.children)
    const ops: Op[] = []
    if (!it.target) {
      const box = layout.boxes.get(node.id)
      const { side: _side, ...free } = node
      ops.push(updateOp(node, { ...free, parentId: null, order: 0, x: snap(it.current.x - 8), y: snap(it.current.y - (box?.h ?? 0) / 2) }))
      this.commit('새 마인드맵으로 떼어내기', ops)
      return
    }
    const parent = this.doc.get(it.target.parentId)
    if (!isMindmap(parent)) return
    if (parent.collapsed) ops.push(updateOp(parent, unfolded(parent, false)))
    // The index counts the children on the target's side (a root has two); the other side keeps its order.
    const left = !parent.parentId && it.target.left
    const all = (layout.children.get(parent.id) ?? []).filter((s) => s.id !== node.id)
    const sameSide = parent.parentId ? all : all.filter((s) => (s.side === 'left') === left)
    const otherSide = all.filter((s) => !sameSide.includes(s))
    const ordered = [...otherSide, ...sameSide.slice(0, it.target.index), node, ...sameSide.slice(it.target.index)]
    const color = parent.parentId ? parent.color : node.color
    ordered.forEach((s, order) => {
      const current = this.doc.get(s.id)
      if (!isMindmap(current)) return
      const { side: _side, ...sideless } = current
      const placed = left ? { ...sideless, side: 'left' as const } : sideless
      const next = s.id === node.id ? { ...placed, parentId: parent.id, order, color } : { ...current, order }
      ops.push(updateOp(current, next))
    })
    // The moved branch takes the color of the branch it joins.
    for (const id of subtree) {
      const d = this.doc.get(id)
      if (isMindmap(d) && d.color !== color) ops.push(updateOp(d, { ...d, color }))
    }
    this.commit('노드 옮기기', ops)
  }

  /** Whether the node is on its root's left (branches grow leftwards). */
  nodeOnLeft(id: string): boolean {
    return !!this.layout().boxes.get(id)?.left
  }

  /** How deep a mind map node is: 0 for a root, 1 for its branches (-1 when folded away). */
  nodeLevel(id: string): number {
    return this.layout().boxes.get(id)?.level ?? -1
  }

  /** The selected root branches to the root's other side. */
  flipSide(): void {
    this.commitEditing()
    const branches = this.selectedObjects().filter((o): o is MindmapNode => {
      if (!isMindmap(o) || o.locked || !o.parentId) return false
      const parent = this.doc.get(o.parentId)
      return isMindmap(parent) && !parent.parentId
    })
    const ops = branches.map((n) => {
      const { side: _side, ...rest } = n
      return updateOp(n, n.side === 'left' ? rest : { ...rest, side: 'left' as const })
    })
    if (ops.length) this.commit('반대쪽으로 보내기', ops)
  }

  /** The selected root's branches: the later half to its left (`both`), or all of them right. */
  spreadBranches(both: boolean): void {
    this.commitEditing()
    const root = this.singleSelectedNode()
    if (!root || root.parentId || root.locked) return
    const kids = this.layout().children.get(root.id) ?? []
    const half = Math.ceil(kids.length / 2)
    const ops = kids.flatMap((k, i) => {
      const left = both && i >= half
      if ((k.side === 'left') === left) return []
      const { side: _side, ...rest } = k
      return [updateOp(k, left ? { ...rest, side: 'left' as const } : rest)]
    })
    if (ops.length) this.commit(both ? '양쪽으로 나누기' : '오른쪽으로 모으기', ops)
  }

  /** How many branches grow from a mind map node (folded or not). */
  branchCount(id: string): number {
    return this.layout().children.get(id)?.length ?? 0
  }

  /**
   * "/": fold the selected nodes' branches away, or unfold them when all are folded. Nodes
   * without branches are left alone; folded-away nodes leave the selection.
   */
  toggleFold(): void {
    this.commitEditing()
    const { children } = this.layout()
    const nodes = this.selectedObjects().filter((o): o is MindmapNode => isMindmap(o) && !o.locked && !!children.get(o.id)?.length)
    if (nodes.length === 0) return
    const fold = nodes.some((n) => !n.collapsed)
    this.setFolded(nodes, fold)
    if (fold) for (const n of nodes) for (const d of descendants(n.id, children)) this.selection.delete(d)
    this.afterSelectionChange()
  }

  private setFolded(nodes: MindmapNode[], fold: boolean): void {
    const ops = nodes.filter((n) => !!n.collapsed !== fold).map((n) => updateOp(n, unfolded(n, fold)))
    if (ops.length) this.commit(fold ? '가지 접기' : '가지 펼치기', ops)
  }

  /** Unfold whatever hides `id` (to show a found or linked node). */
  private unfoldAround(id: string): void {
    const hiding: MindmapNode[] = []
    for (let n = this.doc.get(id); isMindmap(n) && n.parentId; ) {
      n = this.doc.get(n.parentId)
      if (isMindmap(n) && n.collapsed) hiding.push(n)
    }
    this.setFolded(hiding, false)
  }

  /** The folded node whose count is under `p`. */
  private foldBadgeAt(p: Point): MindmapNode | null {
    const layout = this.layout()
    for (const box of layout.boxes.values()) {
      if (!box.hidden) continue
      const b = foldBadge(box)
      if (distance(p, { x: b.cx, y: b.cy }) <= b.r + 3 / this.viewport.zoom) {
        const n = this.doc.get(box.id)
        if (isMindmap(n)) return n
      }
    }
    return null
  }

  /** Alt+Enter: a new node between `id` and its parent. */
  insertParentNode(id: string): void {
    this.commitEditing()
    const node = this.doc.get(id)
    if (!isMindmap(node) || !node.parentId) return
    const made = createMindmapNode(node.parentId, 0, 0, node.order, node.color, this.doc.maxZ() + 1)
    // The new node takes the branch's side; the node under it follows it.
    const middle: MindmapNode = node.side ? { ...made, side: node.side } : made
    const { side: _side, ...moved } = node
    this.commit('부모 노드 추가', [createOp(middle), updateOp(node, { ...moved, parentId: middle.id, order: 0 })])
    this.selection = new Set([middle.id])
    this.startEditing(middle.id)
  }

  /** Arrow keys on a selected node: left = parent, right = first child, up/down = siblings. */
  private navigateNode(node: MindmapNode, key: string): void {
    const { children, boxes } = this.layout()
    const left = !!boxes.get(node.id)?.left
    const outward = left ? 'ArrowLeft' : 'ArrowRight'
    let target: string | undefined
    if (!node.parentId && (key === 'ArrowLeft' || key === 'ArrowRight')) {
      // From a root: the first branch on that side.
      if (node.collapsed) {
        this.setFolded([node], false)
        return
      }
      target = children.get(node.id)?.find((k) => (k.side === 'left') === (key === 'ArrowLeft'))?.id
    } else if (key === outward && node.collapsed) {
      this.setFolded([node], false)
      return
    } else if (key === outward) target = children.get(node.id)?.[0]?.id
    else if (key === 'ArrowLeft' || key === 'ArrowRight') target = node.parentId ?? undefined
    else if (node.parentId) {
      // Up and down among the siblings on the same side.
      const siblings = (children.get(node.parentId) ?? []).filter((k) => (k.side === 'left') === (node.side === 'left'))
      const i = siblings.findIndex((s) => s.id === node.id)
      target = siblings[key === 'ArrowUp' ? i - 1 : i + 1]?.id
    }
    if (!target) return
    this.selection = new Set([target])
    this.afterSelectionChange()
  }

  // ---- text editing (DOM textarea over the canvas) ------------------------

  private startEditing(id: string, selectAll = false): void {
    this.commitEditing()
    const o = this.doc.get(id)
    if (!o || o.locked || (isShape(o) && (o.shape === 'freehand' || o.shape === 'image' || o.shape === 'note'))) return
    const doc = this.host.ownerDocument
    // Shapes with Markdown text, mind map nodes and line labels are typed with their marks
    // (nodes and labels without lists; a node's Enter adds the next node).
    const rich = hasTextStyle(o) || isMindmap(o) || isConnector(o)
    const field = rich ? new RichField(doc, { lists: hasTextStyle(o), enter: !isMindmap(o) }) : doc.createElement('textarea')
    const ta: HTMLElement = field instanceof RichField ? field.el : field
    ta.className = 'bl-board-text-editor'
    ta.spellcheck = false
    if (field instanceof RichField) ta.classList.add('rich')
    if (isConnector(o)) {
      ta.classList.add('label')
      field.value = o.label
      field.placeholder = '텍스트 추가'
    } else {
      field.value = o.text
      if (isMindmap(o)) ta.classList.add('mindmap')
    }
    this.overlay.append(ta)
    this.editing = { id, kind: isConnector(o) ? 'label' : isMindmap(o) ? 'node' : 'shape', original: o, field }
    if (field instanceof RichField) {
      // The toolbar shows the marks where the caret is.
      let queued = false
      const onSelection = () => {
        if (queued || doc.activeElement !== ta) return
        queued = true
        requestAnimationFrame(() => {
          queued = false
          if (this.editing?.field === field) this.emitStatus()
        })
      }
      doc.addEventListener('selectionchange', onSelection)
      this.editing.unwatch = () => doc.removeEventListener('selectionchange', onSelection)
    }
    ta.addEventListener('input', () => this.onTextInput())
    ta.addEventListener('keydown', (e) => {
      if (e.isComposing) {
        e.stopPropagation()
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        this.commitEditing()
        this.canvas.focus()
      } else if (e.key === 'Tab') {
        e.preventDefault()
        // Mind map: Tab = new child.
        if (isMindmap(o)) this.addChildNode(id)
      } else if (e.key === 'Enter' && !e.shiftKey && isMindmap(o)) {
        // Mind map: Enter = new sibling (a child for the root); Shift+Enter = new line.
        e.preventDefault()
        if (o.parentId) this.addSiblingNode(id)
        else this.addChildNode(id)
      } else if (this.onTextStyleKey(e)) {
        e.preventDefault()
      }
      e.stopPropagation()
    })
    ta.addEventListener('blur', () => this.commitEditing())
    this.layoutTextarea()
    ta.focus()
    if (field instanceof RichField) {
      if (selectAll) field.selectAll()
      else field.caretToEnd()
    } else if (selectAll) field.select()
    else field.setSelectionRange(field.value.length, field.value.length)
    this.requestRender()
    this.emitStatus()
  }

  private onTextInput(): void {
    const ed = this.editing
    if (!ed) return
    const base = this.doc.get(ed.id)
    if (!base) return
    if (ed.kind === 'cell' && ed.cell && isShape(base)) {
      this.preview.set(ed.id, autosizeTable(setCell(base, ed.cell, ed.field.value), measureAt))
    } else if (isConnector(base)) {
      this.preview.set(ed.id, { ...base, label: ed.field.value })
    } else if (isMindmap(base)) {
      this.preview.set(ed.id, { ...base, text: ed.field.value })
    } else {
      const next = { ...base, text: ed.field.value }
      this.preview.set(ed.id, autosizeShape(next, measureAt))
    }
    this.requestRender()
  }

  private layoutTextarea(): void {
    const ed = this.editing
    if (!ed) return
    const o = this.lookup(ed.id)
    if (!o) return
    const zoom = this.viewport.zoom
    const s = ed.field.style
    s.fontFamily = FONT_FAMILY
    if (ed.kind === 'cell' && ed.cell && isShape(o)) {
      const l = layoutTable(o, measureAt)
      if (!l.rows[ed.cell.row] || !l.cols[ed.cell.col]) return
      const box = cellTextBox(l, ed.cell)
      const pos = this.viewport.toScreen(box.x, box.y)
      s.left = `${pos.x}px`
      s.top = `${pos.y}px`
      s.width = `${box.w * zoom}px`
      s.height = `${box.h * zoom}px`
      s.fontSize = `${TABLE_FONT * zoom}px`
      s.lineHeight = `${TABLE_LINE * zoom}px`
      s.fontWeight = cellFont(o, ed.cell.row).bold ? '600' : 'normal'
      s.textAlign = 'left'
      s.color = theme.text
      return
    }
    if (isConnector(o)) {
      const g = connectorGeometry(o, this.lookup)
      if (!g) return
      const box = labelLayout(ed.field.value || ed.field.placeholder, measureAt)
      const w = box.w + 4
      const h = box.h
      const at = labelCenter(g, w)
      const pos = this.viewport.toScreen(at.x - w / 2, at.y - h / 2)
      s.left = `${pos.x}px`
      s.top = `${pos.y}px`
      s.width = `${w * zoom}px`
      s.height = `${h * zoom}px`
      s.fontSize = `${LABEL_FONT_SIZE * zoom}px`
      s.lineHeight = `${LABEL_LINE_HEIGHT * zoom}px`
      s.paddingTop = `${(LABEL_PADDING / 2) * zoom - 1}px`
      s.background = theme.canvasBg
      s.borderColor = theme.selection
      return
    }
    if (isMindmap(o)) {
      const box = this.layout().boxes.get(o.id)
      if (!box) return
      const style = levelStyle(box.level)
      const pos = this.viewport.toScreen(box.x + style.padX, box.y + style.padY)
      s.left = `${pos.x}px`
      s.top = `${pos.y}px`
      s.width = `${MM_MAX_TEXT_WIDTH * zoom}px`
      s.height = `${(box.h - 2 * style.padY) * zoom}px`
      s.fontSize = `${style.fontSize * zoom}px`
      s.lineHeight = `${style.lineHeight * zoom}px`
      return
    }
    const layout = layoutShapeText({ ...o, text: ed.field.value }, measureAt)
    // Typed text has the color it will be drawn in (white on filled shapes, etc.).
    s.color = o.shape === 'sticky' ? textColor(o.color, 'fill') : isContainer(o) ? '' : textColor(o.color, o.deco)
    const width = o.shape === 'text' ? textWrapWidth(o) : isContainer(o) ? Math.max(layout.box.w, 200) : layout.box.w
    // Free text lines up with its own box: the wider typing area shares its left, middle or right.
    const shift = o.shape !== 'text' ? 0 : layout.align === 'center' ? (layout.box.w - width) / 2 : layout.align === 'right' ? layout.box.w - width : 0
    const pos = this.viewport.toScreen(layout.box.x + shift, layout.box.y)
    s.left = `${pos.x}px`
    s.top = `${pos.y}px`
    s.width = `${width * zoom}px`
    s.height = `${Math.max(layout.lineHeight, layout.box.h) * zoom}px`
    s.fontSize = `${layout.fontSize * zoom}px`
    s.lineHeight = `${layout.lineHeight * zoom}px`
    s.textAlign = layout.align
    s.whiteSpace = isContainer(o) ? 'nowrap' : 'pre-wrap'
  }

  /** End text editing; `keepEmpty` keeps an empty mind map branch (another one is added from it). */
  private commitEditing(keepEmpty = false): void {
    const ed = this.editing
    if (!ed) return
    this.editing = null
    ed.unwatch?.()
    const after = this.preview.get(ed.id) ?? this.doc.get(ed.id)
    this.preview.delete(ed.id)
    ed.field.remove()
    const current = this.doc.get(ed.id)
    const emptyText = isShape(after) && after.shape === 'text' && after.text.trim() === ''
    // A mind map branch left empty (and without branches of its own) goes too.
    const emptyBranch = !keepEmpty && isMindmap(after) && !!after.parentId && after.text.trim() === '' && !(this.layout().children.get(after.id)?.length)
    if (after && current && (emptyText || emptyBranch)) {
      // An empty free-text object is removed when editing ends.
      this.selection.delete(ed.id)
      this.commit('텍스트 삭제', [deleteOp(current)])
    } else if (after && current) this.commit('텍스트 편집', [updateOp(ed.original, after)])
    this.requestRender()
    this.emitStatus()
  }

  // ---- keyboard -----------------------------------------------------------

  private onKeyDown(e: KeyboardEvent): void {
    if (this.presenting || this.editing || isTypingTarget(e.target)) return
    if (!this.host.isConnected || !this.active()) return
    const mod = e.ctrlKey || e.metaKey
    const key = e.key.toLowerCase()

    if (this.cropping) {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault()
        this.finishCrop(e.key === 'Enter')
      }
      return
    }
    if (this.activeCell && this.onCellKey(e)) return
    if (e.key === '`') {
      this.backtickHeld = true
      e.preventDefault()
      return
    }
    if (e.key === ' ') {
      if (!this.spaceHeld) {
        this.spaceHeld = true
        this.canvas.style.cursor = 'grab'
      }
      e.preventDefault()
      return
    }
    // Read-only: only the keys that move the view.
    const viewKey = (e.shiftKey && !mod && (e.code === 'Digit1' || e.code === 'Digit2')) || (mod && ['0', '=', '+', '-'].includes(key))
    if (this.readOnly && !viewKey) return
    // Alt+] / Alt+[: to front / back; with Ctrl one step.
    if (e.altKey && (e.code === 'BracketRight' || e.code === 'BracketLeft')) {
      e.preventDefault()
      const up = e.code === 'BracketRight'
      this.reorder(mod ? (up ? 'forward' : 'backward') : up ? 'front' : 'back')
      return
    }
    // Alt+A/H/D, Alt+W/V/S: align left / center / right, top / middle / bottom.
    if (e.altKey && !mod && !e.shiftKey && ALIGN_KEYS[e.code] && this.selection.size >= 2) {
      e.preventDefault()
      this.align(ALIGN_KEYS[e.code])
      return
    }
    // Shift+L: lock / unlock.
    if (e.shiftKey && !mod && !e.altKey && e.code === 'KeyL') {
      e.preventDefault()
      this.toggleLock()
      return
    }
    // Shift+1 / Shift+2: zoom to fit the board / the selection.
    if (e.shiftKey && !mod && !e.altKey && (e.code === 'Digit1' || e.code === 'Digit2')) {
      e.preventDefault()
      this.zoomToFit(e.code === 'Digit2')
      return
    }
    // Shift+Alt+V / Shift+Alt+H: auto layout top-down / left-right.
    if (e.shiftKey && e.altKey && !mod && (e.code === 'KeyV' || e.code === 'KeyH')) {
      e.preventDefault()
      void this.autoLayout(e.code === 'KeyV' ? 'DOWN' : 'RIGHT')
      return
    }
    if (mod && key === 'z') {
      e.preventDefault()
      if (e.shiftKey) this.redo()
      else this.undo()
      return
    }
    if (mod && key === 'y') {
      e.preventDefault()
      this.redo()
      return
    }
    if (mod && key === 'a') {
      e.preventDefault()
      this.selection = new Set(this.doc.objects.keys())
      this.afterSelectionChange()
      return
    }
    if (this.onTextStyleKey(e)) {
      e.preventDefault()
      return
    }
    // Ctrl+Alt+C / Ctrl+Alt+V: copy / paste style; Ctrl+Shift+C: copy as PNG.
    if (mod && e.altKey && !e.shiftKey && (e.code === 'KeyC' || e.code === 'KeyV')) {
      e.preventDefault()
      if (e.code === 'KeyC') this.copyStyle()
      else this.pasteStyle()
      return
    }
    if (mod && e.shiftKey && !e.altKey && e.code === 'KeyC') {
      e.preventDefault()
      void this.copyAs('png')
      return
    }
    if (mod && e.shiftKey && e.code === 'KeyD') {
      e.preventDefault()
      this.saveDefaultStyle()
      return
    }
    // Ctrl+L: link to the selected object (or this board) on the clipboard.
    if (mod && !e.shiftKey && !e.altKey && key === 'l') {
      e.preventDefault()
      void this.copyLink(false)
      return
    }
    // Ctrl+R edits the selected object (and must not reload the app).
    if (mod && key === 'r') {
      e.preventDefault()
      if (this.selection.size === 1) this.startEditing([...this.selection][0])
      return
    }
    // Ctrl+C / X / V arrive as copy / cut / paste events (onCopy, onPaste).
    if (mod && (key === 'c' || key === 'x' || key === 'v')) return
    if (mod && key === 'd') {
      e.preventDefault()
      this.duplicateSelection()
      return
    }
    if (mod && key === '0') {
      e.preventDefault()
      this.resetZoom()
      return
    }
    if (mod && key === 'g') {
      e.preventDefault()
      this.setGroup(!e.shiftKey)
      return
    }
    const node = this.singleSelectedNode()
    if (e.altKey && !mod && e.key === 'Enter' && node) {
      e.preventDefault()
      this.insertParentNode(node.id)
      return
    }
    if (mod && e.key === 'Enter' && node) {
      e.preventDefault()
      if (node.parentId) this.addSiblingNode(node.id)
      else this.addChildNode(node.id)
      return
    }
    if (mod) return

    if (e.key === '/' && !e.altKey && [...this.selection].some((id) => isMindmap(this.doc.get(id)))) {
      e.preventDefault()
      this.toggleFold()
      return
    }
    if (node && e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) {
        if (node.parentId) {
          this.selection = new Set([node.parentId])
          this.afterSelectionChange()
        }
      } else this.addChildNode(node.id)
      return
    }
    if (node && !e.altKey && e.key.startsWith('Arrow')) {
      e.preventDefault()
      this.navigateNode(node, e.key)
      return
    }

    // Alt+arrow: quick-add a connected shape in that direction.
    if (e.altKey && ARROW_SIDE[e.key]) {
      const actor = this.selectedActor()
      if (actor) {
        e.preventDefault()
        if (ACTOR_SIDES.includes(ARROW_SIDE[e.key])) this.addActorBeside(actor.id, ARROW_SIDE[e.key])
        return
      }
      const source = this.connectableSelection()
      if (source) {
        e.preventDefault()
        this.quickAdd(source.id, ARROW_SIDE[e.key])
      }
      return
    }

    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        e.preventDefault()
        this.deleteSelection()
        return
      case 'Escape':
        if (this.tool.kind !== 'select') this.setTool({ kind: 'select' })
        else {
          this.selection.clear()
          this.afterSelectionChange()
        }
        return
      case 'Enter':
        // Text is edited; a table's cell, a note card opens, a picture is cropped.
        if (this.selection.size === 1) {
          e.preventDefault()
          this.editSelection()
        }
        return
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight':
        e.preventDefault()
        this.nudge(e.key, e.shiftKey ? LARGE_NUDGE : GRID)
        return
    }
    if (key === 'm' && !e.altKey) {
      this.setTool({ kind: 'mindmap' })
      return
    }
    if (key === 'h' && !e.altKey) {
      this.setTool({ kind: 'draw', pen: e.shiftKey ? 'marker' : 'pen' })
      return
    }
    if (key === 'c' && !e.shiftKey) {
      this.setTool({ kind: 'connector' })
      return
    }
    if (key === 'i' && !e.shiftKey) {
      e.preventDefault()
      this.importImages()
      return
    }
    const shape = SHAPE_KEYS[key]
    if (shape && !e.altKey) this.setTool({ kind: 'shape', shape })
  }

  private active(): boolean {
    return this.opts.isActive?.() ?? true
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (e.key === '`') this.backtickHeld = false
    if (e.key === ' ') {
      this.spaceHeld = false
      if (this.interaction.kind !== 'pan') this.canvas.style.cursor = this.toolCursor()
    }
  }

  /** Arrow keys move by one grid step, Shift by LARGE_NUDGE. */
  private nudge(key: string, step: number): void {
    const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0
    const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0
    const { rootOf } = this.layout()
    const ids = new Set([...this.selection].map((id) => (isMindmap(this.doc.get(id)) ? (rootOf.get(id) ?? id) : id)))
    const ops = [...ids]
      .map((id) => this.doc.get(id))
      .filter(isDefined)
      .filter((o) => !o.locked)
      .map((o) => updateOp(o, translate(o, dx, dy)))
    this.commit('이동', ops)
  }

  // ---- bookkeeping --------------------------------------------------------

  private onDocChange(): void {
    for (const id of [...this.selection]) if (!this.doc.get(id)) this.selection.delete(id)
    this.requestRender()
    this.emitStatus()
  }

  private selectExisting(ids: string[]): void {
    this.selection = new Set(ids.filter((id) => this.doc.get(id)))
    this.afterSelectionChange()
  }

  private afterSelectionChange(): void {
    if (this.cropping && !(this.selection.size === 1 && this.selection.has(this.cropping.id))) this.finishCrop()
    this.requestRender()
    this.emitStatus()
  }

  private viewportChanged(): void {
    this.requestRender()
    this.opts.onViewportChange?.(this.viewport.state())
    this.emitStatus()
  }

  private emitStatus(): void {
    if (this.activeCell && !(this.selection.size === 1 && this.selection.has(this.activeCell.id))) this.activeCell = null
    const selected = [...this.selection].map((id) => this.lookup(id)).filter(isDefined)
    this.opts.onStatus?.({
      tool: this.tool,
      selectionCount: this.selection.size,
      selected,
      tableCell: this.activeCell ? { row: this.activeCell.row, col: this.activeCell.col, range: this.cellRange()! } : null,
      cropping: !!this.cropping,
      selectionBox: this.interaction.kind === 'idle' && !this.editing ? this.screenBounds(selected) : null,
      textEditing: this.textEditingStatus(),
      zoom: this.viewport.zoom,
      canUndo: !this.readOnly && this.doc.canUndo(),
      canRedo: !this.readOnly && this.doc.canRedo(),
    })
  }

  private textEditingStatus(): EditorStatus['textEditing'] {
    const ed = this.editing
    const o = ed ? this.lookup(ed.id) : undefined
    if (!ed || !(ed.field instanceof RichField) || !o) return null
    const box = this.screenBounds([o])
    return box ? { id: ed.id, box, marks: ed.field.marks() } : null
  }

  private screenBounds(objects: BoardObject[]): Rect | null {
    const layout = this.layout()
    const b = unionRects(objects.map((o) => this.rectOf(o, layout)).filter((r): r is Rect => r !== null))
    if (!b) return null
    const tl = this.viewport.toScreen(b.x, b.y)
    return { x: tl.x, y: tl.y, w: b.w * this.viewport.zoom, h: b.h * this.viewport.zoom }
  }

  private listen(target: EventTarget, type: string, fn: (e: Event) => void, options?: AddEventListenerOptions): void {
    target.addEventListener(type, fn, options)
    this.disposers.push(() => target.removeEventListener(type, fn, options))
  }
}

/** Move a shape, or the free (unattached) ends of a connector (and its pinned segments when `withPins`). */
function translate(o: BoardObject, dx: number, dy: number, withPins = false): BoardObject {
  if (isShape(o) || isMindmap(o)) return { ...o, x: o.x + dx, y: o.y + dy }
  const move = (e: Endpoint): Endpoint => ('point' in e ? { point: { x: e.point.x + dx, y: e.point.y + dy } } : e)
  const pins = withPins && o.pins ? shiftPins(o.pins, dx, dy) : o.pins
  return { ...o, from: move(o.from), to: move(o.to), ...(pins ? { pins } : {}) }
}

/** Sections sit behind other objects and carry what lies inside them. */
function isContainer(o: ShapeObject): boolean {
  return o.shape === 'section'
}


function containsRect(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h
}

function rectContainsPoint(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
}

let sharedHitContext: CanvasRenderingContext2D | null = null
function hitContext(): CanvasRenderingContext2D {
  if (!sharedHitContext) {
    const ctx = document.createElement('canvas').getContext('2d')
    if (!ctx) throw new Error('Canvas 2D is not available')
    sharedHitContext = ctx
  }
  return sharedHitContext
}

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

function isDefined<T>(v: T | undefined): v is T {
  return v !== undefined
}

/** Fields without undefined values (so they don't end up in the file as nulls). */
function clean<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')) as Partial<T>
}
