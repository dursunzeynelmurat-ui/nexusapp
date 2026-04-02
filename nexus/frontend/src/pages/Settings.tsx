import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { User, Lock, Globe, AlertTriangle } from 'lucide-react'
import api from '../utils/apiClient'
import { useAuthStore } from '../stores/authStore'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { toast } from '../components/Toast'

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

export default function SettingsPage() {
  const { t } = useTranslation()
  const user  = useAuthStore((s) => s.user)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [showDelete,    setShowDelete]    = useState(false)

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

  const sections = [
    { id: 'profile',   icon: User,          label: t('settings.profile')  },
    { id: 'security',  icon: Lock,          label: t('settings.security') },
    { id: 'language',  icon: Globe,         label: t('settings.language') },
    { id: 'danger',    icon: AlertTriangle, label: t('settings.deleteAccount') },
  ]

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
          {['currentPassword', 'newPassword', 'confirmPassword'].map((field) => (
            <div key={field}>
              <label className="block text-xs text-text-muted mb-1">{t(`settings.${field}`)}</label>
              <input {...passwordForm.register(field as keyof PasswordForm)} type="password"
                className="w-full rounded-xl border border-border bg-secondary px-4 py-2.5 text-sm text-text-primary focus:border-accent focus:outline-none" />
              {passwordForm.formState.errors[field as keyof PasswordForm] && (
                <p className="mt-1 text-xs text-red-400">{passwordForm.formState.errors[field as keyof PasswordForm]?.message}</p>
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
            <p className="text-xs text-text-muted">{t('settings.confirmDelete')}: <span className="font-mono text-text-primary">{user?.email}</span></p>
            <input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={user?.email ?? ''}
              className="w-full rounded-xl border border-red-500/30 bg-secondary px-4 py-2 text-sm text-text-primary focus:border-red-500 focus:outline-none" />
            <button
              onClick={() => toast.error('Account deletion is disabled in this demo')}
              disabled={deleteConfirm !== user?.email}
              className="rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-40 transition-colors">
              {t('settings.deleteAccount')}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  )
}
