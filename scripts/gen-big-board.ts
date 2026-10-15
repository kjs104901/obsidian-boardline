// Big boards for performance checks: a realistic mix of objects (flowchart shapes with text,
// stickies, free text, lines between neighbours, mind maps, tables, sections, pen strokes).
// Run: node scripts/gen-big-board.mjs <count> <out.board>   (the .mjs is built from this file)
import fs from 'node:fs'
import { createConnector, createMindmapNode, createShape, FLOW_SHAPES, type BoardObject, type ColorKey } from '../src/core/board/model'
import { emptyBoardFile, formatBoardFile } from '../src/core/board/serialize'

const [, , countArg, out] = process.argv
const count = Number(countArg ?? 1000)
const colors: ColorKey[] = ['gray', 'blue', 'green', 'orange', 'purple', 'red', 'teal', 'yellow']
let seed = 42
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
const pick = <T>(list: T[]) => list[Math.floor(rnd() * list.length)]
const words = ['로그인', '결제', '주문 확인', 'API 호출', '사용자', 'Server', 'Client', '검토', '배포', '테스트', '데이터베이스', '캐시', '알림 보내기', 'Retry']

const objects: BoardObject[] = []
let z = 0
const shapes: BoardObject[] = []
// Cells of a grid, 320 × 200 apart; a few are sections around blocks of cells.
const cols = Math.ceil(Math.sqrt(count * 0.8))
let i = 0
while (objects.length < count) {
  const cx = (i % cols) * 320
  const cy = Math.floor(i / cols) * 200
  i++
  const r = rnd()
  if (r < 0.55) {
    const s = { ...createShape(pick(FLOW_SHAPES.slice(0, 6)), cx, cy, z++), text: `${pick(words)} ${i}`, color: pick(colors) }
    objects.push(s)
    shapes.push(s)
  } else if (r < 0.67) {
    const s = { ...createShape('sticky', cx, cy - 40, z++), text: `${pick(words)}\n- 할 일 ${i}\n- **확인**`, color: 'yellow' as ColorKey }
    objects.push(s)
    shapes.push(s)
  } else if (r < 0.75) {
    objects.push({ ...createShape('text', cx, cy, z++), text: `메모 ${i}: ${pick(words)} 와 ${pick(words)}` })
  } else if (r < 0.79) {
    const pts: number[] = []
    for (let k = 0; k < 40; k++) pts.push(k * 5, Math.sin(k / 4) * 20 + 20)
    objects.push({ ...createShape('freehand', cx, cy, z++, { w: 200, h: 40 }), points: pts, pen: 'pen', color: pick(colors) })
  } else if (r < 0.81) {
    objects.push({ ...createShape('table', cx, cy, z++), cols: [100, 100, 100], cells: [['이름', '값', '비고'], ['a', '1', 'x'], ['b', '2', 'y']] })
  } else if (r < 0.82) {
    // A small mind map: a root and 8 branches with 2 leaves each.
    const root = { ...createMindmapNode(null, cx, cy, 0, 'gray', z++), text: `주제 ${i}` }
    objects.push(root)
    for (let b = 0; b < 8 && objects.length < count; b++) {
      const kid = { ...createMindmapNode(root.id, 0, 0, b, pick(colors), z++), text: `가지 ${b}` }
      objects.push(kid)
      for (let l = 0; l < 2 && objects.length < count; l++) objects.push({ ...createMindmapNode(kid.id, 0, 0, l, kid.color, z++), text: `잎 ${l}` })
    }
    i += 3
  } else if (shapes.length > 2) {
    // A line between two recent shapes (neighbours), elbow mostly, some labelled.
    const a = shapes[shapes.length - 1 - Math.floor(rnd() * Math.min(5, shapes.length - 1))]
    const b = shapes[shapes.length - 1 - Math.floor(rnd() * Math.min(5, shapes.length - 1))]
    if (a.id !== b.id) objects.push({ ...createConnector({ objectId: a.id }, { objectId: b.id }, z++), label: rnd() < 0.3 ? pick(words) : '' })
  }
}
// Sections behind blocks of 4 × 3 cells, every few blocks.
const rows = Math.ceil(i / cols)
for (let by = 0; by < rows; by += 6) {
  for (let bx = 0; bx < cols; bx += 8) {
    if (rnd() < 0.5) objects.push({ ...createShape('section', bx * 320 - 40, by * 200 - 80, -1 - z++, { w: 4 * 320, h: 3 * 200 }), text: `구역 ${bx}-${by}` })
  }
}
const file = { ...emptyBoardFile(`큰 보드 ${count}`), objects }
fs.writeFileSync(out, formatBoardFile(file))
console.log(`${objects.length} objects -> ${out} (${(fs.statSync(out).size / 1e6).toFixed(2)} MB)`)
