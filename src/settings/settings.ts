/**
 * Global plugin settings, persisted to `.typora/data/{manifest.id}.json`.
 */
export type Delimiter = 'auto' | ',' | ';' | '\t' | '|'

export interface CsvSettings {
  /**
   * Global delimiter preference. `'auto'` lets the plugin detect the delimiter
   * of each file individually. Manual values are non-destructive: they only
   * change how the current file is parsed in the view, not the file format.
   */
  preferredDelimiter: Delimiter
  /** Character used to quote fields containing special characters. */
  quoteChar: string
  /**
   * Per-file "first row as header" preference (issue #39 in csv-lite).
   * Only files with the flag enabled are stored; values are always `true`.
   */
  headerRowFiles: Record<string, true>
}

export const defaultSettings: CsvSettings = {
  preferredDelimiter: 'auto',
  quoteChar: '"',
  headerRowFiles: {},
}

/** Current settings schema version. Bump together with a migration. */
export const SETTINGS_VERSION = 1

/** Human-readable delimiter choices for the settings UI. */
export const DELIMITER_OPTIONS: Delimiter[] = ['auto', ',', ';', '\t', '|']
