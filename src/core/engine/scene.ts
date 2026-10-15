// What to draw for a set of objects and how big it is: used by exports, the version history
// preview and pictures of boards that aren't open.

import { isMindmap, isShape, type BoardObject } from '../board/model'
import { connectorGeometry, labelCenter, polylineBounds, type ConnectorGeometry, type Lookup } from './connectors'
import { exportSvg, type ExportScene } from './exportImage'
import { unionRects, type Rect } from './geometry'
import { layoutMindmaps, type MindmapLayout } from './mindmap'
import { actorBounds, isActor } from './sequence'
import { labelLayout, layoutShapeText, measureAt } from './textLayout'
import { noteTitleBox } from './noteCard'

/** Box of a connector label (white backing behind the text). */
export function labelBoxOf(label: string, g: ConnectorGeometry): Rect {
  const { w, h } = labelLayout(label, measureAt)
  const at = labelCenter(g, w)
  return { x: at.x - w / 2, y: at.y - h / 2, w, h }
}

/** Scene with the bounds of `objects` (in z order); connectors resolve through `lookup`. */
export function sceneOf(objects: BoardObject[], lookup: Lookup, layout: MindmapLayout): ExportScene | null {
  const rects: Rect[] = []
  for (const o of objects) {
    if (isShape(o)) {
      rects.push(isActor(o) ? actorBounds(o) : o)
      // Section titles sit above the frame, icon labels below the icon.
      if ((o.shape === 'section' || o.shape === 'icon') && o.text) rects.push(layoutShapeText(o, measureAt).box)
      if (o.shape === 'note') rects.push(noteTitleBox(o))
    } else if (isMindmap(o)) {
      const box = layout.boxes.get(o.id)
      if (box) rects.push(box)
    } else {
      const g = connectorGeometry(o, lookup)
      if (!g) continue
      rects.push(polylineBounds(g.points))
      // Labels can stick out of the line.
      if (o.label) rects.push(labelBoxOf(o.label, g))
    }
  }
  const bounds = unionRects(rects)
  return bounds ? { objects, lookup, mindmap: layout, bounds } : null
}

/** Scene of objects that aren't on an open board (a file, a version, a template). */
export function standaloneScene(objects: BoardObject[]): ExportScene | null {
  const sorted = [...objects].sort((a, b) => a.z - b.z)
  const byId = new Map(sorted.map((o) => [o.id, o]))
  const layout = layoutMindmaps(sorted.filter(isMindmap), measureAt)
  return sceneOf(sorted, (id) => byId.get(id), layout)
}

/** SVG picture of objects that aren't on the board. */
export function previewSvg(objects: BoardObject[]): string | null {
  const scene = standaloneScene(objects)
  return scene ? exportSvg(scene, measureAt) : null
}
