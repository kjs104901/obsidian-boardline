// A .board file open in Obsidian: the shared BoardScreen in a TextFileView. Obsidian loads and
// saves the file (requestSave after every change); the view adds version history, the header
// actions and Obsidian's own dialogs and menus.

import { Menu, Notice, Platform, Scope, TFile, TextFileView, normalizePath, type TAbstractFile, type WorkspaceLeaf } from 'obsidian'
import { createRoot, type Root } from 'react-dom/client'
import { BoardScreen, boardMenu, type BoardController, type BoardHost } from '@boardline/board-ui/BoardScreen'
import { storeImage } from '@boardline/core/board/assets'
import { boardPicturePath, renderBoardPng, renderCanvasPng } from '@boardline/core/board/boardFiles'
import type { BoardDocument } from '@boardline/core/board/document'
import { afterSave, freshClock, saveSnapshot } from '@boardline/core/board/history'
import { parseLink } from '@boardline/core/board/links'
import { relinkObjects } from '@boardline/core/board/relink'
import { themeMode } from '@boardline/core/theme/palette'
import { parseBoard, serialize, titleFromFileName } from '@boardline/core/board/serialize'
import type { EditorStatus } from '@boardline/core/engine/editor'
import { LinkPicker, TextPrompt, fileLink } from './dialogs'
import { obsidianLinkFetcher } from './linkFetcher'
import type BoardlinePlugin from './main'
import { t } from '@boardline/core/i18n'

export const VIEW_TYPE_BOARD = 'boardline-board'

type Reveal = { objectId?: string; view?: { x: number; y: number; zoom: number }; nonce: number }

export class BoardFileView extends TextFileView {
  private reactRoot: Root | null = null
  private doc: BoardDocument | null = null
  private controller: { current: BoardController | null } = { current: null }
  private status: EditorStatus | null = null
  private unsubscribe: (() => void) | null = null
  /** The file text as last loaded or saved (Obsidian's echo of our own write is ignored). */
  private lastText = ''
  private applying = false
  /** Version history (core/board/history.ts): as opened, then at most one per interval. */
  private clock = freshClock()
  private openedText = ''
  private reveal: Reveal | null = null

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: BoardlinePlugin,
  ) {
    super(leaf)
    // While the board has the focus, its keys win over Obsidian's (Ctrl+G is the graph view
    // elsewhere, Ctrl+0 / = / - the app zoom, Ctrl+B / I bold and italic in notes, Ctrl+F / H the note
    // search and replace, Ctrl+Enter and Alt+Enter links): the board handles them itself.
    this.scope = new Scope(this.app.scope)
    for (const key of ['g', 'G', '0', '=', '-', 'd', 'l', 'e', 'b', 'i', 'f', 'h', 'Enter']) this.scope.register(['Mod'], key, () => true)
    this.scope.register(['Mod', 'Shift'], 'g', () => true)
    this.scope.register(['Mod', 'Shift'], '+', () => true)
    this.scope.register(['Alt'], 'Enter', () => true)
  }

  getViewType(): string {
    return VIEW_TYPE_BOARD
  }

  getDisplayText(): string {
    return this.file ? titleFromFileName(this.file.name) : t('common.board')
  }

  getIcon(): string {
    return 'layout-dashboard'
  }

  onload(): void {
    super.onload()
    this.addAction('download', t('view.exportImport'), (evt) => this.showBoardMenu(evt))
    this.addAction('history', t('history.title'), () => this.controller.current?.toggleHistory())
    // Presenting ends with Esc: not on phones and tablets, which have none.
    if (!Platform.isMobile) this.addAction('presentation', t('view.presentKey'), () => this.controller.current?.startPresenting())
    this.contentEl.addClass('bl-view')
  }

  onPaneMenu(menu: Menu, source: string): void {
    super.onPaneMenu(menu, source)
    this.addBoardItems(menu)
  }

  private addBoardItems(menu: Menu): void {
    const c = this.controller.current
    if (!c) return
    for (const entry of boardMenu(c, { selected: this.status?.selected.length ?? 0 })) {
      if (entry === 'separator') menu.addSeparator()
      else if ('caption' in entry) menu.addItem((i) => i.setTitle(entry.caption).setDisabled(true))
      else menu.addItem((i) => i.setTitle(entry.label).onClick(entry.run))
    }
  }

  private showBoardMenu(evt: MouseEvent): void {
    const menu = new Menu()
    this.addBoardItems(menu)
    menu.showAtMouseEvent(evt)
  }

  /** Show an object or a saved view (following a board link). */
  showTarget(target: Omit<Reveal, 'nonce'>): void {
    this.reveal = { ...target, nonce: Date.now() }
    this.render()
  }

  /**
   * A file or folder moved from `from` to `to`: this board's links into it follow (one undoable
   * step, saved as usual). False when no board is open here to take the change.
   */
  relink(from: string, to: string): boolean {
    const editor = this.controller.current?.editor
    if (!this.doc || !editor) return false
    const changed = relinkObjects(this.doc.ordered(), from, to)
    if (changed.length) editor.updateObjects(changed, t('undo.relink'))
    return true
  }

  getViewData(): string {
    if (!this.doc) return this.data
    this.lastText = serialize(this.doc)
    return this.lastText
  }

  setViewData(data: string, clear: boolean): void {
    if (!clear && this.doc && data === this.lastText) return
    const editor = this.controller.current?.editor
    if (!clear && this.doc && editor) {
      // Changed elsewhere (sync, another device): one undoable step that isn't saved back.
      try {
        const next = parseBoard(data)
        this.applying = true
        editor.replaceAll(next.ordered(), t('undo.external'))
        this.doc.meta.rev = next.meta.rev
        this.doc.meta.thumbnail = next.meta.thumbnail
        this.doc.meta.slides = next.meta.slides
        this.lastText = data
      } catch {
        // Half-synced file: the next change event brings the rest.
      } finally {
        this.applying = false
      }
      return
    }
    this.openBoard(data)
  }

  clear(): void {
    this.closeBoard()
  }

  private openBoard(data: string): void {
    this.closeBoard()
    let doc: BoardDocument
    try {
      doc = parseBoard(data)
    } catch (e) {
      this.contentEl.empty()
      this.contentEl.createDiv({ cls: 'bl-load-error', text: t('board.cantOpen', e instanceof Error ? e.message : String(e)) })
      return
    }
    if (this.file) doc.meta.title = titleFromFileName(this.file.name)
    this.doc = doc
    this.lastText = data
    this.openedText = data
    this.clock = freshClock()
    this.unsubscribe = doc.subscribe(() => {
      if (this.applying) return
      doc.meta.rev += 1
      this.requestSave()
    })
    this.contentEl.empty()
    this.reactRoot = createRoot(this.contentEl.createDiv({ cls: 'bl-mount' }))
    this.render()
  }

  private closeBoard(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.reactRoot?.unmount()
    this.reactRoot = null
    this.doc = null
    this.controller.current = null
  }

  async onUnloadFile(file: Parameters<TextFileView['onUnloadFile']>[0]): Promise<void> {
    const doc = this.doc
    await super.onUnloadFile(file)
    // Keep the state the board was left in.
    if (doc && this.clock.dirty) await this.snapshot(doc.meta.id, this.lastText)
  }

  async save(clear?: boolean): Promise<void> {
    await super.save(clear)
    const doc = this.doc
    if (!doc) return
    const next = afterSave(this.clock, Date.now())
    this.clock = next.clock
    if (next.take === 'base' && this.openedText) await this.snapshot(doc.meta.id, this.openedText)
    if (next.take === 'current') await this.snapshot(doc.meta.id, this.lastText)
    void this.writePicture()
  }

  private async snapshot(boardId: string, text: string): Promise<void> {
    try {
      await saveSnapshot(this.plugin.storage, '', boardId, text)
    } catch (e) {
      console.error(t('history.saveFailed'), e)
    }
  }

  /**
   * X.board.png next to the board, for places that can't draw boards (other apps, notes with the
   * older ![[X.board.png]] embed): kept current when it exists, made when the setting asks.
   */
  private async writePicture(): Promise<void> {
    const editor = this.controller.current?.editor
    if (!editor || !this.file) return
    const picture = boardPicturePath(this.file.path)
    if (!this.plugin.settings.keepPicture && !(await this.plugin.storage.exists('', picture))) return
    const bytes = await editor.boardPicture()
    if (bytes) await this.plugin.storage.writeAsset('', picture, bytes)
  }

  private host(): BoardHost {
    const app = this.app
    const plugin = this.plugin
    return {
      storage: plugin.storage,
      root: '',
      links: obsidianLinkFetcher,
      storeImage: async (image) => storeImage(plugin.storage, '', image, await plugin.attachmentFolder(this.file?.path ?? '')),
      openLink: (link) => void plugin.openLink(link, this.file?.path ?? ''),
      pickLink: (request) => new Promise((resolve) => new LinkPicker(app, request.title, request.initial, resolve).open()),
      // Cards: a note's text; another board or a canvas drawn in the current theme.
      readNote: async (link) => {
        const target = parseLink(link)
        if (target?.kind === 'board') {
          const board = await plugin.findBoard(target.boardId)
          if (!board) return null
          const png = await renderBoardPng(plugin.storage, '', board.path, themeMode(), 1.5)
          return { path: board.path, title: titleFromFileName(board.name), ...(png ? { image: png } : {}) }
        }
        const file = plugin.noteFile(link, this.file?.path ?? '')
        if (!file) return null
        if (file.extension === 'canvas') {
          const png = await renderCanvasPng(plugin.storage, '', file.path, themeMode(), 1.5)
          return { path: file.path, title: file.basename, ...(png ? { image: png } : {}) }
        }
        return { path: file.path, title: file.basename, text: await app.vault.cachedRead(file) }
      },
      // A note beside the board that links back to it, opened to the right.
      saveNote: async (name, markdown) => {
        const folder = this.file?.parent?.path ?? '/'
        const base = normalizePath(folder === '/' ? name : `${folder}/${name}`)
        let path = `${base}.md`
        for (let i = 2; app.vault.getAbstractFileByPath(path); i++) path = `${base} ${i}.md`
        const source = this.file ? t('export.noteSource', this.file.path, this.file.basename) : ''
        const note = await app.vault.create(path, source + markdown)
        await app.workspace.getLeaf('split', 'vertical').openFile(note)
        return true
      },
      saveCanvas: async (name, json) => {
        const folder = this.file?.parent?.path ?? '/'
        const base = normalizePath(folder === '/' ? name : `${folder}/${name}`)
        let path = `${base}.canvas`
        for (let i = 2; app.vault.getAbstractFileByPath(path); i++) path = `${base} ${i}.canvas`
        const canvas = await app.vault.create(path, json)
        await app.workspace.getLeaf('split', 'vertical').openFile(canvas)
        return true
      },
      boardFile: async (id) => (await plugin.findBoard(id))?.path ?? null,
      pickFiles: () => new Promise((resolve) => new LinkPicker(app, t('file.add'), undefined, (pick) => resolve(pick ? [pick.link] : null), true).open()),
      watchFiles: (changed) => {
        // Edits arrive keystroke by keystroke: redraw once they settle.
        let timer = 0
        const paths = new Set<string>()
        const soon = (file: TAbstractFile, oldPath?: string) => {
          paths.add(file.path)
          if (oldPath) paths.add(oldPath)
          window.clearTimeout(timer)
          timer = window.setTimeout(() => {
            changed([...paths])
            paths.clear()
          }, 300)
        }
        const refs = [app.vault.on('modify', soon), app.vault.on('rename', soon), app.vault.on('delete', soon), app.vault.on('create', soon)]
        return () => {
          window.clearTimeout(timer)
          for (const r of refs) app.vault.offref(r)
        }
      },
      // Files dragged from the file explorer: notes, boards and canvases as cards, pictures as images.
      draggedFiles: () => {
        const drag = (app as unknown as { dragManager?: { draggable?: { type?: string; file?: TAbstractFile; files?: TAbstractFile[] } | null } }).dragManager?.draggable
        const dragged = drag?.type === 'file' && drag.file ? [drag.file] : drag?.type === 'files' ? (drag.files ?? []) : []
        const files = dragged.filter((f): f is TFile => f instanceof TFile)
        if (files.length === 0) return null
        return async () => (await Promise.all(files.map((f) => fileLink(app, f)))).filter((l): l is string => l !== null)
      },
      linkTitle: async (link) => {
        const target = parseLink(link)
        if (target?.kind !== 'board') return undefined
        const file = await plugin.findBoard(target.boardId)
        return file ? titleFromFileName(file.name) : undefined
      },
      notify: (text) => {
        if (text) new Notice(text)
      },
      saveExport: async (name, _format, bytes) => {
        const path = await app.fileManager.getAvailablePathForAttachment(name, this.file?.path ?? '')
        await plugin.storage.writeAsset('', path, bytes)
        new Notice(t('export.savedTo', path))
        return false
      },
      setFullscreen: async (on, element) => {
        try {
          if (on) await element.requestFullscreen()
          else if (element.ownerDocument.fullscreenElement) await element.ownerDocument.exitFullscreen()
        } catch {
          // Not every platform allows it (mobile); presenting still works in the pane.
        }
      },
      canPresent: !Platform.isMobile,
      promptText: (request) => new Promise((resolve) => new TextPrompt(app, request, resolve).open()),
      isActive: () => app.workspace.getActiveViewOfType(BoardFileView) === this,
    }
  }

  private render(): void {
    const doc = this.doc
    if (!this.reactRoot || !doc) return
    this.reactRoot.render(
      <BoardScreen
        doc={doc}
        title={this.getDisplayText()}
        host={this.host()}
        controllerRef={this.controller}
        revealRequest={this.reveal}
        onStatus={(s) => (this.status = s)}
        preserveCurrent={async () => {
          await this.save()
          await this.snapshot(doc.meta.id, this.lastText)
          this.clock = { ...this.clock, dirty: false }
        }}
      />,
    )
  }
}
