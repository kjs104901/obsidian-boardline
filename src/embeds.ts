// ![[Board.board]] in a note: a picture of the board (drawn from its file, in the current theme)
// that opens the board when clicked. Pictures are cached until the board file changes.
//
// Obsidian draws embeds of other file types through its embed registry (as it does for PDFs and
// canvases), in reading view and while editing. The registry isn't in the public API, so when
// it's missing the plugin falls back to a reading-view post processor.

import { Component, MarkdownRenderChild, TFile, type MarkdownPostProcessorContext } from 'obsidian'
import { renderBoardPng } from '@boardline/core/board/boardFiles'
import { themeMode } from '@boardline/core/theme/palette'
import type BoardlinePlugin from './main'
import { t } from '@boardline/core/i18n'

const cache = new Map<string, Promise<string | null>>()

/** Blob URL of a board's picture, per file version and theme (freed when the plugin unloads). */
function pictureUrl(plugin: BoardlinePlugin, file: TFile): Promise<string | null> {
  const key = `${file.path}|${file.stat.mtime}|${themeMode()}`
  let p = cache.get(key)
  if (!p) {
    p = renderBoardPng(plugin.storage, '', file.path, themeMode(), 1.5).then((bytes) => (bytes ? URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/png' })) : null))
    cache.set(key, p)
  }
  return p
}

export function clearEmbedCache(): void {
  for (const p of cache.values()) void p.then((url) => url && URL.revokeObjectURL(url))
  cache.clear()
}

/** Draw a board embed into `el` (an .internal-embed span Obsidian made for ![[…]]). */
export function renderBoardEmbed(plugin: BoardlinePlugin, el: HTMLElement, file: TFile): void {
  el.empty()
  el.addClass('bl-embed')
  const frame = el.createDiv({ cls: 'bl-embed-frame' })
  const title = frame.createDiv({ cls: 'bl-embed-title', text: file.basename })
  title.setAttr('aria-label', t('embed.open'))
  const img = frame.createEl('img', { attr: { alt: file.basename } })
  const width = el.getAttr('width')
  if (width && /^\d+$/.test(width)) img.style.maxWidth = `${width}px`
  void pictureUrl(plugin, file).then((url) => {
    if (url) img.src = url
    else frame.createDiv({ cls: 'bl-embed-empty', text: t('common.emptyBoard') })
  })
  frame.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    void plugin.app.workspace.getLeaf(e.ctrlKey || e.metaKey ? 'tab' : false).openFile(file)
  })
}

export function boardEmbedProcessor(plugin: BoardlinePlugin) {
  return (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
    for (const embed of Array.from(el.querySelectorAll<HTMLElement>('.internal-embed[src]'))) {
      const src = embed.getAttr('src') ?? ''
      const file = plugin.app.metadataCache.getFirstLinkpathDest(src.split('#')[0], ctx.sourcePath)
      if (!(file instanceof TFile) || file.extension !== 'board') continue
      const child = new MarkdownRenderChild(embed)
      ctx.addChild(child)
      renderBoardEmbed(plugin, embed, file)
    }
  }
}

/** One board embed for Obsidian's embed registry: drawn on load, redrawn when the board changes. */
class BoardEmbed extends Component {
  constructor(
    private plugin: BoardlinePlugin,
    public containerEl: HTMLElement,
    public file: TFile,
  ) {
    super()
  }

  async loadFile(): Promise<void> {
    const draw = () => renderBoardEmbed(this.plugin, this.containerEl, this.file)
    draw()
    this.registerEvent(this.plugin.app.vault.on('modify', (f) => f === this.file && draw()))
    // Light/dark changed: the picture is drawn again in the new colors.
    this.registerEvent(this.plugin.app.workspace.on('css-change', draw))
  }
}

interface EmbedRegistry {
  registerExtension(ext: string, creator: (context: { containerEl: HTMLElement }, file: TFile, subpath: string) => Component): void
  unregisterExtension(ext: string): void
}

/** Show ![[X.board]] as a board picture: through the embed registry if there is one. */
export function registerBoardEmbeds(plugin: BoardlinePlugin): void {
  const registry = (plugin.app as unknown as { embedRegistry?: EmbedRegistry }).embedRegistry
  if (registry && typeof registry.registerExtension === 'function') {
    registry.registerExtension('board', (context, file) => new BoardEmbed(plugin, context.containerEl, file))
    plugin.register(() => registry.unregisterExtension('board'))
    return
  }
  plugin.registerMarkdownPostProcessor(boardEmbedProcessor(plugin))
}
