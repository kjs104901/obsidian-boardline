// Boards and canvases that aren't open, drawn from their files: cards for them on other boards,
// and the picture kept next to a board for notes that embed it.

import { parseBoard } from './serialize'
import { mimeOf } from './assets'
import { imageSrcs, type BoardObject } from './model'
import { canvasToObjects } from './jsonCanvas'
import { parseLink } from './links'
import { noteName, type NoteView } from '../engine/noteCard'
import { ImageCache } from '../engine/images'
import { standaloneScene } from '../engine/scene'
import { exportPng } from '../engine/exportImage'
import { iconStyleOf } from '../engine/icons'
import { measureAt } from '../engine/textLayout'
import { loadIconSet } from '../icons/iconData'
import type { ThemeMode } from '../theme/palette'
import type { WorkspaceStorage } from '../platform/storage'

/** The picture of a board kept next to it for notes that embed it (`X.board.png`). */
export const boardPicturePath = (boardPath: string) => boardPath.replace(/\.board$/, '.board.png')

/**
 * The whole board as a PNG, drawn from its file (it needn't be open). `mode` picks the theme;
 * pictures for notes are light, which reads well in Obsidian's light and dark themes.
 */
export async function renderBoardPng(storage: WorkspaceStorage, root: string, path: string, mode?: ThemeMode, scale = 2): Promise<Uint8Array | null> {
  return renderObjectsPng(storage, root, parseBoard(await storage.readFile(root, path)).ordered(), mode, scale)
}

/** An Obsidian canvas (.canvas) as a PNG, drawn the way a board with the same cards would be. */
export async function renderCanvasPng(storage: WorkspaceStorage, root: string, path: string, mode?: ThemeMode, scale = 2): Promise<Uint8Array | null> {
  return renderObjectsPng(storage, root, canvasToObjects(await storage.readFile(root, path)), mode, scale)
}

/**
 * Objects of a board that isn't open, as a PNG: their pictures read and their note cards'
 * notes too (cards for boards or canvases in it show just their names).
 */
async function renderObjectsPng(storage: WorkspaceStorage, root: string, objects: BoardObject[], mode?: ThemeMode, scale = 2): Promise<Uint8Array | null> {
  const scene = standaloneScene(objects)
  if (!scene) return null
  const images = new ImageCache(async (src) => new Blob([(await storage.readBytes(root, src)) as BlobPart], { type: mimeOf(src) }), () => {})
  const notes = new Map<string, NoteView>()
  for (const o of objects) {
    const link = o.type === 'shape' && o.shape === 'note' ? o.link : undefined
    const target = link ? parseLink(link) : null
    if (!link || target?.kind !== 'doc' || !/\.md$/i.test(target.path) || notes.has(link)) continue
    const text = await storage.readFile(root, target.path).catch(() => null)
    notes.set(link, text === null ? { state: 'missing', title: noteName(link), text: '' } : { state: 'ready', title: noteName(link), text })
  }
  try {
    await images.ready(new Set(objects.flatMap(imageSrcs)))
    const styles = new Set(objects.flatMap((o) => (o.type === 'shape' && o.icon ? [iconStyleOf(o)] : [])))
    await Promise.all([...styles].map(loadIconSet))
    return await exportPng({ ...scene, note: (link) => notes.get(link) }, measureAt, (src) => images.get(src), { scale, mode })
  } finally {
    images.dispose()
  }
}
