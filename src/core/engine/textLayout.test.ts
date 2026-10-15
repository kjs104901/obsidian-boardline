import { describe, expect, it } from 'vitest'
import { createShape } from '../board/model'
import { autosizeShape, autosizedHeight, labelLayout, layoutShapeText, wrapText } from './textLayout'
import { layoutText } from './richLayout'
import { nextListItem, toggleListText, toggleTaskLine } from './text'

// Fixed-width font: every character is 10px wide.
const measure = (s: string) => s.length * 10

describe('wrapText', () => {
  it('wraps on word boundaries', () => {
    expect(wrapText('aaa bbb ccc', 70, measure)).toEqual(['aaa bbb', 'ccc'])
  })

  it('keeps explicit newlines and empty lines', () => {
    expect(wrapText('a\n\nb', 100, measure)).toEqual(['a', '', 'b'])
  })

  it('breaks words longer than the box per character', () => {
    expect(wrapText('가나다라마바사', 30, measure)).toEqual(['가나다', '라마바', '사'])
    expect(wrapText('ab cdefgh', 40, measure)).toEqual(['ab', 'cdef', 'gh'])
  })

  it('drops whitespace at wrap points', () => {
    expect(wrapText('aa   bb', 40, measure)).toEqual(['aa', 'bb'])
  })
})

describe('shape text', () => {
  it('lays out text inside the inset box, vertically centered', () => {
    const s = { ...createShape('rect', 0, 0, 1), text: 'hello' }
    const layout = layoutShapeText(s, () => measure)
    // rect: 240x60, inset 12 -> width 216; one 24px line centered in 60.
    expect(layout.box).toEqual({ x: 12, y: 18, w: 216, h: 24 })
    expect(layout.rich.spans.map((sp) => sp.text)).toEqual(['hello'])
  })

  it('grows height to lines*24 + 12 but never below the ideal height', () => {
    const s = createShape('rect', 0, 0, 1)
    expect(autosizedHeight(s, measure)).toBe(60)
    // 216px box fits 21 chars per line; 7 lines -> 7*24 + 12 = 180.
    const long = { ...s, text: Array.from({ length: 7 }, () => 'x'.repeat(21)).join(' ') }
    expect(autosizedHeight(long, measure)).toBe(180)
  })
})

describe('sticky, text and section', () => {
  it('shrinks sticky text until it fits inside the 16px inset', () => {
    const s = createShape('sticky', 0, 0, 1)
    // 200x200 sticky -> 168x168 inner box; size-proportional measure (0.5em per char).
    const at = (size: number) => (t: string) => t.length * size * 0.5
    expect(layoutShapeText({ ...s, text: 'short' }, at).fontSize).toBe(24)
    // 24px: 14 chars/line, 34px lines -> 4 lines fit. 200 chars need 15 lines -> shrink.
    const long = layoutShapeText({ ...s, text: 'x'.repeat(200) }, at)
    expect(long.fontSize).toBeLessThan(24)
    expect(long.rich.height).toBeLessThanOrEqual(168)
    expect(long.align).toBe('left')
  })

  it('sizes free text to its content', () => {
    const t = { ...createShape('text', 0, 0, 1), text: 'hello\nworld!' }
    const sized = autosizeShape(t, () => measure)
    expect([sized.w, sized.h]).toEqual([62, 48])
  })

  it('puts the section title above the frame and keeps the frame size', () => {
    const s = { ...createShape('section', 0, 100, 1), text: 'Title' }
    const layout = layoutShapeText(s, () => measure)
    expect(layout.box.y + layout.box.h).toBeLessThanOrEqual(100)
    expect(layout.fontSize).toBe(14)
    expect(autosizeShape(s, () => measure)).toBe(s)
  })
})

describe('icons', () => {
  it('sit 32x32 above the text in a shape, the pair centered', () => {
    // A 96x192 shape at y 228: 32 + 4 + 24 = 60px of icon and text centered -> icon at 294.
    const s = { ...createShape('rect', 30, 228, 1, { w: 96, h: 192 }), text: 'Hello', icon: 'user' }
    const layout = layoutShapeText(s, () => measure)
    expect(layout.icon).toEqual({ x: 62, y: 294, w: 32, h: 32 })
    expect(layout.box.y).toBe(330)
  })

  it('are centered alone without text, and shapes grow to fit icon and text', () => {
    const s = { ...createShape('rect', 30, 228, 1, { w: 96, h: 192 }), icon: 'user' }
    expect(layoutShapeText(s, () => measure).icon).toEqual({ x: 62, y: 308, w: 32, h: 32 })
    const small = { ...createShape('rect', 0, 0, 1, { w: 192, h: 48 }), text: 'a\nb', icon: 'user' }
    expect(autosizeShape(small, () => measure).h).toBe(32 + 4 + 48 + 12)
  })

  it('label icon objects under the icon', () => {
    const o = { ...createShape('icon', 0, 0, 1), text: 'Launch', icon: 'rocket' }
    const layout = layoutShapeText(o, () => measure)
    // An 80px icon, its label in a 200px box 4px below.
    expect(layout.box).toEqual({ x: -60, y: 84, w: 200, h: 24 })
    expect(autosizeShape(o, () => measure)).toBe(o)
  })
})

describe('lists', () => {
  it('shows bullets and hangs wrapped item lines under the text', () => {
    // The marker takes 1.25em (20px): the item wraps at 80 and its next line starts at 20.
    const t = { ...createShape('text', 0, 0, 1), text: '- aaa bbb ccc', fixedWidth: true, w: 102 }
    const spans = layoutShapeText(t, () => measure).rich.spans
    expect(spans.map((sp) => [sp.text, sp.x, sp.y])).toEqual([
      ['•', 0, 12],
      ['aaa bbb', 20, 12],
      ['ccc', 20, 36],
    ])
  })

  it('turns lines into list items and back', () => {
    expect(toggleListText('a\n\nb', 'bullet')).toBe('- a\n\n- b')
    expect(toggleListText('- a\n- b', 'bullet')).toBe('a\nb')
    expect(toggleListText('- a\nb', 'number')).toBe('1. a\n2. b')
    expect(toggleListText('', 'number')).toBe('1. ')
    expect(toggleListText('- a\nb', 'task')).toBe('- [ ] a\n- [ ] b')
    expect(toggleListText('- [ ] a\n- [x] b', 'task')).toBe('a\nb')
    expect(toggleListText('- [ ] a', 'bullet')).toBe('- a')
  })

  it('continues a list on Enter and ends it on an empty item', () => {
    expect(nextListItem('- milk')).toEqual({ marker: '- ', end: false })
    expect(nextListItem('  9) eggs')).toEqual({ marker: '  10) ', end: false })
    expect(nextListItem('- ')).toEqual({ marker: '', end: true })
    expect(nextListItem('plain')).toBeNull()
    expect(nextListItem('- [x] done')).toEqual({ marker: '- [ ] ', end: false })
    expect(nextListItem('- [ ] ')).toEqual({ marker: '', end: true })
  })

  it('checks and unchecks tasks by line', () => {
    expect(toggleTaskLine('title\n- [ ] a\n> - [x] b', 1)).toBe('title\n- [x] a\n> - [x] b')
    expect(toggleTaskLine('title\n- [ ] a\n> - [x] b', 2)).toBe('title\n- [ ] a\n> - [ ] b')
    expect(toggleTaskLine('plain', 0)).toBe('plain')
  })
})

describe('text style', () => {
  it('sizes and aligns the text, with headings and marks inside', () => {
    const s = { ...createShape('text', 0, 0, 1), text: '# Big\n**bold** and *it*', textSize: 'l' as const, align: 'right' as const }
    const styles: string[] = []
    const layout = layoutShapeText(s, (size, style = '') => (styles.push(`${style}${size}`), measure))
    expect(layout).toMatchObject({ fontSize: 20, lineHeight: 28, align: 'right' })
    expect(styles).toEqual(expect.arrayContaining(['600 32', '600 20', 'italic 20']))
    // The heading line (32 on 42) and the text line (28): right-aligned in the widest line.
    const [big, bold, and, it] = layout.rich.spans
    expect(big).toMatchObject({ text: 'Big', y: 21, style: '600 ' })
    expect([bold.bold, and.text, it.italic]).toEqual([true, ' and ', true])
    expect(big.x + big.w).toBe(it.x + it.w)
    expect(autosizeShape(s, () => measure).h).toBe(42 + 28)
  })

  it('grows a shape for bigger text', () => {
    const s = { ...createShape('rect', 0, 0, 1), text: 'a\nb', textSize: 'xxl' as const }
    expect(autosizeShape(s, () => measure).h).toBe(2 * 48 + 12)
  })
})

describe('words with marks only (nodes, cells, labels)', () => {
  const base = { size: 16, line: 24, align: 'left' as const, inline: true }

  it('keeps line markers as typed and draws the marks', () => {
    const l = layoutText('# not a heading\n- **bold** item', 400, base, () => measure)
    expect(l.spans.map((s) => s.text)).toEqual(['# not a heading', '- ', 'bold', ' item'])
    expect(l.spans.find((s) => s.text === 'bold')?.style).toBe('600 ')
    expect(l.height).toBe(2 * 24)
  })

  it('makes all of it bold for a header row', () => {
    expect(layoutText('Name', 400, { ...base, bold: true }, () => measure).spans[0].style).toBe('600 ')
  })

  it('centers a label\'s lines on each other and pads its box', () => {
    const l = labelLayout('long label\nab', () => measure)
    expect(l.w).toBe(100 + 2 * 6)
    expect(l.h).toBe(2 * 24 + 6)
    expect(l.rich.spans[1].x).toBe(40)
  })
})
