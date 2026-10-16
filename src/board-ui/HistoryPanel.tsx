import { useEffect, useState } from 'react'
import type { BoardEditor } from '@boardline/core/engine/editor'
import type { WorkspaceStorage } from '@boardline/core/platform/storage'
import { listSnapshots, type Snapshot } from '@boardline/core/board/history'
import type { BoardObject } from '@boardline/core/board/model'
import { parseBoard } from '@boardline/core/board/serialize'
import { CloseIcon } from './icons'
import { language, t } from '@boardline/core/i18n'

interface Props {
  storage: WorkspaceStorage
  root: string
  boardId: string
  editor: BoardEditor
  /** Save the current board and snapshot it, so a restore can itself be undone later. */
  preserveCurrent: () => Promise<void>
  onClose: () => void
}

interface Preview {
  snapshot: Snapshot
  objects: BoardObject[]
  /** Object URL of the SVG picture, or null for an empty board. */
  image: string | null
}

/** Dates in the interface language (made on first use, once the language is set). */
let dateFormat: Intl.DateTimeFormat | null = null
function formatDate(time: Date): string {
  dateFormat ??= new Intl.DateTimeFormat(language(), { month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit', second: '2-digit' })
  return dateFormat.format(time)
}

function relative(time: Date, now: number): string {
  const min = Math.round((now - time.getTime()) / 60000)
  if (min < 1) return t('time.justNow')
  if (min < 60) return t('time.minutesAgo', min)
  const h = Math.round(min / 60)
  if (h < 24) return t('time.hoursAgo', h)
  return t('time.daysAgo', Math.round(h / 24))
}

/** Side panel listing saved versions of the board, with a preview and restore. */
export function HistoryPanel({ storage, root, boardId, editor, preserveCurrent, onClose }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listSnapshots(storage, root, boardId).then(setSnapshots, (e) => setError(String(e)))
  }, [storage, root, boardId])

  // Release the previous preview image.
  useEffect(() => () => void (preview?.image && URL.revokeObjectURL(preview.image)), [preview])

  const open = async (snapshot: Snapshot) => {
    try {
      setError(null)
      const doc = parseBoard(await storage.readFile(root, snapshot.path))
      const objects = doc.ordered()
      const svg = editor.previewSvg(objects)
      const image = svg ? URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })) : null
      setPreview({ snapshot, objects, image })
    } catch (e) {
      setError(t('history.unreadable', String(e)))
    }
  }

  const restore = async () => {
    if (!preview) return
    setBusy(true)
    try {
      await preserveCurrent()
      editor.replaceAll(preview.objects, t('history.restoreUndo'))
      onClose()
    } catch (e) {
      setError(t('history.restoreFailed', String(e)))
    } finally {
      setBusy(false)
    }
  }

  const now = Date.now()
  return (
    <aside className="bl-history-panel" onPointerDown={(e) => e.stopPropagation()}>
      <header>
        <span>{t('history.title')}</span>
        <button title={t('common.close')} onClick={onClose}>
          <CloseIcon />
        </button>
      </header>
      {preview && (
        <div className="bl-history-preview">
          {preview.image ? <img src={preview.image} alt={t('history.preview')} /> : <div className="bl-history-empty">{t('common.emptyBoard')}</div>}
          <button className="bl-primary" disabled={busy} onClick={() => void restore()}>
            {t('history.restore')}
          </button>
        </div>
      )}
      {error && <div className="bl-history-error">{error}</div>}
      <div className="bl-history-list">
        {snapshots === null && <div className="bl-history-empty">{t('common.reading')}</div>}
        {snapshots?.length === 0 && <div className="bl-history-empty">{t('history.empty')}</div>}
        {snapshots?.map((s) => (
          <button key={s.path} className={'bl-history-item' + (preview?.snapshot.path === s.path ? ' active' : '')} onClick={() => void open(s)}>
            <span>{formatDate(s.time)}</span>
            <span className="bl-history-relative">{relative(s.time, now)}</span>
          </button>
        ))}
      </div>
    </aside>
  )
}
