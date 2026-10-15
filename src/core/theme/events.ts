// Window events the board engine listens to; the plugin fires them (main.ts).

/** The board font changed: text is measured and drawn again. */
export const FONT_EVENT = 'boardline-font'
/** Light/dark changed: the board redraws in the new colors. */
export const THEME_EVENT = 'boardline-theme'
