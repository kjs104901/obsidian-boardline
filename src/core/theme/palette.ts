import type { ColorKey, Deco } from '../board/model'
import { luminance, mixColors, oklchToSrgb } from './color'

/** One color in one theme: lines and outlines, a solid fill, and the tint inside an outline. */
interface Tone {
  stroke: string
  fill: string
  tint: string
}

/** An OKLCH color as #rrggbb, so every consumer (canvas, SVG export, contrast checks) reads it. */
function ok(l: number, c: number, h: number): string {
  return '#' + oklchToSrgb(l, c, h).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
}

/**
 * A hue's tones. Every hue shares the same lightness steps (OKLCH keeps them even): strong
 * lines, soft pastel fills in the light theme, deeper fills in the dark one. Yellow is lighter
 * throughout, or it turns olive.
 */
function hue(h: number, c: number, yellow = false): { light: Tone; dark: Tone } {
  return {
    light: { stroke: ok(yellow ? 0.74 : 0.62, c, h), fill: ok(yellow ? 0.91 : 0.87, c * 0.55, h), tint: ok(0.97, c * 0.18, h) },
    dark: { stroke: ok(yellow ? 0.84 : 0.74, c, h), fill: ok(yellow ? 0.8 : 0.56, c * 0.8, h), tint: ok(0.28, c * 0.22, h) },
  }
}

const gray = (stroke: number, fill: number) => ({ stroke: ok(stroke, 0, 0), fill: ok(fill, 0, 0), tint: '' })

/** Object colors in picker order: three neutrals, then nine hues around the wheel. */
export const PALETTE: { key: ColorKey; name: string; light: Tone; dark: Tone }[] = [
  { key: 'gray', name: '회색', light: gray(0.7, 0.92), dark: gray(0.62, 0.38) },
  { key: 'light', name: '밝은 회색', light: gray(0.85, 0.96), dark: gray(0.42, 0.3) },
  { key: 'ink', name: '먹색', light: gray(0.3, 0.3), dark: gray(0.9, 0.88) },
  { key: 'red', name: '빨강', ...hue(25, 0.17) },
  { key: 'orange', name: '주황', ...hue(55, 0.15) },
  { key: 'yellow', name: '노랑', ...hue(88, 0.14, true) },
  { key: 'green', name: '초록', ...hue(150, 0.13) },
  { key: 'teal', name: '청록', ...hue(190, 0.1) },
  { key: 'blue', name: '파랑', ...hue(250, 0.14) },
  { key: 'indigo', name: '남색', ...hue(275, 0.15) },
  { key: 'purple', name: '보라', ...hue(305, 0.15) },
  { key: 'pink', name: '분홍', ...hue(350, 0.14) },
]

const BY_KEY = new Map(PALETTE.map((p) => [p.key, p]))

export function isColorKey(v: unknown): v is ColorKey {
  return typeof v === 'string' && (BY_KEY.has(v as ColorKey) || /^#[0-9a-f]{6}$/i.test(v))
}

export type ThemeMode = 'light' | 'dark'

/**
 * Dark board theme: Obsidian's canvas colors (background-primary, the dot pattern, text normal
 * and muted, the accent for selection).
 */
const DARK = {
  canvasBg: '#1c1c1c',
  gridDot: '#3a3a3a',
  shapeFill: '#1c1c1c',
  text: '#dadada',
  selection: 'hsl(258 88% 66%)',
  selectionFill: 'hsl(258 88% 66% / 12%)',
  handleFill: '#1c1c1c',
  guide: '#fb464c',
  mindmapRoot: '#333333',
  sectionFill: 'rgb(40 40 40 / 55%)',
  textDim: '#b3b3b3',
  /** Search matches. */
  highlight: '#e0de71',
}

/** Light board theme: Obsidian's light canvas (white, #222 text, the same accent). */
const LIGHT: typeof DARK = {
  canvasBg: '#ffffff',
  gridDot: '#dcdcdc',
  shapeFill: '#FFFFFF',
  text: '#222222',
  selection: 'hsl(258 88% 66%)',
  selectionFill: 'hsl(258 88% 66% / 10%)',
  handleFill: '#FFFFFF',
  guide: '#e93147',
  mindmapRoot: '#efefef',
  sectionFill: 'rgb(246 246 246 / 60%)',
  textDim: '#5c5c5c',
  highlight: '#e0ac00',
}

let mode: ThemeMode = 'dark'

/** Current board theme colors (updated in place by setThemeMode). */
export const theme = { ...DARK }

export function themeMode(): ThemeMode {
  return mode
}

/** Colors of the app around the board (Obsidian's theme): its background, dots and accent. */
export interface HostColors {
  background?: string | null
  dots?: string | null
  accent?: string | null
}

let host: HostColors = {}

export function setThemeMode(next: ThemeMode): void {
  mode = next
  Object.assign(theme, next === 'dark' ? DARK : LIGHT)
  if (host.background) Object.assign(theme, { canvasBg: host.background, shapeFill: host.background, handleFill: host.background })
  if (host.dots) theme.gridDot = host.dots
  if (host.accent) {
    theme.selection = host.accent
    theme.selectionFill = `color-mix(in srgb, ${host.accent} ${next === 'dark' ? 12 : 10}%, transparent)`
  }
}

/** Board colors follow the host's theme where given; null or absent: the board's own. */
export function setHostColors(colors: HostColors): void {
  host = colors
  setThemeMode(mode)
}

const NEUTRALS: ColorKey[] = ['gray', 'light', 'ink']
const isNeutral = (c: ColorKey) => NEUTRALS.includes(c)

/** A color's tones in the current theme; a custom #rrggbb is its own line and fill. */
function toneOf(c: ColorKey): Tone {
  const p = BY_KEY.get(c) ?? (c.startsWith('#') ? null : BY_KEY.get('gray')!)
  if (p) return mode === 'dark' ? p.dark : p.light
  return { stroke: c, fill: c, tint: mixColors(c, theme.shapeFill, 0.12) }
}

/** The color itself in the current theme (swatches, pen strokes). */
export function baseColor(c: ColorKey): string {
  return toneOf(c).stroke
}

/** Outline of a shape, and the ink of text objects and lines. */
export function strokeColor(color: ColorKey): string {
  return toneOf(color).stroke
}

/** Inside of a shape: the solid fill, or (outlined) the canvas, tinted by a colored outline. */
export function fillColor(color: ColorKey, deco: Deco): string {
  if (deco === 'transparent') return 'transparent'
  if (deco === 'fill') return toneOf(color).fill
  return isNeutral(color) ? theme.shapeFill : toneOf(color).tint
}

/** Text on a shape: dark or white on a filled shape (whichever reads), else the theme's text. */
export function textColor(color: ColorKey, deco: Deco): string {
  if (deco !== 'fill') return theme.text
  return luminance(toneOf(color).fill) > 0.4 ? '#1f1f1f' : '#ffffff'
}
