import { PluginSettingTab, Setting, type App } from 'obsidian'
import type BoardlinePlugin from './main'

export interface BoardlineSettings {
  /** Where "새 보드" puts the file: the vault's top, next to the open file, or a set folder. */
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
      .setName('새 보드 위치')
      .setDesc('명령이나 리본으로 만드는 보드를 둘 곳. 파일 탐색기에서 폴더를 오른쪽 클릭해 만들면 그 폴더에 만듭니다.')
      .addDropdown((d) =>
        d
          .addOptions({ current: '지금 연 파일과 같은 폴더', root: '보관함 최상위', folder: '아래 폴더' })
          .setValue(s.newBoardLocation)
          .onChange(async (v) => {
            s.newBoardLocation = v as BoardlineSettings['newBoardLocation']
            await this.plugin.saveSettings()
            this.display()
          }),
      )
    if (s.newBoardLocation === 'folder') {
      new Setting(containerEl).setName('보드 폴더').addText((t) =>
        t
          .setPlaceholder('예: Boards')
          .setValue(s.newBoardFolder)
          .onChange(async (v) => {
            s.newBoardFolder = v.trim().replace(/^\/+|\/+$/g, '')
            await this.plugin.saveSettings()
          }),
      )
    }
    new Setting(containerEl)
      .setName('보드 그림 파일 함께 두기')
      .setDesc('보드를 고칠 때마다 옆에 "이름.board.png"를 다시 그립니다. Obsidian 안의 노트는 보드를 직접 보여 주므로 필요 없고, 보드를 그리지 못하는 다른 앱이나 게시용입니다.')
      .addToggle((t) =>
        t.setValue(s.keepPicture).onChange(async (v) => {
          s.keepPicture = v
          await this.plugin.saveSettings()
        }),
      )

    new Setting(containerEl).setName('오픈소스 라이선스').setHeading()
    const notices = containerEl.createEl('details', { cls: 'boardline-notices' })
    notices.createEl('summary', { text: '이 플러그인에 들어 있는 다른 프로젝트와 그 라이선스' })
    notices.createEl('pre', { text: __THIRD_PARTY_NOTICES__ })
  }
}
