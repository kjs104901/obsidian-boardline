import { useState } from 'react'
import { CloseIcon } from './icons'
import { t } from '@boardline/core/i18n'

interface ShortcutSection {
  title: string
  rows: [string, string][]
}

interface Props {
  onClose: () => void
}

// Keys, then what they do; " / " separates keys shown as chips of their own. Made when the
// panel opens, in the interface language.
function sections(): ShortcutSection[] {
  return [
    {
      title: t('help.tools'),
      rows: [
        ['R / U / O / D', t('help.basicShapes')],
        ['P / G / F / Y / B / J / V', t('help.otherShapes')],
        ['N / T / .', t('help.stickyTextSection')],
        ['C', t('kind.connector')],
        ['M', t('kind.mindmap')],
        ['Q', t('kind.actor')],
        ['E', t('kind.table')],
        ['H / Shift+H', t('help.penMarker')],
        ['X', t('icon')],
        ['K', t('link')],
        ['I', t('kind.image')],
      ],
    },
    {
      title: t('help.edit'),
      rows: [
        ['Enter', t('help.editText')],
        ['Ctrl+D', t('edit.duplicate')],
        [t('help.altDrag'), t('help.altDragDesc')],
        [t('help.shiftDrag'), t('help.shiftDragDesc')],
        [t('help.resizeKeys'), t('help.resizeKeysDesc')],
        [t('help.snapDrag'), t('help.snapDragDesc')],
        [t('help.arrows'), t('help.arrowsDesc')],
        ['Ctrl+G / Ctrl+Shift+G', t('help.group')],
        ['Shift+L', t('lock.lock')],
        ['Alt+] / Alt+[', t('help.frontBack')],
        ['Ctrl+Alt+C / Ctrl+Alt+V', t('help.copyPasteStyle')],
        ['Ctrl+Shift+D', t('style.saveDefault')],
        ['Ctrl+Shift+C', t('help.copyPng')],
        [t('help.linkKeys'), t('help.linkDesc')],
      ],
    },
    {
      title: t('help.text'),
      rows: [
        ['Ctrl+B / Ctrl+I', t('help.boldItalic')],
        ['Ctrl+Shift+X', t('mark.strike')],
        ['Ctrl+Shift+H', t('mark.highlight')],
        ['Ctrl+E', t('mark.code')],
        ['Ctrl+Shift+. / Ctrl+Shift+,', t('help.largerSmaller')],
        ['Ctrl+Shift+8 / 7 / 9', t('help.lists')],
        ['# / - / 1. / >', t('help.lineStarts')],
        [t('help.markdownExample'), t('help.markdownDesc')],
      ],
    },
    {
      title: t('help.connectAlign'),
      rows: [
        [t('help.altArrows'), t('help.altArrowsDesc')],
        ['Shift+Alt+V / Shift+Alt+H', t('help.autoLayout')],
        ['Alt+A / H / D', t('help.alignH')],
        ['Alt+W / V / S', t('help.alignV')],
      ],
    },
    {
      title: t('help.mindmapTable'),
      rows: [
        ['Tab', t('mindmap.addChild')],
        ['Enter / Ctrl+Enter', t('help.addSiblingDesc')],
        ['Alt+Enter', t('mindmap.insertParent')],
        ['/', t('help.fold')],
        [t('help.arrowKeys'), t('help.navigate')],
        ['Enter / F2', t('help.editCell')],
        [t('help.altArrows'), t('help.moveRowCol')],
        [t('help.cellRangeKeys'), t('help.cellRange')],
        [t('help.colEdgeKeys'), t('help.colEdgeDesc')],
      ],
    },
    {
      title: t('help.view'),
      rows: [
        [t('help.spaceDrag'), t('help.pan')],
        [t('help.zoomKeys'), t('help.zoom')],
        ['Ctrl+0', '100%'],
        ['Shift+1 / Shift+2', t('help.fit')],
        ['Ctrl+F', t('help.find')],
        ['F5', t('present')],
        ['L', t('help.laser')],
      ],
    },
  ]
}

/** Shift+/: the board's keyboard shortcuts in tabs. */
export function ShortcutHelp({ onClose }: Props) {
  const [tab, setTab] = useState(0)
  const all = sections()
  const current = all[Math.min(tab, all.length - 1)]
  return (
    <div className="bl-help-backdrop" onPointerDown={onClose}>
      <div className="bl-help-panel" onPointerDown={(e) => e.stopPropagation()}>
        <header>
          <span>{t('help.title')}</span>
          <button title={t('common.closeEsc')} onClick={onClose}>
            <CloseIcon />
          </button>
        </header>
        <nav className="bl-help-tabs" role="tablist">
          {all.map((s, i) => (
            <button key={s.title} role="tab" aria-selected={s === current} className={s === current ? 'active' : ''} onClick={() => setTab(i)}>
              {s.title}
            </button>
          ))}
        </nav>
        <div className="bl-help-list" role="tabpanel">
          {current.rows.map(([keys, what]) => (
            <div key={keys} className="bl-help-row">
              <span className="bl-help-keys">
                {keys.split(' / ').map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </span>
              <span className="bl-help-what">{what}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
