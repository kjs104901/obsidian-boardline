// Auto layout of connected shapes with ELK's layered algorithm.

import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api'
import { updateOp, type BoardDocument, type Op } from '../board/document'
import { FLOW_SHAPES, endpointObjectId, isConnector, isShape, type BoardObject, type ConnectorObject, type ShapeKind, type ShapeObject, type Side } from '../board/model'
import { snap, type Point, type Rect } from './geometry'
import { positionOn } from './outline'

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
  // A loop goes back along the lines as drawn: walking from the start, the line that returns to
  // a shape already passed is the one turned around (ELK's default can flip the step before it,
  // putting a "Looks right?" check above what it checks).
  'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
}

/** Where a connector end attaches after the layout: a side, and the spot along it when not its middle. */
export interface LayoutEnd {
  side: Side
  at?: number
}

export interface LayoutResult {
  /** New top-left of each shape. */
  positions: Map<string, Point>
  /** Where each connector's ends attach after the layout (where ELK routed them). */
  ends: Map<string, { from: LayoutEnd; to: LayoutEnd }>
}

/** Ends kept along a side stay this far (board px) from its corners. */
const END_CORNER_MARGIN = 12

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

  // Re-attach each end where ELK routed it: the nearest side, and the spot along it. ELK spreads
  // the ends that share a side, which keeps lines into and out of a shape (a loop back up a
  // flowchart, say) apart. The spots move with the shapes and onto the grid, so a line ELK drew
  // straight stays straight; ends that would land on the same grid point keep ELK's spacing.
  type Spot = { edge: string; end: 'from' | 'to'; shape: string; side: Side; exact: number }
  const spots: Spot[] = []
  for (const e of (out.edges ?? [])) {
    const section = e.sections?.[0]
    if (!section) continue
    for (const [end, shape, p] of [['from', e.sources[0], section.startPoint], ['to', e.targets[0], section.endPoint]] as const) {
      const r = placed.get(shape)
      if (!r) continue
      const side = nearestSide(r, p)
      spots.push({ edge: e.id, end, shape, side, exact: side === 'top' || side === 'bottom' ? p.x + dx : p.y + dy })
    }
  }
  const crowded = new Set<string>()
  const taken = new Set<string>()
  for (const s of spots) {
    const key = `${s.shape} ${s.side} ${snap(s.exact)}`
    if (taken.has(key)) crowded.add(`${s.shape} ${s.side}`)
    taken.add(key)
  }
  const sizes = new Map(shapes.map((s) => [s.id, s]))
  const ends = new Map<string, { from: LayoutEnd; to: LayoutEnd }>()
  for (const s of spots) {
    const shape = sizes.get(s.shape)
    const p = positions.get(s.shape)
    if (!shape || !p) continue
    const along = crowded.has(`${s.shape} ${s.side}`) ? s.exact : snap(s.exact)
    const point = s.side === 'top' || s.side === 'bottom' ? { x: along, y: 0 } : { x: 0, y: along }
    const at = Math.round(positionOn({ ...shape, x: p.x, y: p.y }, s.side, point, END_CORNER_MARGIN) * 1e4) / 1e4
    const end: LayoutEnd = Math.abs(at - 0.5) < 1e-3 ? { side: s.side } : { side: s.side, at }
    const pair = ends.get(s.edge) ?? ({} as { from: LayoutEnd; to: LayoutEnd })
    pair[s.end] = end
    ends.set(s.edge, pair)
  }
  for (const [id, pair] of ends) if (!pair.from || !pair.to) ends.delete(id)
  return { positions, ends }
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
 * The edits "Auto layout" makes on a board. `seed` picks what moves: two or more shapes as given,
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
    const ends = result.ends.get(c.id)
    if (!isConnector(cur) || !ends || !('objectId' in cur.from) || !('objectId' in cur.to)) continue
    const { pins: _pins, ...rest } = cur
    ops.push(updateOp(cur, { ...rest, from: { objectId: cur.from.objectId, ...ends.from }, to: { objectId: cur.to.objectId, ...ends.to } }))
  }
  return ops
}
