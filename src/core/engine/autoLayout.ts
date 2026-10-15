// Auto layout of connected shapes with ELK's layered algorithm.

import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api'
import { updateOp, type BoardDocument, type Op } from '../board/document'
import { FLOW_SHAPES, endpointObjectId, isConnector, isShape, type BoardObject, type ConnectorObject, type ShapeKind, type ShapeObject, type Side } from '../board/model'
import { snap, type Point, type Rect } from './geometry'

export type LayoutDirection = 'DOWN' | 'RIGHT'

/** Spacing in grid steps: rows of shapes four apart (like quick add), shapes in a row three. */
const LAYOUT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.spacing.nodeNode': '60',
  'elk.layered.spacing.nodeNodeBetweenLayers': '80',
  'elk.layered.spacing.edgeNodeBetweenLayers': '40',
  'elk.spacing.edgeNode': '20',
  'elk.spacing.edgeEdge': '20',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '20',
}

export interface LayoutResult {
  /** New top-left of each shape. */
  positions: Map<string, Point>
  /** Sides each connector's ends attach to after the layout. */
  sides: Map<string, { from: Side; to: Side }>
}

/**
 * Lay out `shapes` along `direction`; `connectors` must have both ends on those shapes.
 * The result keeps the top-left of the shapes' bounding box and snaps to the grid.
 */
export async function autoLayout(shapes: ShapeObject[], connectors: ConnectorObject[], direction: LayoutDirection): Promise<LayoutResult> {
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js')
  const ids = new Set(shapes.map((s) => s.id))
  const edges: ElkExtendedEdge[] = []
  for (const c of connectors) {
    if (!('objectId' in c.from) || !('objectId' in c.to)) continue
    if (!ids.has(c.from.objectId) || !ids.has(c.to.objectId) || c.from.objectId === c.to.objectId) continue
    edges.push({ id: c.id, sources: [c.from.objectId], targets: [c.to.objectId] })
  }
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: { ...LAYOUT_OPTIONS, 'elk.direction': direction },
    children: shapes.map((s) => ({ id: s.id, width: s.w, height: s.h })),
    edges,
  }
  const out = await new ELK().layout(graph)

  const placed = new Map((out.children ?? []).map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0, w: n.width ?? 0, h: n.height ?? 0 }]))
  const before = bounds(shapes)
  const after = bounds([...placed.values()])
  const dx = snap(before.x) - after.x
  const dy = snap(before.y) - after.y
  const positions = new Map<string, Point>()
  for (const [id, r] of placed) positions.set(id, { x: snap(r.x + dx), y: snap(r.y + dy) })

  // Re-attach each end to the side nearest to where ELK routed it.
  const sides = new Map<string, { from: Side; to: Side }>()
  for (const e of (out.edges ?? []) as ElkExtendedEdge[]) {
    const section = e.sections?.[0]
    const a = placed.get(e.sources[0])
    const b = placed.get(e.targets[0])
    if (!section || !a || !b) continue
    sides.set(e.id, { from: nearestSide(a, section.startPoint), to: nearestSide(b, section.endPoint) })
  }
  return { positions, sides }
}

function bounds(rects: Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x))
  const y = Math.min(...rects.map((r) => r.y))
  return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y }
}

/** Side of `r` closest to `p`. */
export function nearestSide(r: Rect, p: Point): Side {
  const d: [Side, number][] = [
    ['top', Math.abs(p.y - r.y)],
    ['bottom', Math.abs(p.y - (r.y + r.h))],
    ['left', Math.abs(p.x - r.x)],
    ['right', Math.abs(p.x - (r.x + r.w))],
  ]
  return d.reduce((best, cur) => (cur[1] < best[1] ? cur : best))[0]
}

/** Shapes auto layout moves (flowchart shapes, stickies and icons). */
export const LAYOUT_KINDS: ShapeKind[] = [...FLOW_SHAPES, 'sticky', 'icon']

/**
 * The edits "자동 정렬" makes on a board. `seed` picks what moves: two or more shapes as given,
 * one shape with everything connected to it, none: every connected shape on the board.
 * Locked shapes stay. Empty when there are fewer than two shapes to arrange.
 */
export async function layoutOps(doc: BoardDocument, seed: string[], direction: LayoutDirection): Promise<Op[]> {
  const all = doc.ordered()
  const connectors = all.filter(isConnector)
  const layoutable = (o: BoardObject | undefined): o is ShapeObject => isShape(o) && LAYOUT_KINDS.includes(o.shape)
  const links = connectors
    .map((c) => [endpointObjectId(c.from), endpointObjectId(c.to)] as const)
    .filter((l): l is readonly [string, string] => l[0] !== null && l[1] !== null)

  const selected = seed.map((id) => doc.get(id)).filter(layoutable)
  let ids: Set<string>
  if (selected.length >= 2) {
    ids = new Set(selected.map((s) => s.id))
  } else if (selected.length === 1) {
    // The connected group around the shape.
    ids = new Set([selected[0].id])
    for (let grew = true; grew; ) {
      grew = false
      for (const [a, b] of links) {
        if (ids.has(a) !== ids.has(b)) {
          ids.add(ids.has(a) ? b : a)
          grew = true
        }
      }
    }
  } else {
    ids = new Set(links.flat())
  }
  const shapes = all.filter(layoutable).filter((s) => ids.has(s.id))
  if (shapes.length < 2) return []
  const inner = connectors.filter((c) => {
    const a = endpointObjectId(c.from)
    const b = endpointObjectId(c.to)
    return a !== null && b !== null && ids.has(a) && ids.has(b)
  })
  const result = await autoLayout(shapes, inner, direction)

  // Re-read the objects: the board may have changed while ELK was running.
  const ops: Op[] = []
  for (const s of shapes) {
    const cur = doc.get(s.id)
    const p = result.positions.get(s.id)
    if (isShape(cur) && p && !cur.locked) ops.push(updateOp(cur, { ...cur, x: p.x, y: p.y }))
  }
  for (const c of inner) {
    const cur = doc.get(c.id)
    const sides = result.sides.get(c.id)
    if (!isConnector(cur) || !sides || !('objectId' in cur.from) || !('objectId' in cur.to)) continue
    const { pins: _pins, ...rest } = cur
    ops.push(updateOp(cur, { ...rest, from: { objectId: cur.from.objectId, side: sides.from }, to: { objectId: cur.to.objectId, side: sides.to } }))
  }
  return ops
}
