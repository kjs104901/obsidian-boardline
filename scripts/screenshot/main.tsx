// Pictures of the board UI (src/board-ui) on demo boards, outside Obsidian, in Obsidian's default
// theme: the README's screenshot and the community directory's. capture.mjs serves this page and
// saves it as a picture once `window.boardReady` is set.
//   ?scene=notes   notes, a table and a sequence diagram (default: flowchart, mind map, stickies)
//   ?dark          the dark theme        ?noselect   nothing selected
//   ?empty         a blank board, for trying things out by hand or from a script
//   ?mobile        as on phones and tablets (no presenting)

import { createRoot } from 'react-dom/client'
import { BoardScreen, type BoardController, type BoardHost } from '@boardline/board-ui/BoardScreen'
import { createConnector, createShape, isShape, type BoardObject, type ColorKey, type Deco } from '@boardline/core/board/model'
import { docLink, parseLink } from '@boardline/core/board/links'
import { emptyBoardFile, formatBoardFile, parseBoard } from '@boardline/core/board/serialize'
import type { BoardEditor } from '@boardline/core/engine/editor'
import type { WorkspaceStorage } from '@boardline/core/platform/storage'
import { followHostLook, type HostLook } from '@boardline/core/theme/follow'
import '../../src/plugin.css'

declare global {
  interface Window {
    boardReady?: boolean
    boardEditor?: BoardEditor
    boardLook?: HostLook
  }
}

const FLOWCHART = `flowchart TD
  subgraph plan [Plan a feature]
    idea([New idea]) --> sketch[Sketch it on a board]
    sketch --> ok{Looks right?}
    ok -->|Yes| note@{ shape: doc, label: "Write the note" }
    ok -->|No| sketch
    note --> share[(Share with the team)]
  end`

const MINDMAP = `mindmap
  root((Boardline))
    Flowcharts
      Shapes
      Connectors
    Mind maps
    Sequence diagrams
    Tables
    Sticky notes
    Your notes`

/** Colors for the flowchart's shapes, by their text. */
const LOOKS: Record<string, { color: ColorKey; deco: Deco }> = {
  'New idea': { color: 'purple', deco: 'fill' },
  'Looks right?': { color: 'yellow', deco: 'fill' },
  'Write the note': { color: 'blue', deco: 'fill' },
  'Share with the team': { color: 'green', deco: 'fill' },
}

const params = new URLSearchParams(location.search)

/** Notes in the pretend vault, for note cards. */
const NOTES: Record<string, { title: string; text: string }> = {
  'Projects/Kickoff notes.md': {
    title: 'Kickoff notes',
    text: `**Goal:** a first release by Friday.

## Decisions
- Boards live next to the notes
- Charts can come from Mermaid
- Present the plan from the board

## To do
- [x] Sketch the flow
- [x] Gather the open questions
- [ ] Review the task table
- [ ] Present on Monday

> Everything on the board stays in sync with the vault.`,
  },
}

const TASKS = [
  ['Task', 'Owner', 'Status'],
  ['Sketch the flow', 'Mina', 'Done'],
  ['Review the table', 'Jun', 'In progress'],
  ['Present the plan', 'Kim', 'Next'],
]

const SEQUENCE = `sequenceDiagram
  participant U as You
  participant B as Board
  participant V as Vault
  U->>B: Drop a note
  B->>V: Read the note
  V-->>B: Markdown
  B-->>U: A live note card`

const STICKIES: { text: string; color: ColorKey }[] = [
  { text: 'Drag notes and pictures from the vault onto the board', color: 'yellow' },
  { text: 'Present sections as slides with **F5**', color: 'pink' },
  { text: 'Export to PNG, SVG, a note or a canvas', color: 'teal' },
]

const files = new Map<string, string | Uint8Array>()
const storage: WorkspaceStorage = {
  readFile: async (_root, path) => {
    const f = files.get(path)
    if (typeof f !== 'string') throw new Error(`No file ${path}`)
    return f
  },
  writeFileAtomic: async (_root, path, contents) => void files.set(path, contents),
  exists: async (_root, path) => files.has(path),
  listFiles: async () => [],
  removeAppFile: async (_root, path) => void files.delete(path),
  readBytes: async (_root, path) => {
    const f = files.get(path)
    if (!(f instanceof Uint8Array)) throw new Error(`No file ${path}`)
    return f
  },
  writeAsset: async (_root, path, bytes) => void files.set(path, bytes),
}

const host: BoardHost = {
  storage,
  root: '',
  links: { preview: async () => null, image: async () => null },
  storeImage: async () => {
    throw new Error('No pictures in the screenshot')
  },
  openLink: () => {},
  pickLink: async () => null,
  notify: () => {},
  saveExport: async () => false,
  promptText: async () => null,
  readNote: async (link) => {
    const target = parseLink(link)
    const note = target?.kind === 'doc' ? NOTES[target.path] : undefined
    return note && target?.kind === 'doc' ? { path: target.path, title: note.title, text: note.text } : null
  },
  // As the plugin does (?mobile: as on phones and tablets, without presenting).
  setFullscreen: async (on, element) => {
    try {
      if (on) await element.requestFullscreen()
      else if (element.ownerDocument.fullscreenElement) await element.ownerDocument.exitFullscreen()
    } catch {
      // Not allowed here: presenting goes on in the page.
    }
  },
  canPresent: !params.has('mobile'),
}

// As the plugin does: light or dark by the body's class (add ?dark for a dark picture).
if (params.has('dark')) document.body.className = 'theme-dark'
window.boardLook = followHostLook(document)

const doc = parseBoard(formatBoardFile(emptyBoardFile('Boardline')))
const controller: { current: BoardController | null } = { current: null }
createRoot(document.getElementById('mount')!).render(<BoardScreen doc={doc} title="Boardline" host={host} controllerRef={controller} />)

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))

async function compose(ed: BoardEditor): Promise<void> {
  if (params.get('scene') === 'notes') return composeNotes(ed)
  await ed.importMermaid(FLOWCHART, { x: 0, y: 0 })
  await ed.importMermaid(MINDMAP, { x: 700, y: -150 })
  const objects: BoardObject[] = [...doc.objects.values()].map((o) => (isShape(o) && LOOKS[o.text] ? { ...o, ...LOOKS[o.text] } : o))
  let z = doc.maxZ()
  const stickies = STICKIES.map((s, i) => ({ ...createShape('sticky', 380 + i * 240, 220, ++z), text: s.text, color: s.color }))
  ed.replaceAll([...objects, ...stickies], 'Demo board')
  await frame()
  fitBesideTools(ed)
  // A selected sticky note shows the selection bar.
  const selected = [...doc.objects.values()].find((o) => isShape(o) && o.text === STICKIES[1].text)
  if (selected && !params.has('noselect')) ed.revealObject(selected.id)
}

/** A note from the vault as a card, the tasks in a table, and how a note gets onto the board. */
async function composeNotes(ed: BoardEditor): Promise<void> {
  let z = 1
  const card = { ...createShape('note', 0, 0, z++, { w: 400, h: 400 }), link: docLink('Projects/Kickoff notes.md') }
  const table = { ...createShape('table', 520, 0, z++, { w: 480, h: 160 }), cols: [200, 140, 140], cells: TASKS.map((r) => [...r]) }
  const todo = { ...createShape('sticky', 1060, 0, z++), text: 'Tables keep **Markdown** in their cells', color: 'yellow' as ColorKey }
  ed.replaceAll([card, table, todo], 'Demo board')
  await ed.importMermaid(SEQUENCE, { x: 780, y: 520 })
  const line = { ...createConnector({ objectId: card.id, side: 'right' }, { objectId: table.id, side: 'left' }, doc.maxZ() + 1), label: 'tasks' }
  ed.replaceAll([...doc.objects.values(), line], 'Demo board')
  await frame()
  fitBesideTools(ed)
}

/** The whole board in view, clear of the tool bar (left) and the view controls (right). */
function fitBesideTools(ed: BoardEditor): void {
  const LEFT = 96
  const RIGHT = 72
  const width = window.innerWidth
  const height = window.innerHeight
  ed.zoomToFit(false)
  const fit = ed.viewState()
  const center = { x: fit.offsetX + width / fit.zoom / 2, y: fit.offsetY + height / fit.zoom / 2 }
  const zoom = fit.zoom * ((width - LEFT - RIGHT) / width)
  ed.setViewState({ zoom, offsetX: center.x - (LEFT + (width - LEFT - RIGHT) / 2) / zoom, offsetY: center.y - height / 2 / zoom })
}

async function start(): Promise<void> {
  while (!controller.current) await frame()
  const ed = controller.current.editor
  window.boardEditor = ed
  if (!params.has('empty')) await compose(ed)
  // The board draws on the next frames; give the text and grid a moment.
  for (let i = 0; i < 10; i++) await frame()
  window.boardReady = true
}

void start()
