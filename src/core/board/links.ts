// Links: web addresses, and links into the workspace —
// boardline://board/<board id>[/<object id>][?view=<x>,<y>,<zoom>] and boardline://doc/<note path>.

export type LinkTarget =
  | { kind: 'web'; url: string }
  | { kind: 'board'; boardId: string; objectId?: string; view?: { x: number; y: number; zoom: number } }
  | { kind: 'doc'; path: string }

const BOARD_PREFIX = 'boardline://board/'
const DOC_PREFIX = 'boardline://doc/'

/** A link to a Markdown note (notes have no id, so by path; found by name if it moved). */
export function docLink(path: string): string {
  return DOC_PREFIX + path.split('/').map(encodeURIComponent).join('/')
}

export function boardLink(boardId: string, objectId?: string, view?: { x: number; y: number; zoom: number }): string {
  const q = view ? `?view=${round(view.x)},${round(view.y)},${Math.round(view.zoom * 1000) / 1000}` : ''
  return `${BOARD_PREFIX}${boardId}${objectId ? `/${objectId}` : ''}${q}`
}

const round = (v: number) => Math.round(v)

export function parseLink(text: string): LinkTarget | null {
  const s = text.trim()
  if (s.startsWith(DOC_PREFIX)) {
    const path = s.slice(DOC_PREFIX.length).split('/').map((p) => decodeURIComponent(p)).join('/')
    return path ? { kind: 'doc', path } : null
  }
  if (s.startsWith(BOARD_PREFIX)) {
    const [path, query = ''] = s.slice(BOARD_PREFIX.length).split('?')
    const [boardId, objectId] = path.split('/')
    if (!boardId) return null
    const view = /^view=(-?[\d.]+),(-?[\d.]+),([\d.]+)$/.exec(query)
    return {
      kind: 'board',
      boardId,
      ...(objectId ? { objectId } : {}),
      ...(view ? { view: { x: Number(view[1]), y: Number(view[2]), zoom: Number(view[3]) } } : {}),
    }
  }
  if (/^(https?:\/\/|mailto:)\S+$/i.test(s)) return { kind: 'web', url: s }
  return null
}

/**
 * What the user typed in the link box as an address: full URLs as they are, "example.com/x" or
 * "www.example.com" with https:// added. Null when it doesn't look like an address.
 */
export function normalizeAddress(text: string): string | null {
  const s = text.trim()
  if (!s || /\s/.test(s)) return null
  if (parseLink(s)) return s
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(s) && /\.[a-z]{2,}(?=$|[:/])/i.test(s)) return `https://${s}`
  return null
}

/** Host of a web address without "www.", for labels. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
