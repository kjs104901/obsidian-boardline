// The vault as a WorkspaceStorage, so the shared board code reads and writes through Obsidian.
// Vault files go through the Vault API (it caches and tells other views); the app's own hidden
// files (.boardline/history, …) go through the adapter, since the Vault API doesn't see them.

import { normalizePath, type App, type TFile } from 'obsidian'
import type { WorkspaceStorage } from '@boardline/core/platform/storage'
import { t } from '@boardline/core/i18n'

const hidden = (path: string) => path.split('/').some((part) => part.startsWith('.'))

export class VaultStorage implements WorkspaceStorage {
  constructor(private app: App) {}

  private get vault() {
    return this.app.vault
  }

  private file(path: string): TFile | null {
    return this.vault.getFileByPath(normalizePath(path))
  }

  async readFile(_root: string, path: string): Promise<string> {
    const p = normalizePath(path)
    if (hidden(p)) return this.vault.adapter.read(p)
    const f = this.file(p)
    if (!f) throw new Error(t('file.missing', p))
    return this.vault.read(f)
  }

  /** Folders above `path` (created when missing). */
  private async ensureParent(path: string): Promise<void> {
    const dir = path.slice(0, Math.max(0, path.lastIndexOf('/')))
    if (!dir || (await this.vault.adapter.exists(dir))) return
    if (hidden(dir)) await this.vault.adapter.mkdir(dir)
    else await this.vault.createFolder(dir)
  }

  async writeFileAtomic(_root: string, path: string, contents: string): Promise<void> {
    const p = normalizePath(path)
    await this.ensureParent(p)
    if (hidden(p)) {
      await this.vault.adapter.write(p, contents)
      return
    }
    const f = this.file(p)
    if (f) await this.vault.process(f, () => contents)
    else await this.vault.create(p, contents)
  }

  async exists(_root: string, path: string): Promise<boolean> {
    return this.vault.adapter.exists(normalizePath(path))
  }

  async listFiles(_root: string, dir: string): Promise<string[]> {
    try {
      const listed = await this.vault.adapter.list(normalizePath(dir))
      return listed.files.map((f) => f.slice(f.lastIndexOf('/') + 1))
    } catch {
      return []
    }
  }

  async removeAppFile(_root: string, path: string): Promise<void> {
    const p = normalizePath(path)
    if (!p.startsWith('.boardline/')) throw new Error(t('file.notAppFile', p))
    if (await this.vault.adapter.exists(p)) await this.vault.adapter.remove(p)
  }

  async readBytes(_root: string, path: string): Promise<Uint8Array> {
    const p = normalizePath(path)
    const f = hidden(p) ? null : this.file(p)
    return new Uint8Array(f ? await this.vault.readBinary(f) : await this.vault.adapter.readBinary(p))
  }

  async writeAsset(_root: string, path: string, bytes: Uint8Array): Promise<void> {
    const p = normalizePath(path)
    await this.ensureParent(p)
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    if (hidden(p)) {
      await this.vault.adapter.writeBinary(p, data)
      return
    }
    const f = this.file(p)
    if (f) await this.vault.modifyBinary(f, data)
    else await this.vault.createBinary(p, data)
  }
}
