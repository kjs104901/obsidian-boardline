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
import { loadPref, savePref } from '@boardline/core/platform/prefs'
import { t } from '@boardline/core/i18n'

/** Snapping while dragging: to the grid, to other objects. Kept per device for every board. */
export interface SnapSettings {
  grid: boolean
  objects: boolean
}

const SNAP_KEY = 'boardline.snap'

export function readSnapSettings(): SnapSettings {
  const v = loadPref(SNAP_KEY) as Partial<SnapSettings> | null
  if (v && typeof v.grid === 'boolean' && typeof v.objects === 'boolean') return { grid: v.grid, objects: v.objects }
  return { grid: true, objects: true }
}

export function writeSnapSettings(s: SnapSettings): void {
  savePref(SNAP_KEY, s)
}

/** Whether a board is shown read-only here (per device, like its view). */
export function readReadOnly(boardId: string): boolean {
  return loadPref(`boardline.readonly.${boardId}`) === true
}

export function writeReadOnly(boardId: string, on: boolean): void {
  savePref(`boardline.readonly.${boardId}`, on ? true : null)
}

interface Props {
  editor: BoardEditor
  status: EditorStatus | null
  snap: SnapSettings
  onSnap: (s: SnapSettings) => void
  readOnly: boolean
  onReadOnly: (on: boolean) => void
  helpOpen: boolean
  onHelp: () => void
  /** The presenting order panel. */
  slidesOpen: boolean
  /** The presenting order panel; absent where there is no presenting. */
  onSlides?: () => void
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
        <button className={menuOpen ? 'active' : ''} title={t('view.settings')} onClick={() => setMenuOpen((v) => !v)}>
          <GearIcon />
        </button>
      </div>
      {menuOpen && (
        <div className="bl-menu bl-settings-menu">
          <CheckItem icon={<GridIcon />} label={t('view.snapGrid')} checked={snap.grid} onClick={() => onSnap({ ...snap, grid: !snap.grid })} />
          <CheckItem icon={<SnapObjectsIcon />} label={t('view.snapObjects')} checked={snap.objects} onClick={() => onSnap({ ...snap, objects: !snap.objects })} />
          <CheckItem
            icon={<LockIcon />}
            label={t('readOnly')}
            checked={readOnly}
            onClick={() => {
              onReadOnly(!readOnly)
              setMenuOpen(false)
            }}
          />
        </div>
      )}
      <div className="bl-control-group">
        <button title={t('view.zoomIn')} onClick={run(() => editor.zoomBy(1.25))}>
          <PlusIcon />
        </button>
        <button title={t('view.resetZoom', zoom)} onClick={run(() => editor.resetZoom())}>
          <ResetZoomIcon />
        </button>
        <button title={t('view.fitKey')} onClick={run(() => editor.zoomToFit(false))}>
          <FitIcon />
        </button>
        <button title={t('view.zoomOut')} onClick={run(() => editor.zoomBy(1 / 1.25))}>
          <MinusIcon />
        </button>
      </div>
      {!readOnly && (
        <div className="bl-control-group">
          <button disabled={!status?.canUndo} title={t('view.undo')} onClick={run(() => editor.undo())}>
            <UndoIcon />
          </button>
          <button disabled={!status?.canRedo} title={t('view.redo')} onClick={run(() => editor.redo())}>
            <RedoIcon />
          </button>
        </div>
      )}
      <div className="bl-control-group">
        {onSlides && (
          <button className={slidesOpen ? 'active' : ''} title={t('slides.title')} onClick={onSlides}>
            <SlidesIcon />
          </button>
        )}
        <button className={helpOpen ? 'active' : ''} title={t('view.help')} onClick={onHelp}>
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
