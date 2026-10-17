// '@boardline/dom' outside Obsidian (Vitest, the screenshot pages): plain DOM. The plugin build
// uses src/dom.ts, Obsidian's helpers.

/** A new `tag` element in `doc`. */
export function createElement<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K): HTMLElementTagNameMap[K] {
  return doc.createElement(tag)
}
