// Version history: snapshots of a board file kept inside the workspace under
// .boardline/history/<board id>/<UTC stamp>.json (hidden from the folder tree).

import { joinPath, type WorkspaceStorage } from '../platform/storage'

export const HISTORY_ROOT = '.boardline/history'
/** While editing, at most one snapshot per interval (plus one before and one after a session). */
export const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000
/** Snapshots kept per board; older ones are deleted. */
export const MAX_SNAPSHOTS = 100

export interface Snapshot {
  path: string
  time: Date
}

export function historyDir(boardId: string): string {
  return joinPath(HISTORY_ROOT, boardId.replace(/[^\w-]/g, '_'))
}

/** Sortable file name for a snapshot taken at `time`, e.g. 20261015T040500123Z.json. */
export function snapshotName(time: Date): string {
  return time.toISOString().replace(/[-:.]/g, '') + '.json'
}

export function parseSnapshotName(name: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z\.json$/.exec(name)
  if (!m) return null
  const [, y, mo, d, h, mi, s, ms] = m.map(Number)
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s, ms))
}

/** Snapshots of a board, newest first. */
export async function listSnapshots(storage: WorkspaceStorage, root: string, boardId: string): Promise<Snapshot[]> {
  const dir = historyDir(boardId)
  const out: Snapshot[] = []
  for (const name of await storage.listFiles(root, dir)) {
    const time = parseSnapshotName(name)
    if (time) out.push({ path: joinPath(dir, name), time })
  }
  return out.sort((a, b) => b.time.getTime() - a.time.getTime())
}

/**
 * Store `contents` as a new snapshot unless it equals the latest one, then drop the oldest
 * snapshots beyond MAX_SNAPSHOTS. Returns whether a snapshot was written.
 */
export async function saveSnapshot(storage: WorkspaceStorage, root: string, boardId: string, contents: string, time = new Date()): Promise<boolean> {
  const existing = await listSnapshots(storage, root, boardId)
  if (existing.length > 0 && sameBoardContent(await storage.readFile(root, existing[0].path), contents)) return false
  await storage.writeFileAtomic(root, joinPath(historyDir(boardId), snapshotName(time)), contents)
  for (const old of existing.slice(MAX_SNAPSHOTS - 1)) await storage.removeAppFile(root, old.path)
  return true
}

/** Same objects, ignoring bookkeeping such as `rev` and `updatedAt`. */
function sameBoardContent(a: string, b: string): boolean {
  if (a === b) return true
  try {
    const objectsOf = (text: string): unknown => (JSON.parse(text) as { objects?: unknown }).objects
    return JSON.stringify(objectsOf(a)) === JSON.stringify(objectsOf(b))
  } catch {
    return false
  }
}

/** Snapshot bookkeeping for one editing session. */
export interface SnapshotClock {
  /** The version as opened has been preserved. */
  baseTaken: boolean
  lastAt: number
  /** Saved changes not yet in a snapshot. */
  dirty: boolean
}

export const freshClock = (): SnapshotClock => ({ baseTaken: false, lastAt: 0, dirty: false })

/**
 * After a save: the first save of a session preserves the version as it was opened
 * ('base'); later saves snapshot the current file at most once per interval.
 */
export function afterSave(clock: SnapshotClock, now: number, interval = SNAPSHOT_INTERVAL_MS): { clock: SnapshotClock; take: 'base' | 'current' | null } {
  if (!clock.baseTaken) return { clock: { baseTaken: true, lastAt: now, dirty: true }, take: 'base' }
  if (now - clock.lastAt >= interval) return { clock: { ...clock, lastAt: now, dirty: false }, take: 'current' }
  return { clock: { ...clock, dirty: true }, take: null }
}
