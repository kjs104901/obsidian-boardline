import { useEffect, useState } from 'react'
import type { BoardEditor } from '@boardline/core/engine/editor'
import type { WorkspaceStorage } from '@boardline/core/platform/storage'
import { listSnapshots, type Snapshot } from '@boardline/core/board/history'
import type { BoardObject } from '@boardline/core/board/model'
import { parseBoard } from '@boardline/core/board/serialize'
import { CloseIcon } from './icons'

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

const dateFormat = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit', second: '2-digit' })

function relative(time: Date, now: number): string {
  const min = Math.round((now - time.getTime()) / 60000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  const h = Math.round(min / 60)
  if (h < 24) return `${h}시간 전`
  return `${Math.round(h / 24)}일 전`
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
      setError(`이 버전을 읽을 수 없습니다: ${String(e)}`)
    }
  }

  const restore = async () => {
    if (!preview) return
    setBusy(true)
    try {
      await preserveCurrent()
      editor.replaceAll(preview.objects, '버전 복원')
      onClose()
    } catch (e) {
      setError(`복원하지 못했습니다: ${String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const now = Date.now()
  return (
    <aside className="bl-history-panel" onPointerDown={(e) => e.stopPropagation()}>
      <header>
        <span>버전 기록</span>
        <button title="닫기" onClick={onClose}>
          <CloseIcon />
        </button>
      </header>
      {preview && (
        <div className="bl-history-preview">
          {preview.image ? <img src={preview.image} alt="미리보기" /> : <div className="bl-history-empty">빈 보드</div>}
          <button className="bl-primary" disabled={busy} onClick={() => void restore()}>
            이 버전으로 복원
          </button>
        </div>
      )}
      {error && <div className="bl-history-error">{error}</div>}
      <div className="bl-history-list">
        {snapshots === null && <div className="bl-history-empty">읽는 중…</div>}
        {snapshots?.length === 0 && <div className="bl-history-empty">아직 저장된 버전이 없습니다. 편집하면 편집 전 상태와 10분마다의 상태가 남습니다.</div>}
        {snapshots?.map((s) => (
          <button key={s.path} className={'bl-history-item' + (preview?.snapshot.path === s.path ? ' active' : '')} onClick={() => void open(s)}>
            <span>{dateFormat.format(s.time)}</span>
            <span className="bl-history-relative">{relative(s.time, now)}</span>
          </button>
        ))}
      </div>
    </aside>
  )
}
