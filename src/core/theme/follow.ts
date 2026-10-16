// The board's look from the page around it (Obsidian's theme): light or dark by the body's
// theme-dark class, the note background, canvas dots and accent from its CSS variables, and the
// interface font.

import { DEFAULT_FONT_FAMILY, setFontFamily } from '../engine/text'
import { FONT_EVENT, THEME_EVENT } from './events'
import { setHostColors, setThemeMode, type HostColors } from './palette'

export interface HostLook {
  /** Read the look again once the page has settled (the host says its CSS changed). */
  refresh(): void
  stop(): void
}

/**
 * Follow `doc`'s look: read now, again on `refresh()`, and whenever the body switches between
 * light and dark. Boards hear of a change through THEME_EVENT / FONT_EVENT, only when something
 * did change.
 */
export function followHostLook(doc: Document): HostLook {
  const win = doc.defaultView ?? window
  let theme = ''
  let font = ''
  let frame = 0

  const read = () => {
    frame = 0
    const body = doc.body
    const mode = body.classList.contains('theme-dark') ? 'dark' : 'light'
    // The variables may be calc() or color-mix() expressions a canvas can't read: a new element
    // colored with each turns it into a plain color (new, so no transition is under way on it).
    const resolve = (name: string) => {
      const probe = body.appendChild(doc.createElement('div'))
      probe.style.color = `var(${name})`
      const color = win.getComputedStyle(probe).color || null
      probe.remove()
      return color
    }
    const colors: HostColors = { background: resolve('--background-primary'), dots: resolve('--canvas-dot-pattern'), accent: resolve('--interactive-accent') }
    const nextTheme = JSON.stringify([mode, colors])
    if (nextTheme !== theme) {
      theme = nextTheme
      setThemeMode(mode)
      setHostColors(colors)
      win.dispatchEvent(new Event(THEME_EVENT))
    }
    const nextFont = win.getComputedStyle(body).getPropertyValue('--font-interface').trim() || DEFAULT_FONT_FAMILY
    if (nextFont !== font) {
      font = nextFont
      setFontFamily(nextFont)
      win.dispatchEvent(new Event(FONT_EVENT))
    }
  }

  // Light and dark switch in steps (the setting, the body's class, the theme's colors), and the
  // host's signal can come before the last step. Reading on the next frame sees where it ended.
  const refresh = () => {
    if (!frame) frame = win.requestAnimationFrame(read)
  }

  // Some themes and plugins (Minimal's settings, say) switch by the body's class alone.
  let dark = doc.body.classList.contains('theme-dark')
  const observer = new MutationObserver(() => {
    const now = doc.body.classList.contains('theme-dark')
    if (now === dark) return
    dark = now
    refresh()
  })
  observer.observe(doc.body, { attributes: true, attributeFilter: ['class'] })

  read()
  return {
    refresh,
    stop: () => {
      observer.disconnect()
      if (frame) win.cancelAnimationFrame(frame)
    },
  }
}
