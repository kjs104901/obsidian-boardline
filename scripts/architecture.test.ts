// The layers stay apart: core knows nothing of React or Obsidian, and board-ui nothing of
// Obsidian or the plugin around it (docs/architecture.md).
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '..')

function sources(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sources(p))
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) out.push(p)
  }
  return out
}

function imports(file: string): string[] {
  const text = fs.readFileSync(file, 'utf8')
  return [...text.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1] ?? m[2])
}

function violations(layer: string, forbidden: RegExp): string[] {
  const dir = path.join(ROOT, 'src', layer)
  return sources(dir).flatMap((f) =>
    imports(f)
      .filter((spec) => forbidden.test(spec) || (spec.startsWith('.') && !path.resolve(path.dirname(f), spec).startsWith(dir)))
      .map((spec) => `${path.relative(ROOT, f)} → ${spec}`),
  )
}

describe('layer boundaries', () => {
  it('core imports no UI framework, Obsidian or board UI', () => {
    expect(violations('core', /^(react|react-dom|obsidian|@boardline\/board-ui)(\/|$)/)).toEqual([])
  })

  it('board-ui imports no Obsidian and nothing of the plugin', () => {
    expect(violations('board-ui', /^obsidian(\/|$)/)).toEqual([])
  })

  it('nothing puts HTML into the page as a string', () => {
    // React's own innerHTML path (dangerouslySetInnerHTML) and the DOM's are never used, so the
    // innerHTML code inside react-dom never runs. Reading innerHTML (of our own nodes) is fine.
    const html = /dangerouslySetInnerHTML|\.(innerHTML|outerHTML)\s*=[^=]|insertAdjacentHTML|document\.write/
    const found = sources(path.join(ROOT, 'src')).filter((f) => html.test(fs.readFileSync(f, 'utf8')))
    expect(found.map((f) => path.relative(ROOT, f))).toEqual([])
  })

  it('core makes DOM elements only through @boardline/dom (Obsidian helpers in the plugin)', () => {
    const direct = sources(path.join(ROOT, 'src', 'core')).filter((f) => /\.createElement(NS)?\(/.test(fs.readFileSync(f, 'utf8')))
    expect(direct.map((f) => path.relative(ROOT, f))).toEqual([])
  })
})
