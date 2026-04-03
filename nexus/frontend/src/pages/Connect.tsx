import { useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { Wifi, WifiOff, RefreshCw, Loader2 } from 'lucide-react'
import { useSessions, useWhatsAppSocket, useInitSession, useDisconnectSession, useSyncContacts } from '../hooks/useWhatsApp'
import { useWhatsAppStore } from '../stores/whatsappStore'
import { useAuthStore } from '../stores/authStore'
import { getWhatsAppSocket } from '../utils/socketClient'
import { StatusBadge } from '../components/StatusBadge'
import { toast } from '../components/Toast'

export default function ConnectPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)

  const { data: sessions, isLoading } = useSessions()
  const activeQR = useWhatsAppStore((s) => s.activeQR)

  useWhatsAppSocket()

  const initMutation       = useInitSession()
  const disconnectMutation = useDisconnectSession()
  const syncMutation       = useSyncContacts()

  // Derive session name from username (slugified)
  const sessionName = user?.name
    ? user.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    : 'my-account'

  // Active session = CONNECTED or QR_READY or CONNECTING
  const activeSession = sessions?.find(
    (s: { status: string }) => ['CONNECTED', 'QR_READY', 'CONNECTING'].includes(s.status)
  )

  const handleReconnect = useCallback(() => {
    // Clear stale QR before re-init
    useWhatsAppStore.getState().setQR(null)

    const socket = getWhatsAppSocket()
    socket.auth = { token: localStorage.getItem('accessToken') }

    const doInit = () => initMutation.mutate(sessionName)

    if (socket.connected) {
      doInit()
    } else {
      // Wait for socket to connect before firing init so QR event is not missed
      socket.once('connect', doInit)
      socket.connect()
    }
  }, [initMutation, sessionName])

  // Auto-init when there is no active session
  useEffect(() => {
    if (isLoading) return
    const hasActive = sessions?.some((s: { status: string }) =>
      ['CONNECTED', 'QR_READY', 'CONNECTING'].includes(s.status)
    )
    if (!hasActive && !initMutation.isPending && !activeQR) {
      handleReconnect()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, sessions])

  const handleDisconnect = async (sid: string) => {
    try {
      await disconnectMutation.mutateAsync(sid)
      toast.success(t('connect.disconnected'))
    } catch {
      toast.error(t('errors.serverError'))
    }
  }

  const handleSync = async (sid: string) => {
    try {
      const { synced } = await syncMutation.mutateAsync(sid)
      toast.success(t('contacts.synced', { count: synced }))
    } catch {
      toast.error(t('errors.sessionNotConnected'))
    }
  }

  const statusLabel: Record<string, string> = {
    CONNECTED:    t('connect.connected'),
    DISCONNECTED: t('connect.disconnected'),
    CONNECTING:   t('connect.connecting'),
    QR_READY:     t('connect.qrReady'),
  }

  return (
    <div className="p-8 space-y-6 max-w-lg">
      <h1 className="text-2xl font-bold text-text-primary font-display">{t('connect.title')}</h1>

      {/* Loading initial state */}
      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 size={28} className="animate-spin text-accent" />
        </div>
      )}

      {!isLoading && (
        <>
          {/* QR code — shown when waiting for scan */}
          {activeQR && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl border border-accent/30 bg-accent/5 p-6 flex flex-col items-center gap-4"
            >
              <p className="font-medium text-accent">{t('connect.scanQR')}</p>
              <div className="rounded-2xl bg-white p-4 shadow-lg">
                <QRCodeSVG value={activeQR.qr} size={220} />
              </div>
              <p className="text-xs text-text-muted">{t('connect.qrExpires')}</p>
            </motion.div>
          )}

          {/* Initialising — no QR yet */}
          {!activeQR && (activeSession?.status === 'CONNECTING' || initMutation.isPending) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-2xl border border-border bg-card p-8 flex flex-col items-center gap-3"
            >
              <Loader2 size={28} className="animate-spin text-accent" />
              <p className="text-sm text-text-muted">{t('connect.connecting')}</p>
            </motion.div>
          )}

          {/* Connected */}
          {activeSession?.status === 'CONNECTED' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-green-500/30 bg-green-500/5 p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/15">
                    <Wifi size={20} className="text-green-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-text-primary">
                      {(activeSession as { displayName?: string }).displayName ?? sessionName}
                    </p>
                    {(activeSession as { phoneNumber?: string }).phoneNumber && (
                      <p className="text-xs text-text-muted">
                        +{(activeSession as { phoneNumber?: string }).phoneNumber}
                      </p>
                    )}
                  </div>
                </div>
                <StatusBadge variant="connected" label={statusLabel['CONNECTED']} />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleSync((activeSession as { sessionId: string }).sessionId)}
                  disabled={syncMutation.isPending}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-secondary text-text-muted hover:bg-card hover:text-accent transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={12} className={syncMutation.isPending ? 'animate-spin' : ''} />
                  {t('contacts.sync')}
                </button>
                <button
                  onClick={() => handleDisconnect((activeSession as { sessionId: string }).sessionId)}
                  disabled={disconnectMutation.isPending}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-secondary text-text-muted hover:bg-red-500/10 hover:text-red-400 transition-colors"
                >
                  <WifiOff size={12} />
                  {t('connect.disconnect')}
                </button>
              </div>
            </motion.div>
          )}

          {/* Disconnected — show reconnect */}
          {!activeQR && (!activeSession || activeSession.status === 'DISCONNECTED') && !initMutation.isPending && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-border bg-card p-8 flex flex-col items-center gap-4"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5">
                <WifiOff size={24} className="text-text-muted" />
              </div>
              <div className="text-center space-y-1">
                <p className="font-medium text-text-primary">{t('connect.noSessions')}</p>
                <p className="text-sm text-text-muted">{t('connect.tapToConnect')}</p>
              </div>
              <button
                onClick={handleReconnect}
                className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
              >
                <Wifi size={15} />
                {t('connect.reconnect')}
              </button>
            </motion.div>
          )}
        </>
      )}
    </div>
  )
}
