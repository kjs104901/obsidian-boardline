// Decoded images for the canvas, loaded on demand from the workspace.

/** Reads an asset's bytes (as a Blob with the right type). */
export type AssetLoader = (src: string) => Promise<Blob>

interface Entry {
  image: HTMLImageElement | null
  url: string | null
  failed: boolean
  loading: Promise<void>
}

export class ImageCache {
  private entries = new Map<string, Entry>()

  constructor(
    private load: AssetLoader | undefined,
    /** Called when an image finishes loading (to redraw). */
    private onLoad: () => void,
  ) {}

  /** The decoded image, or null while it loads (or if it can't be read). */
  get(src: string): HTMLImageElement | null {
    return this.entry(src).image
  }

  failed(src: string): boolean {
    return this.entry(src).failed
  }

  /** Wait until every image in `srcs` has loaded or failed. */
  async ready(srcs: Iterable<string>): Promise<void> {
    await Promise.all([...srcs].map((s) => this.entry(s).loading))
  }

  /** `data:` URL of an image's bytes, for embedding in exports. */
  async dataUrl(src: string): Promise<string | null> {
    if (!this.load) return null
    try {
      const blob = await this.load(src)
      return await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result))
        r.onerror = () => reject(r.error)
        r.readAsDataURL(blob)
      })
    } catch {
      return null
    }
  }

  /**
   * Files changed in the workspace: those pictures (and any that couldn't be read, which may
   * have just appeared) are read again when next drawn. No paths: every one that failed.
   */
  refresh(paths?: string[]): void {
    let dropped = false
    for (const [src, e] of this.entries) {
      if (!e.failed && !paths?.includes(src)) continue
      if (e.url) URL.revokeObjectURL(e.url)
      this.entries.delete(src)
      dropped = true
    }
    if (dropped) this.onLoad()
  }

  dispose(): void {
    for (const e of this.entries.values()) if (e.url) URL.revokeObjectURL(e.url)
    this.entries.clear()
  }

  private entry(src: string): Entry {
    const e = this.entries.get(src)
    if (e) return e
    const entry: Entry = { image: null, url: null, failed: false, loading: Promise.resolve() }
    entry.loading = (async () => {
      try {
        if (!this.load) throw new Error('no loader')
        entry.url = URL.createObjectURL(await this.load(src))
        const img = new Image()
        img.src = entry.url
        await img.decode()
        entry.image = img
      } catch {
        entry.failed = true
      }
      this.onLoad()
    })()
    this.entries.set(src, entry)
    return entry
  }
}
