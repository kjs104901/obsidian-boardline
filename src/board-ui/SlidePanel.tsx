// The presenting order, opened from the view controls: the board's sections as slides, dragged
// into the order a presentation shows them. A click shows a section; ▶ presents from it.

import { useState } from 'react'
import type { BoardEditor, EditorStatus } from '@boardline/core/engine/editor'
import { CloseIcon } from './icons'
import { t } from '@boardline/core/i18n'

interface Props {
  editor: BoardEditor
  /** Redraws the list when the board changes. */
  status: EditorStatus | null
  readOnly: boolean
  onPresent: (from: number) => void
  onClose: () => void
}

/** Triangle pointing right, for "present". */
function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <path d="M3 1.8v8.4L10 6z" />
    </svg>
  )
}

export function SlidePanel({ editor, status, readOnly, onPresent, onClose }: Props) {
  void status
  const sections = editor.slideSections()
  const [dragging, setDragging] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)

  const move = (from: number, to: number) => {
    if (from === to) return
    const ids = sections.map((s) => s.id)
    const [id] = ids.splice(from, 1)
    ids.splice(to > from ? to - 1 : to, 0, id)
    editor.setSlideOrder(ids)
  }

  return (
    <div className="bl-slide-panel" onPointerDown={(e) => e.stopPropagation()}>
      <header>
        <span>{t('slides.title')}</span>
        <button title={t('slides.presentAll')} className="bl-slide-present" onClick={() => onPresent(0)}>
          <PlayIcon />
          {t('present')}
        </button>
        <button title={t('common.close')} onClick={onClose}>
          <CloseIcon />
        </button>
      </header>
      {sections.length === 0 ? (
        <p className="bl-slide-empty">{t('slides.noSections')}</p>
      ) : (
        <ol className="bl-slide-list" onDragLeave={() => setOver(null)}>
          {sections.map((s, i) => (
            <li
              key={s.id}
              draggable={!readOnly}
              className={(dragging === i ? 'dragging' : '') + (over === i && dragging !== null && dragging !== i ? ' drop-before' : '')}
              onDragStart={(e) => {
                setDragging(i)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                if (dragging === null) return
                e.preventDefault()
                // The lower half of a row drops after it.
                const r = e.currentTarget.getBoundingClientRect()
                setOver(e.clientY > r.top + r.height / 2 ? i + 1 : i)
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragging !== null && over !== null) move(dragging, over)
                setDragging(null)
                setOver(null)
              }}
              onDragEnd={() => {
                setDragging(null)
                setOver(null)
              }}
              onClick={() => editor.showSection(s.id)}
            >
              <span className="bl-slide-number">{i + 1}</span>
              <span className="bl-slide-title">{s.text.split('\n')[0].trim() || t('slides.untitled')}</span>
              <button
                title={t('slides.presentFrom')}
                onClick={(e) => {
                  e.stopPropagation()
                  onPresent(i)
                }}
              >
                <PlayIcon />
              </button>
            </li>
          ))}
          {over === sections.length && dragging !== null && <li className="bl-slide-drop-end" />}
        </ol>
      )}
      {sections.length > 1 && !readOnly && <p className="bl-slide-hint">{t('slides.dragHint')}</p>}
    </div>
  )
}
