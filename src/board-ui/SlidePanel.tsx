// The presenting order, opened from the view controls: the board's sections as slides, dragged
// into the order a presentation shows them. A click shows a section; ▶ presents from it.

import { useState } from 'react'
import type { BoardEditor, EditorStatus } from '@boardline/core/engine/editor'
import { CloseIcon } from './icons'

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
        <span>발표 순서</span>
        <button title="처음부터 발표 (F5)" className="bl-slide-present" onClick={() => onPresent(0)}>
          <PlayIcon />
          발표
        </button>
        <button title="닫기" onClick={onClose}>
          <CloseIcon />
        </button>
      </header>
      {sections.length === 0 ? (
        <p className="bl-slide-empty">섹션이 없으면 보드 전체를 한 장으로 보여 줍니다. 섹션(.)으로 장을 나누면 여기에 차례로 나옵니다.</p>
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
              <span className="bl-slide-title">{s.text.split('\n')[0].trim() || '제목 없는 섹션'}</span>
              <button
                title="여기서부터 발표"
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
      {sections.length > 1 && !readOnly && <p className="bl-slide-hint">끌어서 순서를 바꿉니다. 누르면 그 섹션으로 갑니다.</p>}
    </div>
  )
}
