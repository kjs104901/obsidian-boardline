// Builds the Obsidian plugin: main.js (one CommonJS file with the engine, ELK, icons and React),
// styles.css (the board UI's styles and the plugin's own) and manifest.json, into dist/.
//   node esbuild.config.mjs [production] [--watch] [--vault <path>]
// --vault also copies the files into <vault>/.obsidian/plugins/boardline/ after every build.
import fs from 'node:fs'
import path from 'node:path'
import { builtinModules } from 'node:module'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'
import { phosphorIconsEsbuild } from './scripts/icons-plugin.mjs'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const args = process.argv.slice(2)
const production = args.includes('production')
const watch = args.includes('--watch')
const vaultAt = args.indexOf('--vault')
const vault = vaultAt >= 0 ? args[vaultAt + 1] : null
const out = here('dist')

/**
 * Notices for the third-party code bundled into main.js, read from the installed packages:
 * elkjs (EPL-2.0; its source is published, as the license asks), React and Phosphor's icon
 * data (MIT, whose text and copyright must travel with the copies). They head main.js as a
 * comment minifying keeps, and the settings tab shows them.
 */
function thirdPartyNotices() {
  const pkg = (name) => JSON.parse(fs.readFileSync(here(`node_modules/${name}/package.json`), 'utf8'))
  const licenseText = (name) => fs.readFileSync(here(`node_modules/${name}/LICENSE`), 'utf8').trim()
  const elk = pkg('elkjs')
  return [
    'Boardline for Obsidian includes the following third-party software.',
    '',
    `elkjs ${elk.version} (the Eclipse Layout Kernel compiled to JavaScript), used to lay out diagrams`,
    'Copyright (c) 2017 Kiel University and others.',
    'Distributed under the Eclipse Public License 2.0: https://www.eclipse.org/legal/epl-2.0',
    'Its source code is available under that license at https://github.com/kieler/elkjs',
    'and https://github.com/eclipse/elk.',
    '',
    `React ${pkg('react').version}, React DOM ${pkg('react-dom').version} and scheduler ${pkg('scheduler').version}`,
    licenseText('react'),
    '',
    `Phosphor Icons (@phosphor-icons/core ${pkg('@phosphor-icons/core').version})`,
    licenseText('@phosphor-icons/core'),
  ].join('\n')
}
const NOTICES = thirdPartyNotices()

/**
 * Board styles one step more specific inside Obsidian: every selector gets a .bl-root ancestor,
 * so Obsidian's generic rules (".is-tablet button:not(.clickable-icon)", …) don't win over the
 * board's own. All board rules gain the same amount, so their order among themselves holds.
 */
export function scopeBoardCss(css) {
  const scopeSelector = (sel) => {
    const s = sel.trim()
    if (!s || s.startsWith('.bl-root') || s.startsWith(':where(.bl-root)') || /^(from|to|\d+%)$/.test(s)) return s
    if (s.startsWith('.presenting ')) return '.bl-root.presenting ' + s.slice('.presenting '.length)
    return '.bl-root ' + s
  }
  // Rules are "selectors { declarations }"; at-rules (@media, @container) hold rules of their own.
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[{}])([^{}@]+)\{/g, (_, before, selectors) => before + selectors.split(',').map(scopeSelector).join(',') + '{')
}

/** dist/main.css becomes styles.css together with the plugin's own CSS; copy to the vault. */
const finish = {
  name: 'boardline-finish',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length) return
      const board = fs.existsSync(path.join(out, 'main.css')) ? scopeBoardCss(fs.readFileSync(path.join(out, 'main.css'), 'utf8')) : ''
      fs.writeFileSync(path.join(out, 'styles.css'), board + '\n' + fs.readFileSync(here('src/plugin.css'), 'utf8'))
      fs.rmSync(path.join(out, 'main.css'), { force: true })
      fs.copyFileSync(here('manifest.json'), path.join(out, 'manifest.json'))
      fs.writeFileSync(path.join(out, 'THIRD_PARTY_NOTICES.txt'), NOTICES + '\n')
      if (vault) {
        const dest = path.join(vault, '.obsidian', 'plugins', 'boardline')
        fs.mkdirSync(dest, { recursive: true })
        for (const f of ['main.js', 'styles.css', 'manifest.json']) fs.copyFileSync(path.join(out, f), path.join(dest, f))
        console.log(`copied to ${dest}`)
      }
      const size = (f) => `${(fs.statSync(path.join(out, f)).size / 1024 / 1024).toFixed(2)} MB`
      console.log(`main.js ${size('main.js')}, styles.css ${size('styles.css')}`)
    })
  },
}

const ctx = await esbuild.context({
  entryPoints: { main: here('src/main.ts') },
  outdir: out,
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  // Obsidian provides these at runtime.
  external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*', ...builtinModules],
  jsx: 'automatic',
  alias: {
    '@boardline/core': here('src/core'),
    '@boardline/board-ui': here('src/board-ui'),
  },
  define: { 'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development'), __THIRD_PARTY_NOTICES__: JSON.stringify(NOTICES) },
  banner: { js: `/*!\n${NOTICES}\n*/` },
  sourcemap: production ? false : 'inline',
  minify: production,
  treeShaking: true,
  logLevel: 'info',
  plugins: [phosphorIconsEsbuild(), finish],
})

if (watch) await ctx.watch()
else {
  await ctx.rebuild()
  await ctx.dispose()
}
