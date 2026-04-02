import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { Users, Megaphone, MessageSquare, Wifi, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../utils/apiClient'
import { StatusBadge } from '../components/StatusBadge'
import { useAuthStore } from '../stores/authStore'

interface Stats {
  totalContacts:    number
  activeCampaigns:  number
  sentToday:        number
  activeSessions:   number
}

interface RecentCampaign {
  id:          string
  name:        string
  status:      string
  sentCount:   number
  totalCount:  number
  createdAt:   string
}

export default function DashboardPage() {
  const { t }  = useTranslation()
  const user   = useAuthStore((s) => s.user)

  const { data: contacts   } = useQuery({ queryKey: ['contacts', { limit: 1 }], queryFn: async () => (await api.get('/contacts?limit=1')).data })
  const { data: campaigns  } = useQuery({ queryKey: ['campaigns'],               queryFn: async () => (await api.get('/campaigns')).data  })
  const { data: sessions   } = useQuery({ queryKey: ['whatsapp', 'sessions'],    queryFn: async () => (await api.get('/whatsapp/sessions')).data })

  const stats: Stats = {
    totalContacts:   contacts?.total ?? 0,
    activeCampaigns: Array.isArray(campaigns) ? campaigns.filter((c: RecentCampaign) => c.status === 'RUNNING').length : 0,
    sentToday:       Array.isArray(campaigns) ? campaigns.reduce((acc: number, c: RecentCampaign) => acc + (c.sentCount ?? 0), 0) : 0,
    activeSessions:  Array.isArray(sessions)  ? sessions.filter((s: { status: string }) => s.status === 'CONNECTED').length : 0,
  }

  const recentCampaigns: RecentCampaign[] = Array.isArray(campaigns) ? campaigns.slice(0, 5) : []

  const statCards = [
    { label: t('dashboard.totalContacts'),   value: stats.totalContacts,   icon: Users,        color: 'text-blue-400'  },
    { label: t('dashboard.activeCampaigns'), value: stats.activeCampaigns, icon: Megaphone,    color: 'text-accent'    },
    { label: t('dashboard.sentToday'),       value: stats.sentToday,       icon: MessageSquare, color: 'text-green-400' },
    { label: t('dashboard.activeSessions'),  value: stats.activeSessions,  icon: Wifi,         color: 'text-yellow-400'},
  ]

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary font-display">{t('dashboard.title')}</h1>
        <p className="text-text-muted mt-1">Welcome back, {user?.name}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="rounded-2xl border border-border bg-card p-5 shadow-card"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-text-muted">{card.label}</p>
                <p className="mt-2 text-3xl font-bold text-text-primary font-display">
                  {card.value.toLocaleString()}
                </p>
              </div>
              <div className={`rounded-xl bg-secondary p-2 ${card.color}`}>
                <card.icon size={20} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Recent campaigns */}
      <div className="rounded-2xl border border-border bg-card shadow-card">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-text-primary font-display">{t('dashboard.recentCampaigns')}</h2>
          <Link
            to="/campaigns"
            className="flex items-center gap-1 text-sm text-accent hover:underline"
          >
            {t('dashboard.viewAll')} <ArrowRight size={14} />
          </Link>
        </div>
        <div className="divide-y divide-border">
          {recentCampaigns.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-muted">{t('campaigns.noCampaigns')}</p>
          ) : (
            recentCampaigns.map((campaign) => (
              <div key={campaign.id} className="flex items-center gap-4 px-6 py-3">
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-text-primary">{campaign.name}</p>
                  <p className="text-xs text-text-muted">
                    {campaign.sentCount} / {campaign.totalCount} {t('campaigns.sent').toLowerCase()}
                  </p>
                </div>
                <StatusBadge
                  variant={campaign.status.toLowerCase()}
                  label={t(`campaigns.${campaign.status.toLowerCase()}`)}
                />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="font-semibold text-text-primary font-display mb-3">{t('dashboard.quickActions')}</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/campaigns"
            className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/20 transition-colors"
          >
            <Megaphone size={16} />
            {t('dashboard.newCampaign')}
          </Link>
          <Link
            to="/connect"
            className="flex items-center gap-2 rounded-xl border border-border bg-secondary px-4 py-2 text-sm font-medium text-text-muted hover:bg-card hover:text-text-primary transition-colors"
          >
            <Wifi size={16} />
            {t('dashboard.syncContacts')}
          </Link>
        </div>
      </div>
    </div>
  )
}
