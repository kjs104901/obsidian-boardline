import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { BoardEditor } from '@boardline/core/engine/editor'
import { ArrowDownIcon, ArrowUpIcon, ChevronIcon, CloseIcon } from './icons'
import { t } from '@boardline/core/i18n'

interface Props {
  editor: BoardEditor
  /** Query to start with (the last one, or one the view asks for). */
  initialQuery: string
  /** Open with the replace row showing (Ctrl+H). */
  replace?: boolean
  /** No replacing on a read-only board. */
  readOnly?: boolean
  onQueryChange: (query: string) => void
  onNotice?: (text: string) => void
  onClose: () => void
}

/**
 * Ctrl+F: find text on the board; Enter / Shift+Enter step through the matches. Ctrl+H (or the
 * arrow) adds a row to replace the text in the current match or in all of them.
 */
export function FindBar({ editor, initialQuery, replace = false, readOnly = false, onQueryChange, onNotice, onClose }: Props) {
  const [query, setQuery] = useState(initialQuery)
  const [found, setFound] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const [replacing, setReplacing] = useState(replace && !readOnly)
  const [replacement, setReplacement] = useState('')
  const [round, setRound] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const ids = query.trim() ? editor.findMatches(query) : []
    setFound(ids)
    setIndex((i) => (round > 0 ? Math.min(i, Math.max(0, ids.length - 1)) : 0))
    editor.setHighlights(ids)
    if (ids.length > 0 && round === 0) editor.revealObject(ids[0])
    // `round` counts replacements: the matches are looked up again after each.
  }, [query, editor, round])

  // Clear the highlights when the bar closes.
  useEffect(() => () => editor.setHighlights([]), [editor])

  const step = (delta: number) => {
    if (found.length === 0) return
    const next = (index + delta + found.length) % found.length
    setIndex(next)
    editor.revealObject(found[next])
  }

  const replaceIn = (ids: string[]) => {
    const count = editor.replaceText(ids, query, replacement)
    onNotice?.(count ? t('find.replaced', count) : t('find.nothingToReplace'))
    setRound((r) => r + 1)
    // The next match comes forward after the current one is replaced.
    const rest = editor.findMatches(query)
    if (rest.length) editor.revealObject(rest[Math.min(index, rest.length - 1)])
  }

  const onKey = (e: KeyboardEvent, enter: () => void) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter') {
      e.preventDefault()
      enter()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div className="bl-find-bar" onPointerDown={(e) => e.stopPropagation()}>
      <div className="bl-find-row">
        {!readOnly && (
          <button
            className="bl-find-toggle"
            title={replacing ? t('find.closeReplace') : t('find.openReplace')}
            onClick={() => {
              setReplacing((v) => !v)
              window.setTimeout(() => (replacing ? inputRef : replaceRef).current?.focus())
            }}
          >
            <ChevronIcon open={replacing} />
          </button>
        )}
        <input
          ref={inputRef}
          value={query}
          placeholder={t('find.placeholder')}
          onChange={(e) => {
            setRound(0)
            setQuery(e.target.value)
            onQueryChange(e.target.value)
          }}
          onKeyDown={(e) => onKey(e, () => step(e.shiftKey ? -1 : 1))}
        />
        <span className="bl-find-count">{query.trim() ? (found.length ? `${index + 1} / ${found.length}` : t('find.none')) : ''}</span>
        <button title={t('find.prev')} disabled={found.length === 0} onClick={() => step(-1)}>
          <ArrowUpIcon />
        </button>
        <button title={t('find.next')} disabled={found.length === 0} onClick={() => step(1)}>
          <ArrowDownIcon />
        </button>
        <button title={t('common.closeEsc')} onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      {replacing && (
        <div className="bl-find-row">
          <span className="bl-find-toggle-space" />
          <input
            ref={replaceRef}
            value={replacement}
            placeholder={t('find.replaceWith')}
            autoFocus={replace}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={(e) => onKey(e, () => found.length && replaceIn([found[index]]))}
          />
          <button className="bl-find-text" title={t('find.replaceOne')} disabled={found.length === 0} onClick={() => replaceIn([found[index]])}>
            {t('find.replace')}
          </button>
          <button className="bl-find-text" title={t('find.replaceAllTitle')} disabled={found.length === 0} onClick={() => replaceIn(found)}>
            {t('find.replaceAll')}
          </button>
        </div>
      )}
    </div>
  )
}
