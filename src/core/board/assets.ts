// Images pasted onto boards are stored once, as <content hash>.<ext> (shared by every board,
// deduplicated by content). Older boards may still point into .boardline/assets/.

import type { WorkspaceStorage } from '../platform/storage'

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
}

const MIME = Object.fromEntries(Object.entries(EXT).map(([mime, ext]) => [ext, mime]))

export function isImageFile(f: File | Blob): boolean {
  return f.type in EXT
}

export function mimeOf(path: string): string {
  return MIME[path.slice(path.lastIndexOf('.') + 1).toLowerCase()] ?? 'application/octet-stream'
}

/** First 20 hex digits of the SHA-256 of `bytes`. */
export async function contentHash(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))
  return [...digest.slice(0, 10)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface StoredImage {
  /** Workspace-relative path, kept in the board file. */
  src: string
  width: number
  height: number
}

/**
 * Save an image file into `dir` (once) and read its pixel size. The plugin passes the vault's
 * attachment folder, which Obsidian Sync carries (it skips hidden folders).
 */
export async function storeImage(storage: WorkspaceStorage, root: string, file: Blob, dir: string): Promise<StoredImage> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const src = `${dir ? dir + '/' : ''}${await contentHash(bytes)}.${EXT[file.type] ?? 'png'}`
  if (!(await storage.exists(root, src))) await storage.writeAsset(root, src, bytes)
  const bitmap = await createImageBitmap(file)
  const size = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return { src, ...size }
}
