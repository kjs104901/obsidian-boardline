/* global __THIRD_PARTY_NOTICES__ -- the licenses text, put in by the build (esbuild.config.mjs) */
import { PluginSettingTab, Setting, type App } from 'obsidian'
import type BoardlinePlugin from './main'
import { t } from '@boardline/core/i18n'

export interface BoardlineSettings {
  /** Where "New board" puts the file: the vault's top, next to the open file, or a set folder. */
  newBoardLocation: 'root' | 'current' | 'folder'
  newBoardFolder: string
  /** Keep X.board.png next to each board (for apps that can't draw boards). */
  keepPicture: boolean
}

export const DEFAULT_SETTINGS: BoardlineSettings = {
  newBoardLocation: 'current',
  newBoardFolder: '',
  keepPicture: false,
}

export class BoardlineSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: BoardlinePlugin,
  ) {
    super(app, plugin)
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()
    const s = this.plugin.settings

    new Setting(containerEl)
      .setName(t('settings.newBoardFolder'))
      .setDesc(t('settings.newBoardFolderDesc'))
      .addDropdown((d) =>
        d
          .addOptions({ current: t('settings.folderCurrent'), root: t('settings.folderRoot'), folder: t('settings.folderFixed') })
          .setValue(s.newBoardLocation)
          .onChange(async (v) => {
            s.newBoardLocation = v as BoardlineSettings['newBoardLocation']
            await this.plugin.saveSettings()
            this.display()
          }),
      )
    if (s.newBoardLocation === 'folder') {
      new Setting(containerEl).setName(t('settings.boardFolder')).addText((text) =>
        text
          .setPlaceholder(t('settings.boardFolderPlaceholder'))
          .setValue(s.newBoardFolder)
          .onChange(async (v) => {
            s.newBoardFolder = v.trim().replace(/^\/+|\/+$/g, '')
            await this.plugin.saveSettings()
          }),
      )
    }
    new Setting(containerEl)
      .setName(t('settings.keepPicture'))
      .setDesc(t('settings.keepPictureDesc'))
      .addToggle((t) =>
        t.setValue(s.keepPicture).onChange(async (v) => {
          s.keepPicture = v
          await this.plugin.saveSettings()
        }),
      )

    new Setting(containerEl).setName(t('settings.licenses')).setHeading()
    const notices = containerEl.createEl('details', { cls: 'boardline-notices' })
    notices.createEl('summary', { text: t('settings.licensesDesc') })
    notices.createEl('pre', { text: __THIRD_PARTY_NOTICES__ })
  }
}
