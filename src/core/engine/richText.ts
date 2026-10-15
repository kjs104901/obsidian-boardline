// Board text is Markdown. Inside a line: **bold**, *italic*, ~~strike-through~~, ==highlight==,
// `code`, [label](address), [[note]] links and bare web addresses. A line may start with a
// heading, list, task or quote marker. This module turns a line's inline Markdown into styled
// runs and back. Emphasis follows CommonMark's delimiter rules (so text written in Obsidian
// reads the same here), a little looser next to punctuation, which Korean needs: "**(참고)**를".

export type MarkName = 'bold' | 'italic' | 'strike' | 'highlight' | 'code'

export interface Marks {
  bold?: boolean
  italic?: boolean
  strike?: boolean
  highlight?: boolean
  code?: boolean
  /** A web address, or `[[target]]` for a note link. */
  link?: string
}

export interface Run extends Marks {
  text: string
}

// ---- parsing ---------------------------------------------------------------------------

interface Delim {
  ch: string
  count: number
  orig: number
  open: boolean
  close: boolean
}

interface Node {
  text: string
  marks: Marks
  delim?: Delim
}

const isSpace = (c: string | undefined) => c === undefined || /\s/.test(c)
const isPunct = (c: string | undefined) => c !== undefined && /[\p{P}\p{S}]/u.test(c)
const isAsciiPunct = (c: string | undefined) => c !== undefined && /[!-/:-@[-`{-~]/.test(c)

function runLength(s: string, i: number, ch: string): number {
  let n = 0
  while (s[i + n] === ch) n++
  return n
}

/** Index of the backtick run of exactly `n` that closes a code span opened before `from`. */
function codeClose(s: string, from: number, n: number): number {
  for (let i = from; i < s.length; ) {
    if (s[i] !== '`') {
      i++
      continue
    }
    const m = runLength(s, i, '`')
    if (m === n) return i
    i += m
  }
  return -1
}

function codeText(raw: string): string {
  return raw.length > 2 && raw.startsWith(' ') && raw.endsWith(' ') && raw.trim() ? raw.slice(1, -1) : raw
}

/** `[label](address)` at `i`: its parts and where it ends. */
function linkAt(s: string, i: number): { label: string; url: string; end: number } | null {
  let depth = 0
  let j = i
  for (; j < s.length; j++) {
    const c = s[j]
    if (c === '\\') j++
    else if (c === '[') depth++
    else if (c === ']' && --depth === 0) break
  }
  if (j >= s.length || s[j + 1] !== '(') return null
  const close = s.indexOf(')', j + 2)
  if (close < 0) return null
  const url = s.slice(j + 2, close).trim().replace(/^<(.*)>$/, '$1')
  if (!url || /\s/.test(url)) return null
  return { label: s.slice(i + 1, j), url, end: close + 1 }
}

const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1)

function tokenize(s: string, nodes: Node[]): void {
  let buf = ''
  const flush = () => {
    if (buf) nodes.push({ text: buf, marks: {} })
    buf = ''
  }
  for (let i = 0; i < s.length; ) {
    const c = s[i]
    if (c === '\\' && isAsciiPunct(s[i + 1])) {
      buf += s[i + 1]
      i += 2
      continue
    }
    if (c === '`') {
      const n = runLength(s, i, '`')
      const close = codeClose(s, i + n, n)
      if (close >= 0) {
        flush()
        nodes.push({ text: codeText(s.slice(i + n, close)), marks: { code: true } })
        i = close + n
      } else {
        buf += s.slice(i, i + n)
        i += n
      }
      continue
    }
    // [[note]], [[note|label]] and embeds ![[file]].
    const wiki = c === '[' && s[i + 1] === '[' ? i : c === '!' && s[i + 1] === '[' && s[i + 2] === '[' ? i + 1 : -1
    if (wiki >= 0) {
      const end = s.indexOf(']]', wiki + 2)
      const inner = end > wiki + 2 ? s.slice(wiki + 2, end) : ''
      if (inner && !inner.includes('[')) {
        flush()
        const bar = inner.indexOf('|')
        const target = bar >= 0 ? inner.slice(0, bar) : inner
        nodes.push({ text: bar >= 0 ? inner.slice(bar + 1) : wiki > i ? fileName(target) : target, marks: { link: `[[${target}]]` } })
        i = end + 2
        continue
      }
    }
    // [label](address), and pictures ![alt](address) shown by their name.
    const bracket = c === '[' ? i : c === '!' && s[i + 1] === '[' ? i + 1 : -1
    if (bracket >= 0) {
      const m = linkAt(s, bracket)
      if (m) {
        flush()
        if (bracket > i) nodes.push({ text: m.label || fileName(m.url), marks: { link: m.url } })
        else for (const r of parseInline(m.label)) nodes.push({ text: r.text, marks: { ...marksOf(r), link: m.url } })
        i = m.end
        continue
      }
    }
    if (c === '*' || c === '_' || c === '~' || c === '=') {
      const n = runLength(s, i, c)
      // Strike-through and highlight are pairs only.
      if ((c === '~' || c === '=') && n !== 2) {
        buf += s.slice(i, i + n)
        i += n
        continue
      }
      const before = s[i - 1]
      const after = s[i + n]
      let open = !isSpace(after)
      let close = !isSpace(before)
      if (c === '_') {
        // Not inside words: snake_case stays as it is.
        open = open && (isSpace(before) || isPunct(before))
        close = close && (isSpace(after) || isPunct(after))
      }
      flush()
      nodes.push({ text: s.slice(i, i + n), marks: {}, delim: { ch: c, count: n, orig: n, open, close } })
      i += n
      continue
    }
    if (c === 'h' && (i === 0 || /[\s(]/.test(s[i - 1]))) {
      const m = /^https?:\/\/[^\s<>]*[^\s<>.,;:!?)'"\]]/.exec(s.slice(i))
      if (m) {
        flush()
        nodes.push({ text: m[0], marks: { link: m[0] } })
        i += m[0].length
        continue
      }
    }
    buf += c
    i++
  }
  flush()
}

/** CommonMark's "process emphasis": pair closers with the nearest fitting opener. */
function pairDelimiters(nodes: Node[]): void {
  for (let ci = 0; ci < nodes.length; ci++) {
    const closer = nodes[ci].delim
    if (!closer || !closer.close) continue
    while (closer.count > 0) {
      let oi = -1
      for (let j = ci - 1; j >= 0; j--) {
        const d = nodes[j].delim
        if (!d || d.ch !== closer.ch || !d.open || d.count === 0) continue
        if (d.ch === '*' || d.ch === '_') {
          // The rule of three: "*a**b*" is not "a" in bold.
          if ((d.close || closer.open) && (d.orig + closer.orig) % 3 === 0 && !(d.orig % 3 === 0 && closer.orig % 3 === 0)) continue
        } else if (d.count < 2 || closer.count < 2) continue
        oi = j
        break
      }
      if (oi < 0) break
      const opener = nodes[oi].delim!
      const use = opener.count >= 2 && closer.count >= 2 ? 2 : 1
      const mark: MarkName = opener.ch === '~' ? 'strike' : opener.ch === '=' ? 'highlight' : use === 2 ? 'bold' : 'italic'
      for (let k = oi + 1; k < ci; k++) {
        nodes[k].marks[mark] = true
        const d = nodes[k].delim
        if (d) d.open = d.close = false
      }
      opener.count -= use
      closer.count -= use
      nodes[oi].text = nodes[oi].text.slice(use)
      nodes[ci].text = nodes[ci].text.slice(use)
    }
  }
}

function marksOf(r: Marks): Marks {
  const m: Marks = {}
  if (r.bold) m.bold = true
  if (r.italic) m.italic = true
  if (r.strike) m.strike = true
  if (r.highlight) m.highlight = true
  if (r.code) m.code = true
  if (r.link) m.link = r.link
  return m
}

export const sameMarks = (a: Marks, b: Marks) =>
  !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.strike === !!b.strike && !!a.highlight === !!b.highlight && !!a.code === !!b.code && a.link === b.link

/** Adjacent runs with the same marks joined, empty ones dropped. */
export function mergeRuns(runs: Run[]): Run[] {
  const out: Run[] = []
  for (const r of runs) {
    if (!r.text) continue
    const last = out[out.length - 1]
    if (last && sameMarks(last, r)) last.text += r.text
    else out.push({ ...marksOf(r), text: r.text })
  }
  return out
}

/** One line's inline Markdown as styled runs. */
export function parseInline(s: string): Run[] {
  const nodes: Node[] = []
  tokenize(s, nodes)
  pairDelimiters(nodes)
  return mergeRuns(nodes.map((n) => ({ ...n.marks, text: n.text })))
}

/** The text without its Markdown (for search, plain-text copies and Mermaid). */
export function plainInline(s: string): string {
  return parseInline(s)
    .map((r) => r.text)
    .join('')
}

// ---- writing ---------------------------------------------------------------------------

type Emphasis = 'bold' | 'italic' | 'strike' | 'highlight'
const EMPHASIS: Emphasis[] = ['bold', 'italic', 'strike', 'highlight']
const DELIMITER: Record<Emphasis, string> = { bold: '**', italic: '*', strike: '~~', highlight: '==' }

function escapeText(s: string): string {
  // Two or more ~ or = in a row would read as a mark: each of them escaped.
  return s.replace(/[\\*_`[\]]/g, '\\$&').replace(/~{2,}|={2,}/g, (run) => run.replace(/[~=]/g, '\\$&'))
}

function codeSpan(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((m) => m.length))
  const fence = '`'.repeat(longest + 1)
  const pad = text.startsWith('`') || text.endsWith('`') || (text.startsWith(' ') && text.endsWith(' ') && text.trim()) ? ' ' : ''
  return fence + pad + text + pad + fence
}

interface Atom {
  raw: string
  space: boolean
  marks: Set<Emphasis>
}

const emphasisOf = (r: Marks) => new Set(EMPHASIS.filter((m) => r[m]))
const shared = (group: Marks[]) => new Set([...emphasisOf(group[0])].filter((m) => group.every((g) => g[m])))

/** Styled runs as one line of inline Markdown (parseInline reads it back to the same runs). */
export function serializeInline(input: Run[]): string {
  const runs = mergeRuns(input)
  const atoms: Atom[] = []
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i]
    if (r.link) {
      // A link is one piece: its runs in a row, marks they all have around it, the rest inside.
      const group = [r]
      while (runs[i + 1]?.link === r.link) group.push(runs[++i])
      const outer = shared(group)
      const label = group.map((g) => g.text).join('')
      if (r.link.startsWith('[[')) {
        const target = r.link.slice(2, -2)
        atoms.push({ raw: label === target ? r.link : `[[${target}|${label}]]`, space: false, marks: outer })
      } else if (label === r.link && group.length === 1 && !r.code && /^https?:\/\/\S+$/.test(label)) {
        atoms.push({ raw: label, space: false, marks: outer })
      } else {
        const inner = serializeInline(group.map(({ link: _link, ...rest }) => ({ ...rest, ...Object.fromEntries([...outer].map((m) => [m, undefined])) })))
        atoms.push({ raw: `[${inner}](${/[\s()]/.test(r.link) ? `<${r.link}>` : r.link})`, space: false, marks: outer })
      }
      continue
    }
    if (r.code) {
      atoms.push({ raw: codeSpan(r.text), space: false, marks: emphasisOf(r) })
      continue
    }
    for (const part of r.text.split(/(\s+)/)) {
      if (part) atoms.push({ raw: escapeText(part), space: /^\s+$/.test(part), marks: emphasisOf(r) })
    }
  }
  // Delimiters may not open before or close after a space: spaces keep only the marks on
  // both sides of them.
  for (let i = 0; i < atoms.length; i++) {
    if (!atoms[i].space) continue
    const prev = atoms.slice(0, i).reverse().find((a) => !a.space)
    const next = atoms.slice(i + 1).find((a) => !a.space)
    atoms[i].marks = new Set([...atoms[i].marks].filter((m) => prev?.marks.has(m) && next?.marks.has(m)))
  }
  // How far each mark reaches from atom i: marks that last longer open first (outside).
  const reach = (i: number, m: Emphasis) => {
    let j = i
    while (j < atoms.length && (atoms[j].marks.has(m) || atoms[j].space)) j++
    return j
  }
  let out = ''
  const open: { mark: Emphasis; delim: string }[] = []
  const close = (to: number) => {
    for (let j = open.length - 1; j >= to; j--) out += open[j].delim
    open.length = to
  }
  atoms.forEach((a, i) => {
    const firstUnwanted = open.findIndex((o) => !a.marks.has(o.mark))
    if (firstUnwanted >= 0) close(firstUnwanted)
    // A space never opens a mark; the word after it does.
    if (a.space) {
      out += a.raw
      return
    }
    const opening = EMPHASIS.filter((m) => a.marks.has(m) && !open.some((o) => o.mark === m)).sort((x, y) => reach(i, y) - reach(i, x))
    for (const m of opening) {
      // "**" right after "*" would run together: bold and italic also have "__" and "_".
      let delim = DELIMITER[m]
      if (delim[0] === '*' && out.endsWith('*')) delim = delim.replace(/\*/g, '_')
      out += delim
      open.push({ mark: m, delim })
    }
    out += a.raw
  })
  close(0)
  return out
}

// ---- lines -----------------------------------------------------------------------------

export type LineKind = 'heading' | 'bullet' | 'number' | 'task' | 'none'

export interface LineStart {
  /** The marker as written ("## ", "> - [ ] ", "1. "…), which stays as it is. */
  prefix: string
  rest: string
  kind: LineKind
  /** Heading level (1-6), or list nesting depth (0 at the margin). */
  level: number
  /** How many quote markers (>) the line starts with. */
  quote: number
  /** A numbered item's number with its "." or ")". */
  marker?: string
  checked?: boolean
}

const QUOTE = /^ {0,3}>[ \t]?/
const HEADING = /^(#{1,6})[ \t]+/
const TASK = /^([ \t]*)[-*+][ \t]+\[([ xX])\][ \t]+/
const BULLET = /^([ \t]*)[-*+•][ \t]+/
const NUMBER = /^([ \t]*)(\d{1,9}[.)])[ \t]+/

const depthOf = (indent: string) => Math.floor(indent.replace(/\t/g, '    ').length / 2)

/** A line's block marker (heading, list, task, quote) and the inline text after it. */
export function lineStart(line: string): LineStart {
  let prefix = ''
  let quote = 0
  let rest = line
  for (let m = QUOTE.exec(rest); m; m = QUOTE.exec(rest)) {
    quote++
    prefix += m[0]
    rest = rest.slice(m[0].length)
  }
  const at = (m: RegExpExecArray, kind: LineKind, level: number, extra: Partial<LineStart> = {}): LineStart => ({
    prefix: prefix + m[0],
    rest: rest.slice(m[0].length),
    kind,
    level,
    quote,
    ...extra,
  })
  let m = HEADING.exec(rest)
  if (m) return at(m, 'heading', m[1].length)
  m = TASK.exec(rest)
  if (m) return at(m, 'task', depthOf(m[1]), { checked: m[2] !== ' ' })
  m = BULLET.exec(rest)
  if (m) return at(m, 'bullet', depthOf(m[1]))
  m = NUMBER.exec(rest)
  if (m) return at(m, 'number', depthOf(m[1]), { marker: m[2] })
  return { prefix, rest, kind: 'none', level: 0, quote }
}

const FENCE = /^\s*(```|~~~)/

/** Each line of `text` with whether it is inside a fenced code block (or a fence itself). */
export function codeLines(text: string): { line: string; code: boolean; fence: boolean }[] {
  let fence: string | null = null
  return text.split('\n').map((line) => {
    const f = FENCE.exec(line)
    if (f && (!fence || f[1] === fence)) {
      fence = fence ? null : f[1]
      return { line, code: true, fence: true }
    }
    return { line, code: fence !== null, fence: false }
  })
}

/** The text without Markdown marks (block markers stay). */
export function plainText(text: string): string {
  return codeLines(text)
    .map(({ line, code }) => {
      if (code) return line
      const s = lineStart(line)
      return s.prefix + plainInline(s.rest)
    })
    .join('\n')
}

/** Every inline run of `text`, line by line (code blocks left out). */
function inlineLines(text: string, fn: (runs: Run[]) => Run[]): string {
  return codeLines(text)
    .map(({ line, code }) => {
      if (code) return line
      const s = lineStart(line)
      return s.prefix + serializeInline(fn(parseInline(s.rest)))
    })
    .join('\n')
}

/** Whether all of the text (spaces aside) has `mark`. */
export function hasMarkAll(text: string, mark: MarkName): boolean {
  let any = false
  for (const { line, code } of codeLines(text)) {
    if (code) continue
    for (const r of parseInline(lineStart(line).rest)) {
      if (!r.text.trim()) continue
      any = true
      if (!r[mark]) return false
    }
  }
  return any
}

/** The text with `mark` on (or off) everywhere. */
export function setMarkAll(text: string, mark: MarkName, on: boolean): string {
  return inlineLines(text, (runs) => runs.map((r) => ({ ...r, [mark]: on || undefined })))
}
