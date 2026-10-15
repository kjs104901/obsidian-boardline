// Boardline for Obsidian: whiteboards (.board files) inside the vault, drawn by the board
// engine (src/core) and the board UI (src/board-ui).

import { Notice, Plugin, TFile, TFolder, normalizePath } from 'obsidian'
import { parseLink } from '@boardline/core/board/links'
import { boardFileName, emptyBoardFile, formatBoardFile, parseBoard, serialize, titleFromFileName } from '@boardline/core/board/serialize'
import { updateOp } from '@boardline/core/board/document'
import { mayLinkTo, relinkObjects } from '@boardline/core/board/relink'
import { DEFAULT_FONT_FAMILY, setFontFamily } from '@boardline/core/engine/text'
import { FONT_EVENT, THEME_EVENT } from '@boardline/core/theme/events'
import { setHostColors, setThemeMode } from '@boardline/core/theme/palette'
import { BoardFileView, VIEW_TYPE_BOARD } from './BoardFileView'
import { boardIdOf } from './dialogs'
import { clearEmbedCache, registerBoardEmbeds } from './embeds'
import { BoardlineSettingTab, DEFAULT_SETTINGS, type BoardlineSettings } from './settings'
import { VaultStorage } from './vaultStorage'

const NEW_BOARD = '새 보드'

export default class BoardlinePlugin extends Plugin {
  settings: BoardlineSettings = { ...DEFAULT_SETTINGS }
  storage!: VaultStorage
  /** Board ids → files, filled on demand (board links name boards by id). */
  private boardIds = new Map<string, string>()

  async onload(): Promise<void> {
    await this.loadSettings()
    this.storage = new VaultStorage(this.app)
    this.followObsidianLook()

    this.registerView(VIEW_TYPE_BOARD, (leaf) => new BoardFileView(leaf, this))
    this.registerExtensions(['board'], VIEW_TYPE_BOARD)
    registerBoardEmbeds(this)

    this.addRibbonIcon('layout-dashboard', '새 보드', () => void this.createBoard())
    this.addCommand({ id: 'new-board', name: '새 보드', callback: () => void this.createBoard() })
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        const folder = file instanceof TFolder ? file : file.parent
        if (!folder) return
        menu.addItem((i) =>
          i
            .setTitle('새 보드')
            .setIcon('layout-dashboard')
            .onClick(() => void this.createBoard(folder)),
        )
      }),
    )
    this.addSettingTab(new BoardlineSettingTab(this.app, this))
    // Links in boards follow files and folders that move or are renamed, as Obsidian's do in notes.
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => this.queueRelink(oldPath, file.path)))
  }

  /** One move at a time, in the order they happened (a folder's files can follow its own event). */
  private relinking: Promise<void> = Promise.resolve()

  private queueRelink(from: string, to: string): void {
    this.relinking = this.relinking.then(() => this.relinkBoards(from, to)).catch((e) => console.error('Boardline: updating links after a move', e))
  }

  /** Every board's links into `from` point into `to`: open boards through their editor, others in their file. */
  private async relinkBoards(from: string, to: string): Promise<void> {
    const open = new Map<string, BoardFileView>()
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_BOARD)) {
      if (leaf.view instanceof BoardFileView && leaf.view.file) open.set(leaf.view.file.path, leaf.view)
    }
    for (const file of this.app.vault.getFiles()) {
      if (file.extension !== 'board') continue
      if (open.get(file.path)?.relink(from, to)) continue
      if (!mayLinkTo(await this.app.vault.cachedRead(file), from)) continue
      await this.app.vault.process(file, (data) => {
        const doc = parseBoard(data)
        const changed = relinkObjects(doc.ordered(), from, to)
        if (changed.length === 0) return data
        doc.commit('', changed.map((o) => updateOp(doc.get(o.id)!, o)))
        doc.meta.rev += 1
        return serialize(doc)
      })
    }
  }

  onunload(): void {
    clearEmbedCache()
  }

  async loadSettings(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<BoardlineSettings> | null) }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings)
  }

  /** Boards take Obsidian's light/dark mode, note background and interface font. */
  private followObsidianLook(): void {
    const apply = () => {
      const body = activeDocument.body
      setThemeMode(body.classList.contains('theme-dark') ? 'dark' : 'light')
      const style = getComputedStyle(body)
      // The note background, the canvas dots and the accent, as plain colors (the variables
      // themselves may be calc() or color-mix() expressions a canvas can't read).
      const probe = activeDocument.createElement('div')
      body.append(probe)
      const resolve = (name: string) => {
        probe.style.color = `var(${name})`
        return getComputedStyle(probe).color || null
      }
      setHostColors({ background: resolve('--background-primary'), dots: resolve('--canvas-dot-pattern'), accent: resolve('--interactive-accent') })
      probe.remove()
      setFontFamily(style.getPropertyValue('--font-interface').trim() || DEFAULT_FONT_FAMILY)
      window.dispatchEvent(new Event(THEME_EVENT))
      window.dispatchEvent(new Event(FONT_EVENT))
    }
    this.app.workspace.onLayoutReady(apply)
    this.registerEvent(this.app.workspace.on('css-change', apply))
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
    const dir = this.boardFolder(folder)
    if (dir && !this.app.vault.getFolderByPath(dir)) await this.app.vault.createFolder(dir)
    let path = ''
    for (let n = 1; ; n++) {
      path = normalizePath(`${dir ? dir + '/' : ''}${boardFileName(n > 1 ? `${NEW_BOARD} ${n}` : NEW_BOARD)}`)
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
      new Notice(`열 수 없는 링크입니다: ${link}`)
      return
    }
    if (target.kind === 'web') {
      window.open(target.url)
      return
    }
    if (target.kind === 'doc') {
      const file = this.noteFile(link, sourcePath)
      if (!file) {
        new Notice(`링크한 노트를 찾을 수 없습니다: ${target.path}`)
        return
      }
      await this.app.workspace.getLeaf(false).openFile(file)
      return
    }
    const file = await this.findBoard(target.boardId)
    if (!file) {
      new Notice('링크한 보드를 이 보관함에서 찾을 수 없습니다')
      return
    }
    const leaf = this.app.workspace.getLeaf(false)
    await leaf.openFile(file)
    if ((target.objectId || target.view) && leaf.view instanceof BoardFileView) leaf.view.showTarget({ objectId: target.objectId, view: target.view })
  }
}

