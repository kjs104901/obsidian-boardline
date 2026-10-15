// Board object model: what a board file stores. Objects keep flat fields; everything drawn
// (text lines, routes, mind map boxes) is computed from them.

/** Color names; the theme turns them into real colors (theme/palette.ts). */
export type ColorKey =
  | 'gray'
  | 'light'
  | 'ink'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'teal'
  | 'blue'
  | 'indigo'
  | 'purple'
  | 'pink'
  /** A custom color picked with "+", as #rrggbb. */
  | `#${string}`

/** Fill, outline, dashed outline, or transparent (text only). */
export type Deco = 'outline' | 'fill' | 'dashed' | 'transparent'

export type { IconStyle } from '../icons/iconData'
import type { IconStyle } from '../icons/iconData'


export type ShapeKind =
  | 'rect'
  | 'pill'
  | 'ellipse'
  | 'diamond'
  | 'parallelogram'
  | 'parallelogram-flip'
  | 'trapezoid'
  | 'triangle'
  | 'hexagon'
  | 'cylinder'
  | 'cloud'
  | 'star'
  | 'brace'
  | 'sticky'
  | 'text'
  | 'section'
  | 'actor'
  | 'image'
  | 'table'
  | 'icon'
  | 'freehand'
  | 'link'
  | 'note'

/** Kinds that behave like flowchart shapes (outline, centered text, connection dots, quick add). */
export const FLOW_SHAPES: ShapeKind[] = [
  'rect',
  'pill',
  'ellipse',
  'diamond',
  'parallelogram',
  'parallelogram-flip',
  'trapezoid',
  'triangle',
  'hexagon',
  'cylinder',
  'brace',
  'cloud',
  'star',
]

export interface ShapeObject {
  id: string
  type: 'shape'
  shape: ShapeKind
  x: number
  y: number
  w: number
  h: number
  /** Size the user asked for; autosize may only grow `h` beyond this. */
  idealW: number
  idealH: number
  text: string
  color: ColorKey
  deco: Deco
  /** Stacking order; higher draws on top. */
  z: number
  /** Objects sharing a group id are selected and moved together (Ctrl+G). */
  groupId?: string
  /** Sequence diagram actors: lifeline length below the box. */
  stem?: number
  /** Text objects whose width was set by hand: the text wraps at `w` instead of growing it. */
  fixedWidth?: boolean
  /** Rotation in 90° steps; width and height are already swapped for 90/270. */
  angle?: number
  /** Locked objects can't be moved, resized, edited or deleted (Shift+L). */
  locked?: boolean
  /** Icon from the icon library (icon objects, and flowchart shapes with an icon). */
  icon?: string
  iconStyle?: IconStyle
  /** Freehand strokes: points relative to x/y (x0, y0, x1, y1, …) and the pen. */
  points?: number[]
  pen?: 'pen' | 'marker'
  /** A web address or a board link (boardline://board/…) the object opens. */
  link?: string
  /** Link objects: what the page says about itself (the image is an asset path). */
  preview?: { description?: string; site?: string; image?: string }
  /** Link objects: shown as a card with the preview instead of one line. */
  expanded?: boolean
  /** Images: workspace-relative path of the file (.boardline/assets/…); link objects: the site icon. */
  src?: string
  /** Images: the part of the picture shown, in fractions of its width and height (absent = all of it). */
  crop?: { x: number; y: number; w: number; h: number }
  /** Tables: column widths, cell texts (rows × columns), first row as header (default on). */
  cols?: number[]
  cells?: string[][]
  header?: boolean
  /** Tables: cell fills (rows × columns, null = plain) and each column's text alignment (null = left). */
  cellColors?: (ColorKey | null)[][]
  colAligns?: (TextAlign | null)[]
  /** Text size step (default m) and alignment (default per kind); bold, italic and the rest are Markdown in the text. */
  textSize?: TextSize
  align?: TextAlign
}

/** Text size steps, small to huge. */
export type TextSize = 's' | 'm' | 'l' | 'xl' | 'xxl'
export const TEXT_SIZES: TextSize[] = ['s', 'm', 'l', 'xl', 'xxl']
export type TextAlign = 'left' | 'center' | 'right'

/** Side of a shape a connector end is pinned to. */
export type Side = 'top' | 'right' | 'bottom' | 'left'

/**
 * One end of a connector.
 * - attached + side: pinned to the middle of that side, or with `at` to that spot along it
 *   (0 its top or left end, 1 the other), on the shape's outline
 * - attached, no side: "floating" end aimed at the shape's center; the router picks the side
 * - not attached: a free point on the board
 * - on an actor's lifeline: `dy` below the actor's top (sequence diagram messages)
 */
export type Endpoint = { objectId: string; side?: Side; at?: number; dy?: number } | { point: { x: number; y: number } }

export type ConnectorKind = 'elbow' | 'straight' | 'curved'
export type LineStyle = 'solid' | 'dashed'
export type EndCap = 'none' | 'arrow' | 'circle' | 'diamond' | 'fork' | 'zero-one' | 'one-one' | 'zero-many' | 'one-many'

export interface ConnectorObject {
  id: string
  type: 'connector'
  from: Endpoint
  to: Endpoint
  kind: ConnectorKind
  label: string
  /** Where the label sits along the line, from 0 (start) to 1 (end); absent = the middle. */
  labelPos?: number
  color: ColorKey
  line: LineStyle
  startCap: EndCap
  endCap: EndCap
  /** Coordinates of dragged elbow segments: a vertical segment keeps `x`, a horizontal one `y`. */
  pins?: SegmentPins
  z: number
  locked?: boolean
}

/**
 * Dragged segments of an elbow route. `at` holds one entry per segment of the route, from the
 * start: the coordinate a dragged segment keeps, or null for a routed one. When the route takes
 * another shape (more or fewer segments) the entries no longer apply and the line is routed
 * afresh.
 */
export interface SegmentPins {
  at: (SegmentPin | null)[]
}

/** A vertical segment keeps its x, a horizontal one its y. */
export type SegmentPin = { x: number } | { y: number }

/**
 * Mind map node. Only the tree and the root's position are stored;
 * every other node's box is computed by the layout.
 */
export interface MindmapNode {
  id: string
  type: 'mindmap'
  parentId: string | null
  /** Top-left of the root node; ignored for child nodes. */
  x: number
  y: number
  /** Sibling order (ascending). */
  order: number
  text: string
  /** Branch color; level-1 nodes pick from the palette, deeper nodes inherit. */
  color: ColorKey
  z: number
  locked?: boolean
  /** Its branches are folded away (a count beside it unfolds them). */
  collapsed?: boolean
  /** A root's branch on its left (it and everything under it grow leftwards); deeper nodes follow their branch. */
  side?: 'left'
}

export type BoardObject = ShapeObject | ConnectorObject | MindmapNode

export function isShape(o: BoardObject | undefined | null): o is ShapeObject {
  return !!o && o.type === 'shape'
}

export function isMindmap(o: BoardObject | undefined | null): o is MindmapNode {
  return !!o && o.type === 'mindmap'
}

/** Branch colors handed to level-1 nodes in order. */
export const BRANCH_COLORS: ColorKey[] = ['purple', 'blue', 'green', 'orange', 'pink', 'teal', 'red', 'indigo', 'yellow']

export function createMindmapNode(parentId: string | null, x: number, y: number, order: number, color: ColorKey, z: number): MindmapNode {
  return { id: newId(), type: 'mindmap', parentId, x, y, order, text: '', color, z }
}

export function isConnector(o: BoardObject | undefined | null): o is ConnectorObject {
  return !!o && o.type === 'connector'
}

export function endpointObjectId(e: Endpoint): string | null {
  return 'objectId' in e ? e.objectId : null
}

export function createConnector(from: Endpoint, to: Endpoint, z: number): ConnectorObject {
  return {
    id: newId(),
    type: 'connector',
    from,
    to,
    kind: 'elbow',
    label: '',
    color: 'gray',
    line: 'solid',
    startCap: 'none',
    endCap: 'arrow',
    z,
  }
}

export interface ShapeSpec {
  w: number
  h: number
  /** Horizontal inset of the text box from the shape's left/right edges. */
  textInsetX: number
}

/**
 * Default sizes and text boxes on the 20px grid. Boxes start like an Obsidian canvas card
 * (about 240×60); the rest keep proportions that read well at that size.
 */
export const SHAPE_SPECS: Record<ShapeKind, ShapeSpec> = {
  rect: { w: 240, h: 60, textInsetX: 12 },
  pill: { w: 240, h: 60, textInsetX: 20 },
  ellipse: { w: 160, h: 100, textInsetX: 20 },
  diamond: { w: 200, h: 120, textInsetX: 50 },
  parallelogram: { w: 240, h: 60, textInsetX: 30 },
  'parallelogram-flip': { w: 240, h: 60, textInsetX: 30 },
  trapezoid: { w: 240, h: 60, textInsetX: 30 },
  brace: { w: 40, h: 200, textInsetX: 0 },
  triangle: { w: 160, h: 120, textInsetX: 40 },
  hexagon: { w: 240, h: 80, textInsetX: 30 },
  cylinder: { w: 160, h: 140, textInsetX: 12 },
  cloud: { w: 240, h: 140, textInsetX: 40 },
  star: { w: 160, h: 160, textInsetX: 50 },
  sticky: { w: 200, h: 200, textInsetX: 16 },
  text: { w: 20, h: 24, textInsetX: 0 },
  section: { w: 600, h: 400, textInsetX: 0 },
  actor: { w: 160, h: 60, textInsetX: 12 },
  image: { w: 240, h: 160, textInsetX: 0 },
  // Two 118px columns of two 38px rows, with 1px edges and 2px gaps.
  table: { w: 240, h: 80, textInsetX: 0 },
  icon: { w: 80, h: 80, textInsetX: 0 },
  freehand: { w: 20, h: 20, textInsetX: 0 },
  link: { w: 160, h: 24, textInsetX: 0 },
  note: { w: 400, h: 400, textInsetX: 0 },
}

/** Default lifeline length of a sequence diagram actor. */
export const ACTOR_STEM = 400

/** Default look per kind (everything else: a gray outline). */
const KIND_DEFAULTS: Partial<Record<ShapeKind, { color: ColorKey; deco: Deco }>> = {
  text: { color: 'ink', deco: 'outline' },
  sticky: { color: 'yellow', deco: 'fill' },
  section: { color: 'gray', deco: 'outline' },
  actor: { color: 'purple', deco: 'outline' },
  icon: { color: 'blue', deco: 'fill' },
  freehand: { color: 'blue', deco: 'outline' },
}

/** Default column width of a new table (engine/table.ts TABLE_COL_WIDTH). */
const TABLE_COLS = 118

/** Corner radius of `rect` shapes (an Obsidian card's). */
export const RECT_RADIUS = 8

export function newId(): string {
  return crypto.randomUUID()
}

export function createShape(
  shape: ShapeKind,
  x: number,
  y: number,
  z: number,
  size?: { w: number; h: number },
): ShapeObject {
  const spec = SHAPE_SPECS[shape]
  const w = size?.w ?? spec.w
  const h = size?.h ?? spec.h
  return {
    id: newId(),
    type: 'shape',
    shape,
    x,
    y,
    w,
    h,
    idealW: w,
    idealH: h,
    text: '',
    color: KIND_DEFAULTS[shape]?.color ?? 'gray',
    deco: KIND_DEFAULTS[shape]?.deco ?? 'outline',
    z,
    ...(shape === 'actor' ? { stem: ACTOR_STEM } : {}),
    ...(shape === 'table' ? { cols: [TABLE_COLS, TABLE_COLS], cells: [['', ''], ['', '']] } : {}),
  }
}

/** Workspace images an object shows (pictures, link icons and previews). */
export function imageSrcs(o: BoardObject): string[] {
  if (o.type !== 'shape') return []
  return [o.src, o.preview?.image].filter((s): s is string => !!s)
}

export function isFlowShape(o: BoardObject | undefined | null): o is ShapeObject {
  return isShape(o) && FLOW_SHAPES.includes(o.shape)
}

/** Kinds whose text is Markdown (bold, lists, links…) with a size and an alignment. */
export function isRichKind(kind: ShapeKind): boolean {
  return FLOW_SHAPES.includes(kind) || kind === 'text' || kind === 'sticky' || kind === 'icon'
}

/** Shapes with Markdown text (see isRichKind). */
export function hasTextStyle(o: BoardObject | undefined | null): o is ShapeObject {
  return isShape(o) && isRichKind(o.shape)
}
