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
})
