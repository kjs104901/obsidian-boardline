// A laser pointer for presenting: a red dot that follows the pointer, trailing a line that
// fades out within a moment. Drawn on its own canvas over the slide.

import { useEffect, useRef } from 'react'

/** How long the trail behind the dot lasts (ms). */
const TRAIL_MS = 600
const RED = '255, 48, 48'

export function LaserPointer() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const area = canvas?.parentElement
    const ctx = canvas?.getContext('2d')
    if (!canvas || !area || !ctx) return
    const view = canvas.ownerDocument.defaultView ?? window
    const points: { x: number; y: number; t: number }[] = []
    const onMove = (e: PointerEvent) => {
      const r = area.getBoundingClientRect()
      points.push({ x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() })
    }
    area.addEventListener('pointermove', onMove)
    let frame = 0
    const draw = () => {
      const dpr = view.devicePixelRatio || 1
      const w = area.clientWidth
      const h = area.clientHeight
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const now = performance.now()
      while (points.length > 1 && now - points[0].t > TRAIL_MS) points.shift()
      ctx.lineCap = 'round'
      for (let i = 1; i < points.length; i++) {
        const life = 1 - (now - points[i].t) / TRAIL_MS
        if (life <= 0) continue
        ctx.strokeStyle = `rgba(${RED}, ${life * 0.8})`
        ctx.lineWidth = 1.5 + 4 * life
        ctx.beginPath()
        ctx.moveTo(points[i - 1].x, points[i - 1].y)
        ctx.lineTo(points[i].x, points[i].y)
        ctx.stroke()
      }
      const last = points[points.length - 1]
      if (last) {
        ctx.shadowColor = `rgba(${RED}, 0.9)`
        ctx.shadowBlur = 14
        ctx.fillStyle = `rgb(${RED})`
        ctx.beginPath()
        ctx.arc(last.x, last.y, 6, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
      }
      frame = view.requestAnimationFrame(draw)
    }
    frame = view.requestAnimationFrame(draw)
    return () => {
      view.cancelAnimationFrame(frame)
      area.removeEventListener('pointermove', onMove)
    }
  }, [])

  return <canvas ref={ref} className="bl-laser" />
}
