// The README's screenshot: the board UI (src/board-ui) on a demo board, outside Obsidian, in
// Obsidian's default light theme (dark with ?dark). capture.mjs serves this page and saves it as a picture once
// `window.boardReady` is set.

import { createRoot } from 'react-dom/client'
import { BoardScreen, type BoardController, type BoardHost } from '@boardline/board-ui/BoardScreen'
import { createShape, isShape, type BoardObject, type ColorKey, type Deco } from '@boardline/core/board/model'
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
}

// As the plugin does: light or dark by the body's class (add ?dark for a dark picture).
if (new URLSearchParams(location.search).has('dark')) document.body.className = 'theme-dark'
window.boardLook = followHostLook(document)

const doc = parseBoard(formatBoardFile(emptyBoardFile('Boardline')))
const controller: { current: BoardController | null } = { current: null }
createRoot(document.getElementById('mount')!).render(<BoardScreen doc={doc} title="Boardline" host={host} controllerRef={controller} />)

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))

async function compose(ed: BoardEditor): Promise<void> {
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
  if (selected) ed.revealObject(selected.id)
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
  await compose(ed)
  // The board draws on the next frames; give the text and grid a moment.
  for (let i = 0; i < 10; i++) await frame()
  window.boardReady = true
}

void start()
