import { describe, expect, it } from 'vitest'
import { copyObjects, pasteObjects } from './clipboard'
import { createConnector, createMindmapNode, createShape, isConnector, isMindmap, isShape, type BoardObject } from './model'

function board() {
  const a = createShape('rect', 0, 0, 1)
  const b = createShape('rect', 300, 0, 2)
  const c = createShape('rect', 0, 300, 3)
  const ab = createConnector({ objectId: a.id, side: 'right' }, { objectId: b.id, side: 'left' }, 4)
  const ac = createConnector({ objectId: a.id, side: 'bottom' }, { objectId: c.id }, 5)
  const all: BoardObject[] = [a, b, c, ab, ac]
  const map = new Map(all.map((o) => [o.id, o]))
  return { a, b, c, ab, ac, all, lookup: (id: string) => map.get(id) }
}

describe('copy/paste', () => {
  it('brings connectors between copied shapes along and re-points them at the copies', () => {
    const { a, b, all, lookup } = board()
    const payload = copyObjects([a.id, b.id], all, lookup)
    expect(payload.objects).toHaveLength(3) // a, b and the a->b connector

    const pasted = pasteObjects(payload, 24, 24, 10)
    const shapes = pasted.filter(isShape)
    const conn = pasted.find(isConnector)!
    expect(shapes.map((s) => [s.x, s.y])).toEqual([[24, 24], [324, 24]])
    expect(new Set(pasted.map((o) => o.id)).size).toBe(3)
    expect(pasted.some((o) => o.id === a.id)).toBe(false)
    expect(conn.from).toEqual({ objectId: shapes[0].id, side: 'right' })
    expect(conn.to).toEqual({ objectId: shapes[1].id, side: 'left' })
    expect(pasted.map((o) => o.z)).toEqual([10, 11, 12])
  })

  it('turns ends attached outside the copy into free points', () => {
    const { a, ac, all, lookup } = board()
    const payload = copyObjects([a.id, ac.id], all, lookup)
    const conn = payload.objects.find(isConnector)!
    expect(conn.from).toEqual({ objectId: a.id, side: 'bottom' })
    // Floating end on c (0,300,240x60) seen from a's bottom: enters c's top at x=120.
    expect(conn.to).toEqual({ point: { x: 120, y: 300 } })
    const pasted = pasteObjects(payload, 24, 0, 1).find(isConnector)!
    expect(pasted.to).toEqual({ point: { x: 144, y: 300 } })
  })

  it('copies a mind map node with its subtree as a new root at its laid-out spot', () => {
    const root = createMindmapNode(null, 0, 0, 0, 'gray', 1)
    const child = createMindmapNode(root.id, 0, 0, 0, 'purple', 2)
    const grand = createMindmapNode(child.id, 0, 0, 0, 'purple', 3)
    const all: BoardObject[] = [root, child, grand]
    const map = new Map(all.map((o) => [o.id, o]))
    const payload = copyObjects([child.id], all, (id) => map.get(id), (id) => (id === child.id ? { x: 189, y: 18 } : undefined))
    expect(payload.objects).toHaveLength(2)
    const pasted = pasteObjects(payload, 24, 24, 10).filter(isMindmap)
    const newRoot = pasted.find((n) => n.parentId === null)!
    expect([newRoot.x, newRoot.y]).toEqual([213, 42])
    expect(pasted.find((n) => n.parentId !== null)!.parentId).toBe(newRoot.id)
  })

  it('gives pasted grouped shapes a group of their own', () => {
    const a = { ...createShape('rect', 0, 0, 1), groupId: 'g1' }
    const b = { ...createShape('rect', 300, 0, 2), groupId: 'g1' }
    const all: BoardObject[] = [a, b]
    const map = new Map(all.map((o) => [o.id, o]))
    const pasted = pasteObjects(copyObjects([a.id, b.id], all, (id) => map.get(id)), 24, 24, 10).filter(isShape)
    expect(pasted[0].groupId).toBeDefined()
    expect(pasted[0].groupId).not.toBe('g1')
    expect(pasted[1].groupId).toBe(pasted[0].groupId)
  })
})
