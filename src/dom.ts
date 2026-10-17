// DOM elements for the board engine (src/core), made with Obsidian's helpers in the window of the
// document they are for (boards open in popout windows too). The plugin build gives this module
// to the engine as '@boardline/dom'; tests and the screenshot pages get scripts/dom.ts instead.

/** A window as Obsidian sets it up, with its DOM helpers. */
type HelperWindow = Window & { createEl?: typeof createEl }

/** A new `tag` element in `doc`. */
export function createElement<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K): HTMLElementTagNameMap[K] {
  // The document's own window has Obsidian's helpers (popouts too); the main window's otherwise.
  const win: HelperWindow = doc.win
  return (win.createEl ?? createEl)(tag)
}
