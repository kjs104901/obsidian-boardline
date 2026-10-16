// Mermaid → board: flowcharts (laid out with ELK), sequence diagrams and mind maps.
// The other direction is engine/mermaid.ts ("Copy as Mermaid").

import {
  ACTOR_STEM,
  BRANCH_COLORS,
  createConnector,
  createMindmapNode,
  createShape,
  type BoardObject,
  type ColorKey,
  type ConnectorObject,
  type EndCap,
  type ShapeKind,
  type ShapeObject,
} from './model'
import type { LayoutResult } from '../engine/autoLayout'

// ---- parsing ------------------------------------------------------------------------------

export interface FlowNode {
  id: string
  text: string
  shape: ShapeKind
  /** Turned upside down: a trapezoid ([\ /]) or triangle wider at the top. */
  flipped?: boolean
}

export interface FlowEdge {
  from: string
  to: string
  label: string
  dashed: boolean
  startCap: EndCap
  endCap: EndCap
}

export interface Flowchart {
  kind: 'flowchart'
  direction: 'DOWN' | 'RIGHT'
  nodes: FlowNode[]
  edges: FlowEdge[]
  subgraphs: { title: string; nodes: string[] }[]
}

export interface Sequence {
  kind: 'sequence'
  participants: { id: string; label: string }[]
  messages: { from: string; to: string; text: string; dashed: boolean; arrow: boolean }[]
}

export interface MindmapTree {
  kind: 'mindmap'
  root: { text: string; children: MindmapTree['root'][] }
}

export type Diagram = Flowchart | Sequence | MindmapTree

/** Text in Mermaid labels: quotes, line breaks and entities. */
function cleanText(raw: string): string {
  let s = raw.trim()
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) s = s.slice(1, -1)
  if (s.startsWith('`') && s.endsWith('`') && s.length >= 2) s = s.slice(1, -1)
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/#quot;/g, '"')
    .replace(/#amp;/g, '&')
    .replace(/#lt;/g, '<')
    .replace(/#gt;/g, '>')
    .replace(/#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim()
}

/** Lines without comments (%%), split on ';' too. */
function statements(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.replace(/%%.*$/, ''))
    .flatMap((l) => (l.includes('"') ? [l] : l.split(';')))
    .map((l) => l.trim())
    .filter(Boolean)
}

/** Which kind of Mermaid diagram `text` is, if it is one we read. */
export function mermaidKind(text: string): Diagram['kind'] | null {
  const first = statements(text)[0] ?? ''
  if (/^(flowchart|graph)\b/i.test(first)) return 'flowchart'
  if (/^sequenceDiagram\b/.test(first)) return 'sequence'
  if (/^mindmap\b/.test(first)) return 'mindmap'
  return null
}

export function parseMermaid(text: string): Diagram | null {
  switch (mermaidKind(text)) {
    case 'flowchart':
      return parseFlowchart(text)
    case 'sequence':
      return parseSequence(text)
    case 'mindmap':
      return parseMindmapTree(text)
    default:
      return null
  }
}

// Node shapes: opener → [closer, shape]. Longest openers first.
const SHAPES: [string, string[], ShapeKind, boolean?][] = [
  ['(((', [')))'], 'ellipse'],
  ['((', ['))'], 'ellipse'],
  ['([', ['])'], 'pill'],
  ['[[', [']]'], 'subroutine'],
  ['[(', [')]'], 'cylinder'],
  ['[/', ['/]'], 'parallelogram'],
  ['[/', ['\\]'], 'trapezoid'],
  ['[\\', ['\\]'], 'parallelogram-flip'],
  ['[\\', ['/]'], 'trapezoid', true],
  ['{{', ['}}'], 'hexagon'],
  ['[', [']'], 'rect'],
  ['(', [')'], 'pill'],
  ['{', ['}'], 'diamond'],
  ['>', [']'], 'rect'],
]

/** Mermaid 11 shape names (`id@{ shape: doc }`), long names and aliases alike. */
const NAMED_SHAPES: [string[], ShapeKind, boolean?][] = [
  [['rect', 'rectangle', 'proc', 'process', 'rounded', 'event'], 'rect'],
  [['stadium', 'pill', 'terminal'], 'pill'],
  [['circle', 'circ', 'dbl-circ', 'double-circle', 'sm-circ', 'small-circle', 'start', 'f-circ', 'filled-circle', 'junction', 'fr-circ', 'framed-circle', 'stop'], 'ellipse'],
  [['diam', 'diamond', 'decision', 'question'], 'diamond'],
  [['hex', 'hexagon', 'prepare'], 'hexagon'],
  [['cyl', 'cylinder', 'database', 'db', 'h-cyl', 'das', 'horizontal-cylinder', 'lin-cyl', 'disk', 'lined-cylinder'], 'cylinder'],
  [['lean-r', 'lean-right', 'in-out'], 'parallelogram'],
  [['lean-l', 'lean-left', 'out-in'], 'parallelogram-flip'],
  [['trap-b', 'trapezoid', 'priority', 'trapezoid-bottom'], 'trapezoid'],
  [['trap-t', 'manual', 'inv-trapezoid', 'trapezoid-top'], 'trapezoid', true],
  [['tri', 'triangle', 'extract'], 'triangle'],
  [['flip-tri', 'flipped-triangle', 'manual-file'], 'triangle', true],
  [['doc', 'document', 'lin-doc', 'lined-document'], 'document'],
  [['docs', 'documents', 'st-doc', 'stacked-document', 'processes', 'procs', 'st-rect', 'stacked-rectangle'], 'documents'],
  [['subproc', 'subprocess', 'subroutine', 'fr-rect', 'framed-rectangle'], 'subroutine'],
  [['sl-rect', 'sloped-rectangle', 'manual-input'], 'manual-input'],
  [['delay', 'half-rounded-rectangle'], 'delay'],
  [['display', 'curv-trap', 'curved-trapezoid'], 'display'],
  [['cloud'], 'cloud'],
  [['brace', 'brace-l', 'comment'], 'brace'],
]

/** `@{ shape: doc, label: "Text" }` after a node id: the shape and text it gives, and the rest. */
function readShapeData(s: string): { shape: ShapeKind; flipped?: boolean; text?: string; rest: string } | null {
  if (!s.startsWith('@{')) return null
  let quote = false
  let end = -1
  for (let i = 2; i < s.length && end < 0; i++) {
    if (s[i] === '"') quote = !quote
    else if (s[i] === '}' && !quote) end = i
  }
  if (end < 0) return null
  const fields = new Map<string, string>()
  for (const m of s.slice(2, end).matchAll(/([\w-]+)\s*:\s*("(?:[^"]*)"|[^,]*)/g)) fields.set(m[1], m[2].trim())
  const name = (fields.get('shape') ?? 'rect').replace(/^"|"$/g, '').toLowerCase()
  const named = NAMED_SHAPES.find(([names]) => names.includes(name))
  const label = fields.get('label')
  return {
    shape: named?.[1] ?? 'rect',
    ...(named?.[2] ? { flipped: true } : {}),
    ...(label !== undefined ? { text: cleanText(label) } : {}),
    rest: s.slice(end + 1),
  }
}

const ID = /^[\p{L}\p{N}_][\p{L}\p{N}_.-]*/u

/** A node at the start of `s`: id and optional shape with text; returns the rest. */
function readNode(s: string): { node: FlowNode; defined: boolean; rest: string } | null {
  const m = ID.exec(s)
  if (!m) return null
  // "-" may start a link (A-->B), so ids stop before "--", "-." and "-x".
  let id = m[0]
  const cut = id.search(/-[-.>xo]/)
  if (cut > 0) id = id.slice(0, cut)
  else if (id.endsWith('-')) id = id.slice(0, -1)
  let rest = s.slice(id.length)
  const data = readShapeData(rest)
  if (data) {
    const node: FlowNode = { id, text: data.text ?? id, shape: data.shape, ...(data.flipped ? { flipped: true } : {}) }
    return { node, defined: true, rest: data.rest }
  }
  for (const [open, closers, shape, flipped] of SHAPES) {
    if (!rest.startsWith(open)) continue
    const body = rest.slice(open.length)
    // Quoted text may contain the closer.
    let textEnd = 0
    if (body.startsWith('"')) textEnd = body.indexOf('"', 1) + 1
    for (const close of closers) {
      const at = body.indexOf(close, Math.max(0, textEnd))
      if (at < 0) continue
      // The closer must end this node, not a later one.
      const after = body.slice(at + close.length)
      if (after && !/^\s*($|[-=.~<&:]|@)/.test(after)) continue
      return { node: { id, text: cleanText(body.slice(0, at)), shape, ...(flipped ? { flipped } : {}) }, defined: true, rest: after }
    }
  }
  if (rest.startsWith(':::')) rest = rest.replace(/^:::[\w-]+/, '')
  return { node: { id, text: id, shape: 'rect' }, defined: false, rest }
}

/** A link at the start of `s`. */
function readLink(s: string): { edge: Omit<FlowEdge, 'from' | 'to'>; rest: string } | null {
  const t = s.trimStart()
  // Text in the middle: A -- text --> B, A -. text .-> B, A == text ==> B
  const mid = /^(<)?(--|==|-\.)\s*([^>|]+?)\s*(-{2,}>|={2,}>|\.-+>|-{3,}|={3,}|\.-+)/.exec(t)
  const plain = /^(<)?(-{2,}>|={2,}>|-\.+->|-{3,}|={3,}|-\.+-|-{2,}[ox]|~~~)/.exec(t)
  let label = ''
  let body: string
  let rest: string
  let start = false
  if (plain) {
    start = !!plain[1]
    body = plain[2]
    rest = t.slice(plain[0].length)
    const pipe = /^\s*\|([^|]*)\|/.exec(rest)
    if (pipe) {
      label = cleanText(pipe[1])
      rest = rest.slice(pipe[0].length)
    }
  } else if (mid) {
    start = !!mid[1]
    body = mid[2] + mid[4]
    label = cleanText(mid[3])
    rest = t.slice(mid[0].length)
  } else return null
  const end = body.endsWith('>') ? 'arrow' : body.endsWith('o') ? 'circle' : 'none'
  return { edge: { label, dashed: body.includes('.'), startCap: start ? 'arrow' : 'none', endCap: end }, rest }
}

function parseFlowchart(text: string): Flowchart {
  const lines = statements(text)
  const head = lines.shift() ?? ''
  const dir = /\b(LR|RL)\b/.test(head) ? 'RIGHT' : 'DOWN'
  const nodes = new Map<string, FlowNode>()
  const edges: FlowEdge[] = []
  const subgraphs: { title: string; nodes: string[] }[] = []
  const open: { title: string; nodes: string[] }[] = []
  const use = (n: FlowNode, defined: boolean) => {
    const known = nodes.get(n.id)
    if (!known || (defined && known.text === known.id && known.shape === 'rect')) nodes.set(n.id, n)
    for (const g of open) if (!g.nodes.includes(n.id)) g.nodes.push(n.id)
    return n.id
  }
  for (const line of lines) {
    if (/^(classDef|class|style|linkStyle|click|direction|accTitle|accDescr|title)\b/.test(line)) continue
    const sub = /^subgraph\s+(.*)$/.exec(line)
    if (sub) {
      const g = /^([^\s[]+)\s*\[(.*)\]\s*$/.exec(sub[1].trim())
      open.push({ title: cleanText(g ? g[2] : sub[1]), nodes: [] })
      continue
    }
    if (line === 'end') {
      const g = open.pop()
      if (g) subgraphs.push(g)
      continue
    }
    // node (& node)* (link node (& node)*)*
    let rest = line
    let previous: string[] = []
    let pending: Omit<FlowEdge, 'from' | 'to'> | null = null
    for (;;) {
      const group: string[] = []
      for (;;) {
        const n = readNode(rest.trimStart())
        if (!n) break
        group.push(use(n.node, n.defined))
        rest = n.rest
        const amp = /^\s*&\s*/.exec(rest)
        if (!amp) break
        rest = rest.slice(amp[0].length)
      }
      if (group.length === 0) break
      if (pending) for (const a of previous) for (const b of group) edges.push({ from: a, to: b, ...pending })
      previous = group
      const link = readLink(rest)
      if (!link) break
      pending = link.edge
      rest = link.rest
    }
  }
  while (open.length) subgraphs.push(open.pop()!)
  return { kind: 'flowchart', direction: dir, nodes: [...nodes.values()], edges, subgraphs }
}

function parseSequence(text: string): Sequence {
  const lines = statements(text).slice(1)
  const participants: Sequence['participants'] = []
  const ensure = (id: string, label = id) => {
    if (!participants.some((p) => p.id === id)) participants.push({ id, label })
  }
  const messages: Sequence['messages'] = []
  for (const line of lines) {
    const p = /^(participant|actor)\s+(.+?)(?:\s+as\s+(.+))?$/.exec(line)
    if (p) {
      ensure(p[2].trim(), cleanText(p[3] ?? p[2]))
      continue
    }
    const m = /^([^\s:+-]+?)\s*(-->>|->>|-->|->|--x|-x|--\)|-\))\s*[+-]?\s*([^\s:]+?)\s*:\s*(.*)$/.exec(line)
    if (m) {
      ensure(m[1])
      ensure(m[3])
      messages.push({ from: m[1], to: m[3], text: cleanText(m[4]), dashed: m[2].startsWith('--'), arrow: m[2] !== '->' && m[2] !== '-->' })
    }
  }
  return { kind: 'sequence', participants, messages }
}

/** Node text without Mermaid's shape wrappers: root((x)), id[x], (x), ))x((, {{x}}. */
function mindmapText(raw: string): string {
  const s = raw.replace(/:::[\w\s-]+$/, '').trim()
  const m = /^[\w-]*\s*(\(\(|\)\)|\(|\[|\{\{|\))(.*?)(\)\)|\(\(|\)|\]|\}\}|\()$/.exec(s)
  return cleanText(m ? m[2] : s)
}

function parseMindmapTree(text: string): MindmapTree {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/%%.*$/, ''))
    .filter((l) => l.trim() && !/^\s*::icon\(/.test(l))
  lines.shift()
  type Node = MindmapTree['root']
  const root: Node = { text: '', children: [] }
  const stack: { indent: number; node: Node }[] = []
  for (const line of lines) {
    const indent = line.length - line.trimStart().length
    const node: Node = { text: mindmapText(line), children: [] }
    if (stack.length === 0) {
      root.text = node.text
      stack.push({ indent, node: root })
      continue
    }
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop()
    stack[stack.length - 1].node.children.push(node)
    stack.push({ indent, node })
  }
  return { kind: 'mindmap', root }
}

// ---- building board objects ------------------------------------------------------------------

export interface BuildContext {
  /** Shape after its text changed (autosize). */
  autosize: (s: ShapeObject) => ShapeObject
  /** ELK layout (engine/autoLayout.ts): positions by shape id, and where connectors' ends attach. */
  layout: (shapes: ShapeObject[], connectors: ConnectorObject[], direction: 'DOWN' | 'RIGHT') => Promise<LayoutResult>
}

/** Board objects for a diagram, around the origin (z from 1). */
export async function buildDiagram(d: Diagram, ctx: BuildContext): Promise<BoardObject[]> {
  if (d.kind === 'flowchart') return buildFlowchart(d, ctx)
  if (d.kind === 'sequence') return buildSequence(d, ctx)
  return buildMindmap(d)
}

async function buildFlowchart(d: Flowchart, ctx: BuildContext): Promise<BoardObject[]> {
  let z = 1
  const ids = new Map<string, ShapeObject>()
  const shapes = d.nodes.map((n, i) => {
    const s = ctx.autosize({ ...createShape(n.shape, (i % 6) * 240, Math.floor(i / 6) * 168, z++), text: n.text, ...(n.flipped ? { angle: 180 } : {}) })
    ids.set(n.id, s)
    return s
  })
  const connectors = d.edges
    .filter((e) => ids.has(e.from) && ids.has(e.to))
    .map((e) => ({
      ...createConnector({ objectId: ids.get(e.from)!.id }, { objectId: ids.get(e.to)!.id }, z++),
      label: e.label,
      startCap: e.startCap,
      endCap: e.endCap,
      ...(e.dashed ? { line: 'dashed' as const } : {}),
    }))
  if (shapes.length >= 2 && connectors.length > 0) {
    const result = await ctx.layout(shapes, connectors, d.direction)
    for (let i = 0; i < shapes.length; i++) {
      const p = result.positions.get(shapes[i].id)
      if (p) shapes[i] = { ...shapes[i], x: p.x, y: p.y }
    }
    for (let i = 0; i < connectors.length; i++) {
      const ends = result.ends.get(connectors[i].id)
      const c = connectors[i]
      if (ends && 'objectId' in c.from && 'objectId' in c.to) {
        connectors[i] = { ...c, from: { objectId: c.from.objectId, ...ends.from }, to: { objectId: c.to.objectId, ...ends.to } }
      }
    }
  }
  // Subgraphs become sections around their nodes.
  const byId = new Map(shapes.map((s) => [s.id, s]))
  const sections: ShapeObject[] = []
  d.subgraphs.forEach((g, i) => {
    const members = g.nodes.map((n) => byId.get(ids.get(n)?.id ?? '')).filter((s): s is ShapeObject => !!s)
    if (members.length === 0) return
    const pad = 36
    const x = Math.min(...members.map((s) => s.x)) - pad
    const y = Math.min(...members.map((s) => s.y)) - pad
    const w = Math.max(...members.map((s) => s.x + s.w)) + pad - x
    const h = Math.max(...members.map((s) => s.y + s.h)) + pad - y
    sections.push({ ...createShape('section', x, y, -d.subgraphs.length + i, { w, h }), text: g.title })
  })
  return [...sections, ...shapes, ...connectors]
}

const MESSAGE_STEP = 60
const FIRST_MESSAGE = 100

function buildSequence(d: Sequence, ctx: BuildContext): BoardObject[] {
  let z = 1
  let dy = FIRST_MESSAGE
  const plan = d.messages.map((m) => {
    const at = dy
    dy += m.from === m.to ? 2 * MESSAGE_STEP : MESSAGE_STEP
    return at
  })
  const stem = Math.max(ACTOR_STEM, dy + MESSAGE_STEP - 50)
  const actors = new Map<string, ShapeObject>()
  d.participants.forEach((p, i) => actors.set(p.id, ctx.autosize({ ...createShape('actor', i * 240, 0, z++), text: p.label, stem })))
  const messages = d.messages.map((m, i): ConnectorObject => {
    const from = actors.get(m.from)!
    const to = actors.get(m.to)!
    const self = from === to
    return {
      ...createConnector({ objectId: from.id, dy: plan[i] }, { objectId: to.id, dy: self ? plan[i] + MESSAGE_STEP : plan[i] }, z++),
      label: m.text,
      color: 'gray',
      endCap: m.arrow ? 'arrow' : 'none',
      ...(m.dashed ? { line: 'dashed' as const } : {}),
    }
  })
  return [...actors.values(), ...messages]
}

function buildMindmap(d: MindmapTree): BoardObject[] {
  const out: BoardObject[] = []
  let z = 1
  const add = (n: MindmapTree['root'], parentId: string | null, order: number, color: ColorKey) => {
    const node = { ...createMindmapNode(parentId, 0, 0, order, color, z++), text: n.text }
    out.push(node)
    n.children.forEach((c, i) => add(c, node.id, i, parentId === null ? BRANCH_COLORS[i % BRANCH_COLORS.length] : color))
  }
  add(d.root, null, 0, 'gray')
  return out
}
