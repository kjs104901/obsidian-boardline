// Text search and replace inside a board.

import { plainInline, plainText } from '../engine/richText'
import { isConnector, isRichKind, type BoardObject } from './model'

/** Case-insensitive, Unicode-normalized form used for matching. */
export function normalize(s: string): string {
  return s.normalize('NFC').toLocaleLowerCase()
}

/** Searchable text of an object: shape and node text, connector labels. */
export function objectText(o: BoardObject): string {
  // Labels, nodes and cells have marks only (no line markers): each line loses its marks.
  const words = (s: string) => s.split('\n').map(plainInline).join('\n')
  if (isConnector(o)) return words(o.label)
  if (o.type === 'mindmap') return words(o.text)
  if (o.type === 'shape' && o.cells) return o.cells.flat().filter(Boolean).map(words).join('\n')
  if (o.type === 'shape' && o.shape === 'link') return [o.text, o.preview?.description, o.link].filter(Boolean).join('\n')
  if (o.type === 'shape' && o.shape === 'note') return o.link ?? ''
  // Markdown text is searched (and copied) as it reads, without its marks.
  return isRichKind(o.shape) ? plainText(o.text) : o.text
}

/** `text` with every occurrence of `query` (ignoring case) replaced, and how many there were. */
export function replaceAll(text: string, query: string, replacement: string): { text: string; count: number } {
  const q = query.trim().normalize('NFC')
  if (!q) return { text, count: 0 }
  let count = 0
  const pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu')
  const next = text.normalize('NFC').replace(pattern, () => {
    count++
    return replacement
  })
  return { text: count ? next : text, count }
}

/**
 * The object with `query` replaced in its text (shape and node text, labels, table cells), and
 * how many were replaced. Matches that run across Markdown marks aren't found.
 */
export function replaceInObject(o: BoardObject, query: string, replacement: string): { object: BoardObject; count: number } {
  if (isConnector(o)) {
    const r = replaceAll(o.label, query, replacement)
    return { object: r.count ? { ...o, label: r.text } : o, count: r.count }
  }
  if (o.type === 'shape' && o.cells) {
    let count = 0
    const cells = o.cells.map((row) =>
      row.map((cell) => {
        const r = replaceAll(cell, query, replacement)
        count += r.count
        return r.text
      }),
    )
    return { object: count ? { ...o, cells } : o, count }
  }
  if (o.type === 'shape' && o.shape === 'note') return { object: o, count: 0 }
  const r = replaceAll(o.text, query, replacement)
  return { object: r.count ? { ...o, text: r.text } : o, count: r.count }
}

export function matches(text: string, query: string): boolean {
  const q = normalize(query.trim())
  return q.length > 0 && normalize(text).includes(q)
}
