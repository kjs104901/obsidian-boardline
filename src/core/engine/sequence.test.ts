import { describe, expect, it } from 'vitest'
import { createConnector, createShape, type BoardObject } from '../board/model'
import { connectorGeometry, connectorPolyline } from './connectors'
import { actorBounds, actorSlot, lifeline, lifelineAt, messageDy, neighbourActor } from './sequence'

const actor = (x: number, y = 0) => createShape('actor', x, y, 1)

describe('actors', () => {
  it('are 160x60 with a 400px lifeline', () => {
    const a = actor(300, 120)
    expect([a.w, a.h, a.stem]).toEqual([160, 60, 400])
    expect(lifeline(a)).toEqual({ x: 380, top: 180, bottom: 580 })
    expect(actorBounds(a)).toEqual({ x: 300, y: 120, w: 160, h: 460 })
  })

  it('adds the next actor 80px away, past ones already there', () => {
    const a = actor(300)
    expect(actorSlot(a, 'right', [a])).toEqual({ x: 540, y: 0 })
    const b = actor(540)
    expect(actorSlot(a, 'right', [a, b])).toEqual({ x: 780, y: 0 })
    expect(actorSlot(a, 'left', [a, b])).toEqual({ x: 60, y: 0 })
  })

  it('keeps messages on the lifeline and on the grid', () => {
    const a = actor(0, 0)
    expect(messageDy(a, 275)).toBe(280)
    expect(messageDy(a, 10)).toBe(80) // just below the box (60 + 20)
    expect(messageDy(a, 5000)).toBe(460)
  })

  it('finds lifelines and neighbours', () => {
    const a = actor(0)
    const b = actor(280)
    const c = actor(560)
    const all: BoardObject[] = [a, b, c]
    expect(lifelineAt(all, { x: 366, y: 200 }, 6)?.id).toBe(b.id)
    expect(lifelineAt(all, { x: 360, y: 20 }, 6)).toBeNull() // on the box, not the lifeline
    expect(neighbourActor(all, b, 200, 1)?.id).toBe(c.id)
    expect(neighbourActor(all, b, 200, -1)?.id).toBe(a.id)
    expect(neighbourActor(all, c, 200, 1)).toBeNull()
  })
})

describe('messages', () => {
  const a = actor(0)
  const b = actor(280)
  const map = new Map<string, BoardObject>([
    [a.id, a],
    [b.id, b],
  ])
  const lookup = (id: string) => map.get(id)

  it('run straight between lifelines at their height, stopping 6px short of them', () => {
    const m = createConnector({ objectId: a.id, dy: 160 }, { objectId: b.id, dy: 160 }, 2)
    expect(connectorPolyline(m, lookup)).toEqual([
      { x: 80, y: 160 },
      { x: 360, y: 160 },
    ])
    expect(connectorGeometry(m, lookup)?.points).toEqual([
      { x: 86, y: 160 },
      { x: 354, y: 160 },
    ])
  })

  it('follow their actors', () => {
    const moved = { ...b, x: 560 }
    const m = createConnector({ objectId: a.id, dy: 160 }, { objectId: b.id, dy: 160 }, 2)
    expect(connectorPolyline(m, (id) => (id === b.id ? moved : lookup(id)))?.[1]).toEqual({ x: 640, y: 160 })
  })

  it('loop back to the same actor', () => {
    const m = createConnector({ objectId: a.id, dy: 120 }, { objectId: a.id, dy: 160 }, 2)
    expect(connectorPolyline(m, lookup)).toEqual([
      { x: 80, y: 120 },
      { x: 120, y: 120 },
      { x: 120, y: 160 },
      { x: 80, y: 160 },
    ])
  })
})
