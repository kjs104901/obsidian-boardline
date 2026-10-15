// Note cards: a file from the workspace (or vault) shown on the board, its name above the card
// as a section's title is. A Markdown note's text fills the card, cut off at the bottom (a
// selected card scrolls with the wheel); another board or an Obsidian canvas shows as its
// picture. Files are read through the host and kept here until they change.

import { parseLink } from '../board/links'
import type { ShapeObject } from '../board/model'
import type { Rect } from './geometry'
import type { RichLayout } from './richLayout'
import { SECTION_TITLE_SIZE, richText, type MeasureAt } from './textLayout'

export interface NoteView {
  state: 'loading' | 'ready' | 'missing'
  /** The file's name (without .md). */
  title: string
  text: string
  /** A board's or canvas's picture, decoded, and as a data: URL (for SVG export). */
  image?: { source: CanvasImageSource; width: number; height: number; url: string }
}

/** What the host reads for a card: the file's path, and its text or its picture (PNG). */
export interface NoteFile {
  path: string
  title?: string
  text?: string
  image?: Uint8Array
}

/** Reads a card's file by its link; null when there is no such file. */
export type NoteReader = (link: string) => Promise<NoteFile | null>

export const NOTE_PADDING = 16
const TITLE_LINE = 20
const TITLE_GAP = 6
/** Note text: Obsidian's reading size. */
const NOTE_TEXT = { size: 16, line: 24 }
/** How tall the fade is where the text is cut off. */
export const NOTE_FADE = 28

const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/\.(md|canvas)$/i, '')

/** The file's name from its link (before it is read; a board link's is its title, read later). */
export function noteName(link: string | undefined): string {
  const target = parseLink(link ?? '')
  return target?.kind === 'board' ? '보드' : fileName(target?.kind === 'doc' ? target.path : (link ?? ''))
}

/** Where the name goes above the card. */
export function noteTitleBox(o: ShapeObject): Rect {
  return { x: o.x, y: o.y - TITLE_LINE - TITLE_GAP, w: o.w, h: TITLE_LINE }
}

export interface NoteDrawing {
  title: { text: string; x: number; y: number; size: number }
  /** A picture fitted into the card. */
  picture: { rect: Rect; image: NonNullable<NoteView['image']> } | null
  /** The text's area inside the card. */
  inner: Rect
  rich: RichLayout | null
  /** What shows instead of the text (loading, missing, empty). */
  message: string | null
  /** How far the text is scrolled, and how far it can be. */
  scroll: number
  maxScroll: number
}

export function noteDrawing(o: ShapeObject, view: NoteView | undefined, measureAt: MeasureAt, scroll = 0): NoteDrawing {
  const t = noteTitleBox(o)
  const inner = { x: o.x + NOTE_PADDING, y: o.y + NOTE_PADDING / 2, w: Math.max(1, o.w - 2 * NOTE_PADDING), h: Math.max(1, o.h - NOTE_PADDING) }
  const image = view?.state === 'ready' ? view.image : undefined
  const ready = view?.state === 'ready' && (!!image || view.text.trim() !== '')
  const rich = ready && !image ? richText(view.text, inner.w, { ...NOTE_TEXT, align: 'left', note: true }, measureAt) : null
  let picture: NoteDrawing['picture'] = null
  if (image) {
    // As big as fits inside the padding, centered.
    const box = { x: o.x + NOTE_PADDING / 2, y: o.y + NOTE_PADDING / 2, w: Math.max(1, o.w - NOTE_PADDING), h: Math.max(1, o.h - NOTE_PADDING) }
    const k = Math.min(box.w / image.width, box.h / image.height)
    const w = image.width * k
    const h = image.height * k
    picture = { rect: { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h }, image }
  }
  const maxScroll = rich ? Math.max(0, rich.height - inner.h + NOTE_PADDING / 2) : 0
  return {
    title: { text: view?.title || noteName(o.link), x: t.x, y: t.y + t.h / 2, size: SECTION_TITLE_SIZE },
    picture,
    inner,
    rich,
    message: !view || view.state === 'loading' ? '불러오는 중…' : view.state === 'missing' ? '파일을 찾을 수 없습니다' : ready ? null : '비어 있음',
    scroll: Math.min(Math.max(0, scroll), maxScroll),
    maxScroll,
  }
}

interface Entry {
  view: NoteView
  /** The file the link led to last time (a refresh for other paths leaves it be). */
  path: string | null
  loading: Promise<void>
}

async function decode(png: Uint8Array): Promise<NoteView['image']> {
  const blob = new Blob([png as BlobPart], { type: 'image/png' })
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
  const img = new Image()
  img.src = url
  await img.decode()
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, url }
}

/** Notes by link, read on first use and again when the host says they changed. */
export class NoteCache {
  private entries = new Map<string, Entry>()

  constructor(
    private read: NoteReader | undefined,
    /** Called when a note has been read (to redraw). */
    private onLoad: () => void,
  ) {}

  get(link: string): NoteView {
    return this.entry(link).view
  }

  /** Wait until the notes in `links` have been read (exports). */
  async ready(links: Iterable<string>): Promise<void> {
    await Promise.all([...links].map((l) => this.entry(l).loading))
  }

  /**
   * Read the files again: those at `paths`, or all of them. Cards keep showing the old content
   * until the new one is in; ones that weren't found try again.
   */
  refresh(paths?: string[]): void {
    for (const [link, entry] of this.entries) {
      if (!paths || entry.path === null || paths.includes(entry.path)) entry.loading = this.load(link, entry)
    }
  }

  private entry(link: string): Entry {
    let e = this.entries.get(link)
    if (!e) {
      e = { view: { state: 'loading', title: noteName(link), text: '' }, path: null, loading: Promise.resolve() }
      this.entries.set(link, e)
      e.loading = this.load(link, e)
    }
    return e
  }

  private async load(link: string, entry: Entry): Promise<void> {
    let next: NoteView
    try {
      const file = this.read ? await this.read(link) : null
      entry.path = file?.path ?? null
      const image = file?.image ? await decode(file.image) : undefined
      next = file ? { state: 'ready', title: file.title || noteName(link), text: file.text ?? '', ...(image ? { image } : {}) } : { state: 'missing', title: noteName(link), text: '' }
    } catch {
      next = { state: 'missing', title: noteName(link), text: '' }
    }
    const same = next.state === entry.view.state && next.text === entry.view.text && next.title === entry.view.title && next.image?.url === entry.view.image?.url
    entry.view = next
    if (!same) this.onLoad()
  }
}
