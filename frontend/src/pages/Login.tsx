import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Eye, EyeOff } from 'lucide-react'
import { useLogin, useRegister } from '../hooks/useAuth'
import { toast } from '../components/Toast'

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8),
})

const registerSchema = loginSchema.extend({
  name: z.string().min(1),
})

type LoginForm    = z.infer<typeof loginSchema>
type RegisterForm = z.infer<typeof registerSchema>

export default function LoginPage() {
  const { t } = useTranslation()
  const navigate  = useNavigate()
  const [mode, setMode]     = useState<'login' | 'register'>('login')
  const [showPw, setShowPw] = useState(false)

  const loginMutation    = useLogin()
  const registerMutation = useRegister()

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterForm>({
    resolver: zodResolver(mode === 'login' ? loginSchema : registerSchema),
  })

  const onSubmit = async (data: RegisterForm) => {
    try {
      if (mode === 'login') {
        await loginMutation.mutateAsync({ email: data.email, password: data.password })
      } else {
        await registerMutation.mutateAsync(data)
      }
      navigate('/dashboard')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? (mode === 'login' ? t('auth.invalidCredentials') : t('errors.serverError'))
      toast.error(msg)
    }
  }

  const isLoading = loginMutation.isPending || registerMutation.isPending

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-accent font-display tracking-wider">NEXUS</h1>
          <p className="mt-2 text-text-muted text-sm">WhatsApp Bulk Messaging Platform</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border bg-card p-8 shadow-card">
          <h2 className="text-xl font-semibold text-text-primary font-display mb-6">
            {mode === 'login' ? t('auth.login') : t('auth.register')}
          </h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">{t('auth.name')}</label>
                <input
                  {...register('name')}
                  placeholder={t('auth.namePlaceholder')}
                  className="w-full rounded-xl border border-border bg-secondary px-4 py-2.5 text-sm text-text-primary placeholder-text-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition"
                />
                {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name.message}</p>}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-text-muted mb-1">{t('auth.email')}</label>
              <input
                {...register('email')}
                type="email"
                placeholder={t('auth.emailPlaceholder')}
                autoComplete="email"
                className="w-full rounded-xl border border-border bg-secondary px-4 py-2.5 text-sm text-text-primary placeholder-text-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition"
              />
              {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-text-muted mb-1">{t('auth.password')}</label>
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPw ? 'text' : 'password'}
                  placeholder={t('auth.passwordPlaceholder')}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className="w-full rounded-xl border border-border bg-secondary px-4 py-2.5 pr-10 text-sm text-text-primary placeholder-text-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-xs text-red-400">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-white hover:bg-accent-hover transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading
                ? t('common.loading')
                : mode === 'login'
                  ? t('auth.loginButton')
                  : t('auth.registerButton')
              }
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-text-muted">
            {mode === 'login' ? t('auth.noAccount') : t('auth.hasAccount')}{' '}
            <button
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              className="text-accent hover:underline font-medium"
            >
              {mode === 'login' ? t('auth.register') : t('auth.login')}
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  )
}
