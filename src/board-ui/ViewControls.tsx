// The column of view controls at the board's right edge, laid out like Obsidian's canvas:
// board settings, zoom (in, back to 100%, fit, out), undo and redo, and help.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { BoardEditor, EditorStatus } from '@boardline/core/engine/editor'
import {
  CheckIcon,
  FitIcon,
  GearIcon,
  GridIcon,
  HelpIcon,
  SlidesIcon,
  LockIcon,
  MinusIcon,
  PlusIcon,
  RedoIcon,
  ResetZoomIcon,
  SnapObjectsIcon,
  UndoIcon,
} from './icons'

/** Snapping while dragging: to the grid, to other objects. Kept per device for every board. */
export interface SnapSettings {
  grid: boolean
  objects: boolean
}

const SNAP_KEY = 'boardline.snap'

export function readSnapSettings(): SnapSettings {
  try {
    const v = JSON.parse(localStorage.getItem(SNAP_KEY) ?? 'null') as Partial<SnapSettings> | null
    if (v && typeof v.grid === 'boolean' && typeof v.objects === 'boolean') return { grid: v.grid, objects: v.objects }
  } catch {
    // Storage unavailable: the defaults.
  }
  return { grid: true, objects: true }
}

export function writeSnapSettings(s: SnapSettings): void {
  try {
    localStorage.setItem(SNAP_KEY, JSON.stringify(s))
  } catch {
    // Not kept; it still applies to this session.
  }
}

/** Whether a board is shown read-only here (per device, like its view). */
export function readReadOnly(boardId: string): boolean {
  try {
    return localStorage.getItem(`boardline.readonly.${boardId}`) === '1'
  } catch {
    return false
  }
}

export function writeReadOnly(boardId: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(`boardline.readonly.${boardId}`, '1')
    else localStorage.removeItem(`boardline.readonly.${boardId}`)
  } catch {
    // Not kept.
  }
}

interface Props {
  editor: BoardEditor
  status: EditorStatus | null
  snap: SnapSettings
  onSnap(s: SnapSettings): void
  readOnly: boolean
  onReadOnly(on: boolean): void
  helpOpen: boolean
  onHelp(): void
  /** The presenting order panel. */
  slidesOpen: boolean
  onSlides(): void
}

export function ViewControls({ editor, status, snap, onSnap, readOnly, onReadOnly, helpOpen, onHelp, slidesOpen, onSlides }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // The settings menu closes on a press elsewhere or Esc.
  useEffect(() => {
    if (!menuOpen) return
    const doc = rootRef.current?.ownerDocument ?? document
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    doc.addEventListener('pointerdown', onDown, true)
    doc.addEventListener('keydown', onKey)
    return () => {
      doc.removeEventListener('pointerdown', onDown, true)
      doc.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const zoom = Math.round((status?.zoom ?? 1) * 100)
  const run = (fn: () => void) => () => {
    fn()
    editor.focus()
  }
  return (
    <div className="bl-view-controls" ref={rootRef}>
      <div className="bl-control-group">
        <button className={menuOpen ? 'active' : ''} title="보드 설정" onClick={() => setMenuOpen((v) => !v)}>
          <GearIcon />
        </button>
      </div>
      {menuOpen && (
        <div className="bl-menu bl-settings-menu">
          <CheckItem icon={<GridIcon />} label="그리드에 맞추기" checked={snap.grid} onClick={() => onSnap({ ...snap, grid: !snap.grid })} />
          <CheckItem icon={<SnapObjectsIcon />} label="객체에 맞추기" checked={snap.objects} onClick={() => onSnap({ ...snap, objects: !snap.objects })} />
          <CheckItem
            icon={<LockIcon />}
            label="읽기 전용"
            checked={readOnly}
            onClick={() => {
              onReadOnly(!readOnly)
              setMenuOpen(false)
            }}
          />
        </div>
      )}
      <div className="bl-control-group">
        <button title="확대" onClick={run(() => editor.zoomBy(1.25))}>
          <PlusIcon />
        </button>
        <button title={`화면 비율 초기화 (Ctrl+0) · 지금 ${zoom}%`} onClick={run(() => editor.resetZoom())}>
          <ResetZoomIcon />
        </button>
        <button title="화면 맞춤 확대 (Shift+1)" onClick={run(() => editor.zoomToFit(false))}>
          <FitIcon />
        </button>
        <button title="축소" onClick={run(() => editor.zoomBy(1 / 1.25))}>
          <MinusIcon />
        </button>
      </div>
      {!readOnly && (
        <div className="bl-control-group">
          <button disabled={!status?.canUndo} title="실행 취소 (Ctrl+Z)" onClick={run(() => editor.undo())}>
            <UndoIcon />
          </button>
          <button disabled={!status?.canRedo} title="다시 실행 (Ctrl+Shift+Z)" onClick={run(() => editor.redo())}>
            <RedoIcon />
          </button>
        </div>
      )}
      <div className="bl-control-group">
        <button className={slidesOpen ? 'active' : ''} title="발표 순서" onClick={onSlides}>
          <SlidesIcon />
        </button>
        <button className={helpOpen ? 'active' : ''} title="보드 도움말 (Shift+/)" onClick={onHelp}>
          <HelpIcon />
        </button>
      </div>
    </div>
  )
}

function CheckItem(props: { icon: ReactNode; label: string; checked: boolean; onClick: () => void }) {
  return (
    <button className="bl-menu-item" role="menuitemcheckbox" aria-checked={props.checked} onClick={props.onClick}>
      <span className="bl-menu-icon">{props.icon}</span>
      <span className="bl-menu-label">{props.label}</span>
      <span className="bl-menu-check">{props.checked && <CheckIcon />}</span>
    </button>
  )
}
