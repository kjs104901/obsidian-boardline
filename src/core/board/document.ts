import type { BoardObject } from './model'

/**
 * One object-level change. `before`/`after` are full snapshots so the same op can be
 * applied forwards (redo) and backwards (undo). Create: before = null. Delete: after = null.
 */
export interface Op {
  id: string
  before: BoardObject | null
  after: BoardObject | null
}

export interface Transaction {
  label: string
  ops: Op[]
}

export interface BoardMeta {
  id: string
  title: string
  createdAt: string
  /** Incremented on every save; used to detect external edits. */
  rev: number
  /** Objects picked for the board's thumbnail (by the former desktop app); kept so files round-trip. */
  thumbnail?: string[]
  /** Sections in the order a presentation shows them; others follow in reading order. */
  slides?: string[]
}

export type ChangeSource = 'edit' | 'undo' | 'redo' | 'load' | 'meta'

export interface ChangeEvent {
  source: ChangeSource
  ids: string[]
}

const MAX_UNDO = 200

export class BoardDocument {
  readonly objects = new Map<string, BoardObject>()
  private undoStack: Transaction[] = []
  private redoStack: Transaction[] = []
  private listeners = new Set<(e: ChangeEvent) => void>()

  constructor(
    public meta: BoardMeta,
    objects: BoardObject[] = [],
  ) {
    for (const o of objects) this.objects.set(o.id, o)
  }

  get(id: string): BoardObject | undefined {
    return this.objects.get(id)
  }

  /** Drawing order, kept until an edit (asked for many times a frame on big boards). */
  private orderedCache: BoardObject[] | null = null

  /** Objects in drawing order (bottom first). Shared: don't change the array. */
  ordered(): BoardObject[] {
    return (this.orderedCache ??= [...this.objects.values()].sort((a, b) => a.z - b.z))
  }

  maxZ(): number {
    let z = 0
    for (const o of this.objects.values()) z = Math.max(z, o.z)
    return z
  }

  subscribe(fn: (e: ChangeEvent) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /**
   * Apply a user edit as one undoable step. Ops with identical before/after are dropped.
   * `mergeWithLast` adds them to the previous step instead (one gesture made of two edits).
   */
  commit(label: string, ops: Op[], mergeWithLast = false): void {
    const real = ops.filter((op) => !sameObject(op.before, op.after))
    if (real.length === 0) return
    this.applyOps(real, false)
    const last = this.undoStack[this.undoStack.length - 1]
    if (mergeWithLast && last) last.ops = [...last.ops, ...real]
    else {
      this.undoStack.push({ label, ops: real })
      if (this.undoStack.length > MAX_UNDO) this.undoStack.shift()
    }
    this.redoStack = []
    this.emit('edit', real)
  }

  /** Change board settings (not undoable); listeners see a 'meta' change so it gets saved. */
  setMeta(patch: Partial<BoardMeta>): void {
    this.meta = { ...this.meta, ...patch }
    for (const fn of this.listeners) fn({ source: 'meta', ids: [] })
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  undo(): Transaction | null {
    const tx = this.undoStack.pop()
    if (!tx) return null
    this.applyOps(tx.ops, true)
    this.redoStack.push(tx)
    this.emit('undo', tx.ops)
    return tx
  }

  redo(): Transaction | null {
    const tx = this.redoStack.pop()
    if (!tx) return null
    this.applyOps(tx.ops, false)
    this.undoStack.push(tx)
    this.emit('redo', tx.ops)
    return tx
  }

  private applyOps(ops: Op[], reverse: boolean): void {
    this.orderedCache = null
    const seq = reverse ? [...ops].reverse() : ops
    for (const op of seq) {
      const next = reverse ? op.before : op.after
      if (next) this.objects.set(op.id, next)
      else this.objects.delete(op.id)
    }
  }

  private emit(source: ChangeSource, ops: Op[]): void {
    const e: ChangeEvent = { source, ids: ops.map((o) => o.id) }
    for (const fn of this.listeners) fn(e)
  }
}

export function createOp(obj: BoardObject): Op {
  return { id: obj.id, before: null, after: obj }
}

export function updateOp(before: BoardObject, after: BoardObject): Op {
  return { id: before.id, before, after }
}

export function deleteOp(obj: BoardObject): Op {
  return { id: obj.id, before: obj, after: null }
}

function sameObject(a: BoardObject | null, b: BoardObject | null): boolean {
  return deepEqual(a, b)
}

/** Structural equality for plain JSON-like values (objects carry nested endpoints and pins). */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined)
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined)
  if (ka.length !== kb.length) return false
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}
