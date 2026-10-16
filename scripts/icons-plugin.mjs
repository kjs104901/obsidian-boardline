// Phosphor icons (MIT) as lazily loaded data modules, built from the npm package, for Vite (the
// tests, through Vitest) and esbuild (the plugin build).
// `virtual:icons/index` is the list of names with categories and tags, and
// `virtual:icons/<regular|fill|duotone>` maps each name to its path data (0.5–0.7 MB each).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PREFIX = 'virtual:icons/'
// Rollup's marker for modules that don't exist on disk.
const RESOLVED = String.fromCharCode(0) + PREFIX
const PKG = fileURLToPath(new URL('../node_modules/@phosphor-icons/core', import.meta.url))

/** Source of one icon data module. */
async function iconModule(which) {
  if (which === 'index') {
    const { icons } = await import('@phosphor-icons/core')
    const list = icons.map((i) => ({ n: i.name, c: i.categories, t: i.tags.filter((t) => !t.startsWith('*')) }))
    return `export default ${JSON.stringify(list)}`
  }
  if (!['regular', 'fill', 'duotone'].includes(which)) throw new Error('unknown icon set ' + which)
  const dir = path.join(PKG, 'assets', which)
  const out = {}
  // Sorted: directory order differs between file systems, and the build must come out the same everywhere.
  for (const file of fs.readdirSync(dir).sort()) {
    const name = file.replace(/(-fill|-duotone)?\.svg$/, '')
    const svg = fs.readFileSync(path.join(dir, file), 'utf8')
    // Translucent (duotone) layers are marked with a leading "~".
    out[name] = [...svg.matchAll(/<path d="([^"]+)"( opacity="[^"]+")?/g)].map((m) => (m[2] ? '~' : '') + m[1])
  }
  return `export default ${JSON.stringify(out)}`
}

/** @returns {import('vite').Plugin} */
export function phosphorIcons() {
  return {
    name: 'boardline-icons',
    resolveId: (id) => (id.startsWith(PREFIX) ? RESOLVED + id.slice(PREFIX.length) : null),
    load: (id) => (id.startsWith(RESOLVED) ? iconModule(id.slice(RESOLVED.length)) : null),
  }
}

/** The same modules for esbuild. */
export function phosphorIconsEsbuild() {
  return {
    name: 'boardline-icons',
    setup(build) {
      build.onResolve({ filter: /^virtual:icons\// }, (args) => ({ path: args.path.slice(PREFIX.length), namespace: 'boardline-icons' }))
      build.onLoad({ filter: /.*/, namespace: 'boardline-icons' }, async (args) => ({ contents: await iconModule(args.path), loader: 'js' }))
    },
  }
}
