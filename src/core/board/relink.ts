// A file or folder in the workspace moved or was renamed: the links boards keep to it follow,
// as Obsidian updates the links in notes — note cards and links to notes (boardline://doc/…),
// pictures from the workspace (`src`), and [[wiki links]] in text.

import { docLink, parseLink } from './links'
import { isConnector, isMindmap, type BoardObject } from './model'

/** Where `path` went when `from` became `to` (a file, or a folder with everything in it); null if it didn't move. */
function movedPath(path: string, from: string, to: string): string | null {
  if (path === from) return to
  return path.startsWith(from + '/') ? to + path.slice(from.length) : null
}

const withoutMd = (p: string) => p.replace(/\.md$/i, '')
const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1)

/**
 * [[wiki links]] (and ![[embeds]]) in `text` that named the moved file — by its path or, the
 * usual short form, by its name — renamed the same way. A Markdown note is named without ".md".
 */
function relinkText(text: string, from: string, to: string): string {
  if (!text.includes('[[')) return text
  return text.replace(/(!?\[\[)([^\]|#]+)((?:#[^\]|]*)?(?:\|[^\]]*)?\]\])/g, (all, open: string, target: string, rest: string) => {
    const t = target.trim()
    const md = /\.md$/i.test(from)
    // By path (with or without ".md" for notes): the new path the same way.
    for (const candidate of md ? [t, t + '.md'] : [t]) {
      const moved = movedPath(candidate, from, to)
      if (moved) return open + (md && !/\.md$/i.test(t) ? withoutMd(moved) : moved) + rest
    }
    // By name (shortest form): the new name, when the file itself was renamed.
    const oldName = md ? withoutMd(baseName(from)) : baseName(from)
    if (t === oldName && !t.includes('/')) return open + (md ? withoutMd(baseName(to)) : baseName(to)) + rest
    return all
  })
}

/**
 * The objects whose links pointed into `from` (a file, or a folder and what is in it), pointing
 * into `to` instead. Only the changed objects are returned.
 */
export function relinkObjects(objects: BoardObject[], from: string, to: string): BoardObject[] {
  const changed: BoardObject[] = []
  for (const o of objects) {
    let next: BoardObject = o
    if (isConnector(o)) {
      const label = relinkText(o.label, from, to)
      if (label !== o.label) next = { ...o, label }
    } else if (isMindmap(o)) {
      const text = relinkText(o.text, from, to)
      if (text !== o.text) next = { ...o, text }
    } else {
      const target = o.link ? parseLink(o.link) : null
      const linkPath = target?.kind === 'doc' ? movedPath(target.path, from, to) : null
      const src = o.src ? movedPath(o.src, from, to) : null
      const text = relinkText(o.text, from, to)
      const cells = o.cells?.map((row) => row.map((cell) => relinkText(cell, from, to)))
      const cellsChanged = !!cells && cells.some((row, r) => row.some((cell, c) => cell !== o.cells![r][c]))
      if (linkPath || src || text !== o.text || cellsChanged) {
        next = {
          ...o,
          ...(linkPath ? { link: docLink(linkPath) } : {}),
          ...(src ? { src } : {}),
          ...(text !== o.text ? { text } : {}),
          ...(cellsChanged ? { cells } : {}),
        }
      }
    }
    if (next !== o) changed.push(next)
  }
  return changed
}

/** A file or folder that moved or was renamed. */
export interface Move {
  from: string
  to: string
}

/** The objects changed by `moves` made one after another (each as it ends up); only changed ones. */
export function relinkAll(objects: BoardObject[], moves: readonly Move[]): BoardObject[] {
  const changed = new Map<string, BoardObject>()
  let current = objects
  for (const { from, to } of moves) {
    const step = new Map(relinkObjects(current, from, to).map((o) => [o.id, o]))
    if (step.size === 0) continue
    for (const [id, o] of step) changed.set(id, o)
    current = current.map((o) => step.get(o.id) ?? o)
  }
  return [...changed.values()]
}

/** Whether a board's file text could link into `from` (a quick check before reading it). */
export function mayLinkTo(boardText: string, from: string): boolean {
  const name = baseName(from)
  return boardText.includes(name) || boardText.includes(docLink(from).slice('boardline://doc/'.length)) || boardText.includes(encodeURIComponent(name))
}
