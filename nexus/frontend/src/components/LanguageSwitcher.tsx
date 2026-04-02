import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import { SUPPORTED_LANGUAGES } from '../utils/i18n'
import clsx from 'clsx'

interface Props {
  collapsed?: boolean
}

export function LanguageSwitcher({ collapsed = false }: Props) {
  const { i18n } = useTranslation()
  const [open, setOpen]  = useState(false)
  const ref              = useRef<HTMLDivElement>(null)

  const current = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) ?? SUPPORTED_LANGUAGES[0]

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className={clsx(
          'flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors',
          'text-text-muted hover:bg-secondary hover:text-text-primary',
          collapsed && 'justify-center px-2'
        )}
      >
        <span className="text-base">{current.flag}</span>
        {!collapsed && (
          <>
            <span>{current.name}</span>
            <ChevronDown size={14} className={clsx('transition-transform', open && 'rotate-180')} />
          </>
        )}
      </button>

      {open && (
        <div className="absolute bottom-full mb-1 left-0 min-w-[140px] rounded-xl border border-border bg-card shadow-card z-50">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => { i18n.changeLanguage(lang.code); setOpen(false) }}
              className={clsx(
                'flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors',
                'hover:bg-secondary',
                i18n.language === lang.code
                  ? 'text-accent'
                  : 'text-text-muted hover:text-text-primary'
              )}
            >
              <span>{lang.flag}</span>
              <span>{lang.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
