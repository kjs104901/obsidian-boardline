import { RECT_RADIUS, type ShapeKind } from '../board/model'
import type { Rect } from './geometry'

/**
 * Outline of a shape as SVG path data in board coordinates. Shared by canvas rendering,
 * hit testing (through Path2D) and SVG export. A rotated shape (`angle` 90/180/270) is drawn
 * unrotated in its own box and turned around the center; its w/h are already swapped.
 */
export function shapePathData(kind: ShapeKind, r: Rect & { angle?: number }): string {
  const angle = (((r.angle ?? 0) % 360) + 360) % 360
  if (!angle) return basePathData(kind, r)
  const quarter = angle === 90 || angle === 270
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  const w = quarter ? r.h : r.w
  const h = quarter ? r.w : r.h
  return rotatePathData(basePathData(kind, { x: cx - w / 2, y: cy - h / 2, w, h }), cx, cy, angle)
}

/** Shapes that are lines only (never filled). */
export const UNFILLED: ShapeKind[] = ['brace']

function basePathData(kind: ShapeKind, r: Rect): string {
  switch (kind) {
    case 'rect':
    case 'actor':
      return roundRectData(r, Math.min(RECT_RADIUS, r.w / 2, r.h / 2))
    case 'pill':
      return roundRectData(r, Math.min(r.w, r.h) / 2)
    case 'ellipse': {
      const rx = r.w / 2
      const ry = r.h / 2
      const cy = r.y + ry
      return `M${r.x} ${cy}A${rx} ${ry} 0 1 1 ${r.x + r.w} ${cy}A${rx} ${ry} 0 1 1 ${r.x} ${cy}Z`
    }
    case 'sticky':
      return roundRectData(r, 2)
    case 'text':
    case 'section':
      return roundRectData(r, 0)
    case 'diamond':
      return `M${r.x + r.w / 2} ${r.y}L${r.x + r.w} ${r.y + r.h / 2}L${r.x + r.w / 2} ${r.y + r.h}L${r.x} ${r.y + r.h / 2}Z`
    case 'parallelogram': {
      const s = Math.min(24, r.w / 4)
      return `M${r.x + s} ${r.y}H${r.x + r.w}L${r.x + r.w - s} ${r.y + r.h}H${r.x}Z`
    }
    case 'parallelogram-flip': {
      const s = Math.min(24, r.w / 4)
      return `M${r.x} ${r.y}H${r.x + r.w - s}L${r.x + r.w} ${r.y + r.h}H${r.x + s}Z`
    }
    case 'trapezoid': {
      const s = Math.min(24, r.w / 4)
      return `M${r.x + s} ${r.y}H${r.x + r.w - s}L${r.x + r.w} ${r.y + r.h}H${r.x}Z`
    }
    case 'brace': {
      // A left curly brace across the height, tip at the left middle.
      const m = r.x + r.w / 2
      const X = r.x + r.w
      const Y = (f: number) => r.y + r.h * f
      return (
        `M${X} ${r.y}C${m} ${r.y} ${m} ${r.y} ${m} ${Y(0.12)}L${m} ${Y(0.38)}C${m} ${Y(0.5)} ${m} ${Y(0.5)} ${r.x} ${Y(0.5)}` +
        `C${m} ${Y(0.5)} ${m} ${Y(0.5)} ${m} ${Y(0.62)}L${m} ${Y(0.88)}C${m} ${r.y + r.h} ${m} ${r.y + r.h} ${X} ${r.y + r.h}`
      )
    }
    case 'triangle':
      return `M${r.x + r.w / 2} ${r.y}L${r.x + r.w} ${r.y + r.h}H${r.x}Z`
    case 'hexagon': {
      const s = Math.min(24, r.w / 4)
      const cy = r.y + r.h / 2
      return `M${r.x + s} ${r.y}H${r.x + r.w - s}L${r.x + r.w} ${cy}L${r.x + r.w - s} ${r.y + r.h}H${r.x + s}L${r.x} ${cy}Z`
    }
    case 'cylinder': {
      // Outline plus the front edge of the top ellipse. That edge is drawn clockwise like the
      // outline: filling closes it into a sliver, which would cut a hole in the lid if it ran the
      // other way (nonzero fill).
      const rx = r.w / 2
      const ry = Math.min(14, r.h / 6)
      const top = r.y + ry
      const bottom = r.y + r.h - ry
      return (
        `M${r.x} ${top}A${rx} ${ry} 0 0 1 ${r.x + r.w} ${top}V${bottom}A${rx} ${ry} 0 0 1 ${r.x} ${bottom}Z` +
        `M${r.x + r.w} ${top}A${rx} ${ry} 0 0 1 ${r.x} ${top}`
      )
    }
    case 'document':
      return documentData(r)
    case 'documents': {
      // Two sheets behind the front one, up and to the right: only their top and right edges show.
      const d = Math.min(10, r.w * 0.06, r.h * 0.12)
      const bottom = r.y + 2 * d + (r.h - 2 * d) * 0.86
      const back = (k: number) => `M${r.x + k} ${r.y + 3 * d - k}V${r.y + 2 * d - k}H${r.x + r.w - 2 * d + k}V${bottom - k}H${r.x + r.w - 3 * d + k}`
      return back(2 * d) + back(d) + documentData({ x: r.x, y: r.y + 2 * d, w: r.w - 2 * d, h: r.h - 2 * d })
    }
    case 'subroutine': {
      // Predefined process: a box with a line inside each end.
      const s = Math.min(12, r.w / 8)
      return roundRectData(r, Math.min(RECT_RADIUS, r.w / 2, r.h / 2)) + `M${r.x + s} ${r.y}V${r.y + r.h}M${r.x + r.w - s} ${r.y}V${r.y + r.h}`
    }
    case 'manual-input': {
      // The top slopes up to the right.
      const s = Math.min(r.h * 0.3, 24)
      return `M${r.x} ${r.y + s}L${r.x + r.w} ${r.y}V${r.y + r.h}H${r.x}Z`
    }
    case 'delay': {
      // Flat on the left, a half round on the right.
      const rx = Math.min(r.w / 2, r.h / 2)
      return `M${r.x} ${r.y}H${r.x + r.w - rx}A${rx} ${r.h / 2} 0 0 1 ${r.x + r.w - rx} ${r.y + r.h}H${r.x}Z`
    }
    case 'display': {
      // Pointed on the left, rounded on the right.
      const s = Math.min(24, r.w / 5)
      const rx = Math.min(r.w / 4, r.h / 2)
      return `M${r.x} ${r.y + r.h / 2}L${r.x + s} ${r.y}H${r.x + r.w - rx}A${rx} ${r.h / 2} 0 0 1 ${r.x + r.w - rx} ${r.y + r.h}H${r.x + s}Z`
    }
    case 'cloud': {
      const X = (f: number) => r.x + f * r.w
      const Y = (f: number) => r.y + f * r.h
      return (
        `M${X(0.2)} ${Y(0.88)}` +
        `C${X(-0.04)} ${Y(0.88)} ${X(-0.04)} ${Y(0.44)} ${X(0.18)} ${Y(0.44)}` +
        `C${X(0.14)} ${Y(0.08)} ${X(0.5)} ${Y(-0.02)} ${X(0.56)} ${Y(0.24)}` +
        `C${X(0.66)} ${Y(0.0)} ${X(0.97)} ${Y(0.08)} ${X(0.86)} ${Y(0.42)}` +
        `C${X(1.04)} ${Y(0.46)} ${X(1.04)} ${Y(0.88)} ${X(0.82)} ${Y(0.88)}Z`
      )
    }
    case 'star': {
      const cx = r.x + r.w / 2
      const cy = r.y + r.h / 2 + r.h * 0.04
      const pts: string[] = []
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5
        const k = i % 2 === 0 ? 1 : 0.45
        pts.push(`${(cx + (r.w / 2) * k * Math.cos(a)).toFixed(2)} ${(cy + (r.h / 2) * k * Math.sin(a)).toFixed(2)}`)
      }
      return `M${pts.join('L')}Z`
    }
    case 'note':
      return roundRectData(r, 8)
    default:
      return roundRectData(r, 0)
  }
}

/** A sheet with a wavy bottom edge (flowchart "document"). */
function documentData(r: Rect): string {
  const { x, y, w, h } = r
  return `M${x} ${y}H${x + w}V${y + h * 0.86}C${x + w * 0.75} ${y + h * 0.62} ${x + w * 0.42} ${y + h * 1.1} ${x} ${y + h * 0.9}Z`
}

/** Rectangle with rounded corners (radius 0 gives a plain rectangle). */
export function roundRectData(r: Rect, radius: number): string {
  const { x, y, w, h } = r
  if (radius <= 0) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`
  const k = Math.min(radius, w / 2, h / 2)
  const arc = (ex: number, ey: number) => `A${k} ${k} 0 0 1 ${ex} ${ey}`
  return (
    `M${x + k} ${y}H${x + w - k}${arc(x + w, y + k)}V${y + h - k}${arc(x + w - k, y + h)}` +
    `H${x + k}${arc(x, y + h - k)}V${y + k}${arc(x + k, y)}Z`
  )
}

/** Rotate absolute path data (M L H V C Q A Z) by `angle` degrees around (cx, cy). */
export function rotatePathData(d: string, cx: number, cy: number, angle: number): string {
  const rad = (angle * Math.PI) / 180
  const cos = Math.round(Math.cos(rad) * 1e9) / 1e9
  const sin = Math.round(Math.sin(rad) * 1e9) / 1e9
  const rot = (x: number, y: number) => {
    const dx = x - cx
    const dy = y - cy
    const n = (v: number) => Math.round(v * 100) / 100
    return `${n(cx + dx * cos - dy * sin)} ${n(cy + dx * sin + dy * cos)}`
  }
  let out = ''
  let px = 0
  let py = 0
  for (const [, cmd, args] of d.matchAll(/([MLHVCQAZ])([^MLHVCQAZ]*)/g)) {
    const v = (args.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number)
    switch (cmd) {
      case 'M':
      case 'L':
        for (let i = 0; i < v.length; i += 2) {
          out += `${i === 0 ? cmd : 'L'}${rot(v[i], v[i + 1])}`
          ;[px, py] = [v[i], v[i + 1]]
        }
        break
      case 'H':
        px = v[0]
        out += `L${rot(px, py)}`
        break
      case 'V':
        py = v[0]
        out += `L${rot(px, py)}`
        break
      case 'C':
      case 'Q': {
        const pts: string[] = []
        for (let i = 0; i < v.length; i += 2) pts.push(rot(v[i], v[i + 1]))
        out += cmd + pts.join(' ')
        ;[px, py] = [v[v.length - 2], v[v.length - 1]]
        break
      }
      case 'A':
        out += `A${v[0]} ${v[1]} ${v[2] + angle} ${v[3]} ${v[4]} ${rot(v[5], v[6])}`
        ;[px, py] = [v[5], v[6]]
        break
      case 'Z':
        out += 'Z'
        break
    }
  }
  return out
}

export function shapePath(kind: ShapeKind, r: Rect & { angle?: number }): Path2D {
  return new Path2D(shapePathData(kind, r))
}
