import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Megaphone, Plus, Play, Pause, RotateCcw, Trash2 } from 'lucide-react'
import {
  useCampaigns, useCreateCampaign, useStartCampaign,
  usePauseCampaign, useResumeCampaign, useDeleteCampaign,
  useCampaignSocket,
} from '../hooks/useCampaigns'
import { useLists }    from '../hooks/useLists'
import { useSessions } from '../hooks/useWhatsApp'
import { useCampaignStore } from '../stores/campaignStore'
import { StatusBadge }     from '../components/StatusBadge'
import { ProgressRing }    from '../components/ProgressRing'
import { EmptyState }      from '../components/EmptyState'
import { ConfirmModal }    from '../components/ConfirmModal'
import { GrammarChecker }  from '../components/GrammarChecker'
import { MediaUploadZone } from '../components/MediaUploadZone'
import { toast }           from '../components/Toast'
import type { i18n } from 'i18next'

interface StoredFile { key: string; url: string; mimeType: string; size: number }

interface Campaign {
  id:          string
  name:        string
  status:      string
  message:     string
  totalCount:  number
  sentCount:   number
  failedCount: number
  list:        { id: string; name: string }
}

export default function CampaignsPage() {
  const { t, i18n } = useTranslation()
  const [showCreate,    setShowCreate]    = useState(false)
  const [deleteId,      setDeleteId]      = useState<string | null>(null)
  const [activeId,      setActiveId]      = useState<string | null>(null)
  const [name,          setName]          = useState('')
  const [message,       setMessage]       = useState('')
  const [listId,        setListId]        = useState('')
  const [sessionId,     setSessionId]     = useState('')
  const [mediaFile,     setMediaFile]     = useState<StoredFile | null>(null)

  const { data: campaigns,  isLoading } = useCampaigns()
  const { data: lists }                 = useLists()
  const { data: sessions }              = useSessions()
  const progressMap                     = useCampaignStore((s) => s.progressMap)

  useCampaignSocket(activeId)

  const createMutation = useCreateCampaign()
  const startMutation  = useStartCampaign()
  const pauseMutation  = usePauseCampaign()
  const resumeMutation = useResumeCampaign()
  const deleteMutation = useDeleteCampaign()

  const handleCreate = async () => {
    if (!name.trim() || !message.trim() || !listId || !sessionId) {
      toast.error(t('errors.validationFailed'))
      return
    }
    try {
      await createMutation.mutateAsync({
        name: name.trim(), message: message.trim(),
        listId, sessionId, mediaUrl: mediaFile?.url,
      })
      setName(''); setMessage(''); setListId(''); setSessionId(''); setMediaFile(null)
      setShowCreate(false)
      toast.success(t('common.success'))
    } catch {
      toast.error(t('errors.serverError'))
    }
  }

  const connectedSessions = sessions?.filter((s: { status: string }) => s.status === 'CONNECTED') ?? []

  const lang = (i18n.language?.slice(0, 2) as 'en' | 'tr' | 'ar') || 'en'

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary font-display">{t('campaigns.title')}</h1>
        <button onClick={() => setShowCreate((p) => !p)}
          className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors">
          <Plus size={16} /> {t('campaigns.create')}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <h3 className="font-semibold text-text-primary font-display">{t('campaigns.create')}</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('campaigns.namePlaceholder')}
              className="rounded-xl border border-border bg-secondary px-4 py-2.5 text-sm text-text-primary focus:border-accent focus:outline-none" />
            <select value={listId} onChange={(e) => setListId(e.target.value)}
              className="rounded-xl border border-border bg-secondary px-4 py-2.5 text-sm text-text-primary focus:border-accent focus:outline-none">
              <option value="">{t('campaigns.selectList')}</option>
              {lists?.map((l: { id: string; name: string }) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <select value={sessionId} onChange={(e) => setSessionId(e.target.value)}
              className="rounded-xl border border-border bg-secondary px-4 py-2.5 text-sm text-text-primary focus:border-accent focus:outline-none">
              <option value="">{t('campaigns.selectSession')}</option>
              {connectedSessions.map((s: { sessionId: string; phoneNumber?: string }) => (
                <option key={s.sessionId} value={s.sessionId}>{s.sessionId} {s.phoneNumber ? `(${s.phoneNumber})` : ''}</option>
              ))}
            </select>
          </div>

          <textarea value={message} onChange={(e) => setMessage(e.target.value)}
            placeholder={t('campaigns.messagePlaceholder')} rows={4}
            className="w-full rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-text-primary resize-none focus:border-accent focus:outline-none" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <GrammarChecker text={message} lang={lang} onApply={setMessage} />
            <MediaUploadZone
              value={mediaFile}
              onUpload={setMediaFile}
              onRemove={() => setMediaFile(null)}
              label={t('campaigns.attachMedia')}
            />
          </div>

          <p className="text-xs text-text-muted">{t('campaigns.antiSpamNote')}</p>

          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowCreate(false)}
              className="rounded-xl border border-border px-4 py-2 text-sm text-text-muted hover:bg-secondary transition-colors">
              {t('common.cancel')}
            </button>
            <button onClick={handleCreate} disabled={createMutation.isPending}
              className="rounded-xl bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60 transition-colors">
              {createMutation.isPending ? t('common.loading') : t('common.create')}
            </button>
          </div>
        </motion.div>
      )}

      {/* Campaign list */}
      {isLoading ? (
        <div className="flex justify-center py-12"><div className="h-8 w-8 rounded-full border-2 border-accent/20 border-t-accent animate-spin" /></div>
      ) : !campaigns?.length ? (
        <EmptyState icon={<Megaphone size={32} />} title={t('campaigns.noCampaigns')} />
      ) : (
        <div className="space-y-4">
          {campaigns.map((c: Campaign) => {
            const progress = progressMap[c.id]
            const pct = progress
              ? progress.percent
              : c.totalCount > 0
                ? Math.round(((c.sentCount + c.failedCount) / c.totalCount) * 100)
                : 0

            return (
              <div key={c.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-start gap-4">
                  {(c.status === 'RUNNING' || c.status === 'PAUSED' || c.status === 'COMPLETED') && (
                    <ProgressRing percent={pct} size={80} stroke={6} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-text-primary">{c.name}</p>
                        <p className="text-xs text-text-muted mt-0.5">{c.list?.name}</p>
                        <p className="text-xs text-text-muted mt-1 line-clamp-1">{c.message}</p>
                      </div>
                      <StatusBadge variant={c.status.toLowerCase()} label={t(`campaigns.${c.status.toLowerCase()}`)} />
                    </div>

                    <div className="mt-3 flex items-center gap-3 flex-wrap">
                      <span className="text-xs text-text-muted">{t('campaigns.sent')}: <span className="text-green-400">{progress?.sentCount ?? c.sentCount}</span></span>
                      <span className="text-xs text-text-muted">{t('campaigns.errors')}: <span className="text-red-400">{progress?.failedCount ?? c.failedCount}</span></span>
                      <span className="text-xs text-text-muted">{t('campaigns.total')}: {c.totalCount}</span>
                    </div>

                    <div className="mt-3 flex gap-2">
                      {(c.status === 'DRAFT' || c.status === 'PAUSED') && (
                        <button onClick={async () => {
                          try {
                            c.status === 'PAUSED'
                              ? await resumeMutation.mutateAsync(c.id)
                              : await startMutation.mutateAsync(c.id)
                            setActiveId(c.id)
                            toast.success(t('common.success'))
                          } catch { toast.error(t('errors.serverError')) }
                        }} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-accent/15 text-accent hover:bg-accent/25 transition-colors">
                          <Play size={12} /> {c.status === 'PAUSED' ? t('campaigns.resume') : t('campaigns.start')}
                        </button>
                      )}
                      {c.status === 'RUNNING' && (
                        <button onClick={async () => {
                          try {
                            await pauseMutation.mutateAsync(c.id)
                            toast.success(t('common.success'))
                          } catch { toast.error(t('errors.serverError')) }
                        }} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 transition-colors">
                          <Pause size={12} /> {t('campaigns.pause')}
                        </button>
                      )}
                      {(c.status === 'DRAFT' || c.status === 'COMPLETED' || c.status === 'FAILED') && (
                        <button onClick={() => setDeleteId(c.id)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-secondary text-text-muted hover:bg-red-500/10 hover:text-red-400 transition-colors">
                          <Trash2 size={12} /> {t('common.delete')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ConfirmModal open={!!deleteId} danger
        title={t('common.delete')} description="Are you sure you want to delete this campaign?"
        onConfirm={async () => {
          if (!deleteId) return
          try { await deleteMutation.mutateAsync(deleteId); toast.success(t('common.success')) }
          catch { toast.error(t('errors.serverError')) }
          finally { setDeleteId(null) }
        }}
        onClose={() => setDeleteId(null)}
      />
    </div>
  )
}
