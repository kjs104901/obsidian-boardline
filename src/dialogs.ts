// Obsidian's own dialogs for what the board asks of its app: picking a link target (a note, a
// board or a web address) and entering text (Mermaid).

import { Modal, SuggestModal, TFile, type App } from 'obsidian'
import { boardLink, docLink, normalizeAddress } from '@boardline/core/board/links'
import { BOARD_EXT } from '@boardline/core/board/serialize'

type Pick = { link: string; title?: string }
type Item = { kind: 'web'; url: string } | { kind: 'note' | 'board' | 'canvas' | 'picture'; file: TFile }

const PICTURE = /^(png|jpe?g|gif|webp|svg|bmp|avif)$/i

function kindOf(f: TFile): 'note' | 'board' | 'canvas' | 'picture' | null {
  if (f.extension === 'md') return 'note'
  if (f.extension === 'board') return 'board'
  if (f.extension === 'canvas') return 'canvas'
  return PICTURE.test(f.extension) ? 'picture' : null
}

const KIND_NAME = { note: '노트', board: '보드', canvas: '캔버스', picture: '그림' } as const

/** The board's id, read from its file. */
export async function boardIdOf(app: App, file: TFile): Promise<string | null> {
  try {
    const id = JSON.parse(await app.vault.cachedRead(file)).id
    return typeof id === 'string' ? id : null
  } catch {
    return null
  }
}

const title = (f: TFile) => (f.extension === 'board' ? f.name.slice(0, -BOARD_EXT.length) : f.extension === 'md' ? f.basename : f.name)

/** The board link of a board file, or a doc link for any other file. */
export async function fileLink(app: App, f: TFile): Promise<string | null> {
  if (f.extension !== 'board') return docLink(f.path)
  const id = await boardIdOf(app, f)
  return id ? boardLink(id) : null
}

export class LinkPicker extends SuggestModal<Item> {
  private chosen = false

  constructor(
    app: App,
    heading: string,
    private initial: string | undefined,
    private done: (pick: Pick | null) => void,
    /** Putting files on the board: notes, boards, canvases and pictures, no web addresses. */
    private files = false,
  ) {
    super(app)
    this.setPlaceholder(files ? `${heading}: 노트, 보드, 캔버스, 그림 이름` : `${heading}: 노트나 보드 이름, 또는 웹 주소`)
    this.setInstructions([
      { command: '↑↓', purpose: '고르기' },
      { command: 'Enter', purpose: '링크' },
      { command: 'Esc', purpose: '닫기' },
    ])
  }

  onOpen(): void {
    super.onOpen()
    if (this.initial) {
      this.inputEl.value = this.initial
      this.inputEl.dispatchEvent(new Event('input'))
    }
  }

  getSuggestions(query: string): Item[] {
    const q = query.trim().toLowerCase()
    const items: Item[] = []
    const url = this.files ? null : normalizeAddress(query.trim())
    if (url) items.push({ kind: 'web', url })
    const files = this.app.vault
      .getFiles()
      .filter((f) => (this.files ? kindOf(f) !== null : f.extension === 'md' || f.extension === 'board'))
      .filter((f) => !q || f.path.toLowerCase().includes(q))
      .sort((a, b) => Number(title(b).toLowerCase().startsWith(q)) - Number(title(a).toLowerCase().startsWith(q)) || b.stat.mtime - a.stat.mtime)
      .slice(0, 50)
    for (const f of files) items.push({ kind: kindOf(f) ?? 'note', file: f })
    return items
  }

  renderSuggestion(item: Item, el: HTMLElement): void {
    if (item.kind === 'web') {
      el.createDiv({ text: item.url })
      el.createEl('small', { text: '웹 주소', cls: 'bl-suggest-detail' })
      return
    }
    el.createDiv({ text: title(item.file) })
    el.createEl('small', { text: `${KIND_NAME[item.kind]} · ${item.file.parent?.path === '/' ? '최상위' : (item.file.parent?.path ?? '')}`, cls: 'bl-suggest-detail' })
  }

  async onChooseSuggestion(item: Item): Promise<void> {
    this.chosen = true
    if (item.kind === 'web') return this.done({ link: item.url })
    if (item.kind !== 'board') return this.done({ link: docLink(item.file.path), title: title(item.file) })
    const id = await boardIdOf(this.app, item.file)
    this.done(id ? { link: boardLink(id), title: title(item.file) } : null)
  }

  onClose(): void {
    super.onClose()
    // Choosing closes the modal first; only a plain close means "no link".
    setTimeout(() => {
      if (!this.chosen) this.done(null)
    }, 0)
  }
}

/** A text box in a modal: resolves with the text, or null when closed. */
export class TextPrompt extends Modal {
  private result: string | null = null

  constructor(
    app: App,
    private request: { title: string; placeholder: string; hint: string; action: string },
    private done: (text: string | null) => void,
  ) {
    super(app)
  }

  onOpen(): void {
    this.setTitle(this.request.title)
    const area = this.contentEl.createEl('textarea', { cls: 'bl-prompt-input', attr: { placeholder: this.request.placeholder, spellcheck: 'false', rows: '10' } })
    const footer = this.contentEl.createDiv({ cls: 'bl-prompt-footer' })
    footer.createSpan({ text: this.request.hint, cls: 'bl-prompt-hint' })
    const button = footer.createEl('button', { text: this.request.action, cls: 'mod-cta' })
    const submit = () => {
      this.result = area.value
      this.close()
    }
    button.addEventListener('click', submit)
    area.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        submit()
      }
    })
    setTimeout(() => area.focus(), 0)
  }

  onClose(): void {
    this.contentEl.empty()
    this.done(this.result?.trim() ? this.result : null)
  }
}
