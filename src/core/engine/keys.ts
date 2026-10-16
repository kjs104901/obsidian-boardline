// Which key a shortcut means. Shortcuts follow the letter on the key, but a Korean (or other
// non-Latin) input mode reports its own character for it ("ㄱ" for R), and an input method
// busy with a key reports "Process": then the physical key tells.

const CODE_KEYS: Record<string, string> = {
  Period: '.',
  Comma: ',',
  Slash: '/',
  Backslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
  Equal: '=',
  Minus: '-',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
}

/** The key of a shortcut, lowercased: `e.key`, or the physical key when `e.key` isn't Latin. */
export function shortcutKey(e: Pick<KeyboardEvent, 'key' | 'code'>): string {
  const latin = e.key !== 'Process' && !(e.key.length === 1 && e.key.charCodeAt(0) > 0x7f)
  if (latin) return e.key.toLowerCase()
  const m = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(e.code)
  if (m) return (m[1] ?? m[2]).toLowerCase()
  return CODE_KEYS[e.code] ?? e.key.toLowerCase()
}
