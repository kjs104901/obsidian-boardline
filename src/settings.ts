/* global __THIRD_PARTY_NOTICES__ -- the licenses text, put in by the build (esbuild.config.mjs) */
import { PluginSettingTab, Setting, requireApiVersion, type App, type SettingDefinitionItem } from 'obsidian'
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

  /**
   * Obsidian 1.13 and later draw the settings from these (and find them in settings search);
   * display() draws the same settings for earlier versions.
   */
  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: t('settings.newBoardFolder'),
        desc: t('settings.newBoardFolderDesc'),
        control: { type: 'dropdown', key: 'newBoardLocation', options: locations(), defaultValue: DEFAULT_SETTINGS.newBoardLocation },
      },
      {
        name: t('settings.boardFolder'),
        visible: () => this.plugin.settings.newBoardLocation === 'folder',
        control: { type: 'folder', key: 'newBoardFolder', placeholder: t('settings.boardFolderPlaceholder') },
      },
      {
        name: t('settings.keepPicture'),
        desc: t('settings.keepPictureDesc'),
        control: { type: 'toggle', key: 'keepPicture', defaultValue: DEFAULT_SETTINGS.keepPicture },
      },
      {
        type: 'group',
        heading: t('settings.licenses'),
        items: [
          {
            name: t('settings.licensesDesc'),
            searchable: false,
            render: (setting) => {
              setting.settingEl.empty()
              notices(setting.settingEl)
            },
          },
        ],
      },
    ]
  }

  getControlValue(key: string): unknown {
    return this.plugin.settings[key as keyof BoardlineSettings]
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    const s = this.plugin.settings
    if (key === 'newBoardLocation' && (value === 'root' || value === 'current' || value === 'folder')) s.newBoardLocation = value
    else if (key === 'newBoardFolder') s.newBoardFolder = folderPath(typeof value === 'string' ? value : '')
    else if (key === 'keepPicture') s.keepPicture = value === true
    else return
    await this.plugin.saveSettings()
    // The folder row is there only for a set folder (this is only called from 1.13 on).
    if (key !== 'newBoardLocation') return
    if (requireApiVersion('1.13.0')) this.update()
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()
    const s = this.plugin.settings
    let folderRow: Setting | null = null

    new Setting(containerEl)
      .setName(t('settings.newBoardFolder'))
      .setDesc(t('settings.newBoardFolderDesc'))
      .addDropdown((d) =>
        d
          .addOptions(locations())
          .setValue(s.newBoardLocation)
          .onChange(async (v) => {
            s.newBoardLocation = v as BoardlineSettings['newBoardLocation']
            await this.plugin.saveSettings()
            folderRow?.settingEl.toggle(v === 'folder')
          }),
      )
    folderRow = new Setting(containerEl).setName(t('settings.boardFolder')).addText((text) =>
      text
        .setPlaceholder(t('settings.boardFolderPlaceholder'))
        .setValue(s.newBoardFolder)
        .onChange(async (v) => {
          s.newBoardFolder = folderPath(v)
          await this.plugin.saveSettings()
        }),
    )
    folderRow.settingEl.toggle(s.newBoardLocation === 'folder')
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
    notices(containerEl)
  }
}

/** Where New board puts a board. */
const locations = () => ({ current: t('settings.folderCurrent'), root: t('settings.folderRoot'), folder: t('settings.folderFixed') })

/** A folder as typed or picked, without leading or trailing slashes. */
const folderPath = (v: string) => v.trim().replace(/^\/+|\/+$/g, '')

/** The licenses of what the plugin bundles, folded away. */
function notices(el: HTMLElement): void {
  const box = el.createEl('details', { cls: 'boardline-notices' })
  box.createEl('summary', { text: t('settings.licensesDesc') })
  box.createEl('pre', { text: __THIRD_PARTY_NOTICES__ })
}
