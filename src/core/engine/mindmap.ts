// Mind map layout, growing to the right.
//
// - child x = parent's right edge + MM_GAP_X
// - a node's subtree area ("container") is the union of the node grown by pad(level) vertically
//   and its children's stacked containers grown by 4 (0 for the root)
// - sibling containers stack without gaps; a parent sits at the vertical middle of its children
// - the root keeps its stored position; everything else is derived

import type { MindmapNode } from '../board/model'
import { FONT_FAMILY, type MeasureAt } from './text'
import { layoutText, type RichLayout } from './richLayout'

export const MM_GAP_X = 80
export const MM_MAX_TEXT_WIDTH = 400

export interface LevelStyle {
  fontSize: number
  lineHeight: number
  padX: number
  /** Extra height around the text lines inside the node. */
  padY: number
  /** Vertical breathing room of a leaf's container, on each side. */
  containerPad: number
}

const LEVELS: LevelStyle[] = [
  { fontSize: 22, lineHeight: 30, padX: 20, padY: 16, containerPad: 0 },
  { fontSize: 18, lineHeight: 26, padX: 8, padY: 4, containerPad: 16 },
  { fontSize: 16, lineHeight: 24, padX: 8, padY: 0, containerPad: 10 },
]

export function levelStyle(level: number): LevelStyle {
  return LEVELS[Math.min(level, LEVELS.length - 1)]
}

export function levelFont(level: number): string {
  return `${levelStyle(level).fontSize}px ${FONT_FAMILY}`
}

export interface NodeBox {
  id: string
  level: number
  x: number
  y: number
  w: number
  h: number
  /** The text, laid out (marks, wrapped lines). */
  text: RichLayout
  /** Y of the first text line's middle: where branch lines attach. */
  attachY: number
  /** Folded: how many nodes are hidden under it. */
  hidden?: number
  /** On the root's left: its branches grow leftwards. */
  left?: boolean
}

export interface MindmapLayout {
  boxes: Map<string, NodeBox>
  children: Map<string, MindmapNode[]>
  rootOf: Map<string, string>
}


interface Laid {
  node: MindmapNode
  level: number
  w: number
  h: number
  text: RichLayout
  hidden: number
  left: boolean
  /** Container height, the node's top and each child's top, relative to the container top. */
  height: number
  nodeTop: number
  kids: { laid: Laid; top: number }[]
}

export function layoutMindmaps(nodes: MindmapNode[], measureAt: MeasureAt): MindmapLayout {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const children = new Map<string, MindmapNode[]>()
  const roots: MindmapNode[] = []
  for (const n of nodes) {
    if (n.parentId && byId.has(n.parentId)) {
      const list = children.get(n.parentId) ?? []
      list.push(n)
      children.set(n.parentId, list)
    } else {
      roots.push(n)
    }
  }
  for (const list of children.values()) list.sort((a, b) => a.order - b.order)

  const lay = (node: MindmapNode, level: number, seen: Set<string>, left: boolean): Laid => {
    seen.add(node.id)
    const style = levelStyle(level)
    const text = layoutText(node.text, MM_MAX_TEXT_WIDTH, { size: style.fontSize, line: style.lineHeight, align: 'left', inline: true }, measureAt)
    const textW = Math.max(text.width, level === 0 ? measureAt(style.fontSize)(' ') : 12)
    const w = Math.ceil(textW) + style.padX * 2
    const h = Math.max(text.height, style.lineHeight) + style.padY * 2
    const allKids = (children.get(node.id) ?? []).filter((k) => !seen.has(k.id))
    // A folded node lays out as a leaf; its branches get no boxes (they aren't drawn or hit).
    const kidsNodes = node.collapsed ? [] : allKids
    const hidden = node.collapsed && allKids.length ? descendants(node.id, children).length : 0
    if (kidsNodes.length === 0) {
      return { node, level, w, h, text, hidden, left, height: h + style.containerPad * 2, nodeTop: style.containerPad, kids: [] }
    }
    // A root's branches go right, or left when marked so; deeper nodes follow their branch.
    const kids = kidsNodes.map((k) => lay(k, level + 1, seen, level === 0 ? k.side === 'left' : left))
    if (level === 0) {
      // Each side's branches stack centered on the root (relative to the root's top here).
      const sides = [kids.filter((k) => !k.left), kids.filter((k) => k.left)].filter((list) => list.length)
      const spans = sides.map((list) => list.reduce((sum, k) => sum + k.height, 0))
      const starts = spans.map((span) => h / 2 - span / 2)
      const top = Math.min(0, ...starts)
      const bottom = Math.max(h, ...starts.map((start, i) => start + spans[i]))
      const entries: Laid['kids'] = []
      sides.forEach((list, i) => {
        let cursor = starts[i] - top
        for (const laid of list) {
          entries.push({ laid, top: cursor })
          cursor += laid.height
        }
      })
      return { node, level, w, h, text, hidden, left, height: bottom - top, nodeTop: -top, kids: entries }
    }
    const span = kids.reduce((s, k) => s + k.height, 0)
    const margin = level === 0 ? 0 : 4
    const nodeTop = span / 2 - h / 2
    const top = Math.min(nodeTop - style.containerPad, -margin)
    const bottom = Math.max(nodeTop + h + style.containerPad, span + margin)
    let cursor = -top
    return {
      node,
      level,
      w,
      h,
      text,
      hidden,
      left,
      height: bottom - top,
      nodeTop: nodeTop - top,
      kids: kids.map((laid) => {
        const entry = { laid, top: cursor }
        cursor += laid.height
        return entry
      }),
    }
  }

  const boxes = new Map<string, NodeBox>()
  const rootOf = new Map<string, string>()
  const place = (l: Laid, x: number, containerTop: number, rootId: string) => {
    const y = containerTop + l.nodeTop
    const style = levelStyle(l.level)
    boxes.set(l.node.id, {
      id: l.node.id,
      level: l.level,
      x,
      y,
      w: l.w,
      h: l.h,
      text: l.text,
      attachY: y + style.padY + style.lineHeight / 2,
      ...(l.hidden ? { hidden: l.hidden } : {}),
      ...(l.left ? { left: true } : {}),
    })
    rootOf.set(l.node.id, rootId)
    for (const k of l.kids) place(k.laid, k.laid.left ? x - MM_GAP_X - k.laid.w : x + l.w + MM_GAP_X, containerTop + k.top, rootId)
  }

  for (const root of roots) {
    const laid = lay(root, 0, new Set(), false)
    place(laid, root.x, root.y - laid.nodeTop, root.id)
  }
  return { boxes, children, rootOf }
}

/** The count beside a folded node: a circle just past it (where its branches went), on its branch line. */
export function foldBadge(box: NodeBox): { cx: number; cy: number; r: number } {
  return { cx: box.left ? box.x - 18 : box.x + box.w + 18, cy: box.attachY, r: 10 }
}

/** The edge of a node its branches leave from: right, or left on the root's left side. */
export const outerEdge = (box: NodeBox) => (box.left ? box.x : box.x + box.w)

/** All descendants of `id` (not including itself), depth first. */
export function descendants(id: string, children: Map<string, MindmapNode[]>): string[] {
  const out: string[] = []
  const walk = (n: string) => {
    for (const k of children.get(n) ?? []) {
      out.push(k.id)
      walk(k.id)
    }
  }
  walk(id)
  return out
}

export interface BranchCurve {
  from: { x: number; y: number }
  c1: { x: number; y: number }
  c2: { x: number; y: number }
  to: { x: number; y: number }
  /** Short straight runs before/after the curve (deeper levels). */
  leadIn: number
}

/**
 * Branch from parent to child. From the root: a curve starting near the root's middle
 * (drawn under the root box) with 80px horizontal handles. Deeper: 10px straight, a curve
 * with 40px handles, 10px straight, from the parent's outer edge. On the root's left side the
 * same, mirrored (a negative `leadIn` runs leftwards).
 */
export function branchCurve(parent: NodeBox, child: NodeBox): BranchCurve {
  const dir = child.left ? -1 : 1
  const to = { x: child.left ? child.x + child.w : child.x, y: child.attachY }
  if (parent.level === 0) {
    const cy = parent.y + parent.h / 2
    const from = { x: parent.x + parent.w / 2, y: cy + 0.2 * (to.y - cy) }
    return { from, c1: { x: from.x + 80 * dir, y: from.y }, c2: { x: to.x - 80 * dir, y: to.y }, to, leadIn: 0 }
  }
  const from = { x: outerEdge(parent), y: parent.attachY }
  return {
    from,
    c1: { x: from.x + (10 + 40) * dir, y: from.y },
    c2: { x: to.x - (10 + 40) * dir, y: to.y },
    to,
    leadIn: 10 * dir,
  }
}
