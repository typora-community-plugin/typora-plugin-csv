import type { I18n } from '@typora-community-plugin/core'
import type EN from './locales/lang.en.json'

/** Locale shape, inferred from the English file (source of truth). */
export type CsvLocale = typeof EN

export type CsvI18n = I18n<CsvLocale>

/** Minimal `{name}` interpolation, mirroring csv-lite's i18n behaviour. */
export function fmt(template: string, dict: Record<string, string | number>): string {
  return template.replace(/\{([^}]+)\}/g, (raw, name: string) =>
    dict[name] !== undefined ? String(dict[name]) : raw,
  )
}
