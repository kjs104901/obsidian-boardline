// The box board text is typed into: a contenteditable over the canvas that shows bold, italic,
// strike-through, highlight, code and links the way the board draws them, and reads back as
// Markdown. Line markers (#, -, 1., >) and code fences stay as typed.

import { codeLines, lineStart, parseInline, serializeInline, type MarkName, type Marks, type Run } from './richText'
import { nextListItem } from './text'
import { createElement } from '@boardline/dom'

/** One styled run as nodes: its text inside a tag per mark. */
function runNode(doc: Document, r: Run): Node {
  let node: Node = doc.createTextNode(r.text)
  const wrap = (tag: MarkTag) => {
    const el = createElement(doc, tag)
    el.append(node)
    node = el
  }
  if (r.code) wrap('code')
  if (r.highlight) wrap('mark')
  if (r.strike) wrap('s')
  if (r.italic) wrap('i')
  if (r.bold) wrap('b')
  if (r.link) {
    const a = createElement(doc, 'a')
    a.dataset.href = r.link
    a.append(node)
    node = a
  }
  return node
}

/** Markdown as the box's content: inline marks as tags, lines apart by <br>. */
export function markdownToNodes(doc: Document, md: string): Node[] {
  if (!md) return []
  const nodes: Node[] = []
  codeLines(md).forEach(({ line, code }, i) => {
    if (i > 0) nodes.push(createElement(doc, 'br'))
    if (code) {
      if (line) nodes.push(doc.createTextNode(line))
      return
    }
    const s = lineStart(line)
    if (s.prefix) nodes.push(doc.createTextNode(s.prefix))
    for (const r of parseInline(s.rest)) nodes.push(runNode(doc, r))
  })
  // An empty last line shows only with a <br> of its own.
  if (md.endsWith('\n')) nodes.push(createElement(doc, 'br'))
  return nodes
}

const BLOCK = /^(DIV|P|LI|H[1-6]|PRE|BLOCKQUOTE|UL|OL)$/

function marksOf(el: HTMLElement, m: Marks): Marks {
  const next = { ...m }
  const tag = el.tagName
  if (tag === 'B' || tag === 'STRONG') next.bold = true
  if (tag === 'I' || tag === 'EM') next.italic = true
  if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') next.strike = true
  if (tag === 'MARK') next.highlight = true
  if (tag === 'CODE') next.code = true
  if (tag === 'A') next.link = el.dataset.href || el.getAttribute('href') || undefined
  const st = el.style
  if (st.fontWeight) next.bold = /^(bold|bolder|[6-9]00)$/.test(st.fontWeight)
  if (st.fontStyle) next.italic = st.fontStyle === 'italic'
  const line = st.textDecorationLine || st.textDecoration
  if (line) next.strike = line.includes('line-through')
  return next
}

/**
 * The box's content as styled runs per line. A <br> at the very end only holds an empty last
 * line open and is not a line of its own (as the browser shows it), unless `keepLastBreak`.
 */
function domLines(root: Node, keepLastBreak = false): Run[][] {
  const lines: Run[][] = [[]]
  let pendingBreak = false
  let lastWasBreak = false
  const current = () => lines[lines.length - 1]
  const breakIfPending = () => {
    if (pendingBreak) lines.push([])
    pendingBreak = false
  }
  const walk = (node: Node, marks: Marks) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.nodeValue ?? '').replace(/\u00a0/g, ' ').replace(/\u200b/g, '')
      if (!text) return
      breakIfPending()
      text.split('\n').forEach((t, i) => {
        if (i) lines.push([])
        if (t) current().push({ ...marks, text: t })
      })
      lastWasBreak = false
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as HTMLElement
    if (el.tagName === 'BR') {
      breakIfPending()
      lines.push([])
      lastWasBreak = true
      return
    }
    const block = BLOCK.test(el.tagName)
    if (block) {
      if (current().length > 0 || pendingBreak) lines.push([])
      pendingBreak = false
    }
    const inner = marksOf(el, marks)
    for (const child of el.childNodes) walk(child, inner)
    if (block) pendingBreak = true
  }
  for (const child of root.childNodes) walk(child, {})
  if (lastWasBreak && !keepLastBreak && lines.length > 1) lines.pop()
  return lines
}

/** Runs without their first `n` characters. */
function dropChars(runs: Run[], n: number): Run[] {
  const out: Run[] = []
  for (const r of runs) {
    if (n >= r.text.length) {
      n -= r.text.length
      continue
    }
    out.push({ ...r, text: r.text.slice(n) })
    n = 0
  }
  return out
}

const FENCE = /^\s*(```|~~~)/

/** The box's content as Markdown. */
export function htmlToMarkdown(root: Node): string {
  let fence: string | null = null
  return domLines(root)
    .map((runs) => {
      const plain = runs.map((r) => r.text).join('')
      const f = FENCE.exec(plain)
      if (fence || f) {
        if (f && (!fence || f[1] === fence)) fence = fence ? null : f[1]
        return plain
      }
      const start = lineStart(plain)
      return start.prefix + serializeInline(dropChars(runs, start.prefix.length))
    })
    .join('\n')
}

/**
 * Markdown typed out turns into the mark it stands for ("**word**" becomes bold). The third
 * entry lists characters that can't come just before the match (no lookbehind: older iOS
 * can't read one).
 */
/** Tags the field marks text with (as the board draws it). */
type MarkTag = 'b' | 'i' | 's' | 'mark' | 'code'

const TYPED_MARKS: [RegExp, MarkTag, string?][] = [
  [/\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, 'b'],
  [/\*([^*\s](?:[^*]*[^*\s])?)\*$/, 'i', '*\\'],
  [/~~([^~\s](?:[^~]*[^~\s])?)~~$/, 's'],
  [/==([^=\s](?:[^=]*[^=\s])?)==$/, 'mark'],
  [/`([^`]+)`$/, 'code'],
]

const TAG_OF: Record<'highlight' | 'code', MarkTag> = { highlight: 'mark', code: 'code' }

export interface RichFieldOptions {
  /** Enter in a list item starts the next one (default on; off where text has no lists). */
  lists?: boolean
  /** Enter breaks the line (default on); off, only Shift+Enter does and Enter is the owner's. */
  enter?: boolean
}

export class RichField {
  readonly el: HTMLDivElement
  private composing = false

  constructor(
    private doc: Document,
    private opts: RichFieldOptions = {},
  ) {
    const el = createElement(doc, 'div')
    el.contentEditable = 'true'
    el.spellcheck = false
    el.setAttribute('role', 'textbox')
    el.setAttribute('aria-multiline', 'true')
    this.el = el
    // Pasted text is Markdown like everything written here (text copied from a note keeps its
    // bold, highlights and code, as it does pasted onto the board); other formatting (HTML) is
    // not kept. The nodes are built from the text, so the markup handed over is our own.
    el.addEventListener('paste', (e) => {
      e.preventDefault()
      const text = (e.clipboardData?.getData('text/plain') ?? '').replace(/\r\n?/g, '\n')
      if (!text) return
      const box = createElement(doc, 'div')
      box.append(...markdownToNodes(doc, text))
      doc.execCommand('insertHTML', false, box.innerHTML)
    })
    el.addEventListener('drop', (e) => e.preventDefault())
    el.addEventListener('compositionstart', () => (this.composing = true))
    el.addEventListener('compositionend', () => (this.composing = false))
    el.addEventListener('keydown', (e) => {
      if (e.isComposing || e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.altKey) return
      if (!e.shiftKey && this.opts.enter === false) return
      e.preventDefault()
      if (!e.shiftKey && this.opts.lists !== false && this.continueList()) return
      doc.execCommand('insertLineBreak')
    })
    el.addEventListener('input', (e) => {
      if ((e).inputType === 'insertText' && !this.composing) this.typedMarks()
    })
  }

  get value(): string {
    return htmlToMarkdown(this.el)
  }

  set value(md: string) {
    this.el.replaceChildren(...markdownToNodes(this.doc, md))
  }

  get style(): CSSStyleDeclaration {
    return this.el.style
  }

  /** Shown while the box is empty. */
  get placeholder(): string {
    return this.el.dataset.placeholder ?? ''
  }

  set placeholder(text: string) {
    this.el.dataset.placeholder = text
  }

  focus(): void {
    this.el.focus()
  }

  remove(): void {
    this.el.remove()
  }

  selectAll(): void {
    this.doc.getSelection()?.selectAllChildren(this.el)
  }

  caretToEnd(): void {
    const sel = this.doc.getSelection()
    if (!sel) return
    sel.selectAllChildren(this.el)
    sel.collapseToEnd()
  }

  /** A mark on the selected text, or off when it has it (bold, italic and strike-through also for what is typed next). */
  toggleMark(mark: MarkName): void {
    this.el.focus()
    if (mark === 'bold') this.doc.execCommand('bold')
    else if (mark === 'italic') this.doc.execCommand('italic')
    else if (mark === 'strike') this.doc.execCommand('strikeThrough')
    else this.toggleTag(TAG_OF[mark])
  }

  /** The marks where the caret is. */
  marks(): Record<MarkName, boolean> {
    const q = (cmd: string) => {
      try {
        return this.doc.queryCommandState(cmd)
      } catch {
        return false
      }
    }
    return { bold: q('bold'), italic: q('italic'), strike: q('strikeThrough'), highlight: !!this.around('mark'), code: !!this.around('code') }
  }

  private around(tag: MarkTag): HTMLElement | null {
    const node = this.doc.getSelection()?.anchorNode ?? null
    for (let e = node instanceof HTMLElement ? node : (node?.parentElement ?? null); e && e !== this.el; e = e.parentElement) {
      if (e.localName === tag) return e
    }
    return null
  }

  private changed(): void {
    this.el.dispatchEvent(new Event('input', { bubbles: true }))
  }

  /** Highlight and code have no editing command: wrap the selection, or unwrap around the caret. */
  private toggleTag(tag: MarkTag): void {
    const sel = this.doc.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const found = this.around(tag)
    if (found) {
      found.replaceWith(...found.childNodes)
      this.changed()
      return
    }
    const range = sel.getRangeAt(0)
    if (range.collapsed || !this.el.contains(range.commonAncestorContainer)) return
    const wrap = createElement(this.doc, tag)
    wrap.append(range.extractContents())
    range.insertNode(wrap)
    sel.selectAllChildren(wrap)
    this.changed()
  }

  /** The text of the line up to the caret (null with a selection). */
  private lineBeforeCaret(): string | null {
    const sel = this.doc.getSelection()
    if (!sel || !sel.isCollapsed || !sel.anchorNode || !this.el.contains(sel.anchorNode)) return null
    const r = this.doc.createRange()
    r.setStart(this.el, 0)
    r.setEnd(sel.anchorNode, sel.anchorOffset)
    const box = createElement(this.doc, 'div')
    box.append(r.cloneContents())
    const lines = domLines(box, true)
    return lines[lines.length - 1].map((run) => run.text).join('')
  }

  /** Enter in a list item starts the next item; in an empty item it ends the list. */
  private continueList(): boolean {
    const line = this.lineBeforeCaret()
    const next = line === null ? null : nextListItem(line)
    if (!next || line === null) return false
    if (next.end) {
      const sel = this.doc.getSelection()!
      for (let i = 0; i < line.length; i++) sel.modify('extend', 'backward', 'character')
      this.doc.execCommand('delete')
    } else {
      this.doc.execCommand('insertLineBreak')
      this.doc.execCommand('insertText', false, next.marker)
    }
    return true
  }

  private typedMarks(): void {
    const sel = this.doc.getSelection()
    const node = sel?.anchorNode
    if (!sel || !sel.isCollapsed || !(node instanceof Text)) return
    const before = node.data.slice(0, sel.anchorOffset)
    for (const [pattern, tag, notAfter] of TYPED_MARKS) {
      const m = pattern.exec(before)
      if (!m) continue
      const prev = before.charAt(before.length - m[0].length - 1)
      if (notAfter && prev && notAfter.includes(prev)) continue
      const range = this.doc.createRange()
      range.setStart(node, sel.anchorOffset - m[0].length)
      range.setEnd(node, sel.anchorOffset)
      range.deleteContents()
      const el = createElement(this.doc, tag)
      el.textContent = m[1]
      range.insertNode(el)
      // Typing goes on after the mark, not inside it.
      const after = this.doc.createTextNode('\u200b')
      el.after(after)
      sel.collapse(after, 1)
      return
    }
  }
}
