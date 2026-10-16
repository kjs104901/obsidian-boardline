// "Copy as Mermaid": flowchart shapes and the connectors
// between them as a Mermaid flowchart.

import { endpointObjectId, isConnector, isShape, type BoardObject, type ShapeKind } from '../board/model'
import { plainText } from './richText'

/** Mermaid node syntax per shape kind: [open, close]. */
const NODE: Partial<Record<ShapeKind, [string, string]>> = {
  rect: ['[', ']'],
  pill: ['([', '])'],
  ellipse: ['((', '))'],
  diamond: ['{', '}'],
  parallelogram: ['[/', '/]'],
  'parallelogram-flip': ['[\\', '\\]'],
  trapezoid: ['[/', '\\]'],
  hexagon: ['{{', '}}'],
  cylinder: ['[(', ')]'],
  subroutine: ['[[', ']]'],
  sticky: ['[', ']'],
  text: ['[', ']'],
}

/** Shapes only Mermaid 11's `@{ shape: … }` syntax has. */
const NAMED: Partial<Record<ShapeKind, string>> = {
  document: 'doc',
  documents: 'docs',
  'manual-input': 'sl-rect',
  delay: 'delay',
  display: 'display',
}

/** Text inside a Mermaid label: quoted, with quotes and line breaks escaped. */
function label(text: string): string {
  return `"${text.replace(/"/g, '#quot;').replace(/\n/g, '<br/>')}"`
}

/**
 * Mermaid source for the shapes in `objects` (top-down) and the connectors whose ends are
 * both among them. Shapes are named n1, n2, … in reading order.
 */
export function toMermaid(objects: BoardObject[]): string {
  const shapes = objects.filter(isShape).filter((s) => s.shape !== 'section')
  shapes.sort((a, b) => Math.round(a.y / 24) - Math.round(b.y / 24) || a.x - b.x)
  const names = new Map(shapes.map((s, i) => [s.id, `n${i + 1}`]))
  const lines = ['flowchart TD']
  for (const s of shapes) {
    const text = label(plainText(s.text) || ' ')
    const named = NAMED[s.shape]
    if (named) {
      lines.push(`  ${names.get(s.id)}@{ shape: ${named}, label: ${text} }`)
      continue
    }
    const [open, close] = NODE[s.shape] ?? ['[', ']']
    lines.push(`  ${names.get(s.id)}${open}${text}${close}`)
  }
  for (const c of objects.filter(isConnector)) {
    const a = names.get(endpointObjectId(c.from) ?? '')
    const b = names.get(endpointObjectId(c.to) ?? '')
    if (!a || !b) continue
    const arrow = c.endCap === 'arrow' || c.startCap === 'arrow'
    const [x, y] = c.endCap === 'none' && c.startCap === 'arrow' ? [b, a] : [a, b]
    const link = c.line === 'dashed' ? (arrow ? '-.->' : '-.-') : arrow ? '-->' : '---'
    lines.push(`  ${x} ${link}${c.label ? `|${label(plainText(c.label))}|` : ''} ${y}`)
  }
  return lines.join('\n') + '\n'
}
