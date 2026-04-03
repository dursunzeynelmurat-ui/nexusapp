import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Wifi, Users, List, Megaphone,
  Activity, Settings, LogOut, ChevronLeft, ChevronRight, HelpCircle,
} from 'lucide-react'
import clsx from 'clsx'
import { LanguageSwitcher } from './LanguageSwitcher'
import { useAuthStore } from '../stores/authStore'
import { useTutorialStore } from '../stores/tutorialStore'
import { useLogout } from '../hooks/useAuth'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, key: 'nav.dashboard'  },
  { to: '/connect',   icon: Wifi,            key: 'nav.connect'    },
  { to: '/contacts',  icon: Users,           key: 'nav.contacts'   },
  { to: '/lists',     icon: List,            key: 'nav.lists'      },
  { to: '/campaigns', icon: Megaphone,       key: 'nav.campaigns'  },
  { to: '/status',    icon: Activity,        key: 'nav.status'     },
  { to: '/settings',  icon: Settings,        key: 'nav.settings'   },
]

export function Sidebar() {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(false)
  const user           = useAuthStore((s) => s.user)
  const openTutorial   = useTutorialStore((s) => s.open)
  const logout         = useLogout()
  const navigate       = useNavigate()

  const handleLogout = async () => {
    await logout.mutateAsync()
    navigate('/login')
  }

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 240 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      className="flex h-screen flex-col border-r border-border bg-secondary overflow-hidden shrink-0"
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-border">
        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.span
              key="logo-text"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-xl font-bold text-accent font-display tracking-wide"
            >
              NEXUS
            </motion.span>
          )}
        </AnimatePresence>
        <button
          onClick={() => setCollapsed((p) => !p)}
          className="rounded-lg p-1.5 text-text-muted hover:bg-card hover:text-text-primary transition-colors"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        {navItems.map(({ to, icon: Icon, key }) => (
          <NavLink
            key={to}
            to={to}
            title={collapsed ? t(key) : undefined}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                isActive
                  ? 'bg-accent/15 text-accent shadow-glow-sm'
                  : 'text-text-muted hover:bg-card hover:text-text-primary',
                collapsed && 'justify-center px-2'
              )
            }
          >
            <Icon size={18} className="shrink-0" />
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  className="overflow-hidden whitespace-nowrap"
                >
                  {t(key)}
                </motion.span>
              )}
            </AnimatePresence>
          </NavLink>
        ))}
      </nav>

      {/* Bottom: language + user */}
      <div className="border-t border-border px-2 py-3 space-y-1">
        <LanguageSwitcher collapsed={collapsed} />

        {/* User info */}
        <div
          className={clsx(
            'flex items-center gap-3 rounded-xl px-3 py-2',
            collapsed && 'justify-center px-2'
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent text-sm font-semibold">
            {user?.name?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 min-w-0"
              >
                <p className="truncate text-sm font-medium text-text-primary">{user?.name}</p>
                <p className="truncate text-xs text-text-muted">{user?.email}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button
          onClick={openTutorial}
          title={collapsed ? t('tutorial.reopenTitle') : undefined}
          className={clsx(
            'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-text-muted transition-colors',
            'hover:bg-accent/10 hover:text-accent',
            collapsed && 'justify-center px-2'
          )}
        >
          <HelpCircle size={16} />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {t('tutorial.reopenTitle')}
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        <button
          onClick={handleLogout}
          title={collapsed ? t('nav.logout') : undefined}
          className={clsx(
            'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-text-muted transition-colors',
            'hover:bg-red-500/10 hover:text-red-400',
            collapsed && 'justify-center px-2'
          )}
        >
          <LogOut size={16} />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {t('nav.logout')}
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  )
}
