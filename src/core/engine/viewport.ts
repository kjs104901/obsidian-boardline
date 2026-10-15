import type { Point, Rect } from './geometry'

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 4

export interface ViewportState {
  offsetX: number
  offsetY: number
  zoom: number
}

/**
 * Maps between screen space (CSS px relative to the canvas) and board space.
 * `offset` is the board coordinate shown at the canvas's top-left corner.
 */
export class Viewport implements ViewportState {
  offsetX = 0
  offsetY = 0
  zoom = 1
  width = 0
  height = 0

  toBoard(sx: number, sy: number): Point {
    return { x: sx / this.zoom + this.offsetX, y: sy / this.zoom + this.offsetY }
  }

  toScreen(bx: number, by: number): Point {
    return { x: (bx - this.offsetX) * this.zoom, y: (by - this.offsetY) * this.zoom }
  }

  /** Board rect currently visible in the canvas. */
  visibleRect(): Rect {
    return { x: this.offsetX, y: this.offsetY, w: this.width / this.zoom, h: this.height / this.zoom }
  }

  panByScreen(dx: number, dy: number): void {
    this.offsetX -= dx / this.zoom
    this.offsetY -= dy / this.zoom
  }

  /** Zoom by `factor`, keeping the board point under (sx, sy) fixed. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const anchor = this.toBoard(sx, sy)
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor))
    this.offsetX = anchor.x - sx / this.zoom
    this.offsetY = anchor.y - sy / this.zoom
  }

  setState(s: ViewportState): void {
    this.offsetX = s.offsetX
    this.offsetY = s.offsetY
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s.zoom))
  }

  state(): ViewportState {
    return { offsetX: this.offsetX, offsetY: this.offsetY, zoom: this.zoom }
  }
}

/**
 * Two-finger pinch: the view as it was when the fingers went down (`start`, their midpoint and
 * distance), followed so the board point under the starting midpoint stays under the fingers.
 */
export function pinchView(start: ViewportState, startMid: Point, startDist: number, mid: Point, dist: number): ViewportState {
  const anchor = { x: startMid.x / start.zoom + start.offsetX, y: startMid.y / start.zoom + start.offsetY }
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, start.zoom * (startDist > 0 ? dist / startDist : 1)))
  return { zoom, offsetX: anchor.x - mid.x / zoom, offsetY: anchor.y - mid.y / zoom }
}
