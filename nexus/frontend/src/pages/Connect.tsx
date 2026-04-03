import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { Plus, Wifi, WifiOff, RefreshCw } from 'lucide-react'
import { useSessions, useWhatsAppSocket, useInitSession, useDisconnectSession, useSyncContacts } from '../hooks/useWhatsApp'
import { useWhatsAppStore } from '../stores/whatsappStore'
import { StatusBadge } from '../components/StatusBadge'
import { EmptyState } from '../components/EmptyState'
import { toast } from '../components/Toast'

export default function ConnectPage() {
  const { t } = useTranslation()
  const [newSessionId, setNewSessionId] = useState('')
  const [showForm,     setShowForm]     = useState(false)
  const [syncingId,    setSyncingId]    = useState<string | null>(null)

  const { data: sessions, isLoading } = useSessions()
  const activeQR     = useWhatsAppStore((s) => s.activeQR)

  useWhatsAppSocket()

  const initMutation       = useInitSession()
  const disconnectMutation = useDisconnectSession()
  const syncMutation       = useSyncContacts()

  const handleInit = async () => {
    if (!newSessionId.trim()) return
    try {
      await initMutation.mutateAsync(newSessionId.trim())
      setShowForm(false)
      setNewSessionId('')
      toast.info(t('connect.initializingSession'))
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 409) {
        toast.error(t('connect.sessionLimitReached'))
      } else {
        toast.error(t('errors.serverError'))
      }
    }
  }

  const handleDisconnect = async (sessionId: string) => {
    try {
      await disconnectMutation.mutateAsync(sessionId)
      toast.success(t('connect.disconnected'))
    } catch {
      toast.error(t('errors.serverError'))
    }
  }

  const handleSync = async (sessionId: string) => {
    setSyncingId(sessionId)
    try {
      const { synced } = await syncMutation.mutateAsync(sessionId)
      toast.success(t('contacts.synced', { count: synced }))
    } catch {
      toast.error(t('errors.sessionNotConnected'))
    } finally {
      setSyncingId(null)
    }
  }

  const statusLabel: Record<string, string> = {
    CONNECTED:    t('connect.connected'),
    DISCONNECTED: t('connect.disconnected'),
    CONNECTING:   t('connect.connecting'),
    QR_READY:     t('connect.qrReady'),
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary font-display">{t('connect.title')}</h1>
        <button
          onClick={() => setShowForm((p) => !p)}
          className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
        >
          <Plus size={16} />
          {t('connect.newSession')}
        </button>
      </div>

      {/* Add session form */}
      {showForm && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-border bg-card p-5 space-y-3"
        >
          <h3 className="font-medium text-text-primary">{t('connect.newSession')}</h3>
          <div className="flex gap-3">
            <input
              value={newSessionId}
              onChange={(e) => setNewSessionId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInit()}
              placeholder={t('connect.sessionIdPlaceholder')}
              className="flex-1 rounded-xl border border-border bg-secondary px-4 py-2.5 text-sm text-text-primary placeholder-text-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              onClick={handleInit}
              disabled={!newSessionId.trim() || initMutation.isPending}
              className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60 transition-colors"
            >
              {initMutation.isPending ? t('common.loading') : t('common.create')}
            </button>
          </div>
        </motion.div>
      )}

      {/* QR Code */}
      {activeQR && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl border border-accent/30 bg-accent/5 p-6 flex flex-col items-center gap-4"
        >
          <h3 className="font-medium text-accent">{t('connect.scanQR')}</h3>
          <div className="rounded-2xl bg-white p-4">
            <QRCodeSVG value={activeQR.qr} size={220} />
          </div>
          <p className="text-xs text-text-muted">{t('connect.qrExpires')}</p>
        </motion.div>
      )}

      {/* Sessions list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 rounded-full border-2 border-accent/20 border-t-accent animate-spin" />
        </div>
      ) : !sessions?.length ? (
        <EmptyState
          icon={<WifiOff size={32} />}
          title={t('connect.noSessions')}
          description={t('connect.addSession')}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((session: { id: string; sessionId: string; status: string; phoneNumber?: string; displayName?: string }) => (
            <div key={session.id} className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-text-primary font-mono text-sm">{session.sessionId}</p>
                  {session.phoneNumber  && <p className="text-xs text-text-muted">{session.phoneNumber}</p>}
                  {session.displayName  && <p className="text-xs text-text-muted">{session.displayName}</p>}
                </div>
                <StatusBadge
                  variant={session.status.toLowerCase()}
                  label={statusLabel[session.status] ?? session.status}
                />
              </div>

              <div className="flex gap-2">
                {session.status === 'CONNECTED' && (
                  <button
                    onClick={() => handleSync(session.sessionId)}
                    disabled={syncingId === session.sessionId}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-secondary text-text-muted hover:bg-card hover:text-accent transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={syncingId === session.sessionId ? 'animate-spin' : ''} />
                    {t('contacts.sync')}
                  </button>
                )}
                <button
                  onClick={() => handleDisconnect(session.sessionId)}
                  disabled={disconnectMutation.isPending}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-secondary text-text-muted hover:bg-red-500/10 hover:text-red-400 transition-colors"
                >
                  <WifiOff size={12} />
                  {t('connect.disconnect')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
