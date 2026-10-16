// Menus about the selected objects: the selection bar's "more" menu and the right-click menu
// share these rows (copying, style, order, alignment, grouping, the lock, links, and more).

import type { ReactNode } from 'react'
import type { BoardEditor, EditorStatus } from '@boardline/core/engine/editor'
import { isFlowShape, isMindmap, isShape } from '@boardline/core/board/model'
import { t } from '@boardline/core/i18n'

export const ALIGN: { how: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'; label: string; key: string }[] = [
  { how: 'left', get label() { return t('align.left') }, key: 'Alt+A' },
  { how: 'hcenter', get label() { return t('align.centerH') }, key: 'Alt+H' },
  { how: 'right', get label() { return t('align.right') }, key: 'Alt+D' },
  { how: 'top', get label() { return t('align.top') }, key: 'Alt+W' },
  { how: 'vcenter', get label() { return t('align.centerV') }, key: 'Alt+V' },
  { how: 'bottom', get label() { return t('align.bottom') }, key: 'Alt+S' },
]

export const COPY_AS: { format: Parameters<BoardEditor['copyAs']>[0]; label: string; key?: string; done: string }[] = [
  { format: 'png', label: 'PNG', key: 'Ctrl+Shift+C', get done() { return t('copy.donePng') } },
  { format: 'png-bg', get label() { return t('copy.pngBackground') }, get done() { return t('copy.donePngBackground') } },
  { format: 'png-dark', get label() { return t('copy.pngDark') }, get done() { return t('copy.donePngDark') } },
  { format: 'png-light', get label() { return t('copy.pngLight') }, get done() { return t('copy.donePngLight') } },
  { format: 'svg', label: 'SVG', get done() { return t('copy.doneSvg') } },
  { format: 'mermaid', label: 'Mermaid', get done() { return t('copy.doneMermaid') } },
  { format: 'markdown', label: 'Markdown', get done() { return t('copy.doneMarkdown') } },
]

type TableOp = Parameters<BoardEditor['tableEdit']>[0]

/** The table menu; `sep` starts a new group. */
export const TABLE_OPS: { op: TableOp; label: string; key?: string; sep?: boolean }[] = [
  { op: 'rowAbove', get label() { return t('table.rowAbove') } },
  { op: 'rowBelow', get label() { return t('table.rowBelow') } },
  { op: 'colLeft', get label() { return t('table.colLeft') } },
  { op: 'colRight', get label() { return t('table.colRight') } },
  { op: 'rowUp', get label() { return t('table.rowUp') }, key: 'Alt+↑', sep: true },
  { op: 'rowDown', get label() { return t('table.rowDown') }, key: 'Alt+↓' },
  { op: 'colBack', get label() { return t('table.colLeftMove') }, key: 'Alt+←' },
  { op: 'colOn', get label() { return t('table.colRightMove') }, key: 'Alt+→' },
  { op: 'deleteRow', get label() { return t('table.deleteRow') }, sep: true },
  { op: 'deleteCol', get label() { return t('table.deleteCol') } },
  { op: 'fit', get label() { return t('table.fitColumn') }, sep: true },
  { op: 'header', get label() { return t('table.headerRow') } },
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
  const paste = onPaste ? <MenuItem label={t('edit.paste')} keys="Ctrl+V" disabled={editor.isReadOnly()} onClick={run(onPaste)} /> : null
  const copyAs = async (c: (typeof COPY_AS)[number]) => {
    done()
    const ok = await editor.copyAs(c.format)
    onNotice?.(ok ? c.done : t('copy.failed'))
  }
  const grouped = shapes.length >= 2 && shapes.every((s) => s.groupId && s.groupId === shapes[0].groupId)
  return (
    <>
      <MenuItem label={t('edit.copy')} keys="Ctrl+C" onClick={run(() => editor.copySelection(false))} />
      <MenuItem label={t('edit.cut')} keys="Ctrl+X" disabled={locked} onClick={run(() => editor.copySelection(true))} />
      {paste}
      <MenuItem label={t('edit.duplicate')} keys="Ctrl+D" onClick={run(() => editor.duplicateSelection())} />
      <MenuItem label={t('edit.delete')} keys="Delete" disabled={locked} onClick={run(() => editor.deleteSelection())} />
      <hr />
      <SubMenu label={t('copy.as')}>
        {COPY_AS.map((c) => (
          <MenuItem key={c.format} label={c.label} keys={c.key} onClick={() => void copyAs(c)} />
        ))}
      </SubMenu>
      {onExportNote && <MenuItem label={t('export.note')} onClick={run(onExportNote)} />}
      <hr />
      <SubMenu label={t('order')}>
        <MenuItem label={t('order.forward')} keys="Ctrl+Alt+]" onClick={run(() => editor.reorder('forward'))} />
        <MenuItem label={t('order.front')} keys="Alt+]" onClick={run(() => editor.reorder('front'))} />
        <MenuItem label={t('order.backward')} keys="Ctrl+Alt+[" onClick={run(() => editor.reorder('backward'))} />
        <MenuItem label={t('order.back')} keys="Alt+[" onClick={run(() => editor.reorder('back'))} />
      </SubMenu>
      {shapes.length >= 2 && (
        <SubMenu label={t('align')}>
          {ALIGN.map((a) => (
            <MenuItem key={a.how} label={a.label} keys={a.key} onClick={run(() => editor.align(a.how))} />
          ))}
          <hr />
          <MenuItem label={t('align.spaceH')} disabled={shapes.length < 3} onClick={run(() => editor.distribute('h'))} />
          <MenuItem label={t('align.spaceV')} disabled={shapes.length < 3} onClick={run(() => editor.distribute('v'))} />
        </SubMenu>
      )}
      {!locked && flow.length > 0 && (
        <SubMenu label={t('layout.auto')}>
          <MenuItem label={t('layout.down')} keys="Shift+Alt+V" onClick={run(() => void editor.autoLayout('DOWN'))} />
          <MenuItem label={t('layout.right')} keys="Shift+Alt+H" onClick={run(() => void editor.autoLayout('RIGHT'))} />
        </SubMenu>
      )}
      {shapes.length >= 2 && <MenuItem label={grouped ? t('group.ungroup') : t('group.group')} keys={grouped ? 'Ctrl+Shift+G' : 'Ctrl+G'} onClick={run(() => editor.setGroup(!grouped))} />}
      <MenuItem label={locked ? t('lock.unlock') : t('lock.lock')} keys="Shift+L" onClick={run(() => editor.toggleLock())} />
      <hr />
      <SubMenu label={t('style')}>
        <MenuItem
          label={t('style.copy')}
          keys="Ctrl+Alt+C"
          onClick={run(() => {
            if (editor.copyStyle()) onNotice?.(t('style.copied'))
          })}
        />
        <MenuItem label={t('style.paste')} keys="Ctrl+Alt+V" disabled={locked || !editor.canPasteStyle()} onClick={run(() => editor.pasteStyle())} />
        <MenuItem
          label={t('style.saveDefault')}
          keys="Ctrl+Shift+D"
          disabled={!single || isMindmap(single)}
          onClick={run(() => {
            if (editor.saveDefaultStyle()) onNotice?.(t('style.savedDefault'))
          })}
        />
      </SubMenu>
      <SubMenu label={t('link')}>
        {linkable.length > 0 && (
          <MenuItem
            label={linkable.some((s) => s.link) ? t('link.changeMenu') : t('link.setMenu')}
            disabled={locked}
            onClick={run(() => onLinkDialog?.('shape', undefined, linkable.find((s) => s.link)?.link))}
          />
        )}
        {linkable.some((s) => s.link) && <MenuItem label={t('link.remove')} disabled={locked} onClick={run(() => editor.setLink(null))} />}
        <MenuItem label={t('link.copyObject')} keys="Ctrl+L" disabled={status.selected.length !== 1} onClick={run(() => void editor.copyLink(false))} />
        <MenuItem label={t('link.copyView')} onClick={run(() => void editor.copyLink(true))} />
      </SubMenu>
      <MenuItem label={t('section.wrap')} onClick={run(() => editor.wrapInSection())} />
      <MenuItem label={t('grid.snap')} disabled={locked || shapes.length === 0} onClick={run(() => editor.snapSelectionToGrid())} />
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

