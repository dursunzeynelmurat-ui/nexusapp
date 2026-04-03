import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import { User, Lock, Globe, AlertTriangle, Sparkles, CheckCircle2 } from 'lucide-react'
import api from '../utils/apiClient'
import { useAuthStore } from '../stores/authStore'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { toast } from '../components/Toast'
import { disconnectAll } from '../utils/socketClient'

const profileSchema = z.object({
  name:  z.string().min(1),
  email: z.string().email(),
})

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword:     z.string().min(8),
  confirmPassword: z.string().min(1),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

type ProfileForm  = z.infer<typeof profileSchema>
type PasswordForm = z.infer<typeof passwordSchema>

const PERKS = [
  'settings.farewell.perk1',
  'settings.farewell.perk2',
  'settings.farewell.perk3',
  'settings.farewell.perk4',
]

export default function SettingsPage() {
  const { t } = useTranslation()
  const user   = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const [deleteConfirm, setDeleteConfirm]   = useState('')
  const [showDelete,    setShowDelete]       = useState(false)
  const [showFarewell,  setShowFarewell]     = useState(false)
  const [deleting,      setDeleting]         = useState(false)

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name ?? '', email: user?.email ?? '' },
  })

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
  })

  const onUpdateProfile = async (data: ProfileForm) => {
    try {
      await api.patch('/auth/profile', data)
      toast.success(t('common.success'))
    } catch {
      toast.error(t('errors.serverError'))
    }
  }

  const onChangePassword = async (data: PasswordForm) => {
    try {
      await api.post('/auth/change-password', {
        currentPassword: data.currentPassword,
        newPassword:     data.newPassword,
      })
      passwordForm.reset()
      toast.success(t('common.success'))
    } catch {
      toast.error(t('errors.serverError'))
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== user?.email) return
    setDeleting(true)
    try {
      await api.delete('/auth/account')
      setShowDelete(false)
      setShowFarewell(true)
    } catch {
      toast.error(t('errors.serverError'))
      setDeleting(false)
    }
  }

  const handleFarewellClose = () => {
    disconnectAll()
    logout()
  }

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-text-primary font-display">{t('settings.title')}</h1>

      {/* Profile */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <User size={18} className="text-accent" />
          <h2 className="font-semibold text-text-primary">{t('settings.profile')}</h2>
        </div>
        <form onSubmit={profileForm.handleSubmit(onUpdateProfile)} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">{t('auth.name')}</label>
              <input {...profileForm.register('name')}
                className="w-full rounded-xl border border-border bg-secondary px-4 py-2.5 text-sm text-text-primary focus:border-accent focus:outline-none" />
              {profileForm.formState.errors.name && <p className="mt-1 text-xs text-red-400">{profileForm.formState.errors.name.message}</p>}
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">{t('auth.email')}</label>
              <input {...profileForm.register('email')} type="email"
                className="w-full rounded-xl border border-border bg-secondary px-4 py-2.5 text-sm text-text-primary focus:border-accent focus:outline-none" />
              {profileForm.formState.errors.email && <p className="mt-1 text-xs text-red-400">{profileForm.formState.errors.email.message}</p>}
            </div>
          </div>
          <button type="submit" className="rounded-xl bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors">
            {t('settings.updateProfile')}
          </button>
        </form>
      </motion.div>

      {/* Security */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Lock size={18} className="text-accent" />
          <h2 className="font-semibold text-text-primary">{t('settings.security')}</h2>
        </div>
        <form onSubmit={passwordForm.handleSubmit(onChangePassword)} className="space-y-3">
          {(['currentPassword', 'newPassword', 'confirmPassword'] as const).map((field) => (
            <div key={field}>
              <label className="block text-xs text-text-muted mb-1">{t(`settings.${field}`)}</label>
              <input {...passwordForm.register(field)} type="password"
                className="w-full rounded-xl border border-border bg-secondary px-4 py-2.5 text-sm text-text-primary focus:border-accent focus:outline-none" />
              {passwordForm.formState.errors[field] && (
                <p className="mt-1 text-xs text-red-400">{passwordForm.formState.errors[field]?.message}</p>
              )}
            </div>
          ))}
          <button type="submit" className="rounded-xl bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors">
            {t('settings.changePassword')}
          </button>
        </form>
      </motion.div>

      {/* Language */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Globe size={18} className="text-accent" />
          <h2 className="font-semibold text-text-primary">{t('settings.language')}</h2>
        </div>
        <LanguageSwitcher />
      </motion.div>

      {/* Danger zone */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-red-400" />
          <h2 className="font-semibold text-red-400">{t('settings.deleteAccount')}</h2>
        </div>
        <p className="text-sm text-text-muted">{t('settings.deleteAccountWarning')}</p>

        {!showDelete ? (
          <button onClick={() => setShowDelete(true)}
            className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-colors">
            {t('settings.deleteAccount')}
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-text-muted">
              {t('settings.confirmDelete')}: <span className="font-mono text-text-primary">{user?.email}</span>
            </p>
            <input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={user?.email ?? ''}
              className="w-full rounded-xl border border-red-500/30 bg-secondary px-4 py-2 text-sm text-text-primary focus:border-red-500 focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowDelete(false); setDeleteConfirm('') }}
                className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-muted hover:bg-white/5 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirm !== user?.email || deleting}
                className="rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-40 transition-colors"
              >
                {deleting ? t('common.loading') : t('settings.deleteAccount')}
              </button>
            </div>
          </div>
        )}
      </motion.div>

      {/* Farewell modal */}
      <AnimatePresence>
        {showFarewell && (
          <>
            <motion.div
              key="farewell-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            />
            <motion.div
              key="farewell-modal"
              initial={{ opacity: 0, scale: 0.92, y: 24 }}
              animate={{ opacity: 1, scale: 1,    y: 0  }}
              exit={{   opacity: 0, scale: 0.92, y: 24  }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            >
              <div className="pointer-events-auto w-full max-w-md rounded-3xl border border-border bg-card shadow-2xl overflow-hidden">
                {/* Gradient top bar */}
                <div className="h-1.5 w-full bg-gradient-to-r from-accent via-purple-400 to-pink-400" />

                <div className="px-8 py-8 flex flex-col items-center text-center gap-5">
                  {/* Icon */}
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                    <Sparkles size={32} />
                  </div>

                  {/* Thank-you copy */}
                  <div className="space-y-2">
                    <h2 className="text-xl font-bold text-text-primary font-display">
                      {t('settings.farewell.title')}
                    </h2>
                    <p className="text-sm text-text-muted leading-relaxed">
                      {t('settings.farewell.body')}
                    </p>
                  </div>

                  {/* Perks reminder */}
                  <ul className="w-full space-y-2 text-left">
                    {PERKS.map((key) => (
                      <li key={key} className="flex items-start gap-2.5 text-sm text-text-muted">
                        <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-accent" />
                        <span>{t(key)}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={handleFarewellClose}
                    className="w-full rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
                  >
                    {t('settings.farewell.cta')}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
