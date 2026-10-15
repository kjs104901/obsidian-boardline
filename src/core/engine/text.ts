// Text basics shared by every layout module (no dependencies on other engine modules).

export const DEFAULT_FONT_FAMILY = '"Segoe UI", "Malgun Gothic", system-ui, sans-serif'

/** Font family of all board text (a setting; importers see changes through the live binding). */
export let FONT_FAMILY = DEFAULT_FONT_FAMILY

export function setFontFamily(family: string): void {
  FONT_FAMILY = family
}

export type Measure = (s: string) => number

/**
 * Greedy word wrap. Explicit newlines start new lines; words longer than the width are
 * broken per character (needed for long Korean runs without spaces).
 */
export function wrapText(text: string, maxWidth: number, measure: Measure): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    const pushLine = () => {
      lines.push(line.trimEnd())
      line = ''
    }
    for (const token of paragraph.match(/\S+|\s+/g) ?? []) {
      if (/^\s+$/.test(token)) {
        if (line.length > 0) line += token
        continue
      }
      if (measure(line + token) <= maxWidth) {
        line += token
        continue
      }
      if (line.trim().length > 0) pushLine()
      line = ''
      if (measure(token) <= maxWidth) {
        line = token
        continue
      }
      for (const ch of token) {
        if (line.length > 0 && measure(line + ch) > maxWidth) pushLine()
        line += ch
      }
    }
    lines.push(line.trimEnd())
  }
  return lines
}

/**
 * Measurer for text at a given font size, optionally styled: `style` is a prefix of
 * 'italic ', '600 ' (bold) and 'mono ' (code) in any mix.
 */
export type MeasureAt = (fontSize: number, style?: string) => Measure

/** Code in board text and notes. */
export const MONO_FAMILY = '"Cascadia Mono", Consolas, "SF Mono", Menlo, monospace'

/** The CSS font for a size and a style prefix (see MeasureAt). */
export function fontCss(size: number, style = ''): string {
  const mono = style.includes('mono ')
  return `${style.replace('mono ', '')}${size}px ${mono ? MONO_FAMILY : FONT_FAMILY}`
}

/** Bullet and numbered list items: `- `, `* `, `• `, `1. ` or `1) ` after optional indentation. */
const LIST_ITEM = /^(\s*)([-*•]|\d{1,3}[.)])[ \t]+/
/** Any list marker, a task's box included. */
const ANY_MARKER = /^(\s*)(?:[-*+•][ \t]+(?:\[[ xX]\][ \t]+)?|\d{1,3}[.)][ \t]+)/

export type ListKind = 'bullet' | 'number' | 'task'

const MARKERS: Record<ListKind, RegExp> = {
  bullet: /^(\s*)[-*•][ \t]+(?!\[[ xX]\][ \t])/,
  number: /^(\s*)\d{1,3}[.)][ \t]+/,
  task: /^(\s*)[-*+][ \t]+\[[ xX]\][ \t]+/,
}

/**
 * `text` with every line made a bullet, numbered or task item, or with those markers taken off
 * when all its lines already are such items. Empty text starts a list.
 */
export function toggleListText(text: string, kind: ListKind): string {
  const marker = MARKERS[kind]
  const first = kind === 'bullet' ? '- ' : kind === 'number' ? '1. ' : '- [ ] '
  const lines = text.split('\n')
  const filled = lines.filter((l) => l.trim())
  if (filled.length === 0) return text + first
  if (filled.every((l) => marker.test(l))) return lines.map((l) => l.replace(marker, '$1')).join('\n')
  let n = 0
  return lines
    .map((l) => {
      if (!l.trim()) return l
      const bare = l.replace(ANY_MARKER, '$1')
      const indent = /^\s*/.exec(bare)![0]
      return indent + (kind === 'number' ? `${++n}. ` : first) + bare.slice(indent.length)
    })
    .join('\n')
}

/** `text` with the task on line `line` ("- [ ] …") checked, or unchecked when it was. */
export function toggleTaskLine(text: string, line: number): string {
  const lines = text.split('\n')
  const l = lines[line]
  if (l === undefined) return text
  lines[line] = l.replace(/^((?:\s*>[ \t]?)*[ \t]*[-*+][ \t]+\[)([ xX])\]/, (_m, head: string, mark: string) => `${head}${mark === ' ' ? 'x' : ' '}]`)
  return lines.join('\n')
}

/**
 * Enter at the end of a list item: the marker for the next item (the next number), or
 * `end` when the item is still empty, which ends the list instead. Null outside lists.
 */
export function nextListItem(lineBeforeCaret: string): { marker: string; end: boolean } | null {
  const m = LIST_ITEM.exec(lineBeforeCaret)
  if (!m) return null
  // A task goes on with an empty box.
  const task = /^\[[ xX]\][ \t]+/.exec(lineBeforeCaret.slice(m[0].length))
  const rest = lineBeforeCaret.slice(m[0].length + (task ? task[0].length : 0))
  if (!rest.trim()) return { marker: '', end: true }
  const number = /^(\d+)([.)])$/.exec(m[2])
  return { marker: m[1] + (number ? `${Number(number[1]) + 1}${number[2]}` : m[2]) + ' ' + (task ? '[ ] ' : ''), end: false }
}

