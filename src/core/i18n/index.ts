// Interface text in the reader's language. English is the base and the fallback; the plugin
// picks the language from Obsidian's (main.ts) before anything is drawn. A code like "zh-TW"
// or "pt-BR" uses its base language's table when it has none of its own.

import { de } from './de'
import { en, type MessageKey, type Messages } from './en'
import { es } from './es'
import { fr } from './fr'
import { ja } from './ja'
import { ko } from './ko'
import { zh } from './zh'

export type { MessageKey } from './en'

const TABLES: Record<string, Messages> = { en, ko, ja, zh, es, de, fr }

let table: Messages = en
let current = 'en'

/** Use the table for this language code (Obsidian's, like "ko" or "zh-TW"); English when there is none. */
export function setLanguage(code: string): void {
  const lc = code.toLowerCase()
  const base = lc.split('-')[0]
  current = lc in TABLES ? lc : base in TABLES ? base : 'en'
  table = TABLES[current]
}

/** The language in use (a key of the tables: "en", "ko", …). */
export function language(): string {
  return current
}

/** The text for `key`, with {0}, {1}, … filled from `args`. */
export function t(key: MessageKey, ...args: (string | number)[]): string {
  const text = table[key] ?? en[key]
  return args.length ? text.replace(/\{(\d+)\}/g, (hole, i: string) => (args[Number(i)] !== undefined ? String(args[Number(i)]) : hole)) : text
}
