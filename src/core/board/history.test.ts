import { describe, expect, it } from 'vitest'
import { afterSave, freshClock, historyDir, listSnapshots, MAX_SNAPSHOTS, parseSnapshotName, saveSnapshot, snapshotName } from './history'
import type { WorkspaceStorage } from '../platform/storage'

/** In-memory storage with just what the history needs. */
function memoryStorage() {
  const files = new Map<string, string>()
  const storage: WorkspaceStorage = {
    readFile: async (_r, p) => files.get(p) ?? '',
    writeFileAtomic: async (_r, p, c) => void files.set(p, c),
    exists: async (_r, p) => files.has(p),
    listFiles: async (_r, dir) => [...files.keys()].filter((p) => p.startsWith(dir + '/')).map((p) => p.slice(dir.length + 1)),
    removeAppFile: async (_r, p) => void files.delete(p),
    readBytes: async () => new Uint8Array(),
    writeAsset: async () => {},
  }
  return { storage, files }
}

describe('snapshot names', () => {
  it('round-trips a sortable UTC stamp', () => {
    const t = new Date(Date.UTC(2026, 9, 15, 4, 5, 6, 789))
    expect(snapshotName(t)).toBe('20261015T040506789Z.json')
    expect(parseSnapshotName(snapshotName(t))?.getTime()).toBe(t.getTime())
    expect(parseSnapshotName('notes.json')).toBeNull()
  })

  it('keeps board ids path-safe', () => {
    expect(historyDir('abc-123')).toBe('.boardline/history/abc-123')
    expect(historyDir('../x')).toBe('.boardline/history/___x')
  })
})

describe('saving snapshots', () => {
  it('skips a snapshot identical to the latest and lists newest first', async () => {
    const { storage } = memoryStorage()
    const t = (min: number) => new Date(Date.UTC(2026, 0, 1, 0, min))
    expect(await saveSnapshot(storage, 'r', 'b', 'one', t(0))).toBe(true)
    expect(await saveSnapshot(storage, 'r', 'b', 'one', t(1))).toBe(false)
    expect(await saveSnapshot(storage, 'r', 'b', 'two', t(2))).toBe(true)
    const list = await listSnapshots(storage, 'r', 'b')
    expect(list.map((s) => s.time.getUTCMinutes())).toEqual([2, 0])
  })

  it('treats files that differ only in bookkeeping as the same version', async () => {
    const { storage } = memoryStorage()
    const file = (rev: number, objects: unknown[]) => JSON.stringify({ rev, updatedAt: `t${rev}`, objects })
    expect(await saveSnapshot(storage, 'r', 'b', file(1, [{ id: 'a' }]), new Date(1000))).toBe(true)
    expect(await saveSnapshot(storage, 'r', 'b', file(2, [{ id: 'a' }]), new Date(2000))).toBe(false)
    expect(await saveSnapshot(storage, 'r', 'b', file(3, [{ id: 'b' }]), new Date(3000))).toBe(true)
  })

  it('keeps at most MAX_SNAPSHOTS', async () => {
    const { storage } = memoryStorage()
    for (let i = 0; i < MAX_SNAPSHOTS + 3; i++) await saveSnapshot(storage, 'r', 'b', `v${i}`, new Date(Date.UTC(2026, 0, 1, 0, 0, i)))
    const list = await listSnapshots(storage, 'r', 'b')
    expect(list).toHaveLength(MAX_SNAPSHOTS)
    expect(list[list.length - 1].time.getUTCSeconds()).toBe(3)
  })
})

describe('snapshot schedule', () => {
  it('preserves the opened version first, then at most once per interval', () => {
    let clock = freshClock()
    const step = (now: number) => {
      const r = afterSave(clock, now, 1000)
      clock = r.clock
      return r.take
    }
    expect(step(0)).toBe('base')
    expect(step(500)).toBeNull()
    expect(clock.dirty).toBe(true)
    expect(step(1000)).toBe('current')
    expect(clock.dirty).toBe(false)
  })
})
