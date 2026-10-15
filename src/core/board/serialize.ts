import { BoardDocument, type BoardMeta } from './document'
import { SHAPE_SPECS, TEXT_SIZES, newId, type BoardObject, type Endpoint, type ShapeKind, type TextSize } from './model'

export const BOARD_EXT = '.board'
const FORMAT = 'boardline-board'
const VERSION = 1

/** On-disk board file. One board = one JSON file in the workspace folder. */
export interface BoardFile {
  format: typeof FORMAT
  version: typeof VERSION
  id: string
  title: string
  rev: number
  createdAt: string
  updatedAt: string
  /** Objects picked for the board's thumbnail (by the former desktop app); kept as read. */
  thumbnail?: string[]
  /** Sections in presenting order (set by hand); absent = reading order. */
  slides?: string[]
  objects: BoardObject[]
}

export function emptyBoardFile(title: string): BoardFile {
  const now = new Date().toISOString()
  return { format: FORMAT, version: VERSION, id: newId(), title, rev: 0, createdAt: now, updatedAt: now, objects: [] }
}

export function toFile(doc: BoardDocument): BoardFile {
  return {
    format: FORMAT,
    version: VERSION,
    id: doc.meta.id,
    title: doc.meta.title,
    rev: doc.meta.rev,
    createdAt: doc.meta.createdAt,
    updatedAt: new Date().toISOString(),
    ...(doc.meta.thumbnail?.length ? { thumbnail: doc.meta.thumbnail } : {}),
    ...(doc.meta.slides?.length ? { slides: doc.meta.slides } : {}),
    objects: doc.ordered(),
  }
}

export function serialize(doc: BoardDocument): string {
  return formatBoardFile(toFile(doc))
}

/**
 * A board file as text: the header on the first line, then one object per line (so a pen
 * stroke's points stay on its own line, and a change to an object is a one-line diff).
 */
export function formatBoardFile(file: BoardFile): string {
  const { objects, ...header } = file
  const head = JSON.stringify(header).slice(0, -1)
  if (objects.length === 0) return `${head},"objects":[]}\n`
  return `${head},"objects":[\n${objects.map((o) => JSON.stringify(o)).join(',\n')}\n]}\n`
}

export class BoardFormatError extends Error {}

export function parseBoard(text: string): BoardDocument {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    throw new BoardFormatError(`보드 파일을 읽을 수 없습니다: ${(e as Error).message}`)
  }
  const f = raw as Partial<BoardFile>
  if (f?.format !== FORMAT) throw new BoardFormatError('보드 파일 형식이 아닙니다.')
  if (f.version !== VERSION) throw new BoardFormatError(`지원하지 않는 버전입니다: ${String(f.version)}`)
  const meta: BoardMeta = {
    id: String(f.id ?? newId()),
    title: String(f.title ?? ''),
    createdAt: String(f.createdAt ?? new Date().toISOString()),
    rev: Number(f.rev ?? 0),
    ...(Array.isArray(f.thumbnail) ? { thumbnail: f.thumbnail.filter((id): id is string => typeof id === 'string') } : {}),
    ...(Array.isArray(f.slides) ? { slides: f.slides.filter((id): id is string => typeof id === 'string') } : {}),
  }
  const objects = (Array.isArray(f.objects) ? f.objects : []).filter(isValidObject)
  return new BoardDocument(meta, objects)
}

const isNum = (n: unknown) => typeof n === 'number' && Number.isFinite(n)

function isValidEndpoint(e: unknown): e is Endpoint {
  const v = e as Record<string, unknown> | null
  if (!v) return false
  if ('point' in v) {
    const p = v.point as Record<string, unknown> | null
    return !!p && isNum(p.x) && isNum(p.y)
  }
  return (
    typeof v.objectId === 'string' &&
    (v.side === undefined || ['top', 'right', 'bottom', 'left'].includes(v.side as string)) &&
    (v.dy === undefined || isNum(v.dy))
  )
}

function isValidPins(v: unknown): boolean {
  if (v === undefined) return true
  const at = (v as { at?: unknown } | null)?.at
  return Array.isArray(at) && at.every((e: unknown) => e === null || (typeof e === 'object' && (isNum((e as { x?: unknown }).x) || isNum((e as { y?: unknown }).y))))
}

function isValidObject(o: unknown): o is BoardObject {
  const v = o as BoardObject
  if (!v || typeof v.id !== 'string' || !isNum(v.z)) return false
  if (v.type === 'shape') return (v.shape as ShapeKind) in SHAPE_SPECS && [v.x, v.y, v.w, v.h].every(isNum) && (v.stem === undefined || isNum(v.stem)) && (v.src === undefined || typeof v.src === 'string') && (v.angle === undefined || isNum(v.angle)) && (v.icon === undefined || typeof v.icon === 'string') && (v.iconStyle === undefined || ['color', 'fill', 'outline'].includes(v.iconStyle)) && (v.points === undefined || (Array.isArray(v.points) && v.points.every(isNum))) && (v.pen === undefined || v.pen === 'pen' || v.pen === 'marker') && (v.link === undefined || typeof v.link === 'string') && (v.preview === undefined || typeof v.preview === 'object') && (v.cols === undefined || (Array.isArray(v.cols) && v.cols.every(isNum))) && (v.cells === undefined || (Array.isArray(v.cells) && v.cells.every((r) => Array.isArray(r) && r.every((c) => typeof c === 'string')))) && (v.textSize === undefined || TEXT_SIZES.includes(v.textSize as TextSize)) && (v.align === undefined || ['left', 'center', 'right'].includes(v.align as string))
  if (v.type === 'connector') return isValidEndpoint(v.from) && isValidEndpoint(v.to) && (v.kind === 'elbow' || v.kind === 'straight' || v.kind === 'curved') && isValidPins(v.pins)
  if (v.type === 'mindmap') return (v.parentId === null || typeof v.parentId === 'string') && [v.x, v.y, v.order].every(isNum) && typeof v.text === 'string'
  return false
}

/** File name for a new board: keeps Korean/Unicode, strips characters Windows forbids. */
export function boardFileName(title: string): string {
  const safe = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim() || '새 보드'
  return safe + BOARD_EXT
}

export function titleFromFileName(name: string): string {
  return name.endsWith(BOARD_EXT) ? name.slice(0, -BOARD_EXT.length) : name
}
