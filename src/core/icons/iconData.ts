import { t } from '../i18n'
import { loadPref, savePref } from '../platform/prefs'
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
  { key: 'arrows', get label() { return t('iconCat.arrows') } },
  { key: 'system', get label() { return t('iconCat.system') } },
  { key: 'office', get label() { return t('iconCat.office') } },
  { key: 'communications', get label() { return t('iconCat.communication') } },
  { key: 'people', get label() { return t('iconCat.people') } },
  { key: 'technology & development', get label() { return t('iconCat.development') } },
  { key: 'design', get label() { return t('iconCat.design') } },
  { key: 'editor', get label() { return t('iconCat.editor') } },
  { key: 'media', get label() { return t('iconCat.media') } },
  { key: 'commerce', get label() { return t('iconCat.commerce') } },
  { key: 'finances', get label() { return t('iconCat.finance') } },
  { key: 'maps & travel', get label() { return t('iconCat.map') } },
  { key: 'health & wellness', get label() { return t('iconCat.health') } },
  { key: 'nature', get label() { return t('iconCat.nature') } },
  { key: 'weather', get label() { return t('iconCat.weather') } },
  { key: 'objects', get label() { return t('iconCat.objects') } },
  { key: 'games', get label() { return t('iconCat.games') } },
  { key: 'brands', get label() { return t('iconCat.brands') } },
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
  const list = loadPref(RECENT_KEY)
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').slice(0, 10) : []
}

export function rememberIcon(name: string): void {
  savePref(RECENT_KEY, [name, ...recentIcons().filter((n) => n !== name)].slice(0, 10))
}
