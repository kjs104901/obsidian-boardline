import { connectorPolyline, shiftPins, type Lookup } from '../engine/connectors'
import { endpointObjectId, isConnector, isMindmap, isShape, newId, type BoardObject, type Endpoint } from './model'

export interface ClipboardPayload {
  format: 'boardline/objects'
  objects: BoardObject[]
}

/**
 * Snapshot a selection for copy/duplicate.
 * - Connectors between two copied shapes come along; a copied connector's end attached to a
 *   shape outside the copy becomes a free point at its current position.
 * - A mind map node brings its whole subtree; a node copied without its parent becomes a root
 *   at its current laid-out position (`positionOf`).
 */
export function copyObjects(
  selectedIds: Iterable<string>,
  all: BoardObject[],
  lookup: Lookup,
  positionOf?: (id: string) => { x: number; y: number } | undefined,
): ClipboardPayload {
  const ids = new Set(selectedIds)

  const childrenOf = new Map<string, string[]>()
  for (const o of all) {
    if (isMindmap(o) && o.parentId) childrenOf.set(o.parentId, [...(childrenOf.get(o.parentId) ?? []), o.id])
  }
  const stack = [...ids].filter((id) => childrenOf.has(id))
  while (stack.length) {
    for (const k of childrenOf.get(stack.pop()!) ?? []) {
      if (!ids.has(k)) {
        ids.add(k)
        stack.push(k)
      }
    }
  }

  const shapeIds = new Set(all.filter((o) => isShape(o) && ids.has(o.id)).map((o) => o.id))
  for (const o of all) {
    if (!isConnector(o)) continue
    const a = endpointObjectId(o.from)
    const b = endpointObjectId(o.to)
    if (a && b && shapeIds.has(a) && shapeIds.has(b)) ids.add(o.id)
  }

  const objects: BoardObject[] = []
  for (const o of all) {
    if (!ids.has(o.id)) continue
    if (isMindmap(o)) {
      if (o.parentId && ids.has(o.parentId)) objects.push(o)
      else objects.push({ ...o, parentId: null, ...(positionOf?.(o.id) ? { x: positionOf(o.id)!.x, y: positionOf(o.id)!.y } : {}) })
      continue
    }
    if (!isConnector(o)) {
      objects.push(o)
      continue
    }
    const line = connectorPolyline(o, lookup)
    const detach = (e: Endpoint, at: { x: number; y: number } | undefined): Endpoint => {
      const id = endpointObjectId(e)
      return id && !shapeIds.has(id) && at ? { point: { x: at.x, y: at.y } } : e
    }
    objects.push({ ...o, from: detach(o.from, line?.[0]), to: detach(o.to, line?.[line.length - 1]) })
  }
  return { format: 'boardline/objects', objects }
}

/** New objects for a paste: fresh ids, offset positions, references re-pointed at the copies. */
export function pasteObjects(payload: ClipboardPayload, dx: number, dy: number, zStart: number): BoardObject[] {
  const idMap = new Map(payload.objects.map((o) => [o.id, newId()]))
  const remap = (e: Endpoint): Endpoint => {
    if ('point' in e) return { point: { x: e.point.x + dx, y: e.point.y + dy } }
    const mapped = idMap.get(e.objectId)
    return mapped ? { ...e, objectId: mapped } : e
  }
  // Copies form their own groups instead of joining the originals'.
  const groupMap = new Map<string, string>()
  const regroup = (g: string) => groupMap.get(g) ?? (groupMap.set(g, newId()), groupMap.get(g)!)
  return [...payload.objects]
    .sort((a, b) => a.z - b.z)
    .map((o, i) => {
      const id = idMap.get(o.id)!
      const z = zStart + i
      if (isShape(o)) return { ...o, id, z, x: o.x + dx, y: o.y + dy, ...(o.groupId ? { groupId: regroup(o.groupId) } : {}) }
      if (isMindmap(o)) return { ...o, id, z, x: o.x + dx, y: o.y + dy, parentId: o.parentId ? (idMap.get(o.parentId) ?? null) : null }
      const pins = o.pins && shiftPins(o.pins, dx, dy)
      return { ...o, id, z, from: remap(o.from), to: remap(o.to), ...(pins ? { pins } : {}) }
    })
}

export function isClipboardPayload(v: unknown): v is ClipboardPayload {
  return !!v && (v as ClipboardPayload).format === 'boardline/objects' && Array.isArray((v as ClipboardPayload).objects)
}
