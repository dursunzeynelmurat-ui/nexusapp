import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

interface Props {
  open:        boolean
  title:       string
  description: string
  confirmLabel?: string
  cancelLabel?:  string
  danger?:     boolean
  onConfirm:   () => void
  onClose:     () => void
}

export function ConfirmModal({
  open, title, description, confirmLabel, cancelLabel, danger = false, onConfirm, onClose,
}: Props) {
  const { t } = useTranslation()

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-card"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{   opacity: 0, scale: 0.95, y: 10  }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <button
              onClick={onClose}
              className="absolute right-4 top-4 rounded-lg p-1 text-text-muted hover:bg-secondary hover:text-text-primary transition-colors"
            >
              <X size={18} />
            </button>

            <h2 className="text-xl font-semibold text-text-primary font-display">{title}</h2>
            <p className="mt-2 text-sm text-text-muted">{description}</p>

            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={onClose}
                className="rounded-xl px-4 py-2 text-sm font-medium text-text-muted border border-border hover:bg-secondary transition-colors"
              >
                {cancelLabel ?? t('common.cancel')}
              </button>
              <button
                onClick={() => { onConfirm(); onClose() }}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                  danger
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-accent hover:bg-accent-hover text-white'
                }`}
              >
                {confirmLabel ?? t('common.confirm')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
