// The right-click menu: first what can be done with the kind of thing clicked (a line, a mind
// map node, a note card, a table…) or, on the empty board, what can go there; then the rows
// every selection has.

import { Fragment, useEffect, useLayoutEffect, useRef } from 'react'
import { isConnector, isFlowShape, isMindmap, isShape, type ShapeKind } from '@boardline/core/board/model'
import type { BoardEditor, EditorStatus } from '@boardline/core/engine/editor'
import type { Point } from '@boardline/core/engine/geometry'
import { COPY_AS, MenuItem, ObjectMenuItems, SubMenu, TABLE_OPS, tableOpDisabled, type ObjectMenuProps } from './ObjectMenu'
import { BASIC_SHAPES } from './shapeKinds'
import { LINE_KINDS } from './SelectionToolbar'

interface Props extends Omit<ObjectMenuProps, 'done' | 'status' | 'onPaste'> {
  editor: BoardEditor
  status: EditorStatus | null
  /** Where the menu opens (board view coordinates) and the board point under it. */
  at: Point
  board: Point
  /** Opened on an object (now selected), else on the empty board. */
  onObject: boolean
  readOnly: boolean
  onClose: () => void
  onOpenLink?: (link: string) => void
  /** Put a workspace file here; absent where files can't be read. */
  onAddFile?: (at: Point) => void
  onPresent: (from: number) => void
  onImportMermaid: () => void
}

const ADD_HERE: { kind: ShapeKind; label: string; key: string }[] = [
  { kind: 'rect', label: '사각형', key: 'R' },
  { kind: 'sticky', label: '스티키 노트', key: 'N' },
  { kind: 'text', label: '텍스트', key: 'T' },
  { kind: 'section', label: '섹션', key: '.' },
  { kind: 'table', label: '표', key: 'E' },
]

export function ContextMenu(props: Props) {
  const { editor, status, at, board, onObject, readOnly, onClose } = props
  const ref = useRef<HTMLDivElement>(null)

  // Inside the board: moved left or up when it would run off the edge.
  useLayoutEffect(() => {
    const el = ref.current
    const parent = el?.offsetParent as HTMLElement | null
    if (!el || !parent) return
    const left = Math.max(8, Math.min(at.x, parent.clientWidth - el.offsetWidth - 8))
    el.style.left = `${left}px`
    el.style.top = `${Math.max(8, Math.min(at.y, parent.clientHeight - el.offsetHeight - 8))}px`
    // Submenus open to the left when there is no room on the right.
    el.classList.toggle('flip-sub', left + el.offsetWidth + 210 > parent.clientWidth)
  })

  // A press elsewhere, Esc or the wheel closes it.
  useEffect(() => {
    const doc = ref.current?.ownerDocument ?? document
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    doc.addEventListener('pointerdown', onDown, true)
    doc.addEventListener('keydown', onKey, true)
    doc.addEventListener('wheel', onClose, true)
    return () => {
      doc.removeEventListener('pointerdown', onDown, true)
      doc.removeEventListener('keydown', onKey, true)
      doc.removeEventListener('wheel', onClose, true)
    }
  }, [onClose])

  const run = (fn: () => void) => () => {
    onClose()
    fn()
  }
  const selected = status?.selected ?? []
  const one = selected.length === 1 ? selected[0] : null
  const editable = !readOnly && one && !one.locked
  const paste = <MenuItem label="붙여넣기" keys="Ctrl+V" disabled={readOnly} onClick={run(() => void editor.pasteAt(board))} />
  // Nothing is selected here, so the whole board is copied.
  const copyBoardAs = async (c: (typeof COPY_AS)[number]) => {
    onClose()
    const ok = await editor.copyAs(c.format)
    props.onNotice?.(ok ? c.done : '복사하지 못했습니다')
  }

  // What the clicked kind of thing can do.
  const kindRows = () => {
    if (!one || !editable) return null
    if (isConnector(one)) {
      return (
        <>
          <MenuItem label={one.label ? '라벨 고치기' : '라벨 달기'} keys="Enter" onClick={run(() => editor.editSelection())} />
          {one.label && one.labelPos !== undefined && (
            <MenuItem
              label="라벨 가운데로"
              onClick={run(() =>
                editor.updateSelected('라벨 옮기기', (o) => {
                  if (!isConnector(o)) return o
                  const { labelPos: _pos, ...rest } = o
                  return rest
                }),
              )}
            />
          )}
          <SubMenu label="선 모양">
            {LINE_KINDS.map((k) => (
              <MenuItem
                key={k.kind}
                label={k.label + (one.kind === k.kind ? ' ✓' : '')}
                onClick={run(() => editor.updateSelected('선 종류', (o) => (isConnector(o) ? { ...o, kind: k.kind } : o)))}
              />
            ))}
          </SubMenu>
          <MenuItem
            label={one.line === 'dashed' ? '실선으로' : '점선으로'}
            onClick={run(() => editor.updateSelected('선 스타일', (o) => (isConnector(o) ? { ...o, line: o.line === 'dashed' ? 'solid' : 'dashed' } : o)))}
          />
          <MenuItem
            label="방향 바꾸기"
            onClick={run(() => editor.updateSelected('방향 바꾸기', (o) => (isConnector(o) ? { ...o, from: o.to, to: o.from, startCap: o.endCap, endCap: o.startCap } : o)))}
          />
        </>
      )
    }
    if (isMindmap(one)) {
      return (
        <>
          <MenuItem label="자식 노드 추가" keys="Tab" onClick={run(() => editor.addChildNode(one.id))} />
          {editor.branchCount(one.id) > 0 && <MenuItem label={one.collapsed ? '가지 펼치기' : '가지 접기'} keys="/" onClick={run(() => editor.toggleFold())} />}
          {one.parentId && <MenuItem label="형제 노드 추가" keys="Ctrl+Enter" onClick={run(() => editor.addSiblingNode(one.id))} />}
          {one.parentId && <MenuItem label="부모 노드 끼워 넣기" keys="Alt+Enter" onClick={run(() => editor.insertParentNode(one.id))} />}
          <MenuItem label="글 고치기" keys="Enter" onClick={run(() => editor.editSelection())} />
          {editor.nodeLevel(one.id) === 1 && <MenuItem label={one.side === 'left' ? '오른쪽으로 보내기' : '왼쪽으로 보내기'} onClick={run(() => editor.flipSide())} />}
          {!one.parentId && editor.branchCount(one.id) > 1 && (
            <>
              <MenuItem label="가지를 양쪽으로 나누기" onClick={run(() => editor.spreadBranches(true))} />
              <MenuItem label="가지를 오른쪽으로 모으기" onClick={run(() => editor.spreadBranches(false))} />
            </>
          )}
        </>
      )
    }
    if (!isShape(one)) return null
    const open = one.link ? <MenuItem label={one.shape === 'note' ? '파일 열기' : '링크 열기'} keys={one.shape === 'note' ? 'Enter' : undefined} onClick={run(() => props.onOpenLink?.(one.link!))} /> : null
    switch (one.shape) {
      case 'image':
        return (
          <>
            <MenuItem label="이미지 자르기" keys="Enter" onClick={run(() => editor.startCrop())} />
            {one.crop && <MenuItem label="자르기 없애기" onClick={run(() => editor.uncrop())} />}
            {open}
          </>
        )
      case 'note':
      case 'freehand':
        return open
      case 'link':
        return (
          <>
            {open}
            <MenuItem label="링크 바꾸기…" onClick={run(() => props.onLinkDialog?.('edit', one.id, one.link))} />
            <MenuItem label={one.expanded ? '한 줄로 보기' : '카드로 보기'} onClick={run(() => editor.toggleLinkCard())} />
          </>
        )
      case 'table':
        return (
          <SubMenu label="표">
            {TABLE_OPS.map((t) => (
              <Fragment key={t.op}>
                {t.sep && <hr />}
                <MenuItem label={t.label} keys={t.key} disabled={!status || tableOpDisabled(t.op, status)} onClick={run(() => editor.tableEdit(t.op))} />
              </Fragment>
            ))}
          </SubMenu>
        )
      case 'section': {
        const index = editor.slideSections().findIndex((s) => s.id === one.id)
        return (
          <>
            <MenuItem label="제목 고치기" keys="Enter" onClick={run(() => editor.editSelection())} />
            <MenuItem label="이 섹션부터 발표" onClick={run(() => props.onPresent(Math.max(0, index)))} />
          </>
        )
      }
      default:
        return (
          <>
            <MenuItem label="글 고치기" keys="Enter" onClick={run(() => editor.editSelection())} />
            {isFlowShape(one) && (
              <SubMenu label="도형 바꾸기">
                {BASIC_SHAPES.map((s) => (
                  <MenuItem
                    key={s.kind}
                    label={s.label}
                    onClick={run(() => editor.updateSelected('모양 바꾸기', (o) => (isShape(o) && isFlowShape(o) ? { ...o, shape: s.kind } : o)))}
                  />
                ))}
              </SubMenu>
            )}
            {open}
          </>
        )
    }
  }

  if (!onObject || !status || selected.length === 0) {
    return (
      <div ref={ref} className="bl-menu bl-context-menu" role="menu" onPointerDown={(e) => e.stopPropagation()}>
        {paste}
        {!readOnly && (
          <SubMenu label="여기에 추가">
            {ADD_HERE.map((a) => (
              <MenuItem key={a.kind} label={a.label} keys={a.key} onClick={run(() => editor.addShapeAt(a.kind, board))} />
            ))}
            {props.onAddFile && (
              <>
                <hr />
                <MenuItem label="파일 넣기…" onClick={run(() => props.onAddFile?.(board))} />
              </>
            )}
          </SubMenu>
        )}
        <MenuItem label="모두 선택" keys="Ctrl+A" onClick={run(() => editor.selectAll())} />
        <hr />
        <SubMenu label="보드를 다른 형식으로 복사">
          {COPY_AS.map((c) => (
            <MenuItem key={c.format} label={c.label} onClick={() => void copyBoardAs(c)} />
          ))}
        </SubMenu>
        <MenuItem label="보드 위치 링크 복사" onClick={run(() => void editor.copyLink(true))} />
        <hr />
        <MenuItem label="확대" keys="Ctrl+=" onClick={run(() => editor.zoomBy(1.25))} />
        <MenuItem label="축소" keys="Ctrl+-" onClick={run(() => editor.zoomBy(1 / 1.25))} />
        <MenuItem label="100%로 보기" keys="Ctrl+0" onClick={run(() => editor.resetZoom())} />
        <MenuItem label="화면 맞춤" keys="Shift+1" onClick={run(() => editor.zoomToFit(false))} />
        <hr />
        <MenuItem label="발표" keys="F5" onClick={run(() => props.onPresent(0))} />
        {!readOnly && <MenuItem label="Mermaid 가져오기…" onClick={run(props.onImportMermaid)} />}
      </div>
    )
  }

  const rows = kindRows()
  return (
    <div ref={ref} className="bl-menu bl-context-menu" role="menu" onPointerDown={(e) => e.stopPropagation()}>
      {rows && (
        <>
          {rows}
          <hr />
        </>
      )}
      <ObjectMenuItems
        editor={editor}
        status={status}
        done={onClose}
        onNotice={props.onNotice}
        onLinkDialog={props.onLinkDialog}
        onExportNote={props.onExportNote}
        onPaste={() => void editor.pasteAt(board)}
      />
    </div>
  )
}
