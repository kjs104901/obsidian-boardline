import { useEffect, useMemo, useState } from 'react'
import {
  ICON_BOX,
  ICON_CATEGORIES,
  ICONS_EVENT,
  iconPaths,
  loadIconIndex,
  loadIconSet,
  recentIcons,
  rememberIcon,
  searchIcons,
  type IconMeta,
  type IconStyle,
} from '@boardline/core/icons/iconData'
import { BackIcon } from './icons'
import { t } from '@boardline/core/i18n'

/** Re-render when icon data finishes loading. */
function useIconsLoaded(): void {
  const [, setTick] = useState(0)
  useEffect(() => {
    const on = () => setTick((t) => t + 1)
    window.addEventListener(ICONS_EVENT, on)
    return () => window.removeEventListener(ICONS_EVENT, on)
  }, [])
}

/** An icon as inline SVG in the current text color; the duotone layer takes `tint`. */
export function IconGlyph({ name, style, size = 20, tint = 'var(--accent)' }: { name: string; style: IconStyle; size?: number; tint?: string }) {
  useIconsLoaded()
  const paths = iconPaths(name, style)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${ICON_BOX} ${ICON_BOX}`} fill="currentColor" aria-hidden>
      {paths?.map((d, i) => (d.startsWith('~') ? <path key={i} d={d.slice(1)} fill={tint} opacity={tint === 'currentColor' ? 0.35 : 1} /> : <path key={i} d={d} />))}
    </svg>
  )
}

const STYLES: { style: IconStyle; label: string }[] = [
  { style: 'color', get label() { return t('icon.styleColor') } },
  { style: 'fill', get label() { return t('icon.styleFill') } },
  { style: 'outline', get label() { return t('style.outline') } },
]

interface Props {
  style: IconStyle
  onStyle: (style: IconStyle) => void
  onPick: (name: string) => void
  /** Shown when the selection already has an icon. */
  onRemove?: () => void
  onClose?: () => void
}

/** Icon library: search, three looks, recently used icons and categories. */
export function IconPicker({ style, onStyle, onPick, onRemove, onClose }: Props) {
  const [all, setAll] = useState<IconMeta[] | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void loadIconIndex().then((list) => alive && setAll(list))
    return () => {
      alive = false
    }
  }, [])
  useEffect(() => {
    void loadIconSet(style)
  }, [style])

  const shown = useMemo(() => {
    if (!all) return []
    if (query.trim()) return searchIcons(all, query)
    if (category) return all.filter((i) => i.c.includes(category))
    return []
  }, [all, query, category])
  const recent = recentIcons()
  const pick = (name: string) => {
    rememberIcon(name)
    onPick(name)
  }
  const categoryLabel = ICON_CATEGORIES.find((c) => c.key === category)?.label

  return (
    <div className="bl-icon-picker" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {category && !query && (
        <div className="bl-icon-picker-title">
          <button title={t('icon.backToCategories')} onClick={() => setCategory(null)}>
            <BackIcon />
          </button>
          <span>{categoryLabel}</span>
        </div>
      )}
      <div className="bl-icon-picker-head">
        <input
          autoFocus
          placeholder={t('icon.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose?.()
            if (e.key === 'Enter' && shown[0]) pick(shown[0].n)
          }}
        />
        {STYLES.map((s) => (
          <button key={s.style} title={s.label} className={style === s.style ? 'active' : ''} onClick={() => onStyle(s.style)}>
            <IconGlyph name="star" style={s.style} size={16} tint="currentColor" />
          </button>
        ))}
      </div>
      {!query && !category && (
        <>
          {recent.length > 0 && (
            <div className="bl-icon-grid">
              {recent.map((n) => (
                <button key={n} title={n} onClick={() => pick(n)}>
                  <IconGlyph name={n} style={style} size={22} />
                </button>
              ))}
            </div>
          )}
          {onRemove && (
            <button className="bl-icon-picker-row" onClick={onRemove}>
              {t('icon.remove')}
            </button>
          )}
          <div className="bl-icon-categories">
            {ICON_CATEGORIES.map((c) => (
              <button key={c.key} className="bl-icon-picker-row" onClick={() => setCategory(c.key)}>
                {c.label}
              </button>
            ))}
          </div>
        </>
      )}
      {(query || category) && (
        <div className="bl-icon-grid bl-scroll">
          {!all && <span className="bl-icon-picker-empty">{t('common.loading')}</span>}
          {all && shown.length === 0 && <span className="bl-icon-picker-empty">{t('icon.noResults')}</span>}
          {shown.map((i) => (
            <button key={i.n} title={i.n} onClick={() => pick(i.n)}>
              <IconGlyph name={i.n} style={style} size={22} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
