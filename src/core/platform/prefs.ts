/**
 * Small per-device preferences: recent colors and icons, the last tools, default styles, each
 * board's view. The plugin keeps them in Obsidian's local storage for the vault (setPrefsStore);
 * without a store (tests) they last for the session only.
 */
export interface PrefsStore {
  /** The stored value, or null when there is none. */
  load(key: string): unknown
  /** Store a JSON-serializable value; null clears the key. */
  save(key: string, value: unknown): void
}

const session = new Map<string, unknown>()
let store: PrefsStore = {
  load: (key) => session.get(key) ?? null,
  save: (key, value) => {
    if (value === null) session.delete(key)
    else session.set(key, value)
  },
}

export function setPrefsStore(s: PrefsStore): void {
  store = s
}

/** A stored preference, or null when there is none or storage can't be read. */
export function loadPref(key: string): unknown {
  try {
    return store.load(key) ?? null
  } catch {
    return null
  }
}

/** Store a preference (null clears it). Returns false when it couldn't be kept. */
export function savePref(key: string, value: unknown): boolean {
  try {
    store.save(key, value)
    return true
  } catch {
    return false
  }
}
