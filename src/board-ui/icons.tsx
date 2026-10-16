// Small line icons drawn as SVG, so they look the same in every font and theme
// (some Unicode symbols fall back to colored emoji glyphs on Windows).

import type { ReactNode } from 'react'
import type { ShapeKind } from '@boardline/core/board/model'
import { shapePathData } from '@boardline/core/engine/shapes'

function Icon({ size = 16, children }: { size?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

/** Outline of a shape kind, drawn from the same path data as the board. */
export function ShapeIcon({ kind, size = 18 }: { kind: ShapeKind; size?: number }) {
  const wide = ['rect', 'pill', 'parallelogram', 'parallelogram-flip', 'trapezoid', 'hexagon', 'cloud', 'document', 'documents', 'subroutine', 'manual-input', 'delay', 'display'].includes(kind)
  const r = wide ? { x: 2, y: 6, w: 20, h: 12 } : { x: 4, y: 3, w: 16, h: 18 }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      {/* A board rectangle's corners would nearly round this small box into a pill. */}
      {kind === 'rect' ? <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="1.5" /> : <path d={shapePathData(kind, r)} />}
    </svg>
  )
}

export const SelectIcon = () => (
  <Icon>
    <path d="M3.5 2.5l9 5-4 1.2-1.8 3.8z" />
  </Icon>
)

/** A page with lines, for Markdown documents. */
export const HandIcon = () => (
  <Icon>
    <path d="M5.5 8.5V3.8a1 1 0 0 1 2 0V7.5M7.5 7V2.8a1 1 0 0 1 2 0V7M9.5 7V3.8a1 1 0 0 1 2 0V8M11.5 8V5.8a1 1 0 0 1 2 0V10a4.5 4.5 0 0 1-4.5 4.5H8.6a4 4 0 0 1-3.2-1.6L2.8 9.6a1 1 0 0 1 1.5-1.3l1.2 1.2" />
  </Icon>
)

export const PenIcon = () => (
  <Icon>
    <path d="M10.8 2.7l2.5 2.5L5.5 13H3v-2.5z" />
    <path d="M9.3 4.2l2.5 2.5" />
  </Icon>
)

export const MarkerIcon = () => (
  <Icon>
    <path d="M9.5 2.5l4 4-5 5-4-4z" />
    <path d="M4.5 7.5l-1 4.5 4.5-1M2 14h5" />
  </Icon>
)

export const EraserIcon = () => (
  <Icon>
    <path d="M6 13.5l-3-3a1.2 1.2 0 0 1 0-1.7l6-6a1.2 1.2 0 0 1 1.7 0l3 3a1.2 1.2 0 0 1 0 1.7l-5.3 6zM6 13.5h8M5 7l4 4" />
  </Icon>
)

/** A lasso: a dashed loop with a tail. */
export const LassoIcon = () => (
  <Icon>
    <path d="M8 2.5c3.3 0 6 1.8 6 4s-2.7 4-6 4-6-1.8-6-4 2.7-4 6-4z" strokeDasharray="2 1.6" />
    <path d="M5.5 10c-.8.9-1 2-.2 2.8.7.7 1.8.4 2.2-.4" />
  </Icon>
)

export const StickyIcon = () => (
  <Icon>
    <path d="M2.5 2.5h11v7l-4 4h-7z" />
    <path d="M13.5 9.5h-4v4" />
  </Icon>
)

export const TextIcon = () => (
  <Icon>
    <path d="M3 3.5h10M8 3.5v10" />
  </Icon>
)

export const SectionIcon = () => (
  <Icon>
    <rect x="2" y="5.5" width="12" height="8.5" rx="1" />
    <path d="M2.5 2.8h5" />
  </Icon>
)

export const MindmapIcon = () => (
  <Icon>
    <rect x="1.5" y="6" width="4" height="4" rx="1" />
    <path d="M5.5 8C8 8 8 3.5 10.5 3.5M5.5 8h5M5.5 8C8 8 8 12.5 10.5 12.5" />
    <path d="M11.5 3.5h3M11.5 8h3M11.5 12.5h3" />
  </Icon>
)

export const TableIcon = () => (
  <Icon>
    <rect x="2" y="3" width="12" height="10" rx="1" />
    <path d="M2 6.5h12M8 3v10" />
  </Icon>
)

export const ChevronIcon = ({ open }: { open: boolean }) => (
  <Icon size={12}>
    <path d={open ? 'M4 6l4 4 4-4' : 'M6 4l4 4-4 4'} />
  </Icon>
)

// ---- view controls (the column at the board's right, as in Obsidian's canvas) ----------

/** A cog: eight teeth round a hole. */
const COG = (() => {
  const p: string[] = []
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4
    for (const [da, r] of [
      [-0.32, 4.9],
      [-0.17, 6.6],
      [0.17, 6.6],
      [0.32, 4.9],
    ]) {
      p.push(`${(8 + r * Math.cos(a + da)).toFixed(2)} ${(8 + r * Math.sin(a + da)).toFixed(2)}`)
    }
  }
  return `M${p.join('L')}Z`
})()

export const GearIcon = () => (
  <Icon>
    <path d={COG} />
    <circle cx="8" cy="8" r="2" />
  </Icon>
)

export const PlusIcon = () => (
  <Icon>
    <path d="M3 8h10M8 3v10" />
  </Icon>
)

export const MinusIcon = () => (
  <Icon>
    <path d="M3 8h10" />
  </Icon>
)

/** A circling arrow: back to 100%. */
export const ResetZoomIcon = () => (
  <Icon>
    <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9l1.6 1.4" />
    <path d="M13.5 2.5v3h-3" />
  </Icon>
)

/** Four corners: fit the board in view. */
export const FitIcon = () => (
  <Icon>
    <path d="M5.5 2.5h-2a1 1 0 0 0-1 1v2M10.5 2.5h2a1 1 0 0 1 1 1v2M2.5 10.5v2a1 1 0 0 0 1 1h2M13.5 10.5v2a1 1 0 0 1-1 1h-2" />
  </Icon>
)

export const UndoIcon = () => (
  <Icon>
    <path d="M5.5 9.5 2.5 6.5l3-3" />
    <path d="M2.5 6.5h7a3.5 3.5 0 0 1 0 7H7.5" />
  </Icon>
)

export const RedoIcon = () => (
  <Icon>
    <path d="M10.5 9.5l3-3-3-3" />
    <path d="M13.5 6.5h-7a3.5 3.5 0 0 0 0 7h2" />
  </Icon>
)

/** A screen on a stand, for presenting. */
export const SlidesIcon = () => (
  <Icon>
    <rect x="2" y="2.5" width="12" height="8.5" rx="1" />
    <path d="M8 11v2.5M5.5 13.5h5M6.8 5.2v3.1L9.4 6.75z" />
  </Icon>
)

export const HelpIcon = () => (
  <Icon>
    <circle cx="8" cy="8" r="6" />
    <path d="M6.2 6.3a1.9 1.9 0 0 1 3.7.5c0 1.3-1.9 1.5-1.9 2.7" />
    <path d="M8 11.6h.01" />
  </Icon>
)

export const GridIcon = () => (
  <Icon>
    <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
    <path d="M2.5 6.2h11M2.5 9.8h11M6.2 2.5v11M9.8 2.5v11" />
  </Icon>
)

/** A box held between two lines: snap to other objects. */
export const SnapObjectsIcon = () => (
  <Icon>
    <path d="M1.5 2.5h13M1.5 13.5h13" />
    <rect x="5" y="5" width="6" height="6" rx="1" />
  </Icon>
)

export const LockIcon = () => (
  <Icon>
    <rect x="3.5" y="7" width="9" height="6.5" rx="1" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
  </Icon>
)

export const CheckIcon = () => (
  <Icon size={14}>
    <path d="M3.5 8.5l3 3 6-6.5" />
  </Icon>
)

// ---- small controls (drawn, so they sit centered like the rest; text symbols ride the baseline)

export const CloseIcon = () => (
  <Icon size={16}>
    <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
  </Icon>
)

export const ArrowUpIcon = () => (
  <Icon size={14}>
    <path d="M8 13V3M4 7l4-4 4 4" />
  </Icon>
)

export const ArrowDownIcon = () => (
  <Icon size={14}>
    <path d="M8 3v10M4 9l4 4 4-4" />
  </Icon>
)

export const BackIcon = () => (
  <Icon size={14}>
    <path d="M10 3.5 5.5 8l4.5 4.5" />
  </Icon>
)

/** Three dots: more. */
export const MoreIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
    <circle cx="4" cy="9" r="1.3" />
    <circle cx="9" cy="9" r="1.3" />
    <circle cx="14" cy="9" r="1.3" />
  </svg>
)
