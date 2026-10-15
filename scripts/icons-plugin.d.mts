import type { Plugin } from 'vite'

/** Phosphor icon data modules (`virtual:icons/*`) from node_modules/@phosphor-icons/core. */
export function phosphorIcons(): Plugin

/** The same modules for esbuild (the plugin build). */
export function phosphorIconsEsbuild(): { name: string; setup(build: unknown): void }
