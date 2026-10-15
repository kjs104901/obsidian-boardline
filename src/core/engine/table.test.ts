import { describe, expect, it } from 'vitest'
import { createShape } from '../board/model'
import {
  autosizeTable,
  cellAt,
  colBorderAt,
  deleteCol,
  fitCol,
  gridText,
  insertCol,
  insertRow,
  layoutTable,
  moveCol,
  moveRow,
  parseGrid,
  pasteCells,
  resizeCol,
  setCell,
  setCellColors,
  setColAligns,
  stepCell,
  tableAligns,
  tableCellColors,
  tableCells,
  tableCols,
} from './table'

// Fixed-width font: every character is 10px wide.
const measureAt = () => (s: string) => s.length * 10

describe('table layout', () => {
  it('starts as 2x2 cells of 118x38: 240x80 with 1px edges and 2px gaps', () => {
    const t = createShape('table', 0, 0, 1)
    const l = layoutTable(t, measureAt)
    expect([l.w, l.h]).toEqual([240, 80])
    expect(l.cols.map((c) => c.x)).toEqual([1, 121])
    expect(l.rows.map((r) => r.y)).toEqual([1, 41])
  })

  it('grows rows to fit wrapped text (24px lines, 7px padding)', () => {
    // 118 - 24 = 94px for text: 9 characters per line.
    const t = setCell(createShape('table', 0, 0, 1), { row: 1, col: 0 }, 'aaaaaaaaa bbbbbbbbb ccc')
    const sized = autosizeTable(t, measureAt)
    expect(layoutTable(sized, measureAt).rows[1].h).toBe(3 * 24 + 14)
    expect(sized.h).toBe(1 + 38 + 2 + 86 + 1)
  })

  it('finds cells and column borders', () => {
    const l = layoutTable(createShape('table', 0, 0, 1), measureAt)
    expect(cellAt(l, { x: 150, y: 50 })).toEqual({ row: 1, col: 1 })
    expect(colBorderAt(l, { x: 120, y: 20 }, 3)).toBe(0)
    expect(colBorderAt(l, { x: 60, y: 20 }, 3)).toBeNull()
  })
})

describe('table edits', () => {
  const t = createShape('table', 0, 0, 1)

  it('steps through cells in reading order and stops at the ends', () => {
    expect(stepCell(t, { row: 0, col: 1 }, 1)).toEqual({ row: 1, col: 0 })
    expect(stepCell(t, { row: 1, col: 1 }, 1)).toBeNull()
    expect(stepCell(t, { row: 0, col: 0 }, -1)).toBeNull()
  })

  it('inserts and deletes rows and columns', () => {
    const wider = insertCol(setCell(t, { row: 0, col: 1 }, 'B'), 1)
    expect(tableCells(wider)[0]).toEqual(['', '', 'B'])
    expect(wider.cols).toEqual([118, 118, 118])
    expect(tableCells(insertRow(t, 0))).toHaveLength(3)
    expect(deleteCol(deleteCol(wider, 0)!, 0)).not.toBeNull()
    expect(deleteCol(createShape('table', 0, 0, 1), 0)!.cols).toEqual([118])
    expect(deleteCol({ ...t, cols: [118], cells: [[''], ['']] }, 0)).toBeNull()
  })

  it('keeps columns at least 40px wide', () => {
    expect(resizeCol(t, 0, 10).cols).toEqual([40, 118])
  })

  it('moves rows and columns, a column with its width', () => {
    const grid = { ...t, cols: [100, 200, 300], cells: [['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i']] }
    expect(tableCells(moveRow(grid, 0, 2)!)).toEqual([['d', 'e', 'f'], ['g', 'h', 'i'], ['a', 'b', 'c']])
    const cols = moveCol(grid, 2, 0)!
    expect(cols.cols).toEqual([300, 100, 200])
    expect(tableCells(cols)[1]).toEqual(['f', 'd', 'e'])
    expect(moveRow(grid, 1, 1)).toBeNull()
    expect(moveCol(grid, 0, 3)).toBeNull()
  })

  it('keeps cell fills and column alignments with their cells through row and column edits', () => {
    const styled = setColAligns(setCellColors(t, { r0: 0, c0: 1, r1: 0, c1: 1 }, 'blue'), [1], 'center')
    expect(styled.cellColors).toEqual([[null, 'blue'], [null, null]])
    const moved = moveCol(insertRow(styled, 0), 1, 0)!
    expect(tableCellColors(moved)).toEqual([[null, null], ['blue', null], [null, null]])
    expect(tableAligns(moved)).toEqual(['center', 'left'])
    expect(tableAligns(insertCol(moved, 0))).toEqual(['left', 'center', 'left'])
    // Gray takes the fill off; nothing filled and all left drop the fields.
    expect(setCellColors(styled, { r0: 0, c0: 0, r1: 1, c1: 1 }, 'gray').cellColors).toBeUndefined()
    expect(setColAligns(styled, [1], 'left').colAligns).toBeUndefined()
  })

  it('fits a column to its longest line', () => {
    const wide = setCell(t, { row: 1, col: 0 }, 'x'.repeat(30))
    expect(tableCols(fitCol(wide, 0, measureAt))[0]).toBe(300 + 24 + 2)
    expect(tableCols(fitCol(t, 1, measureAt))[1]).toBe(60)
  })

  it('reads pasted spreadsheet rows and Markdown tables, and grows to fit them', () => {
    expect(parseGrid('a\tb\nc\td\n')).toEqual([['a', 'b'], ['c', 'd']])
    expect(parseGrid('| A | B |\n|---|:-:|\n| 1 | x \\| y |')).toEqual([['A', 'B'], ['1', 'x | y']])
    expect(parseGrid('just text')).toBeNull()
    expect(parseGrid('just text', true)).toEqual([['just text']])
    const pasted = pasteCells(t, { row: 1, col: 1 }, [['1', '2'], ['3', '4']])
    expect(tableCells(pasted)).toEqual([['', '', ''], ['', '1', '2'], ['', '3', '4']])
    expect(gridText([['a', 'b\tc'], ['d', '']])).toBe('a\tb c\nd\t')
  })
})
