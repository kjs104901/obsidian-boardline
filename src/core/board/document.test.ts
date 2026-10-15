import { describe, expect, it, vi } from 'vitest'
import { BoardDocument, createOp, deleteOp, updateOp } from './document'
import { createConnector, createShape, isShape } from './model'

const xOf = (doc: BoardDocument, id: string) => {
  const o = doc.get(id)
  return isShape(o) ? o.x : undefined
}

const meta = () => ({ id: 'b1', title: 't', createdAt: '2026-01-01T00:00:00.000Z', rev: 0 })

describe('BoardDocument', () => {
  it('commits, undoes and redoes a transaction', () => {
    const doc = new BoardDocument(meta())
    const a = createShape('rect', 0, 0, 1)
    doc.commit('add', [createOp(a)])
    expect(doc.get(a.id)).toEqual(a)

    const moved = { ...a, x: 12 }
    doc.commit('move', [updateOp(a, moved)])
    expect(xOf(doc, a.id)).toBe(12)

    doc.undo()
    expect(xOf(doc, a.id)).toBe(0)
    doc.undo()
    expect(doc.get(a.id)).toBeUndefined()
    expect(doc.canUndo()).toBe(false)

    doc.redo()
    doc.redo()
    expect(xOf(doc, a.id)).toBe(12)
    expect(doc.canRedo()).toBe(false)
  })

  it('can fold an edit into the previous step (Alt+drag: copy, then move the copy)', () => {
    const doc = new BoardDocument(meta())
    const a = createShape('rect', 0, 0, 1)
    doc.commit('copy', [createOp(a)])
    doc.commit('move', [updateOp(a, { ...a, x: 24 })], true)
    expect(xOf(doc, a.id)).toBe(24)
    doc.undo()
    expect(doc.get(a.id)).toBeUndefined()
    expect(doc.canUndo()).toBe(false)
    doc.redo()
    expect(xOf(doc, a.id)).toBe(24)
  })

  it('drops no-op changes and clears redo on a new edit', () => {
    const doc = new BoardDocument(meta())
    const a = createShape('rect', 0, 0, 1)
    doc.commit('add', [createOp(a)])
    const listener = vi.fn()
    doc.subscribe(listener)

    doc.commit('noop', [updateOp(a, { ...a })])
    expect(listener).not.toHaveBeenCalled()

    doc.undo()
    expect(doc.canRedo()).toBe(true)
    const b = createShape('pill', 0, 0, 2)
    doc.commit('add b', [createOp(b)])
    expect(doc.canRedo()).toBe(false)
  })

  it('treats structurally equal objects (e.g. re-read from a file) as unchanged', () => {
    const doc = new BoardDocument(meta())
    const c = { ...createConnector({ objectId: 'a', side: 'right' }, { point: { x: 1, y: 2 } }, 1), pins: { at: [null, { x: 12 }, null] } }
    doc.commit('add', [createOp(c)])
    const listener = vi.fn()
    doc.subscribe(listener)
    doc.commit('same', [updateOp(c, JSON.parse(JSON.stringify(c)))])
    expect(listener).not.toHaveBeenCalled()
    doc.commit('moved pin', [updateOp(c, { ...c, pins: { at: [null, { x: 24 }, null] } })])
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('restores deleted objects and keeps z order', () => {
    const a = createShape('rect', 0, 0, 2)
    const b = createShape('rect', 0, 0, 1)
    const doc = new BoardDocument(meta(), [a, b])
    expect(doc.ordered().map((o) => o.id)).toEqual([b.id, a.id])
    doc.commit('delete', [deleteOp(a), deleteOp(b)])
    expect(doc.objects.size).toBe(0)
    doc.undo()
    expect(doc.ordered().map((o) => o.id)).toEqual([b.id, a.id])
    expect(doc.maxZ()).toBe(2)
  })
})
