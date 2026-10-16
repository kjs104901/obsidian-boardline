// The board as the user works on it: the canvas, the tool bar, the selection bar, find, icons,
// files, drawing, shortcuts, presenting and version history. The plugin's view passes a
// BoardHost for what comes from Obsidian (files, link picking, dialogs, saving exports, full screen).

import { useCallback, useEffect, useRef, useState } from 'react'
import { mimeOf, type StoredImage } from '@boardline/core/board/assets'
import type { BoardDocument } from '@boardline/core/board/document'
import { webLinkFields, type LinkFetcher, type LinkFields } from '@boardline/core/board/linkFetch'
import { parseLink } from '@boardline/core/board/links'
import { BoardEditor, type EditorStatus } from '@boardline/core/engine/editor'
import type { Point, Rect } from '@boardline/core/engine/geometry'
import type { ViewportState } from '@boardline/core/engine/viewport'
import type { WorkspaceStorage } from '@boardline/core/platform/storage'
import { loadPref, savePref } from '@boardline/core/platform/prefs'
import type { NoteFile } from '@boardline/core/engine/noteCard'
import { THEME_EVENT } from '@boardline/core/theme/events'
import { shortcutKey } from '@boardline/core/engine/keys'
import { FindBar } from './FindBar'
import { HistoryPanel } from './HistoryPanel'
import { SelectionToolbar } from './SelectionToolbar'
import { ShortcutHelp } from './ShortcutHelp'
import { readReadOnly, readSnapSettings, ViewControls, writeReadOnly, writeSnapSettings, type SnapSettings } from './ViewControls'
import { LockIcon } from './icons'
import { ToolRail, type Flyout } from './ToolRail'
import { SlidePanel } from './SlidePanel'
import { boardToCanvas } from '@boardline/core/board/toCanvas'
import { ContextMenu } from './ContextMenu'
import { LaserPointer } from './LaserPointer'
import './board.css'
import { t } from '@boardline/core/i18n'

export type ExportFormat = 'png' | 'svg'

/** What a board needs from the plugin around it. */
export interface BoardHost {
  /** The folder (or vault) the board's pictures and version history live in. */
  storage: WorkspaceStorage
  root: string
  /** Reads web pages for link objects. */
  links: LinkFetcher
  /** Where pasted pictures go. */
  storeImage(image: Blob): Promise<StoredImage>
  /** Follow a link from the board (web page, board or note). */
  openLink(link: string): void
  /** Ask for a link target; null when cancelled. */
  pickLink(request: { title: string; initial?: string }): Promise<{ link: string; title?: string } | null>
  /** Title of a board or note a link points at (for new link objects). */
  linkTitle?(link: string): Promise<string | undefined>
  /**
   * Reads a card's file by its link: a note's text, or a board's or canvas's picture (PNG, in
   * the current theme); null when there is no such file.
   */
  readNote?(link: string): Promise<NoteFile | null>
  /** Save a new note with `markdown` (named after `name`, beside the board) and show it; false when it wasn't made. */
  saveNote?: (name: string, markdown: string) => Promise<boolean>
  /** Save a new canvas (.canvas JSON, named after `name`, beside the board) and show it; absent where there are no canvases. */
  saveCanvas?: (name: string, json: string) => Promise<boolean>
  /** The file of the board with this id (a canvas names files by path), or null. */
  boardFile?: (boardId: string) => Promise<string | null>
  /** Ask for files to put on the board (notes, pictures, boards, canvases): their links, or null. Without it there is no button. */
  pickFiles?(): Promise<string[] | null>
  /** Calls `changed` with the paths of files that changed (null: any may have); returns how to stop. */
  watchFiles?(changed: (paths: string[] | null) => void): () => void
  /** Files being dragged in from Obsidian's file explorer: how to get their links (null when the drag isn't files). */
  draggedFiles?(e: DragEvent): (() => Promise<string[]>) | null
  /** A short message for the user (null clears it). */
  notify(text: string | null): void
  /** Save an exported picture where the user wants it; false when cancelled. */
  saveExport(fileName: string, format: ExportFormat, bytes: Uint8Array): Promise<boolean>
  /** Full screen for presenting. */
  setFullscreen?(on: boolean, element: HTMLElement): Promise<void>
  /** Ask for text (Mermaid import). */
  promptText(request: { title: string; placeholder: string; hint: string; action: string }): Promise<string | null>
  /** Whether keys go to this board now (default: while it has the focus). */
  isActive?(): boolean
}

/** What the view around the board can ask it to do (from its header actions and menus). */
export interface BoardController {
  editor: BoardEditor
  startPresenting(): void
  exportImage(format: ExportFormat): Promise<void>
  importMermaid(): void
  toggleHistory(): void
  openFind(query?: string): void
  /** The selection (or the board) as a new note; absent where the app can't save notes. */
  exportNote?(): Promise<void>
  /** The selection (or the board) as a new Obsidian canvas; absent where the app can't save one. */
  exportCanvas?(): Promise<void>
}

export type BoardMenuEntry = { label: string; run: () => void } | { caption: string } | 'separator'

/** The board's export/import menu, for the view to show as an Obsidian menu. */
export function boardMenu(c: BoardController, opts: { selected: number }): BoardMenuEntry[] {
  return [
    { caption: opts.selected ? t('export.selection') : t('export.wholeBoard') },
    { label: t('export.png'), run: () => void c.exportImage('png') },
    { label: t('export.svg'), run: () => void c.exportImage('svg') },
    ...(c.exportNote ? [{ label: t('export.note'), run: () => void c.exportNote?.() }] : []),
    ...(c.exportCanvas ? [{ label: t('export.canvas'), run: () => void c.exportCanvas?.() }] : []),
    'separator',
    { caption: t('export.import') },
    { label: t('mermaid.importMenu'), run: () => c.importMermaid() },
  ]
}

interface Props {
  doc: BoardDocument
  /** The board's name (exports). */
  title: string
  host: BoardHost
  /** Save now and keep a version (the view keeps version history); without it there is no history panel. */
  preserveCurrent?: () => Promise<void>
  onStatus?: (status: EditorStatus) => void
  /** Filled with the board's controller while it is mounted. */
  controllerRef?: { current: BoardController | null }
  /** Show this object or view once the board is open (following a board link). */
  revealRequest?: { objectId?: string; view?: { x: number; y: number; zoom: number }; nonce: number } | null
}

export function BoardScreen({ doc, title, host, preserveCurrent, onStatus, controllerRef, revealRequest }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasHostRef = useRef<HTMLDivElement>(null)
  const [editor, setEditor] = useState<BoardEditor | null>(null)
  const editorRef = useRef<BoardEditor | null>(null)
  const [status, setStatus] = useState<EditorStatus | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  /** The tool bar's open flyout: shapes, the icon library (X). */
  const [flyout, setFlyout] = useState<Flyout>(null)
  /** Shortcut help (Shift+/). */
  const [helpOpen, setHelpOpen] = useState(false)
  /** The presenting order panel (from the view controls). */
  const [slidesOpen, setSlidesOpen] = useState(false)
  /** Presenting with the laser pointer (L). */
  const [laser, setLaser] = useState(false)
  /** The right-click menu: where, and whether it opened on an object. */
  const [contextMenu, setContextMenu] = useState<{ at: Point; board: Point; onObject: boolean } | null>(null)
  /** A link is being picked (the link button shows it). */
  const [linking, setLinking] = useState(false)
  /** Presenting: sections as slides, full screen. */
  const [presenting, setPresenting] = useState<{ slides: Rect[]; index: number; before: ViewportState } | null>(null)
  /** Open find bar; `key` remounts it (and refocuses) on every Ctrl+F. */
  const [find, setFind] = useState<{ query: string; key: number; replace?: boolean } | null>(null)
  /** Board settings (the gear): snapping for every board, read-only for this one. */
  const [snap, setSnap] = useState<SnapSettings>(readSnapSettings)
  const [readOnly, setReadOnly] = useState(() => readReadOnly(doc.meta.id))
  const readOnlyRef = useRef(readOnly)
  readOnlyRef.current = readOnly

  // Callbacks read through refs, so the editor and window listeners always call the current ones.
  const hostRef = useRef(host)
  hostRef.current = host
  const callbacks = useRef({ onStatus })
  callbacks.current = { onStatus }

  /** Whether keys are for this board: the host decides, else while focus is inside it. */
  const isActive = () => {
    if (hostRef.current.isActive) return hostRef.current.isActive()
    const root = rootRef.current
    if (!root) return false
    const d = root.ownerDocument
    return !d.activeElement || d.activeElement === d.body || root.contains(d.activeElement)
  }
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive
  const win = () => rootRef.current?.ownerDocument.defaultView ?? window

  // Mount the editor for this document.
  useEffect(() => {
    const el = canvasHostRef.current
    if (!el) return
    const viewportKey = `boardline.viewport.${doc.meta.id}`
    const ed = new BoardEditor(el, doc, {
      initialViewport: readViewport(viewportKey),
      loadAsset: async (src) => new Blob([(await hostRef.current.storage.readBytes(hostRef.current.root, src)) as BlobPart], { type: mimeOf(src) }),
      storeImage: (file) => hostRef.current.storeImage(file),
      onStatus: (s) => {
        setStatus(s)
        callbacks.current.onStatus?.(s)
      },
      onOpenLink: (link) => hostRef.current.openLink(link),
      readNote: (link) => hostRef.current.readNote?.(link) ?? Promise.resolve(null),
      draggedFiles: (e) => hostRef.current.draggedFiles?.(e) ?? null,
      onPasteLink: (link, at) => void addLinkRef.current(link, undefined, at),
      onNotice: (text) => hostRef.current.notify(text),
      onContextMenu: (at, board, onObject) => {
        setFlyout(null)
        setContextMenu({ at, board, onObject })
      },
      onViewportChange: (s) => debounce(viewportKey, () => writeViewport(viewportKey, s), 300),
      isActive: () => isActiveRef.current(),
    })
    ed.setSnapping(readSnapSettings())
    const ro = readReadOnly(doc.meta.id)
    ed.setReadOnly(ro)
    setReadOnly(ro)
    editorRef.current = ed
    setEditor(ed)
    // First time this board is opened here: show all of it.
    if (!readViewport(viewportKey) && doc.objects.size > 0) window.requestAnimationFrame(() => ed.zoomToFit(false))
    return () => {
      ed.destroy()
      if (editorRef.current === ed) editorRef.current = null
      setEditor(null)
    }
  }, [doc])

  const changeSnap = (next: SnapSettings) => {
    setSnap(next)
    writeSnapSettings(next)
    editorRef.current?.setSnapping(next)
  }
  const changeReadOnly = (on: boolean) => {
    setReadOnly(on)
    writeReadOnly(doc.meta.id, on)
    editorRef.current?.setReadOnly(on)
    if (on) setFlyout(null)
  }

  // Following a board link into this board: select the object or show the saved view.
  useEffect(() => {
    if (!revealRequest || !editor) return
    const t = window.setTimeout(() => editor.showTarget(revealRequest), 60)
    return () => window.clearTimeout(t)
  }, [revealRequest?.nonce, editor])

  /** A link object for `link` (web pages get their title, icon and preview first). */
  const addLink = async (link: string, linkTitle?: string, at?: { x: number; y: number }, replaceId?: string) => {
    const ed = editorRef.current
    if (!ed) return
    const h = hostRef.current
    let fields: LinkFields
    const target = parseLink(link)
    if (target?.kind === 'board') {
      fields = { link, text: linkTitle ?? (await h.linkTitle?.(link)) ?? t('common.board') }
    } else if (target?.kind === 'doc') {
      fields = { link, text: linkTitle ?? target.path.slice(target.path.lastIndexOf('/') + 1).replace(/\.md$/i, '') }
    } else {
      h.notify(t('link.fetching'))
      const read = await webLinkFields(h.links, (image) => h.storeImage(image), link)
      fields = read.fields
      // Some sites turn away anything that isn't a browser; say so rather than fail quietly.
      h.notify(read.found ? null : t('link.fetchFailed'))
    }
    if (replaceId) ed.updateLinkObject(replaceId, fields)
    else ed.insertLinkObject(fields, at)
  }
  const addLinkRef = useRef(addLink)
  addLinkRef.current = addLink

  /** Ask the plugin for a link: a new link object, a link on the selected shapes, or another target. */
  const requestLink = async (mode: 'create' | 'shape' | 'edit', id?: string, initial?: string) => {
    setLinking(true)
    const title = mode === 'shape' ? t('link.setOnShape') : mode === 'edit' ? t('link.change') : t('link.add')
    const picked = await hostRef.current.pickLink({ title, initial }).finally(() => setLinking(false))
    editorRef.current?.focus()
    if (!picked) return
    if (mode === 'shape') editorRef.current?.setLink(picked.link)
    else await addLink(picked.link, picked.title, undefined, mode === 'edit' ? id : undefined)
  }
  const requestLinkRef = useRef(requestLink)
  requestLinkRef.current = requestLink

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  const requestFiles = async (at?: Point) => {
    const links = await hostRef.current.pickFiles?.()
    editorRef.current?.focus()
    if (links?.length) await editorRef.current?.addFiles(links, at)
  }

  // Cards follow their files, and draw boards and canvases again in a new theme.
  useEffect(() => {
    if (!editor) return
    const stop = host.watchFiles?.((paths) => editor.refreshNotes(paths ?? undefined))
    const onTheme = () => editor.refreshNotes()
    window.addEventListener(THEME_EVENT, onTheme)
    return () => {
      stop?.()
      window.removeEventListener(THEME_EVENT, onTheme)
    }
  }, [editor, host])

  const importMermaid = async () => {
    const text = await hostRef.current.promptText({
      title: t('mermaid.importTitle'),
      placeholder: t('mermaid.placeholder'),
      hint: t('mermaid.hint'),
      action: t('export.import'),
    })
    const ed = editorRef.current
    if (!text || !ed) return
    if (await ed.importMermaid(text)) ed.focus()
    else hostRef.current.notify(t('mermaid.unsupported'))
  }

  const exportImage = async (format: ExportFormat) => {
    const ed = editorRef.current
    const h = hostRef.current
    if (!ed) return
    try {
      const bytes = await ed.exportImage(format)
      if (!bytes) {
        h.notify(t('export.nothing'))
        return
      }
      if (await h.saveExport(`${title}.${format}`, format, bytes)) h.notify(t('export.done', format.toUpperCase()))
    } catch (err) {
      h.notify(t('export.failed', err instanceof Error ? err.message : String(err)))
    }
  }

  const startPresenting = (from = 0) => {
    const ed = editorRef.current
    if (!ed) return
    const slides = ed.slides()
    if (slides.length === 0) {
      hostRef.current.notify(t('present.nothing'))
      return
    }
    setFind(null)
    setFlyout(null)
    setSlidesOpen(false)
    const before = ed.viewState()
    ed.setPresenting(true)
    if (rootRef.current) void hostRef.current.setFullscreen?.(true, rootRef.current)
    setPresenting({ slides, index: Math.min(from, slides.length - 1), before })
  }
  const startPresentingRef = useRef(startPresenting)
  startPresentingRef.current = startPresenting
  const stopPresenting = () => {
    const ed = editorRef.current
    const before = presenting?.before
    if (rootRef.current) void hostRef.current.setFullscreen?.(false, rootRef.current)
    setPresenting(null)
    if (!ed) return
    ed.setPresenting(false)
    // Back to where the board was, once the window has its normal size again.
    window.setTimeout(() => before && ed.setViewState(before), 300)
    ed.focus()
  }
  const go = (delta: number) => setPresenting((p) => (p ? { ...p, index: Math.max(0, Math.min(p.slides.length - 1, p.index + delta)) } : p))

  // The view's header actions and menus reach the board through this.
  useEffect(() => {
    if (!controllerRef || !editor) return
    controllerRef.current = {
      editor,
      startPresenting: () => startPresentingRef.current(),
      exportImage: (f) => exportRef.current(f),
      importMermaid: () => void mermaidRef.current(),
      toggleHistory: () => setHistoryOpen((v) => !v),
      openFind: (query) => setFind((f) => ({ query: query ?? f?.query ?? '', key: Date.now() })),
      ...(hostRef.current.saveNote ? { exportNote: () => exportNoteRef.current() } : {}),
      ...(hostRef.current.saveCanvas ? { exportCanvas: () => exportCanvasRef.current() } : {}),
    }
    return () => {
      if (controllerRef.current?.editor === editor) controllerRef.current = null
    }
  }, [editor, controllerRef])
  const exportRef = useRef(exportImage)
  exportRef.current = exportImage
  const mermaidRef = useRef(importMermaid)
  mermaidRef.current = importMermaid

  /** The selection (or the whole board) as a new note beside the board. */
  const exportNote = async () => {
    const ed = editorRef.current
    const save = hostRef.current.saveNote
    const markdown = ed?.exportMarkdown()
    if (!ed || !save) return
    if (!markdown?.trim()) {
      hostRef.current.notify(t('export.noteEmpty'))
      return
    }
    const name = t('export.noteName', title).replace(/[\\/:*?"<>|#^[\]]/g, ' ').trim()
    await save(name, markdown)
  }
  const exportNoteRef = useRef(exportNote)
  exportNoteRef.current = exportNote

  /** The selection (or the whole board) as a new canvas beside the board. */
  const exportCanvas = async () => {
    const ed = editorRef.current
    const h = hostRef.current
    const scene = ed?.exportScene()
    if (!ed || !h.saveCanvas) return
    if (!scene) {
      h.notify(t('export.canvasEmpty'))
      return
    }
    const { json, skipped } = await boardToCanvas(scene.objects, scene.mindmap, h.boardFile)
    const name = title.replace(/[\\/:*?"<>|#^[\]]/g, ' ').trim() || t('common.board')
    if ((await h.saveCanvas(name, json)) && skipped > 0) h.notify(t('export.canvasSkipped', skipped))
  }
  const exportCanvasRef = useRef(exportCanvas)
  exportCanvasRef.current = exportCanvas

  // Board shortcuts that open panels (the editor handles the drawing ones).
  useEffect(() => {
    const w = win()
    const onKey = (e: KeyboardEvent) => {
      if (!isActiveRef.current()) return
      const t = e.target as HTMLElement | null
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      const mod = e.ctrlKey || e.metaKey
      const key = shortcutKey(e)
      if (mod && !e.altKey && !e.shiftKey && (key === 'f' || key === 'h')) {
        e.preventDefault()
        setFind((f) => ({ query: f?.query ?? '', key: Date.now(), replace: key === 'h' }))
        return
      }
      if (typing || mod || e.altKey) return
      if (readOnlyRef.current && ['k', 'x'].includes(key)) return
      if (e.key === 'F5') {
        e.preventDefault()
        startPresentingRef.current()
      } else if (key === 'k') {
        e.preventDefault()
        void requestLinkRef.current('create')
      } else if (key === 'x') {
        // Keep the X out of the search box that opens with the panel.
        e.preventDefault()
        setFlyout((v) => (v === 'icons' ? null : 'icons'))
      } else if (e.key === '?') setHelpOpen((v) => !v)
      else if (e.key === 'Escape') {
        setHelpOpen(false)
        setFlyout(null)
        setSlidesOpen(false)
      }
    }
    w.addEventListener('keydown', onKey)
    return () => w.removeEventListener('keydown', onKey)
  }, [])

  // Show the current slide (after going full screen); keep it fitted on resize.
  useEffect(() => {
    if (!presenting) return
    const ed = editorRef.current
    const slide = presenting.slides[presenting.index]
    const t = window.setTimeout(() => ed?.flyTo(slide), presenting.index === 0 ? 300 : 0)
    const onResize = () => ed?.flyTo(slide, 32, 0)
    const w = win()
    w.addEventListener('resize', onResize)
    return () => {
      window.clearTimeout(t)
      w.removeEventListener('resize', onResize)
    }
  }, [presenting?.index, presenting?.slides])
  useEffect(() => {
    if (!presenting) return
    const onKey = (e: KeyboardEvent) => {
      const next = ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)
      const prev = ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)
      if (next) go(1)
      else if (prev) go(-1)
      else if (e.key === 'Home') go(-Infinity)
      else if (e.key === 'End') go(Infinity)
      else if (e.key === 'Escape' || e.key === 'F5') stopPresenting()
      else if (shortcutKey(e) === 'l' && !e.ctrlKey && !e.metaKey && !e.altKey) setLaser((v) => !v)
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    // Capture, so the board's own shortcuts never see these keys.
    const w = win()
    w.addEventListener('keydown', onKey, true)
    return () => w.removeEventListener('keydown', onKey, true)
  }, [!!presenting])

  const activeTool = status?.tool
  return (
    <div className={`bl-root${presenting ? ' presenting' : ''}`} ref={rootRef}>
      {presenting && (
        <div
          className={'bl-present-overlay' + (laser ? ' laser' : '')}
          onClick={() => go(1)}
          onContextMenu={(e) => {
            e.preventDefault()
            go(-1)
          }}
          onWheel={(e) => e.preventDefault()}
        >
          {laser && <LaserPointer />}
          <div className="bl-present-counter">
            {presenting.index + 1} / {presenting.slides.length}
            <span> {t('present.hint')} </span>
            <button
              className={laser ? 'active' : ''}
              onClick={(e) => {
                e.stopPropagation()
                setLaser((v) => !v)
              }}
            >
              {t('present.laser')}
            </button>
          </div>
        </div>
      )}
      <div className="bl-board-host" ref={canvasHostRef} onPointerDownCapture={() => setFlyout(null)} />
      {editor && status && (
        <SelectionToolbar
          editor={editor}
          status={status}
          onNotice={(text) => host.notify(text)}
          onOpenLink={(link) => host.openLink(link)}
          onLinkDialog={(mode, id, initial) => void requestLink(mode, id, initial)}
          onExportNote={host.saveNote ? () => void exportNote() : undefined}
        />
      )}
      {editor && historyOpen && preserveCurrent && (
        <HistoryPanel storage={host.storage} root={host.root} boardId={doc.meta.id} editor={editor} preserveCurrent={preserveCurrent} onClose={() => setHistoryOpen(false)} />
      )}
      {editor && find && (
        <FindBar
          key={find.key}
          editor={editor}
          initialQuery={find.query}
          replace={find.replace}
          readOnly={readOnly}
          onNotice={(text) => host.notify(text)}
          onQueryChange={(query) => setFind((f) => (f ? { ...f, query } : f))}
          onClose={() => {
            setFind(null)
            editor.focus()
          }}
        />
      )}
      {readOnly ? (
        <button className="bl-readonly-badge" title={t('readOnly.off')} onClick={() => changeReadOnly(false)}>
          <LockIcon />
          {t('readOnly')}
        </button>
      ) : (
        <ToolRail
          editor={editor}
          tool={activeTool}
          flyout={flyout}
          onFlyout={setFlyout}
          linking={linking}
          onLink={() => void requestLink('create')}
          onAddFile={host.pickFiles ? () => void requestFiles() : undefined}
        />
      )}
      {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
      {editor && (
        <ViewControls
          editor={editor}
          status={status}
          snap={snap}
          onSnap={changeSnap}
          readOnly={readOnly}
          onReadOnly={changeReadOnly}
          helpOpen={helpOpen}
          onHelp={() => setHelpOpen(!helpOpen)}
          slidesOpen={slidesOpen}
          onSlides={() => setSlidesOpen(!slidesOpen)}
        />
      )}
      {editor && contextMenu && (
        <ContextMenu
          editor={editor}
          status={status}
          at={contextMenu.at}
          board={contextMenu.board}
          onObject={contextMenu.onObject}
          readOnly={readOnly}
          onClose={closeContextMenu}
          onNotice={(text) => host.notify(text)}
          onOpenLink={(link) => host.openLink(link)}
          onLinkDialog={(mode, id, initial) => void requestLink(mode, id, initial)}
          onExportNote={host.saveNote ? () => void exportNote() : undefined}
          onAddFile={host.pickFiles ? (at) => void requestFiles(at) : undefined}
          onPresent={(from) => startPresenting(from)}
          onImportMermaid={() => void importMermaid()}
        />
      )}
      {editor && slidesOpen && (
        <SlidePanel editor={editor} status={status} readOnly={readOnly} onPresent={(from) => startPresenting(from)} onClose={() => setSlidesOpen(false)} />
      )}
    </div>
  )
}

function readViewport(key: string): ViewportState | undefined {
  const v = loadPref(key) as Partial<ViewportState> | null
  const ok = v && [v.offsetX, v.offsetY, v.zoom].every((n) => typeof n === 'number' && Number.isFinite(n))
  return ok ? (v as ViewportState) : undefined
}

function writeViewport(key: string, s: ViewportState): void {
  savePref(key, s)
}

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
function debounce(key: string, fn: () => void, ms: number): void {
  const t = debounceTimers.get(key)
  if (t) window.clearTimeout(t)
  debounceTimers.set(key, window.setTimeout(fn, ms))
}
