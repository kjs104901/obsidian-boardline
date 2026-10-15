import { describe, expect, it } from 'vitest'
import { hasMarkAll, lineStart, mergeRuns, parseInline, plainText, serializeInline, setMarkAll, type Run } from './richText'

describe('inline Markdown', () => {
  it('reads emphasis, code and links', () => {
    expect(parseInline('a **b** *c* ~~d~~ ==e== `f`')).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' ' },
      { text: 'c', italic: true },
      { text: ' ' },
      { text: 'd', strike: true },
      { text: ' ' },
      { text: 'e', highlight: true },
      { text: ' ' },
      { text: 'f', code: true },
    ])
    expect(parseInline('***x***')).toEqual([{ text: 'x', bold: true, italic: true }])
    expect(parseInline('**a*b***')).toEqual([{ text: 'a', bold: true }, { text: 'b', bold: true, italic: true }])
    expect(parseInline('see [the **site**](https://a.b) or [[Note|it]]')).toEqual([
      { text: 'see ' },
      { text: 'the ', link: 'https://a.b' },
      { text: 'site', bold: true, link: 'https://a.b' },
      { text: ' or ' },
      { text: 'it', link: '[[Note]]' },
    ])
  })

  it('leaves what is not Markdown alone', () => {
    expect(parseInline('2 * 3 * 4')).toEqual([{ text: '2 * 3 * 4' }])
    expect(parseInline('snake_case_name')).toEqual([{ text: 'snake_case_name' }])
    expect(parseInline('a ~ b = c')).toEqual([{ text: 'a ~ b = c' }])
    expect(parseInline('\\*not\\*')).toEqual([{ text: '*not*' }])
  })

  it('reads emphasis next to Korean particles and punctuation', () => {
    expect(parseInline('**(참고)**를 보세요')).toEqual([{ text: '(참고)', bold: true }, { text: '를 보세요' }])
  })

  it('writes runs that read back the same', () => {
    const cases: Run[][] = [
      [{ text: 'a', bold: true }, { text: 'b', bold: true, italic: true }],
      [{ text: 'a', italic: true }, { text: 'b', bold: true }],
      [{ text: 'a', italic: true }, { text: 'b', bold: true, italic: true }, { text: 'c' }],
      [{ text: '2*3 [x] `y` ~~z~~ ==w== _v_' }],
      [{ text: 'code `tick`', code: true }, { text: ' and ' }, { text: 'struck words', strike: true }],
      [{ text: 'bold ', bold: true }, { text: 'link', bold: true, link: 'https://x.y/a_b' }, { text: ' end' }],
      [{ text: 'note', link: '[[Some Note]]', italic: true }],
      [{ text: '한국어', bold: true }, { text: '와 ' }, { text: '(괄호)', highlight: true }, { text: '를' }],
    ]
    for (const runs of cases) expect(parseInline(serializeInline(runs))).toEqual(mergeRuns(runs))
  })

  it('round-trips random mixes of marks', () => {
    let seed = 7
    const rand = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n)
    const words = ['a', 'bc', '가나', '1.', 'x*y', '(z)', '다']
    for (let t = 0; t < 400; t++) {
      const runs: Run[] = []
      for (let k = 0, n = 1 + rand(5); k < n; k++) {
        const r: Run = { text: words[rand(words.length)] + (rand(3) === 0 ? ' ' : '') }
        if (rand(2)) r.bold = true
        if (rand(2)) r.italic = true
        if (rand(4) === 0) r.strike = true
        if (rand(5) === 0) r.highlight = true
        runs.push(r)
      }
      const md = serializeInline(runs)
      const back = parseInline(md)
      // Spaces at a mark's edge may lose the mark; letters never do.
      const letters = (rs: Run[]) => rs.flatMap((r) => [...r.text].filter((c) => c.trim()).map((c) => `${c}${r.bold ? 'B' : ''}${r.italic ? 'I' : ''}${r.strike ? 'S' : ''}${r.highlight ? 'H' : ''}`))
      expect(letters(back), md).toEqual(letters(runs))
    }
  })
})

describe('lines', () => {
  it('finds block markers', () => {
    expect(lineStart('## Title')).toMatchObject({ kind: 'heading', level: 2, rest: 'Title' })
    expect(lineStart('  - [x] done')).toMatchObject({ kind: 'task', level: 1, checked: true, rest: 'done', prefix: '  - [x] ' })
    expect(lineStart('> 1) item')).toMatchObject({ kind: 'number', quote: 1, marker: '1)', rest: 'item' })
    expect(lineStart('#tag')).toMatchObject({ kind: 'none', rest: '#tag' })
  })

  it('turns marks on and off for the whole text', () => {
    const text = '- one **two**\n```\n*code*\n```'
    expect(hasMarkAll(text, 'bold')).toBe(false)
    const bold = setMarkAll(text, 'bold', true)
    expect(bold).toBe('- **one two**\n```\n*code*\n```')
    expect(hasMarkAll(bold, 'bold')).toBe(true)
    expect(setMarkAll(bold, 'bold', false)).toBe('- one two\n```\n*code*\n```')
    expect(plainText('**a** [b](https://c.d)')).toBe('a b')
  })
})
