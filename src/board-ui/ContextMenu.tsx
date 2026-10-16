// The right-click menu: first what can be done with the kind of thing clicked (a line, a mind
// map node, a note card, a table…) or, on the empty board, what can go there; then the rows
// every selection has.

import { Fragment, useEffect, useLayoutEffect, useRef } from 'react'
import { isConnector, isFlowShape, isMindmap, isShape, type ShapeKind } from '@boardline/core/board/model'
import type { BoardEditor, EditorStatus } from '@boardline/core/engine/editor'
import type { Point } from '@boardline/core/engine/geometry'
import { reverseConnector } from '@boardline/core/engine/connectors'
import { COPY_AS, MenuItem, ObjectMenuItems, SubMenu, TABLE_OPS, tableOpDisabled, type ObjectMenuProps } from './ObjectMenu'
import { BASIC_SHAPES } from './shapeKinds'
import { LINE_KINDS } from './SelectionToolbar'
import { t } from '@boardline/core/i18n'

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
  /** Absent where there is no presenting. */
  onPresent?: (from: number) => void
  onImportMermaid: () => void
}

const ADD_HERE: { kind: ShapeKind; label: string; key: string }[] = [
  { kind: 'rect', get label() { return t('shape.rect') }, key: 'R' },
  { kind: 'sticky', get label() { return t('kind.sticky') }, key: 'N' },
  { kind: 'text', get label() { return t('kind.text') }, key: 'T' },
  { kind: 'section', get label() { return t('kind.section') }, key: '.' },
  { kind: 'table', get label() { return t('kind.table') }, key: 'E' },
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
  const paste = <MenuItem label={t('edit.paste')} keys="Ctrl+V" disabled={readOnly} onClick={run(() => void editor.pasteAt(board))} />
  // Nothing is selected here, so the whole board is copied.
  const copyBoardAs = async (c: (typeof COPY_AS)[number]) => {
    onClose()
    const ok = await editor.copyAs(c.format)
    props.onNotice?.(ok ? c.done : t('copy.failed'))
  }

  // What the clicked kind of thing can do.
  const kindRows = () => {
    if (!one || !editable) return null
    if (isConnector(one)) {
      return (
        <>
          <MenuItem label={one.label ? t('label.edit') : t('label.add')} keys="Enter" onClick={run(() => editor.editSelection())} />
          {one.label && one.labelPos !== undefined && (
            <MenuItem
              label={t('label.center')}
              onClick={run(() =>
                editor.updateSelected(t('label.move'), (o) => {
                  if (!isConnector(o)) return o
                  const { labelPos: _pos, ...rest } = o
                  return rest
                }),
              )}
            />
          )}
          <SubMenu label={t('line.shape')}>
            {LINE_KINDS.map((k) => (
              <MenuItem
                key={k.kind}
                label={k.label + (one.kind === k.kind ? ' ✓' : '')}
                onClick={run(() => editor.updateSelected(t('line.kind'), (o) => (isConnector(o) ? { ...o, kind: k.kind } : o)))}
              />
            ))}
          </SubMenu>
          <MenuItem
            label={one.line === 'dashed' ? t('line.toSolid') : t('line.toDashed')}
            onClick={run(() => editor.updateSelected(t('line.style'), (o) => (isConnector(o) ? { ...o, line: o.line === 'dashed' ? 'solid' : 'dashed' } : o)))}
          />
          <MenuItem
            label={t('line.reverse')}
            onClick={run(() => editor.updateSelected(t('line.reverse'), (o) => (isConnector(o) ? reverseConnector(o) : o)))}
          />
        </>
      )
    }
    if (isMindmap(one)) {
      return (
        <>
          <MenuItem label={t('mindmap.addChild')} keys="Tab" onClick={run(() => editor.addChildNode(one.id))} />
          {editor.branchCount(one.id) > 0 && <MenuItem label={one.collapsed ? t('mindmap.unfold') : t('mindmap.fold')} keys="/" onClick={run(() => editor.toggleFold())} />}
          {one.parentId && <MenuItem label={t('mindmap.addSibling')} keys="Ctrl+Enter" onClick={run(() => editor.addSiblingNode(one.id))} />}
          {one.parentId && <MenuItem label={t('mindmap.insertParent')} keys="Alt+Enter" onClick={run(() => editor.insertParentNode(one.id))} />}
          <MenuItem label={t('text.edit')} keys="Enter" onClick={run(() => editor.editSelection())} />
          {editor.nodeLevel(one.id) === 1 && <MenuItem label={one.side === 'left' ? t('mindmap.toRight') : t('mindmap.toLeft')} onClick={run(() => editor.flipSide())} />}
          {!one.parentId && editor.branchCount(one.id) > 1 && (
            <>
              <MenuItem label={t('mindmap.spread')} onClick={run(() => editor.spreadBranches(true))} />
              <MenuItem label={t('mindmap.gatherRight')} onClick={run(() => editor.spreadBranches(false))} />
            </>
          )}
        </>
      )
    }
    if (!isShape(one)) return null
    const open = one.link ? <MenuItem label={one.shape === 'note' ? t('file.open') : t('link.open')} keys={one.shape === 'note' ? 'Enter' : undefined} onClick={run(() => props.onOpenLink?.(one.link!))} /> : null
    switch (one.shape) {
      case 'image':
        return (
          <>
            <MenuItem label={t('image.crop')} keys="Enter" onClick={run(() => editor.startCrop())} />
            {one.crop && <MenuItem label={t('image.uncrop')} onClick={run(() => editor.uncrop())} />}
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
            <MenuItem label={t('link.changeMenu')} onClick={run(() => props.onLinkDialog?.('edit', one.id, one.link))} />
            <MenuItem label={one.expanded ? t('link.compact') : t('link.card')} onClick={run(() => editor.toggleLinkCard())} />
          </>
        )
      case 'table':
        return (
          <SubMenu label={t('kind.table')}>
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
            <MenuItem label={t('section.editTitle')} keys="Enter" onClick={run(() => editor.editSelection())} />
            {props.onPresent && <MenuItem label={t('present.fromSection')} onClick={run(() => props.onPresent?.(Math.max(0, index)))} />}
          </>
        )
      }
      default:
        return (
          <>
            <MenuItem label={t('text.edit')} keys="Enter" onClick={run(() => editor.editSelection())} />
            {isFlowShape(one) && (
              <SubMenu label={t('shape.change')}>
                {BASIC_SHAPES.map((s) => (
                  <MenuItem
                    key={s.kind}
                    label={s.label}
                    onClick={run(() => editor.updateSelected(t('shape.changeUndo'), (o) => (isShape(o) && isFlowShape(o) ? { ...o, shape: s.kind } : o)))}
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
          <SubMenu label={t('board.addHere')}>
            {ADD_HERE.map((a) => (
              <MenuItem key={a.kind} label={a.label} keys={a.key} onClick={run(() => editor.addShapeAt(a.kind, board))} />
            ))}
            {props.onAddFile && (
              <>
                <hr />
                <MenuItem label={t('file.addMenu')} onClick={run(() => props.onAddFile?.(board))} />
              </>
            )}
          </SubMenu>
        )}
        <MenuItem label={t('edit.selectAll')} keys="Ctrl+A" onClick={run(() => editor.selectAll())} />
        <hr />
        <SubMenu label={t('copy.boardAs')}>
          {COPY_AS.map((c) => (
            <MenuItem key={c.format} label={c.label} onClick={() => void copyBoardAs(c)} />
          ))}
        </SubMenu>
        <MenuItem label={t('link.copyView')} onClick={run(() => void editor.copyLink(true))} />
        <hr />
        <MenuItem label={t('view.zoomIn')} keys="Ctrl+=" onClick={run(() => editor.zoomBy(1.25))} />
        <MenuItem label={t('view.zoomOut')} keys="Ctrl+-" onClick={run(() => editor.zoomBy(1 / 1.25))} />
        <MenuItem label={t('view.actualSize')} keys="Ctrl+0" onClick={run(() => editor.resetZoom())} />
        <MenuItem label={t('view.fit')} keys="Shift+1" onClick={run(() => editor.zoomToFit(false))} />
        <hr />
        {props.onPresent && <MenuItem label={t('present')} keys="F5" onClick={run(() => props.onPresent?.(0))} />}
        {!readOnly && <MenuItem label={t('mermaid.importMenu')} onClick={run(props.onImportMermaid)} />}
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
