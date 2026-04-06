import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
  Wifi, Users, List, Megaphone, Activity,
  ChevronLeft, ChevronRight, X, Sparkles,
} from 'lucide-react'
import { useTutorialStore } from '../stores/tutorialStore'

interface Step {
  icon:        React.ReactNode
  titleKey:    string
  bodyKey:     string
  accentColor: string
}

const STEPS: Step[] = [
  {
    icon:        <Sparkles size={32} />,
    titleKey:    'tutorial.step0.title',
    bodyKey:     'tutorial.step0.body',
    accentColor: '#6C63FF',
  },
  {
    icon:        <Wifi size={32} />,
    titleKey:    'tutorial.step1.title',
    bodyKey:     'tutorial.step1.body',
    accentColor: '#22c55e',
  },
  {
    icon:        <Users size={32} />,
    titleKey:    'tutorial.step2.title',
    bodyKey:     'tutorial.step2.body',
    accentColor: '#3b82f6',
  },
  {
    icon:        <List size={32} />,
    titleKey:    'tutorial.step3.title',
    bodyKey:     'tutorial.step3.body',
    accentColor: '#f59e0b',
  },
  {
    icon:        <Megaphone size={32} />,
    titleKey:    'tutorial.step4.title',
    bodyKey:     'tutorial.step4.body',
    accentColor: '#ec4899',
  },
  {
    icon:        <Activity size={32} />,
    titleKey:    'tutorial.step5.title',
    bodyKey:     'tutorial.step5.body',
    accentColor: '#14b8a6',
  },
]

export function Tutorial() {
  const { t } = useTranslation()
  const { isOpen, currentStep, close, next, prev, goTo } = useTutorialStore()

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft')  prev()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, close, next, prev])

  const step        = STEPS[currentStep]
  const isLast      = currentStep === STEPS.length - 1
  const progressPct = ((currentStep + 1) / STEPS.length) * 100

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            onClick={close}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{   opacity: 0, scale: 0.92, y: 24  }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="pointer-events-auto w-full max-w-md rounded-3xl border border-border bg-card shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Progress bar */}
              <div className="h-1 bg-white/5">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: step.accentColor }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.4, ease: 'easeInOut' }}
                />
              </div>

              {/* Close button */}
              <div className="flex justify-end px-5 pt-4">
                <button
                  onClick={close}
                  className="rounded-lg p-1.5 text-text-muted hover:bg-white/5 hover:text-text-primary transition-colors"
                  title={t('common.close')}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Step content */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: 20  }}
                  animate={{ opacity: 1, x: 0   }}
                  exit={{   opacity: 0, x: -20  }}
                  transition={{ duration: 0.22 }}
                  className="px-8 pb-6 pt-2 flex flex-col items-center text-center gap-5"
                >
                  {/* Icon */}
                  <div
                    className="flex h-16 w-16 items-center justify-center rounded-2xl"
                    style={{
                      background: `${step.accentColor}18`,
                      color:      step.accentColor,
                      boxShadow:  `0 0 32px ${step.accentColor}30`,
                    }}
                  >
                    {step.icon}
                  </div>

                  {/* Text */}
                  <div className="space-y-2">
                    <h2 className="text-xl font-bold text-text-primary font-display">
                      {t(step.titleKey)}
                    </h2>
                    <p className="text-sm text-text-muted leading-relaxed">
                      {t(step.bodyKey)}
                    </p>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Dots + Buttons */}
              <div className="px-8 pb-8 flex flex-col gap-5">
                {/* Step dots */}
                <div className="flex justify-center gap-2">
                  {STEPS.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => goTo(i)}
                      className="rounded-full transition-all duration-200"
                      style={{
                        width:      i === currentStep ? 20 : 8,
                        height:     8,
                        background: i === currentStep ? step.accentColor : '#ffffff18',
                      }}
                    />
                  ))}
                </div>

                {/* Navigation */}
                <div className="flex gap-3">
                  {currentStep > 0 && (
                    <button
                      onClick={prev}
                      className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-white/5 hover:text-text-primary transition-colors"
                    >
                      <ChevronLeft size={15} />
                      {t('common.back')}
                    </button>
                  )}

                  <button
                    onClick={isLast ? close : next}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                    style={{ background: step.accentColor }}
                  >
                    {isLast ? t('tutorial.finish') : t('tutorial.next')}
                    {!isLast && <ChevronRight size={15} />}
                  </button>
                </div>

                {/* Skip */}
                {!isLast && (
                  <button
                    onClick={close}
                    className="text-center text-xs text-text-muted hover:text-text-primary transition-colors"
                  >
                    {t('tutorial.skip')}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
