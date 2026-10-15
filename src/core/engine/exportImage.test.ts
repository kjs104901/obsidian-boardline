import { describe, expect, it } from 'vitest'
import { createConnector, createShape, type BoardObject } from '../board/model'
import { luminance, mixColors, oklchToSrgb, toSvgColor } from '../theme/color'
import { exportSvg } from './exportImage'
import { layoutMindmaps } from './mindmap'

const measure = (s: string) => s.length * 10

describe('colors for SVG', () => {
  it('converts oklch to sRGB hex', () => {
    expect(toSvgColor('oklch(100% 0 0)')).toEqual({ hex: '#ffffff', opacity: 1 })
    expect(toSvgColor('oklch(0% 0 0 / 35%)')).toEqual({ hex: '#000000', opacity: 0.35 })
    // Pure sRGB red is oklch(62.8% 0.2577 29.23).
    const [r, g, b] = oklchToSrgb(0.628, 0.2577, 29.23)
    expect(r).toBeCloseTo(1, 2)
    expect(g).toBeCloseTo(0, 2)
    expect(b).toBeCloseTo(0, 2)
  })

  it('tints a color over a background and tells light colors from dark', () => {
    expect(mixColors('#ff0000', '#ffffff', 0.1)).toBe('#ffe6e6')
    expect(mixColors('rgb(0, 0, 255)', '#000000', 0.5)).toBe('#000080')
    expect(luminance('#ffffff')).toBeCloseTo(1, 3)
    expect(luminance('#222222')).toBeLessThan(0.05)
  })

  it('passes other colors through', () => {
    expect(toSvgColor('#FFFFFF')).toEqual({ hex: '#FFFFFF', opacity: 1 })
  })
})

describe('SVG export', () => {
  const a = { ...createShape('rect', 0, 0, 1), text: 'Start & <go>' }
  const b = createShape('rect', 400, 0, 2)
  const c = { ...createConnector({ objectId: a.id, side: 'right' }, { objectId: b.id, side: 'left' }, 3), label: 'yes' }
  const objects: BoardObject[] = [a, b, c]
  const map = new Map(objects.map((o) => [o.id, o]))
  const svg = exportSvg(
    { objects, lookup: (id) => map.get(id), mindmap: layoutMindmaps([], () => measure), bounds: { x: 0, y: 0, w: 640, h: 60 } },
    () => measure,
  )

  it('frames the content with padding', () => {
    expect(svg).toContain('viewBox="-40 -40 720 140"')
  })

  it('draws shapes, escaped text, the connector and its arrow', () => {
    expect(svg).toContain('>Start &amp; &lt;go&gt;</text>')
    // 6px off both outlines; the line stops short of the arrow so its tip stays sharp (394 - 9).
    expect(svg).toContain('<path d="M246 30L385 30"')
    expect(svg).toContain('<polygon points=')
    expect(svg).toContain('>yes</text>')
  })

  it('uses only sRGB colors', () => {
    expect(svg).not.toContain('oklch')
  })

  it('frames the kept part of a cropped picture', () => {
    const pic = { ...createShape('image', 10, 20, 1, { w: 120, h: 60 }), src: 'a.png', crop: { x: 0.25, y: 0, w: 0.5, h: 0.5 } }
    const out = exportSvg(
      { objects: [pic], lookup: () => pic, mindmap: layoutMindmaps([], () => measure), bounds: { x: 10, y: 20, w: 120, h: 60 } },
      () => measure,
      new Map([['a.png', 'data:image/png;base64,AA==']]),
    )
    expect(out).toContain('<svg x="10" y="20" width="120" height="60" viewBox="0.25 0 0.5 0.5" preserveAspectRatio="none"><image href="data:image/png;base64,AA=="')
  })
})
