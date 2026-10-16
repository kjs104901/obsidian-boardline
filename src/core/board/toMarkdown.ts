// The board, or a part of it, as a Markdown note: sections become headings; stickies, shapes
// and text become list items and paragraphs in reading order; mind maps nested lists; tables
// Markdown tables; note cards and pictures links and embeds; and connectors a closing list of
// what leads to what.

import { lineStart, plainText } from '../engine/richText'
import { parseLink } from './links'
import { endpointObjectId, isConnector, isMindmap, isRichKind, isShape, type BoardObject, type ConnectorObject, type MindmapNode, type ShapeObject } from './model'
import { t } from '../i18n'

interface Block {
  text: string
  /** List items run together; anything else stands apart with blank lines. */
  list: boolean
}

const firstLine = (s: string) => s.split('\n').find((l) => l.trim())?.trim() ?? ''

/** Reading order: rows from the top (things starting within 40px of each other share one), left to right. */
function readingOrder<T extends { x: number; y: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => Math.round(a.y / 40) - Math.round(b.y / 40) || a.x - b.x)
}

function containsPoint(s: ShapeObject, x: number, y: number): boolean {
  return x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h
}

/** A list item from Markdown text: its first line after "- ", the others indented under it. */
function listItem(text: string, indent = ''): string {
  const lines = text.split('\n')
  return lines.map((l, i) => (i === 0 ? `${indent}- ${l}` : l.trim() ? `${indent}  ${l}` : '')).join('\n')
}

/** A table as a Markdown table (its first row the header, column alignment in the rule). */
export function markdownTable(o: ShapeObject): string {
  const cells = o.cells ?? []
  if (cells.length === 0) return ''
  const cols = Math.max(...cells.map((r) => r.length))
  const row = (r: string[]) => `| ${Array.from({ length: cols }, (_, i) => (r[i] ?? '').replace(/\n/g, '<br>').replace(/\|/g, '\\|')).join(' | ')} |`
  // Column alignment in the rule: --- left, :---: center, ---: right.
  const rule = Array.from({ length: cols }, (_, i) => (o.colAligns?.[i] === 'center' ? ':---:' : o.colAligns?.[i] === 'right' ? '---:' : '---'))
  return [row(cells[0]), `| ${rule.join(' | ')} |`, ...cells.slice(1).map(row)].join('\n')
}

/** A shape as a block of the note (null for what has nothing to say). */
function shapeBlock(o: ShapeObject): Block | null {
  switch (o.shape) {
    case 'freehand':
    case 'section':
      return null
    case 'text':
      return o.text.trim() ? { text: o.text.trim(), list: false } : null
    case 'table': {
      const t = markdownTable(o)
      return t ? { text: t, list: false } : null
    }
    case 'image':
      return o.src ? { text: `![[${o.src}]]`, list: false } : null
    case 'link':
      return o.link ? { text: `- [${(o.text || o.link).replace(/[[\]]/g, '')}](${o.link})`, list: true } : null
    case 'note': {
      const target = parseLink(o.link ?? '')
      if (target?.kind === 'doc') return { text: `- [[${target.path.replace(/\.md$/i, '')}]]`, list: true }
      return o.link ? { text: `- ${o.link}`, list: true } : null
    }
    default: {
      const text = o.text.trim()
      if (!text) return null
      const web = o.link && parseLink(o.link)?.kind === 'web' ? t('md.linkSuffix', o.link) : ''
      // Text that is already a list (or a heading) stays as it is written.
      const start = lineStart(text.split('\n')[0]).kind
      if (start === 'heading') return { text: text + web, list: false }
      if (start !== 'none') return { text: text + web, list: true }
      return { text: listItem(text + web), list: true }
    }
  }
}

function mindmapBlock(root: MindmapNode, nodes: MindmapNode[]): Block {
  const children = (id: string) => nodes.filter((n) => n.parentId === id).sort((a, b) => a.order - b.order)
  const lines: string[] = []
  const walk = (n: MindmapNode, depth: number) => {
    lines.push(`${'  '.repeat(depth)}- ${n.text.replace(/\n+/g, ' ').trim() || '…'}`)
    for (const c of children(n.id)) walk(c, depth + 1)
  }
  walk(root, 0)
  return { text: lines.join('\n'), list: true }
}

function joinBlocks(blocks: Block[]): string {
  let out = ''
  blocks.forEach((b, i) => {
    if (i > 0) out += blocks[i - 1].list && b.list ? '\n' : '\n\n'
    out += b.text
  })
  return out
}

/** `objects` (in any order) as the body of a Markdown note. */
export function boardToMarkdown(objects: BoardObject[]): string {
  const shapes = objects.filter(isShape)
  const sections = shapes.filter((s) => s.shape === 'section')
  const nodes = objects.filter(isMindmap)
  const roots = nodes.filter((n) => !n.parentId)
  // Each thing belongs to the smallest section around its middle (a section to the smallest around it).
  const homeOf = (x: number, y: number, self?: ShapeObject): string | null => {
    const around = sections.filter((s) => s !== self && containsPoint(s, x, y) && (!self || s.w * s.h > self.w * self.h))
    around.sort((a, b) => a.w * a.h - b.w * b.h)
    return around[0]?.id ?? null
  }
  type Entry = { x: number; y: number; home: string | null; section?: ShapeObject; block?: Block }
  const entries: Entry[] = []
  for (const s of shapes) {
    if (s.shape === 'section') entries.push({ x: s.x, y: s.y, home: homeOf(s.x + s.w / 2, s.y + s.h / 2, s), section: s })
    else {
      const block = shapeBlock(s)
      if (block) entries.push({ x: s.x, y: s.y, home: homeOf(s.x + s.w / 2, s.y + s.h / 2), block })
    }
  }
  for (const r of roots) entries.push({ x: r.x, y: r.y, home: homeOf(r.x, r.y), block: mindmapBlock(r, nodes) })

  const render = (home: string | null, level: number): Block[] =>
    readingOrder(entries.filter((e) => e.home === home)).flatMap((e) => {
      if (!e.section) return [e.block!]
      const title = firstLine(e.section.text) || t('kind.section')
      return [{ text: `${'#'.repeat(Math.min(6, level))} ${title}`, list: false }, ...render(e.section.id, level + 1)]
    })
  const blocks = render(null, 2)

  // What leads to what.
  const named = new Map<string, string>()
  for (const s of shapes) named.set(s.id, firstLine(isRichKind(s.shape) ? plainText(s.text) : s.text) || firstLine(s.link ?? '') || t('md.emptyShape'))
  for (const n of nodes) named.set(n.id, firstLine(n.text) || '…')
  const lines = objects.filter(isConnector).flatMap((c: ConnectorObject) => {
    const from = endpointObjectId(c.from)
    const to = endpointObjectId(c.to)
    if (!from || !to || !named.has(from) || !named.has(to)) return []
    const both = c.startCap !== 'none' && c.endCap !== 'none'
    const back = c.startCap !== 'none' && c.endCap === 'none'
    const [a, b] = back ? [to, from] : [from, to]
    const arrow = both ? '↔' : c.startCap === 'none' && c.endCap === 'none' ? '—' : '→'
    return [`- ${named.get(a)} ${arrow} ${named.get(b)}${c.label.trim() ? `: ${firstLine(c.label)}` : ''}`]
  })
  if (lines.length) blocks.push({ text: t('md.connections'), list: false }, { text: lines.join('\n'), list: true })
  return joinBlocks(blocks).trim() + '\n'
}
