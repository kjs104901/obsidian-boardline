// Board text (Markdown) laid out for drawing: lines become blocks (headings, lists, tasks,
// quotes, code, rules), words wrap across styled runs, and the result is spans of text and a
// few decorations (quote bars, rules, code backgrounds, task boxes) at board positions. The
// canvas and the SVG export draw the same layout.

import type { TextAlign } from '../board/model'
import { codeLines, lineStart, parseInline, type Marks, type Run } from './richText'
import { FONT_FAMILY, fontCss, type Measure, type MeasureAt } from './text'

export interface Block {
  kind: 'para' | 'heading' | 'bullet' | 'number' | 'task' | 'code' | 'rule' | 'blank'
  runs: Run[]
  /** Heading level, or list nesting depth. */
  level: number
  /** Quote nesting depth. */
  quote: number
  marker?: string
  checked?: boolean
  /** The line of the text it comes from. */
  line: number
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** The blocks of Markdown text; `note` skips a note's front matter (properties). */
export function parseBlocks(text: string, note = false): Block[] {
  let lines = codeLines(text)
  if (note && lines[0]?.line.trim() === '---') {
    const end = lines.findIndex((l, i) => i > 0 && l.line.trim() === '---')
    if (end > 0) lines = lines.slice(end + 1)
  }
  const blocks: Block[] = []
  const skipped = text.split('\n').length - lines.length
  lines.forEach(({ line, code, fence }, i) => {
    const source = i + skipped
    if (fence) return
    if (code) {
      blocks.push({ kind: 'code', runs: line ? [{ text: line, code: true }] : [], level: 0, quote: 0, line: source })
      return
    }
    const s = lineStart(line)
    const at = { level: s.level, quote: s.quote, line: source }
    if (s.kind === 'none') {
      if (!s.rest.trim()) {
        blocks.push({ kind: 'blank', runs: [], ...at })
        return
      }
      if (/^ {0,3}([-*_])([ \t]*\1){2,}[ \t]*$/.test(s.rest)) {
        blocks.push({ kind: 'rule', runs: [], ...at })
        return
      }
      // Callout titles: "> [!note] Title".
      const callout = s.quote > 0 ? /^\[!([\w-]+)\][+-]?[ \t]*(.*)$/.exec(s.rest) : null
      if (callout) {
        blocks.push({ kind: 'para', runs: [{ text: callout[2] || capitalize(callout[1]), bold: true }], ...at })
        return
      }
      // Table rows: the cells apart, the |---| row left out.
      if (/^\s*\|.*\|\s*$/.test(s.rest)) {
        if (/^\s*\|[\s:|-]+\|\s*$/.test(s.rest)) return
        const cells = s.rest.trim().slice(1, -1).split('|')
        blocks.push({ kind: 'para', runs: cells.flatMap((c, k) => [...(k ? [{ text: '   ·   ' }] : []), ...parseInline(c.trim())]), ...at })
        return
      }
    }
    blocks.push({ kind: s.kind === 'none' ? 'para' : s.kind, runs: parseInline(s.rest), marker: s.marker, checked: s.checked, ...at })
  })
  return blocks
}

// ---- layout -----------------------------------------------------------------------------

export interface RichBase {
  size: number
  line: number
  align: TextAlign
  /** Notes: blank lines are paragraph gaps (half a line) and headings get room above. */
  note?: boolean
  /** Only words with marks: line markers (#, -, >) stay as typed (mind map nodes, table cells, line labels). */
  inline?: boolean
  /** All of it bold (a table's header row). */
  bold?: boolean
}

/** A piece of text in one style on one line; `y` is the middle of its line. */
export interface RichSpan extends Marks {
  x: number
  y: number
  w: number
  text: string
  size: number
  /** fontCss style prefix ('italic ', '600 ', 'mono '). */
  style: string
  /** Done tasks are drawn faint. */
  faint?: boolean
}

export type RichDeco =
  | { kind: 'bar'; x: number; y: number; h: number }
  | { kind: 'rule'; x: number; y: number; w: number }
  | { kind: 'code'; x: number; y: number; w: number; h: number }
  | { kind: 'box'; x: number; y: number; size: number; checked: boolean; line: number }

export interface RichLayout {
  spans: RichSpan[]
  decos: RichDeco[]
  height: number
  /** How far the widest line reaches from the left. */
  width: number
}

/** Heading sizes against the text size (h1..h6). */
const HEADING_SCALE = [1.6, 1.4, 1.25, 1.12, 1, 0.9]
const even = (v: number) => Math.round(v / 2) * 2

interface Piece {
  run: Run
  text: string
  w: number
  space: boolean
}

/** Words of styled runs wrapped at `avail`; a word wider than a line breaks between letters. */
function wrapRuns(runs: Run[], avail: number, measureOf: (r: Run) => Measure): Piece[][] {
  const lines: Piece[][] = [[]]
  let used = 0
  const current = () => lines[lines.length - 1]
  const trim = () => {
    const cur = current()
    while (cur.length && cur[cur.length - 1].space) cur.pop()
  }
  const newLine = () => {
    trim()
    lines.push([])
    used = 0
  }
  const put = (p: Piece) => {
    current().push(p)
    used += p.w
  }
  for (const run of runs) {
    const measure = measureOf(run)
    for (const part of run.text.split(/(\s+)/)) {
      if (!part) continue
      const w = measure(part)
      if (/^\s+$/.test(part)) {
        // Spaces at a wrap point go; at the very start (indentation) they stay.
        if (current().length > 0 || lines.length === 1) put({ run, text: part, w, space: true })
        continue
      }
      if (used + w <= avail + 0.01) {
        put({ run, text: part, w, space: false })
        continue
      }
      if (current().some((p) => !p.space)) newLine()
      if (w <= avail) {
        put({ run, text: part, w, space: false })
        continue
      }
      let chunk = ''
      for (const ch of part) {
        if (chunk && used + measure(chunk + ch) > avail) {
          put({ run, text: chunk, w: measure(chunk), space: false })
          newLine()
          chunk = ''
        }
        chunk += ch
      }
      if (chunk) put({ run, text: chunk, w: measure(chunk), space: false })
    }
  }
  trim()
  return lines
}

const marksOf = ({ bold, italic, strike, highlight, code, link }: Run): Marks => ({
  ...(bold ? { bold } : {}),
  ...(italic ? { italic } : {}),
  ...(strike ? { strike } : {}),
  ...(highlight ? { highlight } : {}),
  ...(code ? { code } : {}),
  ...(link ? { link } : {}),
})

/**
 * Lay out blocks wrapped at `wrapWidth`; lines are aligned within `alignWidth` (free text
 * wraps at its maximum width but aligns within the width it ends up with).
 */
export function layoutRich(blocks: Block[], wrapWidth: number, base: RichBase, measureAt: MeasureAt, alignWidth = wrapWidth): RichLayout {
  const spans: RichSpan[] = []
  const decos: RichDeco[] = []
  let y = 0
  let width = 0
  const quoteW = Math.round(base.size * 0.9)
  const bars = (quote: number, top: number, h: number) => {
    for (let q = 0; q < quote; q++) decos.push({ kind: 'bar', x: q * quoteW + 1, y: top, h })
  }
  blocks.forEach((b, bi) => {
    const heading = b.kind === 'heading'
    const size = heading ? even(base.size * HEADING_SCALE[b.level - 1]) : b.kind === 'code' ? Math.round(base.size * 0.88) : base.size
    const line = heading ? Math.max(base.line, even(size * 1.3)) : base.line
    const left = b.quote * quoteW
    if (heading && base.note && bi > 0) y += Math.round(base.line * 0.5)
    if (b.kind === 'blank') {
      const h = base.note ? Math.round(base.line / 2) : base.line
      bars(b.quote, y, h)
      y += h
      return
    }
    if (b.kind === 'rule') {
      decos.push({ kind: 'rule', x: left, y: y + line / 2, w: Math.max(0, alignWidth - left) })
      bars(b.quote, y, line)
      y += line
      return
    }
    const list = b.kind === 'bullet' || b.kind === 'number' || b.kind === 'task'
    const indent = left + (list ? b.level * Math.round(base.size * 1.25) : 0)
    const markerText = b.kind === 'bullet' ? '•' : b.kind === 'number' ? b.marker : undefined
    const plainMeasure = measureAt(size)
    const markerW = !list ? 0 : Math.max(Math.round(size * 1.25), markerText && b.kind === 'number' ? Math.ceil(plainMeasure(markerText + ' ')) : 0)
    const contentX = indent + markerW
    const done = b.kind === 'task' && !!b.checked
    const styleOf = (r: Run) => (r.code ? 'mono ' : '') + (r.italic ? 'italic ' : '') + (r.bold || heading || base.bold ? '600 ' : '')
    const sizeOf = (r: Run) => (r.code && b.kind !== 'code' ? Math.round(size * 0.88) : size)
    const lines = wrapRuns(b.runs, Math.max(1, wrapWidth - contentX), (r) => measureAt(sizeOf(r), styleOf(r)))
    lines.forEach((pieces, li) => {
      const used = pieces.reduce((sum, p) => sum + p.w, 0)
      const room = alignWidth - contentX
      const shift = Math.max(0, base.align === 'center' ? (room - used) / 2 : base.align === 'right' ? room - used : 0)
      const mid = y + line / 2
      if (li === 0 && list) {
        const mx = contentX + shift - markerW
        if (b.kind === 'task') {
          const box = Math.round(size * 0.8)
          decos.push({ kind: 'box', x: mx, y: mid - box / 2, size: box, checked: done, line: b.line })
        } else if (markerText) spans.push({ x: mx, y: mid, w: plainMeasure(markerText), text: markerText, size, style: '' })
      }
      if (b.kind === 'code') decos.push({ kind: 'code', x: left, y, w: Math.max(0, alignWidth - left), h: line })
      bars(b.quote, y, line)
      let x = contentX + shift
      for (let i = 0; i < pieces.length; ) {
        const run = pieces[i].run
        let text = ''
        let w = 0
        for (; i < pieces.length && pieces[i].run === run; i++) {
          text += pieces[i].text
          w += pieces[i].w
        }
        spans.push({ ...marksOf(run), ...(done ? { strike: true, faint: true } : {}), x, y: mid, w, text, size: sizeOf(run), style: styleOf(run) })
        x += w
      }
      width = Math.max(width, x)
      y += line
    })
  })
  return { spans, decos, height: y, width }
}

/** Text as lines of marked words only: no headings, lists, quotes or code blocks. */
export function inlineBlocks(text: string): Block[] {
  return text.split('\n').map((line, i): Block => (line ? { kind: 'para', runs: parseInline(line), level: 0, quote: 0, line: i } : { kind: 'blank', runs: [], level: 0, quote: 0, line: i }))
}

const EMPTY: RichLayout = { spans: [], decos: [], height: 0, width: 0 }

/** Laid-out text by text, width and style (layouts are asked for on every frame). */
const layouts = new WeakMap<MeasureAt, Map<string, RichLayout>>()

/** Markdown text laid out at `wrap` wide, aligned within `alignWidth` (cached). */
export function layoutText(text: string, wrap: number, base: RichBase, measureAt: MeasureAt, alignWidth = wrap): RichLayout {
  if (!text) return EMPTY
  let cache = layouts.get(measureAt)
  if (!cache) layouts.set(measureAt, (cache = new Map()))
  const key = `${wrap}|${alignWidth}|${base.size}|${base.line}|${base.align}|${base.note ? 1 : 0}${base.inline ? 1 : 0}${base.bold ? 1 : 0}|${FONT_FAMILY}|${text}`
  let l = cache.get(key)
  if (!l) {
    if (cache.size > 8000) {
      // The oldest half goes (a Map keeps insertion order).
      let drop = cache.size / 2
      for (const k of cache.keys()) {
        if (drop-- <= 0) break
        cache.delete(k)
      }
    }
    l = layoutRich(base.inline ? inlineBlocks(text) : parseBlocks(text, base.note), wrap, base, measureAt, alignWidth)
    cache.set(key, l)
  }
  return l
}

/**
 * Inline text that wraps at `wrap` and centers its lines on each other (line labels): laid
 * out once to find its width, then centered within it.
 */
export function centeredText(text: string, wrap: number, base: Omit<RichBase, 'align'>, measureAt: MeasureAt): RichLayout {
  const natural = Math.ceil(layoutText(text, wrap, { ...base, align: 'left' }, measureAt).width)
  return layoutText(text, wrap, { ...base, align: 'center' }, measureAt, natural)
}

/** Lines of plain text (titles, labels) as a layout, aligned within `alignWidth`. */
export function plainLayout(lines: string[], base: RichBase, alignWidth: number, measureAt: MeasureAt, style = ''): RichLayout {
  const measure = measureAt(base.size, style)
  let width = 0
  const spans = lines.map((text, i): RichSpan => {
    const w = measure(text)
    const x = base.align === 'center' ? (alignWidth - w) / 2 : base.align === 'right' ? alignWidth - w : 0
    width = Math.max(width, x + w)
    return { x, y: i * base.line + base.line / 2, w, text, size: base.size, style, ...(style.includes('600') ? { bold: true } : {}) }
  })
  return { spans, decos: [], height: lines.length * base.line, width }
}

// ---- drawing ----------------------------------------------------------------------------

/** Tints that read on light and dark boards alike. */
export const HIGHLIGHT_FILL = 'rgba(255, 208, 0, 0.42)'
export const CODE_FILL = 'rgba(135, 135, 135, 0.16)'

/** Draw a layout with its top-left at (ox, oy). */
export function drawRich(ctx: CanvasRenderingContext2D, l: RichLayout, ox: number, oy: number, ink: string): void {
  ctx.save()
  for (const d of l.decos) {
    if (d.kind === 'code') {
      ctx.fillStyle = CODE_FILL
      ctx.fillRect(ox + d.x, oy + d.y, d.w, d.h)
    } else if (d.kind === 'bar') {
      ctx.globalAlpha = 0.35
      ctx.fillStyle = ink
      ctx.fillRect(ox + d.x, oy + d.y, 3, d.h)
      ctx.globalAlpha = 1
    } else if (d.kind === 'rule') {
      ctx.globalAlpha = 0.3
      ctx.fillStyle = ink
      ctx.fillRect(ox + d.x, oy + d.y - 0.5, d.w, 1)
      ctx.globalAlpha = 1
    } else {
      ctx.strokeStyle = ink
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.roundRect(ox + d.x + 0.7, oy + d.y + 0.7, d.size - 1.4, d.size - 1.4, 3)
      ctx.stroke()
      if (d.checked) {
        const s = d.size
        ctx.beginPath()
        ctx.moveTo(ox + d.x + s * 0.25, oy + d.y + s * 0.52)
        ctx.lineTo(ox + d.x + s * 0.43, oy + d.y + s * 0.7)
        ctx.lineTo(ox + d.x + s * 0.76, oy + d.y + s * 0.32)
        ctx.lineCap = 'round'
        ctx.stroke()
      }
    }
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  for (const s of l.spans) {
    const x = ox + s.x
    const y = oy + s.y
    if (s.highlight) {
      ctx.fillStyle = HIGHLIGHT_FILL
      ctx.fillRect(x - 1, y - s.size * 0.7, s.w + 2, s.size * 1.4)
    }
    if (s.code) {
      ctx.fillStyle = CODE_FILL
      ctx.beginPath()
      ctx.roundRect(x - 2, y - s.size * 0.7, s.w + 4, s.size * 1.4, 3)
      ctx.fill()
    }
    ctx.globalAlpha = s.faint ? 0.55 : 1
    ctx.fillStyle = ink
    ctx.font = fontCss(s.size, s.style)
    ctx.fillText(s.text, x, y)
    const thick = Math.max(1, s.size / 15)
    if (s.strike) ctx.fillRect(x, y - thick / 2, s.w, thick)
    if (s.link) ctx.fillRect(x, y + s.size * 0.55, s.w, thick)
    ctx.globalAlpha = 1
  }
  ctx.restore()
}

/** The same drawing as SVG elements; `paint` writes a fill/stroke attribute for a color. */
export function richSvg(l: RichLayout, ox: number, oy: number, ink: string, paint: (attr: 'fill' | 'stroke', css: string) => string): string {
  const num = (v: number) => String(Math.round(v * 100) / 100)
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const out: string[] = []
  for (const d of l.decos) {
    if (d.kind === 'code') out.push(`<rect x="${num(ox + d.x)}" y="${num(oy + d.y)}" width="${num(d.w)}" height="${num(d.h)}" ${paint('fill', CODE_FILL)}/>`)
    else if (d.kind === 'bar') out.push(`<rect x="${num(ox + d.x)}" y="${num(oy + d.y)}" width="3" height="${num(d.h)}" ${paint('fill', ink)} fill-opacity="0.35"/>`)
    else if (d.kind === 'rule') out.push(`<rect x="${num(ox + d.x)}" y="${num(oy + d.y - 0.5)}" width="${num(d.w)}" height="1" ${paint('fill', ink)} fill-opacity="0.3"/>`)
    else {
      const s = d.size
      out.push(`<rect x="${num(ox + d.x + 0.7)}" y="${num(oy + d.y + 0.7)}" width="${num(s - 1.4)}" height="${num(s - 1.4)}" rx="3" fill="none" ${paint('stroke', ink)} stroke-width="1.4"/>`)
      if (d.checked) {
        const p = (fx: number, fy: number) => `${num(ox + d.x + s * fx)} ${num(oy + d.y + s * fy)}`
        out.push(`<path d="M${p(0.25, 0.52)}L${p(0.43, 0.7)}L${p(0.76, 0.32)}" fill="none" ${paint('stroke', ink)} stroke-width="1.4" stroke-linecap="round"/>`)
      }
    }
  }
  for (const s of l.spans) {
    const x = ox + s.x
    const y = oy + s.y
    if (s.highlight) out.push(`<rect x="${num(x - 1)}" y="${num(y - s.size * 0.7)}" width="${num(s.w + 2)}" height="${num(s.size * 1.4)}" ${paint('fill', HIGHLIGHT_FILL)}/>`)
    if (s.code) out.push(`<rect x="${num(x - 2)}" y="${num(y - s.size * 0.7)}" width="${num(s.w + 4)}" height="${num(s.size * 1.4)}" rx="3" ${paint('fill', CODE_FILL)}/>`)
    const deco = [s.strike ? 'line-through' : '', s.link ? 'underline' : ''].filter(Boolean).join(' ')
    out.push(
      `<text x="${num(x)}" y="${num(y)}" style="font: ${esc(fontCss(s.size, s.style))}${deco ? `; text-decoration: ${deco}` : ''}; white-space: pre" ${paint('fill', ink)}${s.faint ? ' fill-opacity="0.55"' : ''} dominant-baseline="central">${esc(s.text)}</text>`,
    )
  }
  return out.join('')
}
