// Menus about the selected objects: the selection bar's "more" menu and the right-click menu
// share these rows (copying, style, order, alignment, grouping, the lock, links, and more).

import type { ReactNode } from 'react'
import type { BoardEditor, EditorStatus } from '@boardline/core/engine/editor'
import { isFlowShape, isMindmap, isShape } from '@boardline/core/board/model'

export const ALIGN: { how: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'; label: string; key: string }[] = [
  { how: 'left', label: '왼쪽 맞춤', key: 'Alt+A' },
  { how: 'hcenter', label: '가로 가운데 맞춤', key: 'Alt+H' },
  { how: 'right', label: '오른쪽 맞춤', key: 'Alt+D' },
  { how: 'top', label: '위쪽 맞춤', key: 'Alt+W' },
  { how: 'vcenter', label: '세로 가운데 맞춤', key: 'Alt+V' },
  { how: 'bottom', label: '아래쪽 맞춤', key: 'Alt+S' },
]

export const COPY_AS: { format: Parameters<BoardEditor['copyAs']>[0]; label: string; key?: string; done: string }[] = [
  { format: 'png', label: 'PNG', key: 'Ctrl+Shift+C', done: 'PNG로 복사했습니다' },
  { format: 'png-bg', label: 'PNG (배경 포함)', done: '배경 포함 PNG로 복사했습니다' },
  { format: 'png-dark', label: 'PNG (다크 모드)', done: '다크 모드 PNG로 복사했습니다' },
  { format: 'png-light', label: 'PNG (라이트 모드)', done: '라이트 모드 PNG로 복사했습니다' },
  { format: 'svg', label: 'SVG', done: 'SVG로 복사했습니다' },
  { format: 'mermaid', label: 'Mermaid', done: 'Mermaid로 복사했습니다' },
  { format: 'markdown', label: 'Markdown', done: 'Markdown으로 복사했습니다' },
]

type TableOp = Parameters<BoardEditor['tableEdit']>[0]

/** The table menu; `sep` starts a new group. */
export const TABLE_OPS: { op: TableOp; label: string; key?: string; sep?: boolean }[] = [
  { op: 'rowAbove', label: '위에 행 추가' },
  { op: 'rowBelow', label: '아래에 행 추가' },
  { op: 'colLeft', label: '왼쪽에 열 추가' },
  { op: 'colRight', label: '오른쪽에 열 추가' },
  { op: 'rowUp', label: '행을 위로', key: 'Alt+↑', sep: true },
  { op: 'rowDown', label: '행을 아래로', key: 'Alt+↓' },
  { op: 'colBack', label: '열을 왼쪽으로', key: 'Alt+←' },
  { op: 'colOn', label: '열을 오른쪽으로', key: 'Alt+→' },
  { op: 'deleteRow', label: '행 삭제', sep: true },
  { op: 'deleteCol', label: '열 삭제' },
  { op: 'fit', label: '열 너비 맞추기', sep: true },
  { op: 'header', label: '첫 행을 머리글로' },
]

/**
 * Whether a table row can't do its thing now: moves need a selected cell with room to go,
 * deletes a row or column to spare.
 */
export function tableOpDisabled(op: TableOp, status: EditorStatus): boolean {
  const t = status.selected[0]
  if (!isShape(t) || t.shape !== 'table') return true
  const rows = t.cells?.length ?? 2
  const cols = t.cols?.length ?? 2
  const c = status.tableCell
  switch (op) {
    case 'rowUp':
      return !c || c.row === 0
    case 'rowDown':
      return !c || c.row >= rows - 1
    case 'colBack':
      return !c || c.col === 0
    case 'colOn':
      return !c || c.col >= cols - 1
    case 'deleteRow':
      return rows <= 1
    case 'deleteCol':
      return cols <= 1
    default:
      return false
  }
}

export interface ObjectMenuProps {
  editor: BoardEditor
  status: EditorStatus
  /** Close the menu (a row did its thing). */
  done: () => void
  onNotice?: (text: string) => void
  /** Open the link box: link the selected shapes, or point a link object elsewhere. */
  onLinkDialog?: (mode: 'shape' | 'edit', id?: string, initial?: string) => void
  /** Make a note of the selection; absent where the app can't save notes. */
  onExportNote?: () => void
  /** Paste here (the right-click menu has a place to paste at). */
  onPaste?: () => void
}

/** The rows about the selected objects. */
export function ObjectMenuItems({ editor, status, done, onNotice, onLinkDialog, onExportNote, onPaste }: ObjectMenuProps) {
  const shapes = status.selected.filter(isShape)
  const flow = shapes.length > 0 && shapes.every(isFlowShape) ? shapes : []
  const locked = status.selected.every((o) => o.locked)
  const single = status.selected.length === 1 ? status.selected[0] : null
  const linkable = shapes.filter((s) => s.shape !== 'link' && s.shape !== 'note')
  const run = (fn: () => void) => () => {
    fn()
    done()
  }
  const paste = onPaste ? <MenuItem label="붙여넣기" keys="Ctrl+V" disabled={editor.isReadOnly()} onClick={run(onPaste)} /> : null
  const copyAs = async (c: (typeof COPY_AS)[number]) => {
    done()
    const ok = await editor.copyAs(c.format)
    onNotice?.(ok ? c.done : '복사하지 못했습니다')
  }
  const grouped = shapes.length >= 2 && shapes.every((s) => s.groupId && s.groupId === shapes[0].groupId)
  return (
    <>
      <MenuItem label="복사" keys="Ctrl+C" onClick={run(() => editor.copySelection(false))} />
      <MenuItem label="잘라내기" keys="Ctrl+X" disabled={locked} onClick={run(() => editor.copySelection(true))} />
      {paste}
      <MenuItem label="복제" keys="Ctrl+D" onClick={run(() => editor.duplicateSelection())} />
      <MenuItem label="삭제" keys="Delete" disabled={locked} onClick={run(() => editor.deleteSelection())} />
      <hr />
      <SubMenu label="다른 형식으로 복사">
        {COPY_AS.map((c) => (
          <MenuItem key={c.format} label={c.label} keys={c.key} onClick={() => void copyAs(c)} />
        ))}
      </SubMenu>
      {onExportNote && <MenuItem label="노트로 내보내기" onClick={run(onExportNote)} />}
      <hr />
      <SubMenu label="순서">
        <MenuItem label="앞으로" keys="Ctrl+Alt+]" onClick={run(() => editor.reorder('forward'))} />
        <MenuItem label="맨 앞으로" keys="Alt+]" onClick={run(() => editor.reorder('front'))} />
        <MenuItem label="뒤로" keys="Ctrl+Alt+[" onClick={run(() => editor.reorder('backward'))} />
        <MenuItem label="맨 뒤로" keys="Alt+[" onClick={run(() => editor.reorder('back'))} />
      </SubMenu>
      {shapes.length >= 2 && (
        <SubMenu label="맞춤">
          {ALIGN.map((a) => (
            <MenuItem key={a.how} label={a.label} keys={a.key} onClick={run(() => editor.align(a.how))} />
          ))}
          <hr />
          <MenuItem label="가로 간격 같게" disabled={shapes.length < 3} onClick={run(() => editor.distribute('h'))} />
          <MenuItem label="세로 간격 같게" disabled={shapes.length < 3} onClick={run(() => editor.distribute('v'))} />
        </SubMenu>
      )}
      {!locked && flow.length > 0 && (
        <SubMenu label="자동 정렬">
          <MenuItem label="위에서 아래로" keys="Shift+Alt+V" onClick={run(() => void editor.autoLayout('DOWN'))} />
          <MenuItem label="왼쪽에서 오른쪽으로" keys="Shift+Alt+H" onClick={run(() => void editor.autoLayout('RIGHT'))} />
        </SubMenu>
      )}
      {shapes.length >= 2 && <MenuItem label={grouped ? '그룹 해제' : '그룹'} keys={grouped ? 'Ctrl+Shift+G' : 'Ctrl+G'} onClick={run(() => editor.setGroup(!grouped))} />}
      <MenuItem label={locked ? '잠금 해제' : '잠금'} keys="Shift+L" onClick={run(() => editor.toggleLock())} />
      <hr />
      <SubMenu label="스타일">
        <MenuItem
          label="스타일 복사"
          keys="Ctrl+Alt+C"
          onClick={run(() => {
            if (editor.copyStyle()) onNotice?.('스타일을 복사했습니다')
          })}
        />
        <MenuItem label="스타일 붙여넣기" keys="Ctrl+Alt+V" disabled={locked || !editor.canPasteStyle()} onClick={run(() => editor.pasteStyle())} />
        <MenuItem
          label="기본 스타일로 저장"
          keys="Ctrl+Shift+D"
          disabled={!single || isMindmap(single)}
          onClick={run(() => {
            if (editor.saveDefaultStyle()) onNotice?.('새로 만드는 객체에 이 스타일을 씁니다')
          })}
        />
      </SubMenu>
      <SubMenu label="링크">
        {linkable.length > 0 && (
          <MenuItem
            label={linkable.some((s) => s.link) ? '링크 바꾸기…' : '링크 걸기…'}
            disabled={locked}
            onClick={run(() => onLinkDialog?.('shape', undefined, linkable.find((s) => s.link)?.link))}
          />
        )}
        {linkable.some((s) => s.link) && <MenuItem label="링크 없애기" disabled={locked} onClick={run(() => editor.setLink(null))} />}
        <MenuItem label="객체 링크 복사" keys="Ctrl+L" disabled={status.selected.length !== 1} onClick={run(() => void editor.copyLink(false))} />
        <MenuItem label="보드 위치 링크 복사" onClick={run(() => void editor.copyLink(true))} />
      </SubMenu>
      <MenuItem label="섹션으로 감싸기" onClick={run(() => editor.wrapInSection())} />
      <MenuItem label="격자에 맞추기" disabled={locked || shapes.length === 0} onClick={run(() => editor.snapSelectionToGrid())} />
    </>
  )
}

export function MenuItem(props: { label: string; keys?: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button className="bl-menu-item" disabled={props.disabled} onClick={props.onClick}>
      <span>{props.label}</span>
      {props.keys && <kbd>{props.keys}</kbd>}
    </button>
  )
}

/** A menu row that opens its items beside it on hover. */
export function SubMenu(props: { label: string; disabled?: boolean; children: ReactNode }) {
  return (
    <div className={'bl-menu-sub' + (props.disabled ? ' disabled' : '')}>
      <button className="bl-menu-item" disabled={props.disabled}>
        <span>{props.label}</span>
        <span className="bl-chevron">›</span>
      </button>
      {!props.disabled && <div className="bl-menu bl-submenu">{props.children}</div>}
    </div>
  )
}

