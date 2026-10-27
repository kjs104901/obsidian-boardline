import { describe, expect, it } from 'vitest'
import { createShape } from '../board/model'
import { newSectionZ, ownerOf } from './sections'

const section = (x: number, y: number, w: number, h: number, z: number) => createShape('section', x, y, z, { w, h })
const box = (x: number, y: number, z: number) => createShape('rect', x, y, z)

describe('which section holds what', () => {
  it('a section pasted on top keeps its own copy and leaves the original its box', () => {
    const original = section(0, 0, 500, 300, -1)
    const copy = section(20, 20, 500, 300, 5)
    const a = box(100, 100, 1)
    const aCopy = box(120, 120, 6)
    expect(ownerOf(a, a, [original, copy])?.id).toBe(original.id)
    expect(ownerOf(aCopy, aCopy, [original, copy])?.id).toBe(copy.id)
  })

  it('the smallest section around something holds it, whichever section is drawn first', () => {
    const big = section(0, 0, 900, 600, -1)
    const small = section(100, 100, 400, 300, -2)
    const a = box(150, 150, 1)
    expect(ownerOf(a, a, [big, small])?.id).toBe(small.id)
    expect(ownerOf(small, small, [big, small])?.id).toBe(big.id)
    expect(ownerOf(big, big, [big, small])).toBeNull()
  })

  it('a new section goes behind everything, but over the sections it lies in', () => {
    const big = section(0, 0, 900, 600, -1)
    const a = box(150, 150, 1)
    expect(newSectionZ({ x: 1000, y: 0, w: 100, h: 100 }, [big, a])).toBe(-2)
    const z = newSectionZ({ x: 100, y: 100, w: 400, h: 300 }, [big, a])
    expect(z).toBeGreaterThan(big.z)
    expect(z).toBeLessThan(a.z)
  })
})
