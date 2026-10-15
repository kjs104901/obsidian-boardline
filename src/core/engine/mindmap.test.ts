import { describe, expect, it } from 'vitest'
import { createMindmapNode, type MindmapNode } from '../board/model'
import { layoutMindmaps, levelStyle } from './mindmap'

// Fixed-width font: 8px per character at every level.
const measure = (s: string) => s.length * 8

function node(text: string, parent: MindmapNode | null, order = 0, x = 0, y = 0): MindmapNode {
  return { ...createMindmapNode(parent?.id ?? null, x, y, order, 'purple', 1), text }
}

describe('mind map layout', () => {
  it('puts children MM_GAP_X right of their parent and the parent in the middle of them', () => {
    const root = node('Root', null, 0, 300, 480)
    const c1 = node('Child one', root, 1)
    const c2 = node('Child two', root, 2)
    const g1 = node('Grandchild', c2, 1)
    const g2 = node('Grandchild 2', c2, 2)
    const { boxes } = layoutMindmaps([root, c1, c2, g1, g2], () => measure)

    // Root: 32px of text + 2*20 padding, one 30px line + 2*16.
    expect(boxes.get(root.id)).toMatchObject({ x: 300, y: 480, w: 72, h: 62 })
    // Level 1: 72px + 2*8, one 26px line + 2*4; 80px right of the root.
    expect(boxes.get(c1.id)).toMatchObject({ x: 452, y: 446, w: 88, h: 34 })
    expect(boxes.get(c2.id)).toMatchObject({ x: 452, y: 527, w: 88, h: 34 })
    // Level 2: 24px lines, no vertical padding; stacked with 10px of room each side.
    expect(boxes.get(g1.id)).toMatchObject({ x: 620, y: 510, w: 96, h: 24 })
    expect(boxes.get(g2.id)).toMatchObject({ x: 620, y: 554, w: 112, h: 24 })
    // The parent sits in the middle of its children.
    const mid = (id: string) => boxes.get(id)!.y + boxes.get(id)!.h / 2
    expect(mid(c2.id)).toBeCloseTo((mid(g1.id) + mid(g2.id)) / 2, 0)
  })

  it('wraps long text and makes room for it', () => {
    const root = node('Root', null, 0, 300, 480)
    const long = node('x'.repeat(60), root, 1)
    const other = node('Child two', root, 2)
    const { boxes } = layoutMindmaps([root, long, other], () => measure)
    // 480px of text wraps at 400 (50 characters): two 26px lines.
    expect(boxes.get(long.id)).toMatchObject({ w: 400 + 16, h: 2 * 26 + 8 })
    expect(boxes.get(other.id)!.y).toBeGreaterThan(boxes.get(long.id)!.y + boxes.get(long.id)!.h)
  })

  it('lays a folded node out as a leaf that counts what it hides', () => {
    const root = node('Root', null, 0, 300, 480)
    const c1 = { ...node('Folded', root, 1), collapsed: true }
    const g1 = node('Grandchild', c1, 1)
    const gg = node('Great', g1, 1)
    const c2 = node('Open', root, 2)
    const { boxes } = layoutMindmaps([root, c1, g1, gg, c2], () => measure)
    expect(boxes.get(c1.id)?.hidden).toBe(2)
    expect(boxes.has(g1.id) || boxes.has(gg.id)).toBe(false)
    expect(boxes.get(c2.id)?.hidden).toBeUndefined()
  })

  it('grows a root\'s left branches leftwards, each side centered on the root', () => {
    const root = node('Root', null, 0, 300, 480)
    const right = node('Right', root, 1)
    const left = { ...node('Left', root, 2), side: 'left' as const }
    const deep = node('Deep', left, 1)
    const { boxes } = layoutMindmaps([root, right, left, deep], () => measure)
    const r = boxes.get(root.id)!
    const l = boxes.get(left.id)!
    // Root 72 wide at 300; "Left" (32 + 16 = 48 wide) ends MM_GAP_X before it, "Deep" as far again.
    expect(l).toMatchObject({ x: 300 - 80 - 48, left: true })
    expect(boxes.get(deep.id)).toMatchObject({ x: l.x - 80 - 48, left: true })
    expect(boxes.get(right.id)).toMatchObject({ x: 300 + 72 + 80 })
    expect(boxes.get(right.id)!.left).toBeUndefined()
    // One branch on each side: both level with the root's middle.
    const mid = (b: { y: number; h: number }) => b.y + b.h / 2
    expect(mid(boxes.get(right.id)!)).toBeCloseTo(mid(r), 0)
    expect(mid(l)).toBeCloseTo(mid(r), 0)
  })

  it('uses smaller text for deeper levels', () => {
    expect([0, 1, 2, 5].map((l) => levelStyle(l).fontSize)).toEqual([22, 18, 16, 16])
  })
})
