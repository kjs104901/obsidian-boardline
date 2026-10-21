import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ARROW_LENGTH, capPrimitives } from '@boardline/core/engine/caps'
import { reverseConnector } from '@boardline/core/engine/connectors'
import type { BoardEditor, EditorStatus } from '@boardline/core/engine/editor'
import { MoreIcon, ShapeIcon, TableIcon } from './icons'
import { IconGlyph, IconPicker } from './IconPicker'
import { BASIC_SHAPES } from './shapeKinds'
import { MenuItem, ObjectMenuItems, TABLE_OPS, tableOpDisabled } from './ObjectMenu'
import { tableAligns, tableCellColors } from '@boardline/core/engine/table'
import type { IconStyle } from '@boardline/core/icons/iconData'
import { baseColor, PALETTE, strokeColor } from '@boardline/core/theme/palette'
import { hasMarkAll, type MarkName } from '@boardline/core/engine/richText'
import {
  hasTextStyle,
  isConnector,
  isFlowShape,
  isMindmap,
  isShape,
  type BoardObject,
  type ColorKey,
  type ConnectorKind,
  type ConnectorObject,
  type Deco,
  type EndCap,
  type ShapeObject,
  type TextAlign,
  type TextSize,
} from '@boardline/core/board/model'
import { loadPref, savePref } from '@boardline/core/platform/prefs'
import { t } from '@boardline/core/i18n'

interface Props {
  editor: BoardEditor
  status: EditorStatus
  /** Short message for the user (copied, saved, …). */
  onNotice?: (text: string) => void
  onOpenLink?: (link: string) => void
  /** Open the link box: link the selected shapes, or point a link object elsewhere. */
  onLinkDialog?: (mode: 'shape' | 'edit', id?: string, initial?: string) => void
  /** Make a note of the selection; absent where the app can't save notes. */
  onExportNote?: () => void
}

const DECOS: { deco: Deco; label: string }[] = [
  { deco: 'fill', get label() { return t('style.fill') } },
  { deco: 'outline', get label() { return t('style.outline') } },
  { deco: 'dashed', get label() { return t('style.dashed') } },
  { deco: 'transparent', get label() { return t('style.transparent') } },
]

const CAPS: { cap: EndCap; label: string }[] = [
  { cap: 'none', get label() { return t('find.none') } },
  { cap: 'arrow', get label() { return t('cap.arrow') } },
  { cap: 'circle', get label() { return t('shape.ellipse') } },
  { cap: 'diamond', get label() { return t('cap.diamond') } },
  { cap: 'fork', get label() { return t('cap.fork') } },
  { cap: 'zero-one', label: '0..1' },
  { cap: 'one-one', label: '1..1' },
  { cap: 'zero-many', label: '0..N' },
  { cap: 'one-many', label: '1..N' },
]

type Menu = 'color' | 'shape' | 'deco' | 'icon' | 'table' | 'more' | 'startCap' | 'endCap' | 'textSize' | 'align' | 'list' | 'lineKind' | null

/** Line shapes, with their toolbar icons. */
export const LINE_KINDS: { kind: ConnectorKind; label: string; icon: string }[] = [
  { kind: 'elbow', get label() { return t('line.elbow') }, icon: 'M3.5 14V8.5a2 2 0 0 1 2-2h9' },
  { kind: 'straight', get label() { return t('line.straight') }, icon: 'M3.5 14.5l11-11' },
  { kind: 'curved', get label() { return t('line.curved') }, icon: 'M3.5 14.5C3.5 7 14.5 11 14.5 3.5' },
]

const TEXT_SIZE_NAMES: { size: TextSize; short: string; label: string }[] = [
  { size: 's', short: 'S', get label() { return t('text.small') } },
  { size: 'm', short: 'M', get label() { return t('text.medium') } },
  { size: 'l', short: 'L', get label() { return t('text.large') } },
  { size: 'xl', short: 'XL', get label() { return t('text.xlarge') } },
  { size: 'xxl', short: 'XXL', get label() { return t('text.heading') } },
]

const ALIGN_PATHS: Record<TextAlign, string> = {
  left: 'M3 4.5h12M3 9h8M3 13.5h10',
  center: 'M3 4.5h12M5 9h8M4 13.5h10',
  right: 'M3 4.5h12M7 9h8M5 13.5h10',
}

const TEXT_ALIGNS: { align: TextAlign; label: string }[] = [
  { align: 'left', get label() { return t('text.alignLeft') } },
  { align: 'center', get label() { return t('text.alignCenter') } },
  { align: 'right', get label() { return t('text.alignRight') } },
]

const LIST_ICON = 'M7.5 5h7.5M7.5 9h7.5M7.5 13h7.5M3.8 5h.01M3.8 9h.01M3.8 13h.01'

const ICON_LOOKS: { style: IconStyle; label: string }[] = [
  { style: 'color', get label() { return t('icon.styleColorShort') } },
  { style: 'fill', get label() { return t('icon.styleFill') } },
  { style: 'outline', get label() { return t('style.outline') } },
]

const TOOLBAR_HEIGHT = 40
const TOOLBAR_GAP = 24

const RECENT_KEY = 'boardline.recentColors'

function recentColors(): ColorKey[] {
  const list = loadPref(RECENT_KEY)
  return Array.isArray(list) ? list.filter((c): c is ColorKey => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)).slice(0, 5) : []
}

function rememberColor(c: ColorKey): void {
  savePref(RECENT_KEY, [c, ...recentColors().filter((x) => x !== c)].slice(0, 5))
}

/** Floating toolbar above the selection. */
export function SelectionToolbar({ editor, status, onNotice, onOpenLink, onLinkDialog, onExportNote }: Props) {
  // An open menu belongs to the selection it was opened for: picking something else (or
  // nothing) starts the next toolbar closed.
  const selectionKey = status.selected.map((o) => o.id).join(' ')
  const [open, setOpen] = useState<{ menu: Menu; for: string }>({ menu: null, for: '' })
  const menu = open.for === selectionKey ? open.menu : null
  const setMenu = (m: Menu) => setOpen({ menu: m, for: selectionKey })
  if (open.menu && open.for !== selectionKey) setOpen({ menu: null, for: '' })
  const [pickStyle, setPickStyle] = useState<IconStyle>('fill')
  const barRef = useRef<HTMLDivElement>(null)
  // The bar stays inside the board when the selection is near its left or right edge, and
  // clear of the tool bar and the view controls at its height when it fits between them.
  useLayoutEffect(() => {
    const bar = barRef.current
    const parent = bar?.offsetParent as HTMLElement | null
    if (!bar || !parent) return
    if (bar.classList.contains('beside')) {
      // Beside a node near the board's edge: over (or under) the node instead.
      bar.style.top = `${top}px`
      bar.style.left = `${left}px`
      bar.classList.remove('over-node')
      const onLeft = bar.classList.contains('on-left')
      if (onLeft ? left - bar.offsetWidth >= 8 : left + bar.offsetWidth <= parent.clientWidth - 8) return
      bar.classList.add('over-node')
      const above = Number(bar.dataset.above)
      bar.style.top = `${above >= 8 ? above : Number(bar.dataset.below)}px`
      bar.style.left = `${Math.max(8, Math.min(Number(bar.dataset.nodeLeft), parent.clientWidth - bar.offsetWidth - 8))}px`
      return
    }
    const half = bar.offsetWidth / 2
    const center = Number(bar.dataset.center)
    const y0 = parseFloat(bar.style.top)
    const y1 = y0 + bar.offsetHeight
    let lo = 8
    let hi = parent.clientWidth - 8
    for (const side of parent.querySelectorAll<HTMLElement>(':scope > .bl-toolbar, :scope > .bl-view-controls')) {
      if (side.offsetTop > y1 || side.offsetTop + side.offsetHeight < y0) continue
      if (side.offsetLeft + side.offsetWidth / 2 < parent.clientWidth / 2) lo = Math.max(lo, side.offsetLeft + side.offsetWidth + 8)
      else hi = Math.min(hi, side.offsetLeft - 8)
    }
    if (hi - lo < bar.offsetWidth) [lo, hi] = [8, parent.clientWidth - 8]
    bar.style.left = `${Math.max(lo + half, Math.min(center, hi - half))}px`
    // Wrapped onto more rows (a narrow board), a bar above the selection grows upward, clear of it.
    const extra = bar.offsetHeight - TOOLBAR_HEIGHT
    if (bar.dataset.place === 'above') bar.style.top = `${extra > 0 ? top - extra : top}px`
  })
  // An open menu closes on a press anywhere but on it and its button (the tool bar, the view
  // controls…), and on Esc, which then does nothing else (the selection and the text being typed stay).
  useEffect(() => {
    const doc = barRef.current?.ownerDocument
    if (!menu || !doc) return
    const close = () => setOpen({ menu: null, for: '' })
    const onDown = (e: PointerEvent) => {
      const anchor = barRef.current?.querySelector('.bl-menu:not(.bl-submenu)')?.parentElement
      if (!anchor?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      close()
    }
    doc.addEventListener('pointerdown', onDown, true)
    doc.addEventListener('keydown', onKey, true)
    return () => {
      doc.removeEventListener('pointerdown', onDown, true)
      doc.removeEventListener('keydown', onKey, true)
    }
  }, [menu])
  // An open menu stays on the board: above its button when there is no room below, else as far
  // up as it needs; its submenus open on the left when there is no room on the right.
  useLayoutEffect(() => {
    const list = barRef.current?.querySelector<HTMLElement>('.bl-menu:not(.bl-submenu)')
    const board = barRef.current?.offsetParent
    if (!list || !board || !list.parentElement) return
    list.classList.remove('up')
    list.style.removeProperty('top')
    const room = board.getBoundingClientRect()
    const r = list.getBoundingClientRect()
    const button = list.parentElement.getBoundingClientRect()
    list.classList.toggle('flip-sub', r.right + 210 > room.right)
    if (r.bottom <= room.bottom - 8) return
    if (button.top - 6 - r.height >= room.top + 8) list.classList.add('up')
    else list.style.top = `${Math.max(room.top + 8, room.bottom - 8 - r.height) - button.top}px`
  })
  // While text is typed, the bar keeps only its text buttons, which act on the selected words.
  const typing = status.textEditing
  const box = typing?.box ?? status.selectionBox
  if (!box || status.selected.length === 0) return null

  const shapes = status.selected.filter(isShape)
  // Kind and style only apply to flowchart shapes; stickies, text and sections keep theirs.
  const flow = shapes.length > 0 && shapes.every(isFlowShape) ? shapes : []
  const connectors = status.selected.filter(isConnector)
  const first = status.selected[0]
  const locked = status.selected.every((o) => o.locked)
  const anyLocked = status.selected.some((o) => o.locked)
  const apply = (label: string, fn: (o: BoardObject) => BoardObject) => {
    editor.updateSelected(label, fn)
    setMenu(null)
  }
  const run = (fn: () => void) => () => {
    fn()
    setMenu(null)
  }
  const onShapes = (fn: (s: ShapeObject) => ShapeObject) => (o: BoardObject) => (isShape(o) ? fn(o) : o)
  const onConnectors = (fn: (c: ConnectorObject) => ConnectorObject) => (o: BoardObject) => (isConnector(o) ? fn(o) : o)
  const same = <T,>(values: T[]) => (values.every((v) => v === values[0]) ? values[0] : undefined)

  // Text: size, marks (on the selected words while typing, else on all the text), alignment, lists.
  const texts = status.selected.filter(hasTextStyle).filter((t) => !typing || t.id === typing.id)
  const textSize = same(texts.map((t) => t.textSize ?? 'm'))
  const textAlign = same(texts.map((t) => t.align ?? (t.shape === 'text' || t.shape === 'sticky' ? 'left' : 'center')))
  const allOn = (mark: MarkName) => (typing ? typing.marks[mark] : texts.length > 0 && texts.every((t) => hasMarkAll(t.text, mark)))
  // Mind map nodes, line labels and table cells take marks too (no sizes, alignment or lists):
  // while one is typed in, and on selected nodes.
  const nodes = typing ? [] : status.selected.filter(isMindmap)
  const wordsOnly = !locked && texts.length === 0 && (!!typing || (nodes.length > 0 && nodes.length === status.selected.length))
  const wordsOn = (mark: MarkName) => (typing ? typing.marks[mark] : nodes.every((n) => hasMarkAll(n.text, mark)))
  const markButtons = (on: (mark: MarkName) => boolean) => (
    <>
      <button title={t('mark.boldKey')} className={on('bold') ? 'active' : ''} onClick={() => editor.toggleTextStyle('bold')}>
        <span className="bl-glyph bold">B</span>
      </button>
      <button title={t('mark.italicKey')} className={on('italic') ? 'active' : ''} onClick={() => editor.toggleTextStyle('italic')}>
        <span className="bl-glyph italic">I</span>
      </button>
      <button title={t('mark.strikeKey')} className={on('strike') ? 'active' : ''} onClick={() => editor.toggleTextStyle('strike')}>
        <span className="bl-glyph strike">S</span>
      </button>
      {typing && (
        <>
          <button title={t('mark.highlightKey')} className={on('highlight') ? 'active' : ''} onClick={() => editor.toggleTextStyle('highlight')}>
            <ToolbarIcon d="M3.5 15h11M5.5 12.5V10l6-6 2.5 2.5-6 6z" />
          </button>
          <button title={t('mark.codeKey')} className={on('code') ? 'active' : ''} onClick={() => editor.toggleTextStyle('code')}>
            <ToolbarIcon d="M6.5 5 3 9l3.5 4M11.5 5 15 9l-3.5 4" />
          </button>
        </>
      )}
    </>
  )

  const icons = shapes.length > 0 && shapes.every((s) => s.shape === 'icon') ? shapes : []
  const links = shapes.length > 0 && shapes.every((s) => s.shape === 'link') ? shapes : []
  // Flowchart shapes and icon objects take an icon.
  const iconTargets = flow.length > 0 ? flow : icons
  const iconLook = same(icons.map((s) => s.iconStyle ?? 'color'))
  const shapeKind = same(flow.map((s) => s.shape))
  const deco = same(flow.map((s) => s.deco))
  const line = same(connectors.map((c) => c.line))
  const kind = same(connectors.map((c) => c.kind))
  const conn = connectors.length === 1 ? connectors[0] : null
  const single = status.selected.length === 1 ? first : null
  const singleLink = single && isShape(single) ? single.link : undefined
  const editable = single && !single.locked && !(isShape(single) && (single.shape === 'image' || single.shape === 'freehand' || single.shape === 'note'))
  const size = single && isShape(single) ? `${Math.round(single.w)} x ${Math.round(single.h)}` : null

  // A table's color tints its header; with cells selected, the color fills them instead.
  const table = single && isShape(single) && single.shape === 'table' ? single : null
  const cell = table ? status.tableCell : null
  const cellColor = table && cell ? (tableCellColors(table)[cell.row]?.[cell.col] ?? 'gray') : null
  const shownColor = cellColor ?? first.color
  const tableAlign = table ? (cell ? tableAligns(table)[cell.col] : same(tableAligns(table))) : undefined
  const pickColor = (color: ColorKey) => {
    if (color.startsWith('#')) rememberColor(color)
    if (cell && editor.setCellColor(color)) {
      setMenu(null)
      return
    }
    apply(t('color.change'), (o) => ({ ...o, color }))
  }

  // Above the selection, centered (below when there is no room). Mind map nodes sit close
  // together vertically, so their bar goes to the right instead.
  // The gap keeps the bar clear of the connection dots and resize handles on the edge.
  const onlyNodes = status.selected.every(isMindmap)
  const above = box.y - TOOLBAR_HEIGHT - TOOLBAR_GAP
  const below = above < 8
  const top = onlyNodes ? box.y + box.h / 2 - TOOLBAR_HEIGHT / 2 : below ? box.y + box.h + TOOLBAR_GAP + (size ? 24 : 0) : above
  // A node's bar clears its "+" (add a branch) button, and a folded node's count before it.
  const folded = onlyNodes && single && isMindmap(single) && single.collapsed
  // A node on its root's left side has its bar on the left (its branches and "+" grow that way).
  const leftSide = onlyNodes && !!single && editor.nodeOnLeft(single.id)
  const clear = TOOLBAR_GAP + 24 + (folded ? 28 * status.zoom : 0)
  const left = onlyNodes ? (leftSide ? box.x - clear : box.x + box.w + clear) : box.x + box.w / 2

  // Cropping a picture: keep the frame, frame the whole picture again, or go back.
  if (status.cropping) {
    return (
      <div ref={barRef} className="bl-selection-toolbar" style={{ top, left }} data-center={left} onPointerDown={(e) => e.stopPropagation()}>
        <button title={t('crop.apply')} onClick={() => editor.finishCrop()}>
          <ToolbarIcon d="M4 9.5l3.5 3.5L14 5.5" />
        </button>
        <button title={t('crop.whole')} onClick={() => editor.cropToWhole()}>
          <ToolbarIcon d="M3 6.5V3h3.5M11.5 3H15v3.5M15 11.5V15h-3.5M6.5 15H3v-3.5" />
        </button>
        <button title={t('common.cancelEsc')} onClick={() => editor.finishCrop(false)}>
          <ToolbarIcon d="M5 5l8 8M13 5l-8 8" />
        </button>
      </div>
    )
  }

  return (
    <>
      {size && !onlyNodes && !typing && (
        <div className="bl-size-label" style={{ top: box.y + box.h + 8, left: box.x + box.w / 2 }}>
          {size}
        </div>
      )}
      <div
        ref={barRef}
        className={'bl-selection-toolbar' + (onlyNodes ? ' beside' : '') + (leftSide ? ' on-left' : '')}
        style={{ top, left }}
        data-place={onlyNodes ? 'beside' : below ? 'below' : 'above'}
        data-center={left}
        data-above={box.y - TOOLBAR_HEIGHT - 12}
        data-below={box.y + box.h + 12}
        data-node-left={box.x}
        onPointerDown={(e) => e.stopPropagation()}
        // Clicks on the bar keep the focus (and the selected words) in the text being typed.
        onMouseDown={(e) => typing && !(e.target instanceof HTMLInputElement) && e.preventDefault()}
      >
        {!typing && onlyNodes && single && !single.locked && (
          <>
            <button title={t('mindmap.addChildKey')} onClick={run(() => editor.addChildNode(single.id))}>
              <ToolbarIcon d="M3 9h5M8 4.5v9M8 4.5h3M8 13.5h3M13.5 4.5h2M13.5 13.5h2M14.5 3.5v2M14.5 12.5v2" />
            </button>
            {isMindmap(single) && single.parentId && (
              <button title={t('mindmap.addSiblingKey')} onClick={run(() => editor.addSiblingNode(single.id))}>
                <ToolbarIcon d="M4 5h7M4 10h7M13.5 13.5h3M15 12v3" />
              </button>
            )}
            {isMindmap(single) && editor.branchCount(single.id) > 0 && (
              <button title={single.collapsed ? t('mindmap.unfoldKey') : t('mindmap.foldKey')} onClick={run(() => editor.toggleFold())}>
                <ToolbarIcon d={single.collapsed ? 'M9 3.5a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11M6.5 9h5M9 6.5v5' : 'M9 3.5a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11M6.5 9h5'} />
              </button>
            )}
            <span className="bl-sep" />
          </>
        )}
        {editable && !typing && (
          <button title={t('text.addKey')} onClick={run(() => editor.editSelection())}>
            <ToolbarIcon d="M4 4h10M9 4v10" />
          </button>
        )}
        {single && isShape(single) && single.shape === 'image' && !single.locked && (
          <button title={t('image.cropKey')} onClick={run(() => editor.startCrop())}>
            <ToolbarIcon d="M5.5 2.5v10h10M2.5 5.5h10v10" />
          </button>
        )}

        {!locked && texts.length > 0 && (
          <>
            <span className="bl-text-size">
              <button title={t('text.smallerKey')} disabled={textSize === 's'} onClick={() => editor.stepTextSize(-1)}>
                <ToolbarIcon d="M5 9h8" />
              </button>
              <span className="bl-menu-anchor">
                <button title={t('text.size')} className="bl-text-size-value" onClick={() => setMenu(menu === 'textSize' ? null : 'textSize')}>
                  {TEXT_SIZE_NAMES.find((n) => n.size === textSize)?.short ?? '–'}
                </button>
                {menu === 'textSize' && (
                  <div className="bl-menu bl-text-size-menu">
                    {TEXT_SIZE_NAMES.map((n) => (
                      <button key={n.size} className={'bl-menu-item' + (textSize === n.size ? ' active' : '')} onClick={run(() => editor.setTextSize(n.size))}>
                        <span>{n.label}</span>
                        <kbd>{n.short}</kbd>
                      </button>
                    ))}
                  </div>
                )}
              </span>
              <button title={t('text.largerKey')} disabled={textSize === 'xxl'} onClick={() => editor.stepTextSize(1)}>
                <ToolbarIcon d="M5 9h8M9 5v8" />
              </button>
            </span>
            {markButtons(allOn)}
            <div className="bl-menu-anchor">
              <button title={t('text.align')} onClick={() => setMenu(menu === 'align' ? null : 'align')}>
                <ToolbarIcon d={ALIGN_PATHS[textAlign ?? 'left']} />
              </button>
              {menu === 'align' && (
                <div className="bl-menu bl-align-menu">
                  {TEXT_ALIGNS.map((a) => (
                    <button key={a.align} title={a.label} className={textAlign === a.align ? 'active' : ''} onClick={run(() => editor.setTextAlign(a.align))}>
                      <ToolbarIcon d={ALIGN_PATHS[a.align]} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="bl-menu-anchor">
              <button title={t('text.list')} onClick={() => setMenu(menu === 'list' ? null : 'list')}>
                <ToolbarIcon d={LIST_ICON} />
              </button>
              {menu === 'list' && (
                <div className="bl-menu bl-list-menu">
                  <MenuItem label={t('text.bulletsMenu')} keys="Ctrl+Shift+8" onClick={run(() => editor.toggleList('bullet'))} />
                  <MenuItem label={t('text.numbersMenu')} keys="Ctrl+Shift+7" onClick={run(() => editor.toggleList('number'))} />
                  <MenuItem label={t('text.tasksMenu')} keys="Ctrl+Shift+9" onClick={run(() => editor.toggleList('task'))} />
                </div>
              )}
            </div>
            {!typing && <span className="bl-sep" />}
          </>
        )}

        {wordsOnly && (
          <>
            {markButtons(wordsOn)}
            {!typing && <span className="bl-sep" />}
          </>
        )}

        {!typing && (
          <>
          {!locked && flow.length > 0 && (
            <div className="bl-menu-anchor">
              <button title={t('shape.kind')} onClick={() => setMenu(menu === 'shape' ? null : 'shape')}>
                <ShapeIcon kind={shapeKind ?? 'rect'} />
              </button>
              {menu === 'shape' && (
                <div className="bl-menu bl-shape-menu">
                  {BASIC_SHAPES.map((s) => (
                    <button
                      key={s.kind}
                      title={s.key ? `${s.label} (${s.key})` : s.label}
                      className={shapeKind === s.kind ? 'active' : ''}
                      onClick={() => apply(t('shape.changeUndo'), onShapes((o) => ({ ...o, shape: s.kind })))}
                    >
                      <ShapeIcon kind={s.kind} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {!locked && (
            <div className="bl-menu-anchor">
              <button title={table ? (cell ? t('table.cellColor') : t('table.headerColor')) : t('color')} onClick={() => setMenu(menu === 'color' ? null : 'color')}>
                <span className="bl-swatch" style={{ background: strokeColor(shownColor) }} />
              </button>
              {menu === 'color' && (
                <div className="bl-menu bl-color-menu">
                  {PALETTE.map((p) => (
                    <button key={p.key} title={p.name} className={shownColor === p.key ? 'active' : ''} onClick={() => pickColor(p.key)}>
                      <span className="bl-swatch" style={{ background: baseColor(p.key) }} />
                    </button>
                  ))}
                  {recentColors().map((c) => (
                    <button key={c} title={c} className={shownColor === c ? 'active' : ''} onClick={() => pickColor(c)}>
                      <span className="bl-swatch" style={{ background: c }} />
                    </button>
                  ))}
                  <label className="bl-custom-color" title={t('color.custom')}>
                    +
                    <input
                      type="color"
                      defaultValue={shownColor.startsWith('#') ? shownColor : '#7c5cff'}
                      onChange={(e) => pickColor(e.currentTarget.value.toLowerCase() as ColorKey)}
                    />
                  </label>
                </div>
              )}
            </div>
          )}

          {!locked && flow.length > 0 && (
            <div className="bl-menu-anchor">
              <button title={t('style')} onClick={() => setMenu(menu === 'deco' ? null : 'deco')}>
                <DecoIcon deco={deco ?? 'outline'} />
              </button>
              {menu === 'deco' && (
                <div className="bl-menu bl-deco-menu">
                  {DECOS.map((d) => (
                    <button key={d.deco} title={d.label} className={deco === d.deco ? 'active' : ''} onClick={() => apply(t('style'), onShapes((o) => ({ ...o, deco: d.deco })))}>
                      <DecoIcon deco={d.deco} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {!locked && iconTargets.length > 0 && (
            <div className="bl-menu-anchor">
              <button title={icons.length ? t('icon.change') : t('icon')} className={menu === 'icon' ? 'active' : ''} onClick={() => setMenu(menu === 'icon' ? null : 'icon')}>
                {iconTargets[0].icon ? <IconGlyph name={iconTargets[0].icon} style="outline" size={18} /> : <ToolbarIcon d="M9 2.5l1.9 4 4.4.5-3.3 3 .9 4.3L9 12.1l-3.9 2.2.9-4.3-3.3-3 4.4-.5z" />}
              </button>
              {menu === 'icon' && (
                <div className="bl-menu bl-icon-menu">
                  <IconPicker
                    style={icons.length ? (iconLook ?? 'color') : pickStyle}
                    onStyle={(s) => (icons.length ? editor.updateSelected(t('icon.style'), onShapes((o) => ({ ...o, iconStyle: s }))) : setPickStyle(s))}
                    onPick={(name) => {
                      editor.setIcon(name, icons.length ? undefined : pickStyle)
                      setMenu(null)
                    }}
                    onRemove={flow.some((s) => s.icon) ? () => (editor.setIcon(null), setMenu(null)) : undefined}
                    onClose={() => setMenu(null)}
                  />
                </div>
              )}
            </div>
          )}

          {!locked && icons.length > 0 &&
            ICON_LOOKS.map((l) => (
              <button
                key={l.style}
                title={l.label}
                className={iconLook === l.style ? 'active' : ''}
                onClick={() => apply(t('icon.style'), onShapes((o) => ({ ...o, iconStyle: l.style })))}
              >
                <IconGlyph name={icons[0].icon ?? 'star'} style={l.style} size={18} tint="currentColor" />
              </button>
            ))}

          {!locked && flow.length > 0 && (
            <button title={t('rotate90')} onClick={run(() => editor.rotateSelected())}>
              <ToolbarIcon d="M14 9a5 5 0 1 1-1.5-3.5M14 3v3h-3" />
            </button>
          )}

          {!locked && shapes.length === 1 && shapes[0].shape === 'table' && (
            <div className="bl-menu-anchor">
              <button
                title={status.tableCell ? t('table.withCell', status.tableCell.row + 1, status.tableCell.col + 1) : t('table.withoutCell')}
                onClick={() => setMenu(menu === 'table' ? null : 'table')}
              >
                <TableIcon />
              </button>
              {menu === 'table' && (
                <div className="bl-menu bl-table-menu">
                  {TABLE_OPS.map((t) => (
                    <Fragment key={t.op}>
                      {t.sep && <hr />}
                      <MenuItem
                        label={t.label + (t.op === 'header' && shapes[0].header !== false ? ' ✓' : '')}
                        keys={t.key}
                        disabled={tableOpDisabled(t.op, status)}
                        onClick={run(() => editor.tableEdit(t.op))}
                      />
                    </Fragment>
                  ))}
                </div>
              )}
            </div>
          )}
          {!locked && table && (
            <div className="bl-menu-anchor">
              <button title={cell ? t('table.alignColumn') : t('table.alignAll')} onClick={() => setMenu(menu === 'align' ? null : 'align')}>
                <ToolbarIcon d={ALIGN_PATHS[tableAlign ?? 'left']} />
              </button>
              {menu === 'align' && (
                <div className="bl-menu bl-align-menu">
                  {TEXT_ALIGNS.map((a) => (
                    <button key={a.align} title={a.label} className={tableAlign === a.align ? 'active' : ''} onClick={run(() => editor.setCellAlign(a.align))}>
                      <ToolbarIcon d={ALIGN_PATHS[a.align]} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {!locked && connectors.length > 0 && (
            <>
              <span className="bl-sep" />
              <button title={t('line.solid')} className={line === 'solid' ? 'active' : ''} onClick={() => apply(t('line.style'), onConnectors((c) => ({ ...c, line: 'solid' })))}>
                <ToolbarIcon d="M3 9h12" />
              </button>
              <button title={t('line.dashed')} className={line === 'dashed' ? 'active' : ''} onClick={() => apply(t('line.style'), onConnectors((c) => ({ ...c, line: 'dashed' })))}>
                <ToolbarIcon d="M3 9h2.5M7.75 9h2.5M12.5 9h2.5" />
              </button>
              <div className="bl-menu-anchor">
                <button title={t('line.shape')} onClick={() => setMenu(menu === 'lineKind' ? null : 'lineKind')}>
                  <ToolbarIcon d={LINE_KINDS.find((k) => k.kind === kind)?.icon ?? LINE_KINDS[0].icon} />
                </button>
                {menu === 'lineKind' && (
                  <div className="bl-menu bl-align-menu">
                    {LINE_KINDS.map((k) => (
                      <button key={k.kind} title={k.label} className={kind === k.kind ? 'active' : ''} onClick={() => apply(t('line.kind'), onConnectors((c) => ({ ...c, kind: k.kind })))}>
                        <ToolbarIcon d={k.icon} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {!locked && conn && (
            <>
              <span className="bl-sep" />
              <CapMenu
                atStart
                title={t('cap.start')}
                value={conn.startCap}
                open={menu === 'startCap'}
                onToggle={() => setMenu(menu === 'startCap' ? null : 'startCap')}
                onPick={(cap) => apply(t('cap.start'), onConnectors((c) => ({ ...c, startCap: cap })))}
              />
              <button
                title={t('line.reverse')}
                onClick={() => apply(t('line.reverse'), onConnectors(reverseConnector))}
              >
                <ToolbarIcon d="M3 6.5h11.5M12 4l2.5 2.5L12 9M15 11.5H3.5M6 9l-2.5 2.5L6 14" />
              </button>
              <CapMenu
                title={t('cap.end')}
                value={conn.endCap}
                open={menu === 'endCap'}
                onToggle={() => setMenu(menu === 'endCap' ? null : 'endCap')}
                onPick={(cap) => apply(t('cap.end'), onConnectors((c) => ({ ...c, endCap: cap })))}
              />
            </>
          )}

          {singleLink && (
            <button title={isShape(single) && single.shape === 'note' ? t('note.openKey') : t('link.openKey')} onClick={run(() => onOpenLink?.(singleLink))}>
              <ToolbarIcon d="M10 3h5v5M15 3L8 10M13 11v3.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5H7" />
            </button>
          )}
          {!locked && links.length > 0 && (
            <button title={links.every((l) => l.expanded) ? t('link.compact') : t('link.cardDetail')} className={links.every((l) => l.expanded) ? 'active' : ''} onClick={run(() => editor.toggleLinkCard())}>
              <ToolbarIcon d="M3 4h12v10H3zM3 9h12" />
            </button>
          )}
          {!locked && links.length === 1 && (
            <button title={t('link.change')} onClick={run(() => onLinkDialog?.('edit', links[0].id, links[0].link))}>
              <ToolbarIcon d="M7.5 10.5a3 3 0 0 0 4.2 0l2.3-2.3a3 3 0 0 0-4.2-4.2l-.8.8M10.5 7.5a3 3 0 0 0-4.2 0L4 9.8A3 3 0 0 0 8.2 14l.8-.8" />
            </button>
          )}
          <span className="bl-sep" />
          <button title={t('edit.duplicateKey')} onClick={run(() => editor.duplicateSelection())}>
            <ToolbarIcon d="M6 6h8v8H6zM4 12V4h8" />
          </button>
          {anyLocked && (
            <button title={t('lock.unlockKey')} className="active" onClick={run(() => editor.toggleLock())}>
              <ToolbarIcon d="M5 8h8v7H5zM7 8V6a2 2 0 0 1 4 0v2" />
            </button>
          )}
          <div className="bl-menu-anchor">
            <button title={t('more')} className={menu === 'more' ? 'active' : ''} onClick={() => setMenu(menu === 'more' ? null : 'more')}>
              <MoreIcon />
            </button>
            {menu === 'more' && (
              <div className="bl-menu bl-more-menu">
                <ObjectMenuItems editor={editor} status={status} done={() => setMenu(null)} onNotice={onNotice} onLinkDialog={onLinkDialog} onExportNote={onExportNote} />
              </div>
            )}
          </div>
          </>
        )}
      </div>
    </>
  )
}

function ToolbarIcon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

function DecoIcon({ deco }: { deco: Deco }) {
  const common = { x: 3.5, y: 4.5, width: 11, height: 9, rx: 2 }
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
      {deco === 'fill' && <rect {...common} fill="currentColor" />}
      {deco === 'outline' && <rect {...common} />}
      {deco === 'dashed' && <rect {...common} strokeDasharray="3 2" />}
      {deco === 'transparent' && (
        <>
          <rect {...common} strokeOpacity="0.3" strokeDasharray="1 2" />
          <path d="M6.5 7.5h5M9 7.5v4" />
        </>
      )}
    </svg>
  )
}

function CapMenu(props: { title: string; atStart?: boolean; value: EndCap; open: boolean; onToggle: () => void; onPick: (cap: EndCap) => void }) {
  return (
    <div className="bl-menu-anchor">
      <button title={props.title} onClick={props.onToggle}>
        <CapIcon cap={props.value} atStart={props.atStart} />
      </button>
      {props.open && (
        <div className="bl-menu bl-cap-menu">
          {CAPS.map((c) => (
            <button key={c.cap} title={c.label} className={props.value === c.cap ? 'active' : ''} onClick={() => props.onPick(c.cap)}>
              <CapIcon cap={c.cap} atStart={props.atStart} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** A short line ending in `cap`, drawn with the board's own cap shapes (caps.ts). */
function CapIcon({ cap, atStart }: { cap: EndCap; atStart?: boolean }) {
  const pts = [
    { x: 3, y: 10 },
    { x: 37, y: 10 },
  ]
  // A filled arrow keeps its sharp tip: the line stops short of it, as on the board.
  const cut = cap === 'arrow' ? ARROW_LENGTH - 2 : 0
  const x0 = atStart ? 3 + cut : 3
  const x1 = atStart ? 37 : 37 - cut
  return (
    <svg width="28" height="14" viewBox="0 0 40 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={`M${x0} 10H${x1}`} />
      {capPrimitives(pts, cap, !!atStart).map((p, i) => {
        switch (p.kind) {
          case 'polygon':
            return <polygon key={i} points={p.points.map((q) => `${q.x},${q.y}`).join(' ')} fill="currentColor" stroke="none" />
          case 'dot':
            return <circle key={i} cx={p.center.x} cy={p.center.y} r={p.radius} fill="currentColor" stroke="none" />
          case 'ring':
            return <circle key={i} cx={p.center.x} cy={p.center.y} r={p.radius} />
          case 'lines':
            return <path key={i} d={p.segments.map(([a, b]) => `M${a.x} ${a.y}L${b.x} ${b.y}`).join('')} />
        }
      })}
    </svg>
  )
}
