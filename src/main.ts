import './style.scss'
import { Plugin, PluginSettings, I18n, Notice, openInputBox, fs, path } from '@typora-community-plugin/core'
import { CsvView } from './view/csv-view'
import { CsvSettingTab } from './settings/setting-tab'
import { defaultSettings, SETTINGS_VERSION, type CsvSettings, type Delimiter } from './settings/settings'
import type { CsvLocale } from './i18n'

export default class CsvPlugin extends Plugin<CsvSettings> {

  i18n = new I18n<CsvLocale>({
    localePath: path.join(this.manifest.dir!, 'locales'),
  })

  onload(): void {
    // --- settings ----------------------------------------------------------
    // Version 1 is the initial schema; `SettingMigrations` can be wired in here
    // when the structure changes in a future release.
    this.registerSettings(
      new PluginSettings<CsvSettings>(this.app, this.manifest, { version: SETTINGS_VERSION }),
    )
    this.settings.setDefault(defaultSettings)
    this.registerSettingTab(new CsvSettingTab({ settings: this.settings, i18n: this.i18n }))

    // --- custom view -------------------------------------------------------
    this.registerCsvView()

    // --- commands ----------------------------------------------------------
    this.registerCommand({
      id: 'create-new-csv-file',
      title: this.i18n.t.commands.createNewCsv,
      scope: 'global',
      callback: () => {
        void this.createNewCsv()
      },
    })

    // --- rename migration --------------------------------------------------
    this.register(
      this.app.vault.on('file:rename', (oldPath, newPath) => this.migrateHeaderRowPath(oldPath, newPath)),
    )
  }

  onunload(): void {
    // All resources registered via `this.register(...)` are disposed automatically.
  }

  // =========================================================================
  // View registration
  // =========================================================================

  private registerCsvView(): void {
    const extensions = CsvView.extensions

    // Pre-check for extension conflicts (registerExtension throws on conflict).
    const free = extensions.filter(ext => !this.app.viewManager.isExtensionRegistered(ext))
    if (free.length < extensions.length) {
      const taken = extensions.filter(ext => !free.includes(ext))
      Notice.warning(`[CSV] Extension already registered by another plugin: ${taken.join(', ')}`)
    }

    this.register(
      this.app.viewManager.registerView(CsvView.type, leaf =>
        new CsvView(leaf, {
          app: this.app,
          i18n: this.i18n,
          getSettings: () => ({
            preferredDelimiter: this.settings.get('preferredDelimiter') as Delimiter,
            quoteChar: this.settings.get('quoteChar') as string,
            headerRowFiles: (this.settings.get('headerRowFiles') as Record<string, true>) ?? {},
          }),
          setPreferredDelimiter: delimiter => this.settings.set('preferredDelimiter', delimiter),
          isHeaderRowEnabled: filePath => this.isHeaderRowEnabled(filePath),
          setHeaderRowEnabled: (filePath, enabled) => this.setHeaderRowEnabled(filePath, enabled),
        }),
      ),
    )

    if (free.length > 0) {
      this.register(this.app.viewManager.registerExtensions(free, CsvView.type))
    }
  }

  // =========================================================================
  // Header-row preference (per file)
  // =========================================================================

  isHeaderRowEnabled(filePath: string): boolean {
    const map = this.settings.get('headerRowFiles') as Record<string, true> | undefined
    return !!(filePath && map?.[filePath])
  }

  setHeaderRowEnabled(filePath: string, enabled: boolean): void {
    if (!filePath) return
    const map = { ...((this.settings.get('headerRowFiles') as Record<string, true>) ?? {}) }
    if (enabled) map[filePath] = true
    else delete map[filePath]
    this.settings.set('headerRowFiles', map)
  }

  private migrateHeaderRowPath(oldPath: string, newPath: string): void {
    const map = this.settings.get('headerRowFiles') as Record<string, true> | undefined
    if (!map?.[oldPath]) return
    const next = { ...map }
    delete next[oldPath]
    next[newPath] = true
    this.settings.set('headerRowFiles', next)
  }

  // =========================================================================
  // Commands
  // =========================================================================

  private async createNewCsv(): Promise<void> {
    const t = this.i18n.t
    const activeFile = this.app.workspace.activeFile
    const dir = activeFile ? path.dirname(activeFile) : (this.app.vault?.path ?? '')

    const input = await openInputBox({ title: t.commands.createNewCsv, placeholder: 'new.csv' })
    if (!input) return

    const base = (input.replace(/\.csv$/i, '').trim() || 'new')

    const buildPath = (name: string) => (dir ? path.join(dir, name) : name)

    let fileName = `${base}.csv`
    let suffix = 1
    let filePath = buildPath(fileName)
    while (await fs.exists(filePath)) {
      fileName = `${base}-${suffix++}.csv`
      filePath = buildPath(fileName)
    }

    try {
      await fs.writeText(filePath, '')
      await this.app.openFile(filePath)
    } catch (error) {
      console.error('Failed to create CSV file:', error)
      Notice.error(t.commands.createFailed)
    }
  }
}
