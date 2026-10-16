import { afterEach, describe, expect, it } from 'vitest'
import { de } from './de'
import { en, type MessageKey } from './en'
import { es } from './es'
import { fr } from './fr'
import { ja } from './ja'
import { ko } from './ko'
import { zh } from './zh'
import { language, setLanguage, t } from './index'

afterEach(() => setLanguage('en'))

describe('interface language', () => {
  it('picks the language, its base language, or English', () => {
    setLanguage('ko')
    expect([language(), t('board.newName')]).toEqual(['ko', '새 보드'])
    setLanguage('zh-TW')
    expect(language()).toBe('zh')
    setLanguage('pt-BR')
    expect([language(), t('board.newName')]).toEqual(['en', 'New board'])
  })

  it('fills in the numbered holes', () => {
    expect(t('table.withCell', 2, 3)).toBe('Table (selected cell: row 2, column 3)')
    setLanguage('de')
    expect(t('find.replaced', 4)).toBe('4 ersetzt')
  })

  it('has every phrase in every language, with the same holes', () => {
    const holes = (s: string) => (s.match(/\{\d\}/g) ?? []).sort().join()
    for (const [name, table] of Object.entries({ ko, ja, zh, es, de, fr })) {
      for (const key of Object.keys(en) as MessageKey[]) {
        expect(table[key], `${name} ${key}`).toBeTypeOf('string')
        expect(holes(table[key]!), `${name} ${key}`).toBe(holes(en[key]))
      }
    }
  })
})
