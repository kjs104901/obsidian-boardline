import { describe, expect, it } from 'vitest'
import { BoardDocument, createOp } from './document'
import { createConnector, createShape } from './model'
import { BoardFormatError, boardFileName, emptyBoardFile, parseBoard, serialize, titleFromFileName } from './serialize'

describe('board files', () => {
  it('round-trips a document', () => {
    const file = emptyBoardFile('설계')
    const doc = parseBoard(JSON.stringify(file))
    const s = { ...createShape('diamond', 24, 48, 1), text: '분기?' }
    doc.commit('add', [createOp(s)])
    doc.meta.rev = 3

    const again = parseBoard(serialize(doc))
    expect(again.meta).toEqual(doc.meta)
    expect(again.get(s.id)).toEqual(s)
  })

  it('rejects foreign JSON and skips malformed objects', () => {
    expect(() => parseBoard('{"hello":1}')).toThrow(BoardFormatError)
    expect(() => parseBoard('not json')).toThrow(BoardFormatError)

    const file = { ...emptyBoardFile('x'), objects: [{ id: 'bad', type: 'shape', shape: 'star' }] }
    expect(parseBoard(JSON.stringify(file)).objects.size).toBe(0)
  })

  it('round-trips connectors and drops ones with invalid ends', () => {
    const doc = parseBoard(JSON.stringify(emptyBoardFile('c')))
    const a = createShape('rect', 0, 0, 1)
    const c = { ...createConnector({ objectId: a.id, side: 'right' }, { point: { x: 300, y: 48 } }, 2), label: '요청' }
    doc.commit('add', [createOp(a), createOp(c)])
    const again = parseBoard(serialize(doc))
    expect(again.get(c.id)).toEqual(c)

    const broken = { ...emptyBoardFile('x'), objects: [{ ...c, to: { side: 'left' } }] }
    expect(parseBoard(JSON.stringify(broken)).objects.size).toBe(0)
  })

  it('keeps an end pinned along a side, and drops a position off the side', () => {
    const doc = parseBoard(JSON.stringify(emptyBoardFile('c')))
    const a = createShape('rect', 0, 0, 1)
    const c = createConnector({ objectId: a.id, side: 'top', at: 0.25 }, { point: { x: 300, y: 48 } }, 2)
    doc.commit('add', [createOp(a), createOp(c)])
    expect(parseBoard(serialize(doc)).get(c.id)).toEqual(c)

    for (const from of [{ objectId: a.id, side: 'top', at: 1.5 }, { objectId: a.id, at: 0.25 }]) {
      const file = { ...emptyBoardFile('x'), objects: [{ ...c, from }] }
      expect(parseBoard(JSON.stringify(file)).objects.size).toBe(0)
    }
  })

  it('serializes objects in z order', () => {
    const a = createShape('rect', 0, 0, 5)
    const b = createShape('rect', 0, 0, 1)
    const doc = new BoardDocument({ id: 'b', title: 't', createdAt: '', rev: 0 }, [a, b])
    const ids = JSON.parse(serialize(doc)).objects.map((o: { id: string }) => o.id)
    expect(ids).toEqual([b.id, a.id])
  })

  it('makes safe file names', () => {
    expect(boardFileName('회의: 1/2?')).toBe('회의 12.board')
    expect(boardFileName('   ')).toBe('새 보드.board')
    expect(titleFromFileName('던전 연출.board')).toBe('던전 연출')
  })
})
