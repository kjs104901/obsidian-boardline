// Obsidian canvases (.canvas, the open JSON Canvas format) as board objects, so a canvas can be
// drawn like a board: text cards become boxes with their Markdown, notes become note cards,
// pictures become images, web links link objects, groups sections, and edges connectors.

import { docLink } from './links'
import { createConnector, createShape, type BoardObject, type ColorKey, type EndCap, type ShapeObject, type Side } from './model'

interface CanvasNode {
  id: string
  type: 'text' | 'file' | 'link' | 'group'
  x: number
  y: number
  width: number
  height: number
  color?: string
  text?: string
  file?: string
  url?: string
  label?: string
}

interface CanvasEdge {
  id: string
  fromNode: string
  toNode: string
  fromSide?: Side
  toSide?: Side
  fromEnd?: 'none' | 'arrow'
  toEnd?: 'none' | 'arrow'
  color?: string
  label?: string
}

/** The canvas's six preset colors, and its own hex colors. */
const PRESETS: Record<string, ColorKey> = { '1': 'red', '2': 'orange', '3': 'yellow', '4': 'green', '5': 'teal', '6': 'purple' }

function colorOf(c: string | undefined): ColorKey | undefined {
  if (!c) return undefined
  if (PRESETS[c]) return PRESETS[c]
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim())
  if (!hex) return undefined
  const h = hex[1].length === 3 ? [...hex[1]].map((d) => d + d).join('') : hex[1]
  return `#${h.toLowerCase()}`
}

const IMAGE_FILE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i
const SIDES: Side[] = ['top', 'right', 'bottom', 'left']

/** The board objects a canvas file's JSON draws as (empty when it can't be read). */
export function canvasToObjects(json: string): BoardObject[] {
  let data: { nodes?: CanvasNode[]; edges?: CanvasEdge[] }
  try {
    data = JSON.parse(json)
  } catch {
    return []
  }
  const nodes = (data.nodes ?? []).filter((n) => n && typeof n.id === 'string' && [n.x, n.y, n.width, n.height].every(Number.isFinite))
  // Groups behind everything, then cards in file order, then edges on top.
  const ordered = [...nodes.filter((n) => n.type === 'group'), ...nodes.filter((n) => n.type !== 'group')]
  const objects: BoardObject[] = []
  let z = 0
  for (const n of ordered) {
    const size = { w: n.width, h: n.height }
    const color = colorOf(n.color)
    let shape: ShapeObject
    if (n.type === 'group') {
      shape = { ...createShape('section', n.x, n.y, z++, size), text: n.label ?? '' }
    } else if (n.type === 'file' && n.file && IMAGE_FILE.test(n.file)) {
      shape = { ...createShape('image', n.x, n.y, z++, size), src: n.file }
    } else if (n.type === 'file' && n.file) {
      shape = { ...createShape('note', n.x, n.y, z++, size), link: docLink(n.file) }
    } else if (n.type === 'link' && n.url) {
      shape = { ...createShape('link', n.x, n.y, z++, size), link: n.url, text: n.url, expanded: true }
    } else {
      // A text card: its Markdown in a box, left-aligned as the canvas shows it.
      shape = { ...createShape('rect', n.x, n.y, z++, size), text: n.text ?? '', align: 'left' }
    }
    objects.push({ ...shape, id: n.id, ...(color ? { color } : {}) })
  }
  const ids = new Set(objects.map((o) => o.id))
  for (const e of data.edges ?? []) {
    if (!e || !ids.has(e.fromNode) || !ids.has(e.toNode)) continue
    const side = (s: Side | undefined) => (s && SIDES.includes(s) ? { side: s } : {})
    const cap = (end: 'none' | 'arrow' | undefined, fallback: EndCap): EndCap => (end === 'arrow' ? 'arrow' : end === 'none' ? 'none' : fallback)
    const c = createConnector({ objectId: e.fromNode, ...side(e.fromSide) }, { objectId: e.toNode, ...side(e.toSide) }, z++)
    const color = colorOf(e.color)
    objects.push({
      ...c,
      // A canvas draws its edges curved.
      kind: 'curved',
      id: typeof e.id === 'string' ? e.id : c.id,
      label: e.label ?? '',
      startCap: cap(e.fromEnd, 'none'),
      endCap: cap(e.toEnd, 'arrow'),
      ...(color ? { color } : {}),
    })
  }
  return objects
}
