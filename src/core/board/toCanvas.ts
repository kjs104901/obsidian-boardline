// A board (or part of it) as an Obsidian canvas (.canvas, the open JSON Canvas format): boxes,
// stickies and text become text cards with their Markdown, tables Markdown tables, sections
// groups, pictures and note cards file cards, web links link cards, mind maps text cards joined
// by edges, and lines between objects edges. Pen strokes, lines with a free end and branches
// folded away have no place in a canvas and are left out (counted in `skipped`).

import { plainText } from '../engine/richText'
import type { MindmapLayout } from '../engine/mindmap'
import { PALETTE } from '../theme/palette'
import { parseLink } from './links'
import { isConnector, isMindmap, type BoardObject, type ColorKey, type EndCap, type Side } from './model'
import { markdownTable } from './toMarkdown'

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

/** The canvas's six preset colors; other hues go as their own hex, neutrals as the default. */
const PRESET: Partial<Record<ColorKey, string>> = { red: '1', orange: '2', yellow: '3', green: '4', teal: '5', purple: '6' }
const NEUTRAL: ColorKey[] = ['gray', 'light', 'ink']

function canvasColor(c: ColorKey): string | undefined {
  if (NEUTRAL.includes(c)) return undefined
  if (PRESET[c]) return PRESET[c]
  if (c.startsWith('#')) return c
  return PALETTE.find((p) => p.key === c)?.light.stroke
}

/** Line ends: an arrow, or nothing (a canvas has no other kinds). */
const end = (cap: EndCap): 'none' | 'arrow' => (cap === 'none' ? 'none' : 'arrow')

/** A canvas file's text, and how many objects couldn't go in it. */
export interface CanvasExport {
  json: string
  skipped: number
}

/**
 * The canvas of `objects` (in z order). `layout` places mind map nodes; `boardFile` gives the
 * file of a board a card links to (a canvas names files by path), when it can be found.
 */
export async function boardToCanvas(objects: BoardObject[], layout: MindmapLayout, boardFile?: (boardId: string) => Promise<string | null>): Promise<CanvasExport> {
  const groups: CanvasNode[] = []
  const nodes: CanvasNode[] = []
  const edges: CanvasEdge[] = []
  let skipped = 0
  const round = (v: number) => Math.round(v)
  const box = (o: { id: string; x: number; y: number; w: number; h: number }) => ({ id: o.id, x: round(o.x), y: round(o.y), width: round(o.w), height: round(o.h) })
  const colored = (c: ColorKey) => {
    const color = canvasColor(c)
    return color ? { color } : {}
  }

  for (const o of objects) {
    if (isConnector(o)) continue
    if (isMindmap(o)) {
      const b = layout.boxes.get(o.id)
      if (!b) {
        skipped++
        continue
      }
      // A card has padding a node doesn't: a little room around the text.
      nodes.push({ ...box({ id: o.id, x: b.x - 8, y: b.y - 6, w: b.w + 16, h: Math.max(b.h + 12, 50) }), type: 'text', text: o.text, ...colored(o.color) })
      const parent = o.parentId ? layout.boxes.get(o.parentId) : undefined
      if (parent) {
        const left = !!b.left
        edges.push({ id: `${o.id}-branch`, fromNode: o.parentId!, toNode: o.id, fromSide: left ? 'left' : 'right', toSide: left ? 'right' : 'left', toEnd: 'none', ...colored(o.color) })
      }
      continue
    }
    switch (o.shape) {
      case 'freehand':
        skipped++
        continue
      case 'section':
        groups.push({ ...box(o), type: 'group', ...(o.text ? { label: plainText(o.text) } : {}), ...colored(o.color) })
        continue
      case 'image':
        if (o.src) nodes.push({ ...box(o), type: 'file', file: o.src })
        else skipped++
        continue
      case 'table':
        nodes.push({ ...box(o), type: 'text', text: markdownTable(o) })
        continue
    }
    const target = o.link ? parseLink(o.link) : null
    if ((o.shape === 'note' || o.shape === 'link') && target) {
      if (target.kind === 'web') {
        nodes.push({ ...box(o), type: 'link', url: target.url })
        continue
      }
      const file = target.kind === 'doc' ? target.path : await boardFile?.(target.boardId)
      if (file) {
        nodes.push({ ...box(o), type: 'file', file })
        continue
      }
      // A board that can't be found has no file to show.
      if (target.kind === 'board') {
        skipped++
        continue
      }
    }
    if (o.shape === 'note' || o.shape === 'link') {
      // A link that can't be followed from a canvas: its title as text.
      nodes.push({ ...box(o), type: 'text', text: o.text || o.link || '' })
      continue
    }
    // Boxes, stickies, text, actors, icons: their Markdown (a link the shape opens goes under it).
    const link = target?.kind === 'web' ? `<${target.url}>` : target?.kind === 'doc' ? `[[${target.path.replace(/\.md$/i, '')}]]` : ''
    const text = [o.text, link].filter(Boolean).join('\n\n')
    nodes.push({ ...box(o), type: 'text', text, ...colored(o.shape === 'text' ? 'gray' : o.color) })
  }

  const ids = new Set([...groups, ...nodes].map((n) => n.id))
  for (const o of objects) {
    if (!isConnector(o)) continue
    const from = 'objectId' in o.from ? o.from : null
    const to = 'objectId' in o.to ? o.to : null
    if (!from || !to || !ids.has(from.objectId) || !ids.has(to.objectId)) {
      skipped++
      continue
    }
    edges.push({
      id: o.id,
      fromNode: from.objectId,
      toNode: to.objectId,
      ...(from.side ? { fromSide: from.side } : {}),
      ...(to.side ? { toSide: to.side } : {}),
      ...(end(o.startCap) === 'arrow' ? { fromEnd: 'arrow' as const } : {}),
      ...(end(o.endCap) === 'none' ? { toEnd: 'none' as const } : {}),
      ...(o.label ? { label: plainText(o.label) } : {}),
      ...colored(o.color),
    })
  }
  // Groups first: a canvas draws its nodes in order, so they stay behind.
  return { json: JSON.stringify({ nodes: [...groups, ...nodes], edges }, null, '\t'), skipped }
}
