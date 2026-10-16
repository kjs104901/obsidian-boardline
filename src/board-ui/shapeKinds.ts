import type { ShapeKind } from '@boardline/core/board/model'
import { t } from '@boardline/core/i18n'

/** The flowchart shapes, in menu order, with their names and tool keys ('' for none). */
export const BASIC_SHAPES: { kind: ShapeKind; label: string; key: string }[] = [
  { kind: 'rect', get label() { return t('shape.rect') }, key: 'R' },
  { kind: 'pill', get label() { return t('shape.pill') }, key: 'U' },
  { kind: 'ellipse', get label() { return t('shape.ellipse') }, key: 'O' },
  { kind: 'diamond', get label() { return t('shape.diamond') }, key: 'D' },
  { kind: 'parallelogram', get label() { return t('shape.parallelogram') }, key: 'P' },
  { kind: 'parallelogram-flip', get label() { return t('shape.parallelogramFlip') }, key: '' },
  { kind: 'trapezoid', get label() { return t('shape.trapezoid') }, key: '' },
  { kind: 'triangle', get label() { return t('shape.triangle') }, key: 'G' },
  { kind: 'hexagon', get label() { return t('shape.hexagon') }, key: 'F' },
  { kind: 'cylinder', get label() { return t('shape.cylinder') }, key: 'Y' },
  { kind: 'document', get label() { return t('shape.document') }, key: '' },
  { kind: 'documents', get label() { return t('shape.documents') }, key: '' },
  { kind: 'subroutine', get label() { return t('shape.subroutine') }, key: '' },
  { kind: 'manual-input', get label() { return t('shape.manualInput') }, key: '' },
  { kind: 'delay', get label() { return t('shape.delay') }, key: '' },
  { kind: 'display', get label() { return t('shape.display') }, key: '' },
  { kind: 'brace', get label() { return t('shape.brace') }, key: 'B' },
  { kind: 'cloud', get label() { return t('shape.cloud') }, key: 'J' },
  { kind: 'star', get label() { return t('shape.star') }, key: 'V' },
]

export const isBasicShape = (kind: string): kind is ShapeKind => BASIC_SHAPES.some((s) => s.kind === kind)
