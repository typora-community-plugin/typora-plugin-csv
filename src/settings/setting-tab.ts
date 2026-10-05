import { SettingTab, type PluginSettings } from '@typora-community-plugin/core'
import type { CsvI18n } from '../i18n'
import type { CsvSettings, Delimiter } from './settings'

export interface CsvSettingsHost {
  settings: PluginSettings<CsvSettings>
  i18n: CsvI18n
}

/** Global settings page: field separator + quote character. */
export class CsvSettingTab extends SettingTab {

  constructor(private host: CsvSettingsHost) {
    super()
  }

  get name() {
    return 'CSV'
  }

  onload() {
    const { settings, i18n } = this.host
    const t = i18n.t

    this.addSettingTitle(t.settings.title)

    this.addSetting(setting => {
      setting.addName(t.settings.fieldSeparator)
      setting.addDescription(t.settings.fieldSeparatorDesc)
      setting.addSelect(select => {
        const options: Array<[Delimiter, string]> = [
          ['auto', t.settings.delimiterAuto],
          [',', t.settings.delimiterComma],
          [';', t.settings.delimiterSemicolon],
          ['\t', t.settings.delimiterTab],
          ['|', t.settings.delimiterPipe],
        ]
        for (const [value, label] of options) {
          const option = document.createElement('option')
          option.value = value
          option.textContent = label
          select.append(option)
        }
        select.value = settings.get('preferredDelimiter')
        select.onchange = () => {
          settings.set('preferredDelimiter', select.value as Delimiter)
        }
      })
    })

    this.addSetting(setting => {
      setting.addName(t.settings.quoteChar)
      setting.addDescription(t.settings.quoteCharDesc)
      setting.addText(input => {
        input.value = settings.get('quoteChar')
        input.maxLength = 1
        input.onchange = () => {
          settings.set('quoteChar', input.value || '"')
        }
      })
    })
  }
}
