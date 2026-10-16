// Lint with Obsidian's own rules (eslint-plugin-obsidianmd: its recommended set brings ESLint's
// and typescript-eslint's type-checked rules too), over what the community directory reviews:
// the plugin's source, not tests, scripts or build config.
import { defineConfig } from 'eslint/config'
import obsidianmd from 'eslint-plugin-obsidianmd'

export default defineConfig([
  { ignores: ['node_modules/**', 'dist/**', 'main.js', 'scripts/**', 'docs/**', '**/*.test.ts', '*.mjs', 'vitest.config.ts'] },
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
])
