import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle, AlertCircle, RefreshCw } from 'lucide-react'
import clsx from 'clsx'
import api from '../utils/apiClient'

interface GrammarError {
  word:        string
  offset:      number
  length:      number
  suggestions: string[]
}

interface StyleIssue {
  type:    string
  message: string
}

interface Props {
  text:     string
  lang:     'en' | 'tr' | 'ar'
  onApply?: (corrected: string) => void
}

export function GrammarChecker({ text, lang, onApply }: Props) {
  const { t } = useTranslation()
  const [errors,      setErrors]      = useState<GrammarError[]>([])
  const [styleIssues, setStyleIssues] = useState<StyleIssue[]>([])
  const [loading,     setLoading]     = useState(false)
  const [checked,     setChecked]     = useState(false)

  const check = useCallback(async () => {
    if (!text.trim()) return
    setLoading(true)
    try {
      const res = await api.post('/grammar/check', { text, lang })
      setErrors(res.data.errors)
      setStyleIssues(res.data.styleIssues)
      setChecked(true)
    } finally {
      setLoading(false)
    }
  }, [text, lang])

  const applyFix = (error: GrammarError, suggestion: string) => {
    if (!onApply) return
    const corrected = text.slice(0, error.offset) + suggestion + text.slice(error.offset + error.length)
    onApply(corrected)
    setErrors((prev) => prev.filter((e) => e.offset !== error.offset))
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-text-primary">{t('grammar.checkGrammar')}</h4>
        <button
          onClick={check}
          disabled={loading || !text.trim()}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-accent/15 text-accent hover:bg-accent/25 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={clsx(loading && 'animate-spin')} />
          {loading ? t('grammar.checkingGrammar') : t('grammar.checkGrammar')}
        </button>
      </div>

      {checked && (
        <div className="space-y-2">
          {errors.length === 0 && styleIssues.length === 0 ? (
            <div className="flex items-center gap-2 text-green-400 text-sm">
              <CheckCircle size={16} />
              <span>{t('grammar.noErrors')}</span>
            </div>
          ) : (
            <>
              {errors.length > 0 && (
                <div>
                  <p className="text-xs text-text-muted mb-1">
                    {t('grammar.errorsFound', { count: errors.length })}
                  </p>
                  <div className="space-y-1.5">
                    {errors.map((err, i) => (
                      <div key={i} className="rounded-lg border border-red-500/20 bg-red-500/5 p-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <AlertCircle size={12} className="text-red-400 shrink-0" />
                          <span className="text-xs text-red-400 font-mono">"{err.word}"</span>
                          {err.suggestions.slice(0, 3).map((s) => (
                            <button
                              key={s}
                              onClick={() => applyFix(err, s)}
                              className="text-xs px-2 py-0.5 rounded bg-accent/15 text-accent hover:bg-accent/25 transition-colors"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {styleIssues.length > 0 && (
                <div>
                  <p className="text-xs text-text-muted mb-1">{t('grammar.styleIssues')}</p>
                  <div className="space-y-1">
                    {styleIssues.map((issue, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-yellow-400">
                        <AlertCircle size={12} className="shrink-0 mt-0.5" />
                        <span>{issue.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
