import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import en from '../locales/en.json'
import tr from '../locales/tr.json'
import ar from '../locales/ar.json'

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English',  dir: 'ltr' as const, flag: '🇺🇸' },
  { code: 'tr', name: 'Türkçe',   dir: 'ltr' as const, flag: '🇹🇷' },
  { code: 'ar', name: 'العربية', dir: 'rtl' as const, flag: '🇸🇦' },
]

const RTL_LANGUAGES = new Set(['ar'])

export function isRTL(lang: string): boolean {
  return RTL_LANGUAGES.has(lang)
}

export function applyDirection(lang: string): void {
  const dir = isRTL(lang) ? 'rtl' : 'ltr'
  document.documentElement.setAttribute('dir', dir)
  document.documentElement.setAttribute('lang', lang)
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      tr: { translation: tr },
      ar: { translation: ar },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'tr', 'ar'],
    interpolation: { escapeValue: false },
    detection: {
      order:  ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  })

// Apply direction on language change
i18n.on('languageChanged', (lang) => {
  applyDirection(lang)
})

// Apply initial direction
applyDirection(i18n.language)

export default i18n
