// Icon library (Phosphor Icons, MIT): names, categories and path data, loaded on first use.

/** Icon look: duotone in the object's color, solid, or outline. */
export type IconStyle = 'color' | 'fill' | 'outline'

export const ICON_STYLES: IconStyle[] = ['color', 'fill', 'outline']

export interface IconMeta {
  /** Icon name, e.g. "airplane". */
  n: string
  /** Categories. */
  c: string[]
  /** Search tags. */
  t: string[]
}

/** Path data of one icon in a 256×256 box; translucent (duotone) layers start with "~". */
type IconSet = Record<string, string[]>

/** Fired on window when a set finishes loading, so boards that show icons redraw. */
export const ICONS_EVENT = 'boardline-icons'

/** Icons are drawn from a 256×256 box. */
export const ICON_BOX = 256

const SET_OF: Record<IconStyle, 'duotone' | 'fill' | 'regular'> = { color: 'duotone', fill: 'fill', outline: 'regular' }

const sets = new Map<IconStyle, IconSet>()
const pending = new Map<IconStyle, Promise<IconSet>>()
let index: Promise<IconMeta[]> | null = null

function importSet(style: IconStyle): Promise<{ default: IconSet }> {
  switch (SET_OF[style]) {
    case 'duotone':
      return import('virtual:icons/duotone')
    case 'fill':
      return import('virtual:icons/fill')
    default:
      return import('virtual:icons/regular')
  }
}

/** Load the path data of one style (once). */
export function loadIconSet(style: IconStyle): Promise<IconSet> {
  const ready = sets.get(style)
  if (ready) return Promise.resolve(ready)
  let p = pending.get(style)
  if (!p) {
    p = importSet(style).then((m) => {
      sets.set(style, m.default)
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(ICONS_EVENT))
      return m.default
    })
    pending.set(style, p)
  }
  return p
}

/**
 * Path data of an icon, or null while its style is still loading (loading starts here;
 * ICONS_EVENT fires when it's done). Unknown names give an empty list.
 */
export function iconPaths(name: string, style: IconStyle): string[] | null {
  const set = sets.get(style)
  if (!set) {
    void loadIconSet(style)
    return null
  }
  return set[name] ?? []
}

/** All icons with their categories and tags. */
export function loadIconIndex(): Promise<IconMeta[]> {
  index ??= import('virtual:icons/index').then((m) => m.default)
  return index
}

/** Korean names of the Phosphor categories, in menu order. */
export const ICON_CATEGORIES: { key: string; label: string }[] = [
  { key: 'arrows', label: '화살표' },
  { key: 'system', label: '시스템' },
  { key: 'office', label: '사무' },
  { key: 'communications', label: '소통' },
  { key: 'people', label: '사람' },
  { key: 'technology & development', label: '기술·개발' },
  { key: 'design', label: '디자인' },
  { key: 'editor', label: '글 편집' },
  { key: 'media', label: '미디어' },
  { key: 'commerce', label: '쇼핑' },
  { key: 'finances', label: '금융' },
  { key: 'maps & travel', label: '지도·여행' },
  { key: 'health & wellness', label: '건강' },
  { key: 'nature', label: '자연' },
  { key: 'weather', label: '날씨' },
  { key: 'objects', label: '사물' },
  { key: 'games', label: '게임' },
  { key: 'brands', label: '브랜드' },
]

/** Icons whose name or tags contain every word of `query`, best (name) matches first. */
export function searchIcons(all: IconMeta[], query: string, limit = 240): IconMeta[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const hits: { icon: IconMeta; score: number }[] = []
  for (const icon of all) {
    let score = 0
    for (const w of words) {
      if (icon.n.includes(w)) score += icon.n.startsWith(w) ? 3 : 2
      else if (icon.t.some((t) => t.includes(w))) score += 1
      else {
        score = -1
        break
      }
    }
    if (score > 0) hits.push({ icon, score })
  }
  hits.sort((a, b) => b.score - a.score || a.icon.n.localeCompare(b.icon.n))
  return hits.slice(0, limit).map((h) => h.icon)
}

const RECENT_KEY = 'boardline.recentIcons'

export function recentIcons(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').slice(0, 10) : []
  } catch {
    return []
  }
}

export function rememberIcon(name: string): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([name, ...recentIcons().filter((n) => n !== name)].slice(0, 10)))
  } catch {
    // Recent icons are a convenience only.
  }
}
