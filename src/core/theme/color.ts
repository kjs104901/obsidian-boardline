/** A CSS color as plain sRGB hex plus opacity, for SVG viewers without oklch() support. */
export interface SvgColor {
  hex: string
  opacity: number
}

const OKLCH = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)(%?)\s*)?\)$/i

/** Convert `oklch(L% C H [/ A])` or `#rrggbb` to hex + opacity; other strings pass through. */
export function toSvgColor(css: string): SvgColor {
  const m = OKLCH.exec(css.trim())
  if (!m) return { hex: css, opacity: 1 }
  const alpha = m[4] === undefined ? 1 : Number(m[4]) / (m[5] ? 100 : 1)
  const [r, g, b] = oklchToSrgb(Number(m[1]) / 100, Number(m[2]), Number(m[3]))
  const hex = '#' + [r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
  return { hex, opacity: alpha }
}

/** OKLCH -> gamma-encoded sRGB in 0..1 (clamped). */
export function oklchToSrgb(l: number, c: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180
  const a = c * Math.cos(h)
  const b = c * Math.sin(h)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]
  const encode = (x: number) => {
    const v = Math.min(1, Math.max(0, x))
    return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
  }
  return [encode(lin[0]), encode(lin[1]), encode(lin[2])]
}

/** Gamma-encoded sRGB (0..1) of `oklch(…)` or `#rrggbb`, or null for other syntaxes. */
export function cssToSrgb(css: string): [number, number, number] | null {
  const m = OKLCH.exec(css.trim())
  if (m) return oklchToSrgb(Number(m[1]) / 100, Number(m[2]), Number(m[3]))
  const h = /^#([0-9a-f]{6})$/i.exec(css.trim())
  if (!h) return null
  const n = parseInt(h[1], 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** sRGB (0..1) -> OKLCH [L 0..1, C, H degrees]. */
export function srgbToOklch(r: number, g: number, b: number): [number, number, number] {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const [R, G, B] = [lin(r), lin(g), lin(b)]
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return [L, Math.hypot(A, Bb), ((Math.atan2(Bb, A) * 180) / Math.PI + 360) % 360]
}

const RGB = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i

/** sRGB (0..1) of any color the board uses: #rrggbb, rgb()/rgba(), oklch(); null otherwise. */
export function parseColor(css: string): [number, number, number] | null {
  const m = RGB.exec(css.trim())
  if (m) return [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255]
  return cssToSrgb(css)
}

const hex = (rgb: number[]) => '#' + rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')

/** `k` of `color` over `base` (a tint of a color on a background), as #rrggbb. */
export function mixColors(color: string, base: string, k: number): string {
  const a = parseColor(color)
  const b = parseColor(base)
  if (!a || !b) return color
  return hex(a.map((v, i) => v * k + b[i] * (1 - k)))
}

/** Relative luminance (0 black .. 1 white) of a color; 0.5 when it can't be read. */
export function luminance(css: string): number {
  const rgb = parseColor(css)
  if (!rgb) return 0.5
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])
}

/** A color made see-through: `alpha` 0 (clear) to 1, as rgba(). */
export function withAlpha(css: string, alpha: number): string {
  const rgb = parseColor(css)
  if (!rgb) return css
  return `rgba(${rgb.map((v) => Math.round(v * 255)).join(', ')}, ${alpha})`
}
