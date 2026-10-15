// Tables: columns with widths, rows sized by their text, a header row.

import type { ColorKey, ShapeObject, TextAlign } from '../board/model'
import { fillColor, textColor, theme, themeMode } from '../theme/palette'
import type { Point, Rect } from './geometry'
import type { MeasureAt } from './text'
import { layoutText, type RichLayout } from './richLayout'
import type { Part } from './parts'

/** Two columns and two rows fill a 240×80 table with its 1px edges and 2px gaps. */
export const TABLE_COL_WIDTH = 118
export const TABLE_MIN_COL_WIDTH = 40
export const TABLE_ROW_HEIGHT = 38
export const TABLE_FONT = 16
export const TABLE_LINE = 24
export const TABLE_PAD_X = 12
export const TABLE_PAD_Y = 7
/** Space between cells, and around the outside. */
const GAP = 2
const EDGE = 1

export interface Cell {
  row: number
  col: number
}

export interface TableLayout {
  cols: { x: number; w: number }[]
  rows: { y: number; h: number }[]
  /** Each cell's text, laid out (marks, wrapped lines). */
  text: RichLayout[][]
  w: number
  h: number
}

export function tableCols(o: ShapeObject): number[] {
  return o.cols?.length ? o.cols : [TABLE_COL_WIDTH, TABLE_COL_WIDTH]
}

/** Cell texts, padded to the column count. */
export function tableCells(o: ShapeObject): string[][] {
  const n = tableCols(o).length
  const rows = o.cells?.length ? o.cells : [['', ''], ['', '']]
  return rows.map((r) => Array.from({ length: n }, (_, i) => r[i] ?? ''))
}

export const hasHeader = (o: ShapeObject) => o.header !== false

/** Each cell's fill (null = plain), padded to the table's rows and columns. */
export function tableCellColors(o: ShapeObject): (ColorKey | null)[][] {
  const n = tableCols(o).length
  return tableCells(o).map((_, r) => Array.from({ length: n }, (_, c) => o.cellColors?.[r]?.[c] ?? null))
}

/** Each column's text alignment. */
export function tableAligns(o: ShapeObject): TextAlign[] {
  return tableCols(o).map((_, i) => o.colAligns?.[i] ?? 'left')
}

export function cellFont(o: ShapeObject, row: number): { size: number; bold: boolean } {
  return { size: TABLE_FONT, bold: hasHeader(o) && row === 0 }
}

export function layoutTable(o: ShapeObject, measureAt: MeasureAt): TableLayout {
  const widths = tableCols(o)
  const cells = tableCells(o)
  const cols: TableLayout['cols'] = []
  let x = o.x + EDGE
  for (const w of widths) {
    cols.push({ x, w })
    x += w + GAP
  }
  const aligns = tableAligns(o)
  const text = cells.map((r, row) =>
    r.map((t, c) => layoutText(t, widths[c] - 2 * TABLE_PAD_X, { size: TABLE_FONT, line: TABLE_LINE, align: aligns[c], inline: true, bold: cellFont(o, row).bold }, measureAt)),
  )
  const rows: TableLayout['rows'] = []
  let y = o.y + EDGE
  for (const rowText of text) {
    const h = Math.max(TABLE_ROW_HEIGHT, Math.max(TABLE_LINE, ...rowText.map((l) => l.height)) + 2 * TABLE_PAD_Y)
    rows.push({ y, h })
    y += h + GAP
  }
  return { cols, rows, text, w: x - GAP + EDGE - o.x, h: y - GAP + EDGE - o.y }
}

export function autosizeTable(o: ShapeObject, measureAt: MeasureAt): ShapeObject {
  const l = layoutTable(o, measureAt)
  return l.w === o.w && l.h === o.h ? o : { ...o, w: l.w, h: l.h }
}

export function cellRect(l: TableLayout, c: Cell): Rect {
  const col = l.cols[c.col]
  const row = l.rows[c.row]
  return { x: col.x, y: row.y, w: col.w, h: row.h }
}

/** Box the cell's text is laid out in. */
export function cellTextBox(l: TableLayout, c: Cell): Rect {
  const r = cellRect(l, c)
  return { x: r.x + TABLE_PAD_X, y: r.y + TABLE_PAD_Y, w: r.w - 2 * TABLE_PAD_X, h: r.h - 2 * TABLE_PAD_Y }
}

export function cellAt(l: TableLayout, p: Point): Cell | null {
  const col = l.cols.findIndex((c) => p.x >= c.x - GAP / 2 && p.x < c.x + c.w + GAP / 2)
  const row = l.rows.findIndex((r) => p.y >= r.y - GAP / 2 && p.y < r.y + r.h + GAP / 2)
  return col < 0 || row < 0 ? null : { row, col }
}

/** Column whose right border is within `tolerance` of `p` (for resizing). */
export function colBorderAt(l: TableLayout, p: Point, tolerance: number): number | null {
  const top = l.rows[0]?.y ?? 0
  const last = l.rows[l.rows.length - 1]
  if (!last || p.y < top || p.y > last.y + last.h) return null
  const i = l.cols.findIndex((c) => Math.abs(p.x - (c.x + c.w + GAP / 2)) <= tolerance)
  return i < 0 ? null : i
}

/** The next cell in reading order (Tab), or the previous one; null past either end. */
export function stepCell(o: ShapeObject, c: Cell, dir: 1 | -1): Cell | null {
  const n = tableCols(o).length
  const i = c.row * n + c.col + dir
  const rows = tableCells(o).length
  if (i < 0 || i >= rows * n) return null
  return { row: Math.floor(i / n), col: i % n }
}

// ---- edits (return a new table) -------------------------------------------------------

export function setCell(o: ShapeObject, c: Cell, text: string): ShapeObject {
  const cells = tableCells(o).map((r) => [...r])
  cells[c.row][c.col] = text
  return { ...o, cells }
}

/** Rearranges a list (rows, or the cells of a row), putting `blank` where one is added. */
type Rearrange = <T>(list: T[], blank: T) => T[]
const same: Rearrange = (list) => list

/**
 * Rows and columns added, removed or moved: the texts, the fills and the column alignments
 * change together (`cols` rearranges every row's cells; `widths` are the new column widths).
 */
function restructure(o: ShapeObject, rows: Rearrange, cols: Rearrange, widths: number[]): ShapeObject {
  const next: ShapeObject = { ...o, cols: widths, cells: rows(tableCells(o).map((r) => cols(r, '')), widths.map(() => '')) }
  if (o.cellColors) next.cellColors = rows(tableCellColors(o).map((r) => cols<ColorKey | null>(r, null)), widths.map(() => null))
  if (o.colAligns) next.colAligns = cols<TextAlign | null>(tableAligns(o), null)
  return next
}

const insertAt = (at: number): Rearrange => (list, blank) => [...list.slice(0, at), blank, ...list.slice(at)]
const removeAt = (at: number): Rearrange => (list) => list.filter((_, i) => i !== at)
/** Move one entry of a list from `from` to `to` (its index afterwards). */
const moveTo =
  (from: number, to: number): Rearrange =>
  (list) => {
    const next = [...list]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    return next
  }

export function insertRow(o: ShapeObject, at: number): ShapeObject {
  return restructure(o, insertAt(at), same, tableCols(o))
}

export function insertCol(o: ShapeObject, at: number): ShapeObject {
  return restructure(o, same, insertAt(at), insertAt(at)(tableCols(o), TABLE_COL_WIDTH))
}

export function deleteRow(o: ShapeObject, at: number): ShapeObject | null {
  if (tableCells(o).length <= 1) return null
  return restructure(o, removeAt(at), same, tableCols(o))
}

export function deleteCol(o: ShapeObject, at: number): ShapeObject | null {
  const cols = tableCols(o)
  if (cols.length <= 1) return null
  return restructure(o, same, removeAt(at), removeAt(at)(cols, 0))
}

/** The row at `from` moved to `to`; null when it stays where it is. */
export function moveRow(o: ShapeObject, from: number, to: number): ShapeObject | null {
  const n = tableCells(o).length
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return null
  return restructure(o, moveTo(from, to), same, tableCols(o))
}

/** The column at `from` moved to `to`, with its width; null when it stays where it is. */
export function moveCol(o: ShapeObject, from: number, to: number): ShapeObject | null {
  const cols = tableCols(o)
  if (from === to || from < 0 || to < 0 || from >= cols.length || to >= cols.length) return null
  return restructure(o, same, moveTo(from, to), moveTo(from, to)(cols, 0))
}

/** Selected cells, corner to corner (inclusive). */
export interface CellRange {
  r0: number
  c0: number
  r1: number
  c1: number
}

/** The cells' fill (gray takes it off); nothing left filled drops the field. */
export function setCellColors(o: ShapeObject, range: CellRange, color: ColorKey): ShapeObject {
  const colors = tableCellColors(o).map((row, r) => row.map((c, col) => (r >= range.r0 && r <= range.r1 && col >= range.c0 && col <= range.c1 ? (color === 'gray' ? null : color) : c)))
  const { cellColors: _old, ...rest } = o
  return colors.some((row) => row.some(Boolean)) ? { ...rest, cellColors: colors } : rest
}

/** The columns' text alignment; all left again drops the field. */
export function setColAligns(o: ShapeObject, cols: number[], align: TextAlign): ShapeObject {
  const aligns = tableAligns(o).map((a, i) => (cols.includes(i) ? align : a))
  const { colAligns: _old, ...rest } = o
  return aligns.some((a) => a !== 'left') ? { ...rest, colAligns: aligns } : rest
}

/** Widest a fitted column gets (longer text wraps). */
export const TABLE_FIT_MAX = 480

/** The column as wide as its longest line (within TABLE_FIT_MAX). */
export function fitCol(o: ShapeObject, col: number, measureAt: MeasureAt): ShapeObject {
  let widest = 0
  tableCells(o).forEach((r, row) => {
    if (!r[col]) return
    const l = layoutText(r[col], 1e5, { size: TABLE_FONT, line: TABLE_LINE, align: 'left', inline: true, bold: cellFont(o, row).bold }, measureAt)
    widest = Math.max(widest, l.width)
  })
  return resizeCol(o, col, Math.min(TABLE_FIT_MAX, Math.max(60, Math.ceil(widest) + 2 * TABLE_PAD_X + 2)))
}

/**
 * Text pasted at a cell: rows of cells from tab-separated lines (a spreadsheet) or a
 * Markdown table. The table grows to fit.
 */
export function pasteCells(o: ShapeObject, at: Cell, grid: string[][]): ShapeObject {
  const width = Math.max(...grid.map((r) => r.length))
  let next = o
  while (tableCols(next).length < at.col + width) next = insertCol(next, tableCols(next).length)
  while (tableCells(next).length < at.row + grid.length) next = insertRow(next, tableCells(next).length)
  const cells = tableCells(next).map((r) => [...r])
  grid.forEach((r, i) => r.forEach((text, j) => (cells[at.row + i][at.col + j] = text)))
  return { ...next, cells }
}

/**
 * Rows of cells in pasted text: tab-separated lines, or a Markdown table (`| a | b |` with a
 * `|---|` rule under the first row). Null for anything else (one plain line counts as one cell
 * only when `single` is on).
 */
export function parseGrid(text: string, single = false): string[][] | null {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n')
  if (lines.length === 0) return null
  const pipe = (l: string) => l.trim().startsWith('|') && l.trim().length > 1
  if (lines.length >= 2 && lines.every(pipe) && /^\s*\|?\s*:?-{3,}/.test(lines[1])) {
    const split = (l: string) =>
      l
        .trim()
        .replace(/^\||\|$/g, '')
        // An escaped \| stays in its cell (set aside while splitting: no lookbehind on older iOS).
        .replace(/\\\|/g, '\u0000')
        .split('|')
        .map((c) => c.trim().replace(/\u0000/g, '|'))
    return [split(lines[0]), ...lines.slice(2).map(split)]
  }
  if (lines.some((l) => l.includes('\t'))) return lines.map((l) => l.split('\t').map((c) => c.trim()))
  return single && lines.length === 1 ? [[lines[0]]] : null
}

/** Cells as tab-separated lines (what spreadsheets read). */
export function gridText(grid: string[][]): string {
  return grid.map((r) => r.map((c) => c.replace(/[\t\n]+/g, ' ')).join('\t')).join('\n')
}

export function resizeCol(o: ShapeObject, col: number, width: number): ShapeObject {
  const cols = [...tableCols(o)]
  cols[col] = Math.max(TABLE_MIN_COL_WIDTH, Math.round(width))
  return { ...o, cols }
}

// ---- drawing ---------------------------------------------------------------------------

function tableColors(header: boolean) {
  if (themeMode() === 'dark') {
    return { border: 'oklch(39.4% 0 0)', bg: header ? 'oklch(32.3% 0 0)' : 'oklch(17.4% 0 0)' }
  }
  return header ? { border: '#c2c5ca', bg: '#e1e5ec' } : { border: 'oklch(92% 0 0)', bg: '#ffffff' }
}

/**
 * Drawing parts: every cell's border box first, then backgrounds, then text (skipping the
 * cell being edited, whose text is in the editor overlay).
 */
export function tableParts(o: ShapeObject, measureAt: MeasureAt, editing: Cell | null = null): Part[] {
  const l = layoutTable(o, measureAt)
  const head = hasHeader(o)
  const parts: Part[] = []
  const cells: { c: Cell; r: Rect; header: boolean }[] = []
  l.rows.forEach((_, row) => l.cols.forEach((_, col) => cells.push({ c: { row, col }, r: cellRect(l, { row, col }), header: head && row === 0 })))
  for (const { r, header } of cells) parts.push({ kind: 'rect', x: r.x - GAP, y: r.y - GAP, w: r.w + 2 * GAP, h: r.h + 2 * GAP, fill: tableColors(header).border })
  // The table's color tints its header row; a cell's own fill goes over that.
  const fills = tableCellColors(o)
  const fillOf = (c: Cell, header: boolean) => fills[c.row]?.[c.col] ?? (header && o.color !== 'gray' ? o.color : null)
  for (const { c, r, header } of cells) {
    const fill = fillOf(c, header)
    parts.push({ kind: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, fill: fill ? fillColor(fill, 'fill') : tableColors(header).bg })
  }
  for (const { c, header } of cells) {
    if (editing && editing.row === c.row && editing.col === c.col) continue
    const box = cellTextBox(l, c)
    const text = l.text[c.row][c.col]
    const fill = fillOf(c, header)
    if (text.spans.length) parts.push({ kind: 'rich', x: box.x, y: box.y, layout: text, color: fill ? textColor(fill, 'fill') : theme.text })
  }
  return parts
}
