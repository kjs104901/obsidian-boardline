// The tool bar down the left edge. A tool without choices arms at once; a group (shapes,
// drawing, icons) also opens its choices in a column to the right of its button, and the
// group's button shows the choice made last.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { ShapeKind } from '@boardline/core/board/model'
import type { BoardEditor, Tool } from '@boardline/core/engine/editor'
import type { IconStyle } from '@boardline/core/icons/iconData'
import { baseColor, PALETTE } from '@boardline/core/theme/palette'
import { IconPicker } from './IconPicker'
import { CloseIcon, EraserIcon, HandIcon, LassoIcon, MarkerIcon, MindmapIcon, PenIcon, SectionIcon, SelectIcon, ShapeIcon, StickyIcon, TableIcon, TextIcon } from './icons'
import { BASIC_SHAPES, isBasicShape } from './shapeKinds'

/** A flyout opened from its group button (drawing's opens by itself while drawing). */
export type Flyout = 'shapes' | 'icons' | null

type Group = 'shapes' | 'draw' | 'icons'

interface Props {
  editor: BoardEditor | null
  tool: Tool | undefined
  flyout: Flyout
  onFlyout: (f: Flyout) => void
  /** A link is being picked (the link button shows it). */
  linking: boolean
  onLink: () => void
  /** Add a note, picture, board or canvas from the workspace; absent where files can't be read. */
  onAddFile?: () => void
}

/** Box with a dashed lifeline, for the sequence actor tool. */
function ActorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="2" y="1.5" width="12" height="5" rx="1" />
      <path d="M8 6.5V15" strokeDasharray="2 1.6" />
    </svg>
  )
}

/** Line with an arrowhead, for the connector tool. */
function ConnectorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 13.5L12.5 3.5M7.5 3.5h5v5" />
    </svg>
  )
}

/** Chain link, for the link tool button. */
function LinkToolIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </svg>
  )
}

/** A page with a folded corner and lines, for note cards. */
function NoteCardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
      <path d="M3.5 1.8h6l3 3v9.4h-9z" />
      <path d="M9.5 1.8v3h3M5.8 8h4.4M5.8 10.5h4.4" />
    </svg>
  )
}

/** Smiley outline, for the icon tool button. */
function IconToolIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <circle cx="9" cy="9" r="6.5" />
      <path d="M6.5 10.5c1.4 1.4 3.6 1.4 5 0" />
      <circle cx="6.8" cy="7.3" r=".4" fill="currentColor" />
      <circle cx="11.2" cy="7.3" r=".4" fill="currentColor" />
    </svg>
  )
}

const TOOLS_BEFORE: { tool: Tool; label: string; key: string; icon: ReactNode }[] = [
  { tool: { kind: 'select' }, label: '선택', key: 'Esc', icon: <SelectIcon /> },
  { tool: { kind: 'hand' }, label: '손 (화면 이동)', key: 'Space 누른 채 끌기', icon: <HandIcon /> },
]

const TOOLS_AFTER: { tool: Tool; label: string; key: string; icon: ReactNode }[] = [
  { tool: { kind: 'shape', shape: 'sticky' }, label: '스티키 노트', key: 'N', icon: <StickyIcon /> },
  { tool: { kind: 'shape', shape: 'text' }, label: '텍스트', key: 'T', icon: <TextIcon /> },
  { tool: { kind: 'shape', shape: 'section' }, label: '섹션', key: '.', icon: <SectionIcon /> },
  { tool: { kind: 'shape', shape: 'table' }, label: '표', key: 'E', icon: <TableIcon /> },
  { tool: { kind: 'shape', shape: 'actor' }, label: '시퀀스 액터', key: 'Q', icon: <ActorIcon /> },
  { tool: { kind: 'connector' }, label: '연결선', key: 'C', icon: <ConnectorIcon /> },
  { tool: { kind: 'mindmap' }, label: '마인드맵', key: 'M', icon: <MindmapIcon /> },
]

type Pen = 'pen' | 'marker' | 'eraser' | 'lasso'

const PENS: { pen: Pen; label: string; icon: ReactNode }[] = [
  { pen: 'pen', label: '펜 (H)', icon: <PenIcon /> },
  { pen: 'marker', label: '형광펜 (Shift+H)', icon: <MarkerIcon /> },
  { pen: 'eraser', label: '지우개', icon: <EraserIcon /> },
  { pen: 'lasso', label: '올가미 선택 (Alt+끌기)', icon: <LassoIcon /> },
]

const LAST_KEY = 'boardline.lastTools'

function readLast(): { shape: ShapeKind; pen: Pen } {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}')
    return {
      shape: typeof v.shape === 'string' && isBasicShape(v.shape) ? v.shape : 'rect',
      pen: v.pen === 'marker' || v.pen === 'eraser' || v.pen === 'lasso' ? v.pen : 'pen',
    }
  } catch {
    return { shape: 'rect', pen: 'pen' }
  }
}

function sameTool(a: Tool | undefined, b: Tool): boolean {
  if (!a || a.kind !== b.kind) return false
  return a.kind !== 'shape' || a.shape === (b as { shape: ShapeKind }).shape
}

export function ToolRail({ editor, tool, flyout, onFlyout, linking, onLink, onAddFile }: Props) {
  const [last, setLast] = useState(readLast)
  const [iconStyle, setIconStyle] = useState<IconStyle>('color')
  const anchors = useRef<Partial<Record<Group, HTMLButtonElement | null>>>({})
  const flyRef = useRef<HTMLDivElement>(null)

  const shape = tool?.kind === 'shape' ? tool.shape : null
  const drawing = tool?.kind === 'draw' ? tool.pen : null
  const open: Group | null = flyout ?? (drawing ? 'draw' : null)

  // Remember the last shape and pen, so their group buttons offer them next time.
  useEffect(() => {
    const next = { shape: shape && isBasicShape(shape) ? shape : last.shape, pen: drawing ?? last.pen }
    if (next.shape === last.shape && next.pen === last.pen) return
    setLast(next)
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify(next))
    } catch {
      // Only a convenience.
    }
  }, [shape, drawing])

  // Line the flyout up with its button, kept inside the board.
  useLayoutEffect(() => {
    const fly = flyRef.current
    const anchor = open && anchors.current[open]
    const parent = fly?.offsetParent
    if (!fly || !anchor || !parent) return
    const top = anchor.getBoundingClientRect().top - parent.getBoundingClientRect().top - 5
    const max = parent.clientHeight - fly.offsetHeight - 16
    fly.style.setProperty('--bl-flyout-top', `${Math.max(16, Math.min(top, max))}px`)
  })

  const arm = (t: Tool) => {
    editor?.setTool(t)
    editor?.focus()
  }
  const pick = (t: Tool) => {
    onFlyout(null)
    arm(t)
  }
  const groupButton = (group: Group, label: string, active: boolean, icon: ReactNode, onClick: () => void) => (
    <button
      ref={(el) => {
        anchors.current[group] = el
      }}
      className={'bl-tool-group' + (active ? ' active' : '')}
      title={label}
      aria-expanded={open === group}
      onClick={onClick}
    >
      {icon}
    </button>
  )
  const plain = (t: (typeof TOOLS_BEFORE)[number]) => (
    <button key={t.label} className={sameTool(tool, t.tool) ? 'active' : ''} title={`${t.label} (${t.key})`} onClick={() => pick(t.tool)}>
      {t.icon}
    </button>
  )
  const lastShapeInfo = BASIC_SHAPES.find((s) => s.kind === last.shape) ?? BASIC_SHAPES[0]

  return (
    <>
      <nav className="bl-toolbar">
        {TOOLS_BEFORE.map(plain)}
        <span className="bl-rail-sep" />
        {groupButton('shapes', `도형: ${lastShapeInfo.label}${lastShapeInfo.key ? ` (${lastShapeInfo.key})` : ''}`, open === 'shapes' || (!!shape && isBasicShape(shape)), <ShapeIcon kind={last.shape} />, () => {
          arm({ kind: 'shape', shape: last.shape })
          onFlyout(flyout === 'shapes' ? null : 'shapes')
        })}
        {TOOLS_AFTER.map(plain)}
        <span className="bl-rail-sep" />
        {groupButton('draw', '그리기 (H)', !!drawing, PENS.find((p) => p.pen === last.pen)?.icon, () => {
          onFlyout(null)
          arm(drawing ? { kind: 'select' } : { kind: 'draw', pen: last.pen })
        })}
        <button className={linking ? 'active' : ''} title="링크 (K)" onClick={onLink}>
          <LinkToolIcon />
        </button>
        {onAddFile && (
          <button title="파일 넣기 (노트, 그림, 보드, 캔버스)" onClick={onAddFile}>
            <NoteCardIcon />
          </button>
        )}
        {groupButton('icons', '아이콘 (X)', open === 'icons' || shape === 'icon', <IconToolIcon />, () => onFlyout(flyout === 'icons' ? null : 'icons'))}
      </nav>

      {open && (
        <div ref={flyRef} className={`bl-flyout bl-flyout-${open}`} onPointerDown={(e) => e.stopPropagation()}>
          {open === 'shapes' &&
            BASIC_SHAPES.map((s) => (
              <button key={s.kind} className={shape === s.kind ? 'active' : ''} onClick={() => pick({ kind: 'shape', shape: s.kind })}>
                <ShapeIcon kind={s.kind} />
                <span className="bl-flyout-label">{s.label}</span>
                {s.key && <kbd>{s.key}</kbd>}
              </button>
            ))}

          {open === 'draw' && editor && drawing && (
            <>
              {PENS.map((p) => (
                <button key={p.pen} title={p.label} className={drawing === p.pen ? 'active' : ''} onClick={() => arm({ kind: 'draw', pen: p.pen })}>
                  {p.icon}
                </button>
              ))}
              {drawing !== 'eraser' && drawing !== 'lasso' && (
                <>
                  <span className="bl-sep" />
                  {PALETTE.filter((p) => p.key !== 'light').map((p) => (
                    <button key={p.key} title={p.name} className={editor.penColor(drawing) === p.key ? 'active' : ''} onClick={() => editor.setPenColor(drawing, p.key)}>
                      <span className="bl-swatch" style={{ background: baseColor(p.key) }} />
                    </button>
                  ))}
                </>
              )}
              <span className="bl-sep" />
              <button title="그리기 끝내기 (Esc)" onClick={() => arm({ kind: 'select' })}>
                <CloseIcon />
              </button>
            </>
          )}

          {open === 'icons' && (
            <IconPicker
              style={iconStyle}
              onStyle={setIconStyle}
              onPick={(icon) => pick({ kind: 'shape', shape: 'icon', icon, iconStyle })}
              onClose={() => {
                onFlyout(null)
                editor?.focus()
              }}
            />
          )}
        </div>
      )}
    </>
  )
}
