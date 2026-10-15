import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { phosphorIcons } from './scripts/icons-plugin.mjs'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// Tests, with the same aliases the plugin builds with.
export default defineConfig({
  plugins: [phosphorIcons()],
  resolve: {
    alias: {
      '@boardline/core': here('src/core'),
      '@boardline/board-ui': here('src/board-ui'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
})
