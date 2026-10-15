// Copy / paste style and per-kind default styles.

import {
  FLOW_SHAPES,
  hasTextStyle,
  isConnector,
  isFlowShape,
  isShape,
  type BoardObject,
  type ColorKey,
  type ConnectorKind,
  type Deco,
  type EndCap,
  type LineStyle,
  type ShapeObject,
  type TextAlign,
  type TextSize,
} from './model'

/** The look of an object without its content or geometry. */
export interface Style {
  color?: ColorKey
  deco?: Deco
  line?: LineStyle
  kind?: ConnectorKind
  startCap?: EndCap
  endCap?: EndCap
  /** Text size and alignment of shapes with Markdown text; without an alignment, the kind's own. */
  text?: { size: TextSize; align?: TextAlign }
}

const textStyleOf = (o: ShapeObject): Style['text'] => ({ size: o.textSize ?? 'm', ...(o.align ? { align: o.align } : {}) })

export function styleOf(o: BoardObject): Style {
  if (isConnector(o)) return { color: o.color, line: o.line, kind: o.kind, startCap: o.startCap, endCap: o.endCap }
  const text = hasTextStyle(o) ? { text: textStyleOf(o) } : {}
  if (isFlowShape(o)) return { color: o.color, deco: o.deco, ...text }
  return { color: o.color, ...text }
}

/** `o` with the text look `t` (defaults are left out of the object). */
function withTextStyle(o: ShapeObject, t: NonNullable<Style['text']>): ShapeObject {
  const { textSize: _size, align: _align, ...rest } = o
  return { ...rest, ...(t.size !== 'm' ? { textSize: t.size } : {}), ...(t.align ? { align: t.align } : {}) }
}

/** `o` with the parts of `s` that apply to it. */
export function applyStyle<T extends BoardObject>(o: T, s: Style): T {
  const next = { ...o }
  if (s.color) next.color = s.color
  if (isConnector(next)) {
    if (s.line) next.line = s.line
    if (s.kind) next.kind = s.kind
    if (s.startCap) next.startCap = s.startCap
    if (s.endCap) next.endCap = s.endCap
  } else if (isFlowShape(next) && s.deco) next.deco = s.deco
  if (s.text && hasTextStyle(next)) return withTextStyle(next, s.text) as T
  return next
}

/** Objects that share a default style: all flowchart shapes, all connectors, else per kind. */
function styleGroup(o: BoardObject): string | null {
  if (isConnector(o)) return 'connector'
  // Mind map branches pick their colors from the palette, so they have no default.
  if (!isShape(o)) return null
  return FLOW_SHAPES.includes(o.shape) ? 'flow' : o.shape
}

const DEFAULTS_KEY = 'boardline.defaultStyles'

function loadDefaults(): Record<string, Style> {
  try {
    const parsed = JSON.parse(localStorage.getItem(DEFAULTS_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** Ctrl+Shift+D: new objects like `o` start with its style. Returns false if it has none. */
export function saveDefaultStyle(o: BoardObject): boolean {
  const group = styleGroup(o)
  if (!group) return false
  const all = loadDefaults()
  all[group] = styleOf(o)
  try {
    localStorage.setItem(DEFAULTS_KEY, JSON.stringify(all))
  } catch {
    return false
  }
  return true
}

/** A newly created object with the saved default style of its kind. */
export function withDefaultStyle<T extends BoardObject>(o: T): T {
  const group = styleGroup(o)
  const s = group ? loadDefaults()[group] : undefined
  return s ? applyStyle(o, s) : o
}
