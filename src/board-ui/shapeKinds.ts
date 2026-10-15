import type { ShapeKind } from '@boardline/core/board/model'

/** The flowchart shapes, in menu order, with their names and tool keys ('' for none). */
export const BASIC_SHAPES: { kind: ShapeKind; label: string; key: string }[] = [
  { kind: 'rect', label: '사각형', key: 'R' },
  { kind: 'pill', label: '알약', key: 'U' },
  { kind: 'ellipse', label: '원', key: 'O' },
  { kind: 'diamond', label: '다이아몬드', key: 'D' },
  { kind: 'parallelogram', label: '평행사변형', key: 'P' },
  { kind: 'parallelogram-flip', label: '반대 평행사변형', key: '' },
  { kind: 'trapezoid', label: '사다리꼴', key: '' },
  { kind: 'triangle', label: '삼각형', key: 'G' },
  { kind: 'hexagon', label: '육각형', key: 'F' },
  { kind: 'cylinder', label: '원통', key: 'Y' },
  { kind: 'brace', label: '중괄호', key: 'B' },
  { kind: 'cloud', label: '구름', key: 'J' },
  { kind: 'star', label: '별', key: 'V' },
]

export const isBasicShape = (kind: ShapeKind): boolean => BASIC_SHAPES.some((s) => s.kind === kind)
