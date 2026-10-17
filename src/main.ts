// Boardline for Obsidian: whiteboards (.board files) inside the vault, drawn by the board
// engine (src/core) and the board UI (src/board-ui).

import { Notice, Platform, Plugin, TFile, TFolder, getLanguage, normalizePath, type App, type Vault } from 'obsidian'
import { parseLink } from '@boardline/core/board/links'
import { boardFileName, emptyBoardFile, formatBoardFile, parseBoard, serialize, titleFromFileName } from '@boardline/core/board/serialize'
import { updateOp } from '@boardline/core/board/document'
import { mayLinkTo, relinkAll, type Move } from '@boardline/core/board/relink'
import { followHostLook } from '@boardline/core/theme/follow'
import type { BoardController } from '@boardline/board-ui/BoardScreen'
import { BoardFileView, VIEW_TYPE_BOARD } from './BoardFileView'
import { boardIdOf, confirmRelink } from './dialogs'
import { clearEmbedCache, registerBoardEmbeds } from './embeds'
import { BoardlineSettingTab, DEFAULT_SETTINGS, type BoardlineSettings } from './settings'
import { VaultStorage } from './vaultStorage'
import { setLanguage, t } from '@boardline/core/i18n'
import { setPrefsStore } from '@boardline/core/platform/prefs'

/** Moves this close together (ms) are taken as one: a folder, then each file in it. */
const MOVES_TOGETHER_MS = 100

/**
 * Obsidian's "Automatically update internal links" (Files and links). The settings API reads it
 * with vault.getConfig (see SettingTab.getControlValue), which the typings leave out; without it,
 * ask (Obsidian's default is off).
 */
function alwaysUpdateLinks(app: App): boolean {
  const vault: Vault & { getConfig?: (key: string) => unknown } = app.vault
  return vault.getConfig?.('alwaysUpdateLinks') === true
}

export default class BoardlinePlugin extends Plugin {
  settings: BoardlineSettings = { ...DEFAULT_SETTINGS }
  storage!: VaultStorage
  /** Board ids → files, filled on demand (board links name boards by id). */
  private boardIds = new Map<string, string>()

  async onload(): Promise<void> {
    // Obsidian's language, before any text is made (Obsidian restarts when it changes).
    setLanguage(getLanguage())
    // Recent colors, last tools, each board's view: per device, kept for this vault.
    setPrefsStore({
      load: (key): unknown => this.app.loadLocalStorage(key),
      save: (key, value) => this.app.saveLocalStorage(key, value),
    })
    await this.loadSettings()
    this.storage = new VaultStorage(this.app)
    this.followObsidianLook()

    this.registerView(VIEW_TYPE_BOARD, (leaf) => new BoardFileView(leaf, this))
    this.registerExtensions(['board'], VIEW_TYPE_BOARD)
    registerBoardEmbeds(this)

    this.addRibbonIcon('layout-dashboard', t('board.newName'), () => void this.createBoard())
    this.addCommand({ id: 'new-board', name: t('board.newName'), callback: () => void this.createBoard() })
    this.addBoardCommands()
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        const folder = file instanceof TFolder ? file : file.parent
        if (!folder) return
        // With Obsidian's own New note, New folder and New canvas at the top of the menu.
        menu.addItem((i) =>
          i
            .setSection('action-primary')
            .setTitle(t('board.newName'))
            .setIcon('layout-dashboard')
            .onClick(() => void this.createBoard(folder)),
        )
      }),
    )
    this.addSettingTab(new BoardlineSettingTab(this.app, this))
    // Links in boards follow files and folders that move or are renamed, as Obsidian's do in notes.
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => this.queueRelink(oldPath, file.path)))
  }

  /** Moves handled one batch at a time, in the order they happened. */
  private relinking: Promise<void> = Promise.resolve()
  /** Moves that came in together (a folder's files follow in events of their own), not yet handled. */
  private moves: Move[] = []
  private movesTimer: number | null = null

  private queueRelink(from: string, to: string): void {
    this.moves.push({ from, to })
    if (this.movesTimer !== null) return
    this.movesTimer = window.setTimeout(() => {
      this.movesTimer = null
      const moves = this.moves.splice(0)
      this.relinking = this.relinking.then(() => this.relinkBoards(moves)).catch((e) => console.error('Boardline: updating links after a move', e))
    }, MOVES_TOGETHER_MS)
  }

  /**
   * Boards' links into what moved follow it: open boards through their editor, others in their
   * file. As Obsidian does for notes, this happens by itself when "Automatically update internal
   * links" is on, and after asking when it is off.
   */
  private async relinkBoards(moves: Move[]): Promise<void> {
    const open = new Map<string, BoardFileView>()
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_BOARD)) {
      if (leaf.view instanceof BoardFileView && leaf.view.file) open.set(leaf.view.file.path, leaf.view)
    }
    const boards = this.app.vault.getFiles().filter((file) => file.extension === 'board')
    if (!alwaysUpdateLinks(this.app)) {
      let affected = 0
      for (const file of boards) if (await this.linksInto(file, open.get(file.path), moves)) affected++
      if (affected === 0 || !(await confirmRelink(this.app, affected))) return
    }
    for (const file of boards) {
      if (open.get(file.path)?.relink(moves)) continue
      if (!this.mayLinkInto(await this.app.vault.cachedRead(file), moves)) continue
      await this.app.vault.process(file, (data) => {
        const doc = parseBoard(data)
        const changed = relinkAll(doc.ordered(), moves)
        if (changed.length === 0) return data
        doc.commit('', changed.map((o) => updateOp(doc.get(o.id)!, o)))
        doc.meta.rev += 1
        return serialize(doc)
      })
    }
  }

  /** Whether a board (open in `view`, or in its file) has links that `moves` change. */
  private async linksInto(file: TFile, view: BoardFileView | undefined, moves: Move[]): Promise<boolean> {
    const open = view?.linksInto(moves)
    if (open !== undefined && open !== null) return open
    const data = await this.app.vault.cachedRead(file)
    if (!this.mayLinkInto(data, moves)) return false
    try {
      return relinkAll(parseBoard(data).ordered(), moves).length > 0
    } catch {
      return false
    }
  }

  private mayLinkInto(data: string, moves: Move[]): boolean {
    return moves.some((m) => mayLinkTo(data, m.from))
  }

  onunload(): void {
    if (this.movesTimer !== null) window.clearTimeout(this.movesTimer)
    clearEmbedCache()
  }

  async loadSettings(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<BoardlineSettings> | null) }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings)
  }

  /**
   * What a board does, as commands for the board in focus: in the command palette and in
   * Settings > Hotkeys, where any key can be given to them (none by default). The board's own
   * keys (Shift+/ lists them) work while it has the focus, like Obsidian's canvas.
   */
  private addBoardCommands(): void {
    const command = (id: string, name: string, run: (c: BoardController) => void, when: (c: BoardController) => boolean = () => true) =>
      this.addCommand({
        id,
        name,
        checkCallback: (checking) => {
          const board = this.app.workspace.getActiveViewOfType(BoardFileView)?.board
          if (!board || !when(board)) return false
          if (!checking) run(board)
          return true
        },
      })
    // Presenting ends with Esc: not on phones and tablets, which have none.
    if (!Platform.isMobile) command('present', t('present'), (c) => c.startPresenting())
    command('find', t('find.placeholder'), (c) => c.openFind())
    command('find-replace', t('command.replace'), (c) => c.openFind(undefined, true), (c) => !c.editor.isReadOnly())
    command('version-history', t('history.title'), (c) => c.toggleHistory())
    command('zoom-to-fit', t('view.fit'), (c) => c.editor.zoomToFit(false))
    command('zoom-in', t('view.zoomIn'), (c) => c.editor.zoomBy(1.25))
    command('zoom-out', t('view.zoomOut'), (c) => c.editor.zoomBy(1 / 1.25))
    command('zoom-reset', t('view.actualSize'), (c) => c.editor.resetZoom())
    command('auto-layout-down', `${t('layout.auto')}: ${t('layout.down')}`, (c) => void c.editor.autoLayout('DOWN'), (c) => !c.editor.isReadOnly())
    command('auto-layout-right', `${t('layout.auto')}: ${t('layout.right')}`, (c) => void c.editor.autoLayout('RIGHT'), (c) => !c.editor.isReadOnly())
    command('export-png', t('command.exportPng'), (c) => void c.exportImage('png'))
    command('export-svg', t('command.exportSvg'), (c) => void c.exportImage('svg'))
    command('export-note', t('export.note'), (c) => void c.exportNote?.(), (c) => !!c.exportNote)
    command('export-canvas', t('export.canvas'), (c) => void c.exportCanvas?.(), (c) => !!c.exportCanvas)
    command('import-mermaid', t('mermaid.importMenu'), (c) => c.importMermaid(), (c) => !c.editor.isReadOnly())
  }

  /** Boards take Obsidian's light/dark mode, note background and interface font. */
  private followObsidianLook(): void {
    const look = followHostLook(activeDocument)
    this.register(() => look.stop())
    this.app.workspace.onLayoutReady(() => look.refresh())
    this.registerEvent(this.app.workspace.on('css-change', () => look.refresh()))
  }

  /** The folder new boards go to (see settings), or `folder` when given. */
  private boardFolder(folder?: TFolder): string {
    if (folder) return folder.path === '/' ? '' : folder.path
    const s = this.settings
    if (s.newBoardLocation === 'folder') return normalizePath(s.newBoardFolder || '/').replace(/^\/$/, '')
    if (s.newBoardLocation === 'current') {
      const parent = this.app.workspace.getActiveFile()?.parent
      return parent && parent.path !== '/' ? parent.path : ''
    }
    return ''
  }

  async createBoard(folder?: TFolder): Promise<void> {
    const newBoard = t('board.newName')
    const dir = this.boardFolder(folder)
    if (dir && !this.app.vault.getFolderByPath(dir)) await this.app.vault.createFolder(dir)
    let path = ''
    for (let n = 1; ; n++) {
      path = normalizePath(`${dir ? dir + '/' : ''}${boardFileName(n > 1 ? `${newBoard} ${n}` : newBoard)}`)
      if (!this.app.vault.getAbstractFileByPath(path)) break
    }
    const file = await this.app.vault.create(path, formatBoardFile(emptyBoardFile(titleFromFileName(path.slice(path.lastIndexOf('/') + 1)))))
    await this.app.workspace.getLeaf(false).openFile(file)
  }

  /** Where pictures pasted into boards go: the vault's attachment folder for that board. */
  async attachmentFolder(boardPath: string): Promise<string> {
    const probe = await this.app.fileManager.getAvailablePathForAttachment('boardline.png', boardPath)
    return probe.includes('/') ? probe.slice(0, probe.lastIndexOf('/')) : ''
  }

  /** The board with this id (board links name boards by id, so they survive renames). */
  async findBoard(id: string): Promise<TFile | null> {
    const known = this.boardIds.get(id)
    const cached = known ? this.app.vault.getFileByPath(known) : null
    if (cached) return cached
    for (const file of this.app.vault.getFiles()) {
      if (file.extension !== 'board') continue
      const fileId = await boardIdOf(this.app, file)
      if (fileId) this.boardIds.set(fileId, file.path)
      if (fileId === id) return file
    }
    return null
  }

  /** The note a doc link points at: by path, or by name if it moved (as Obsidian finds links). */
  noteFile(link: string, sourcePath: string): TFile | null {
    const target = parseLink(link)
    if (target?.kind !== 'doc') return null
    const name = target.path.slice(target.path.lastIndexOf('/') + 1).replace(/\.md$/i, '')
    return this.app.vault.getFileByPath(target.path) ?? this.app.metadataCache.getFirstLinkpathDest(name, sourcePath)
  }

  /** Follow a link from a board: a web page, a note, or another board (at an object or view). */
  async openLink(link: string, sourcePath: string): Promise<void> {
    const target = parseLink(link)
    if (!target) {
      new Notice(t('link.cantOpen', link))
      return
    }
    if (target.kind === 'web') {
      window.open(target.url)
      return
    }
    if (target.kind === 'doc') {
      const file = this.noteFile(link, sourcePath)
      if (!file) {
        new Notice(t('link.noteMissing', target.path))
        return
      }
      await this.app.workspace.getLeaf(false).openFile(file)
      return
    }
    const file = await this.findBoard(target.boardId)
    if (!file) {
      new Notice(t('link.boardMissing'))
      return
    }
    const leaf = this.app.workspace.getLeaf(false)
    await leaf.openFile(file)
    if ((target.objectId || target.view) && leaf.view instanceof BoardFileView) leaf.view.showTarget({ objectId: target.objectId, view: target.view })
  }
}

