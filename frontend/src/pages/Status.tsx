import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Activity, Plus, Trash2, ToggleLeft, ToggleRight, Calendar } from 'lucide-react'
import {
  useStatusPosts, useStatusSchedules, useStatusSocket,
  useCreatePost, useDeletePost,
  useCreateSchedule, useToggleSchedule, useDeleteSchedule,
} from '../hooks/useStatus'
import { useSessions } from '../hooks/useWhatsApp'
import { MediaUploadZone } from '../components/MediaUploadZone'
import { EmptyState }      from '../components/EmptyState'
import { ConfirmModal }    from '../components/ConfirmModal'
import { StatusBadge }     from '../components/StatusBadge'
import { toast }           from '../components/Toast'

interface StoredFile { key: string; url: string; mimeType: string; size: number }

type Frequency = 'ONCE' | 'DAILY' | 'WEEKLY' | 'CUSTOM_INTERVAL'

export default function StatusPage() {
  const { t } = useTranslation()
  const [tab,            setTab]           = useState<'posts' | 'schedules'>('posts')
  const [showCreate,     setShowCreate]    = useState(false)
  const [showSchedule,   setShowSchedule]  = useState<string | null>(null)
  const [deletePostId,   setDeletePostId]  = useState<string | null>(null)
  const [deleteSchedId,  setDeleteSchedId] = useState<string | null>(null)
  const [content,        setContent]       = useState('')
  const [mediaFile,      setMediaFile]     = useState<StoredFile | null>(null)
  const [schedSessionId, setSchedSess]     = useState('')
  const [frequency,      setFrequency]     = useState<Frequency>('ONCE')
  const [scheduledAt,    setScheduledAt]   = useState('')
  const [intervalMs,     setIntervalMs]    = useState('')

  const { data: posts,     isLoading: postsLoading }    = useStatusPosts()
  const { data: schedules, isLoading: schedLoading }    = useStatusSchedules()
  const { data: sessions }                               = useSessions()

  useStatusSocket()

  const createPost     = useCreatePost()
  const deletePost     = useDeletePost()
  const createSchedule = useCreateSchedule()
  const toggleSchedule = useToggleSchedule()
  const deleteSchedule = useDeleteSchedule()

  const connectedSessions = sessions?.filter((s: { status: string }) => s.status === 'CONNECTED') ?? []

  const handleCreatePost = async () => {
    if (!content.trim()) return
    try {
      await createPost.mutateAsync({ content: content.trim(), mediaUrl: mediaFile?.url, mediaType: mediaFile?.mimeType })
      setContent(''); setMediaFile(null); setShowCreate(false)
      toast.success(t('common.success'))
    } catch { toast.error(t('errors.serverError')) }
  }

  const handleCreateSchedule = async (postId: string) => {
    if (!schedSessionId || !scheduledAt) { toast.error(t('errors.validationFailed')); return }
    try {
      await createSchedule.mutateAsync({
        postId, sessionId: schedSessionId, frequency, scheduledAt,
        customIntervalMs: frequency === 'CUSTOM_INTERVAL' ? parseInt(intervalMs) : undefined,
      })
      setShowSchedule(null); setSchedSess(''); setScheduledAt(''); setIntervalMs('')
      toast.success(t('common.success'))
    } catch { toast.error(t('errors.serverError')) }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary font-display">{t('status.title')}</h1>
        {tab === 'posts' && (
          <button onClick={() => setShowCreate((p) => !p)}
            className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors">
            <Plus size={16} /> {t('status.createPost')}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-secondary p-1 w-fit">
        {(['posts', 'schedules'] as const).map((tab_) => (
          <button key={tab_} onClick={() => setTab(tab_)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === tab_ ? 'bg-card text-text-primary shadow' : 'text-text-muted hover:text-text-primary'
            }`}>
            {t(`status.${tab_}`)}
          </button>
        ))}
      </div>

      {tab === 'posts' && (
        <>
          {showCreate && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-border bg-card p-6 space-y-4">
              <textarea value={content} onChange={(e) => setContent(e.target.value)}
                placeholder={t('status.contentPlaceholder')} rows={4}
                className="w-full rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-text-primary resize-none focus:border-accent focus:outline-none" />
              <MediaUploadZone value={mediaFile} onUpload={setMediaFile} onRemove={() => setMediaFile(null)} />
              <div className="flex gap-3 justify-end">
                <button onClick={() => setShowCreate(false)}
                  className="rounded-xl border border-border px-4 py-2 text-sm text-text-muted hover:bg-secondary">{t('common.cancel')}</button>
                <button onClick={handleCreatePost} disabled={createPost.isPending}
                  className="rounded-xl bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60">
                  {t('common.save')}
                </button>
              </div>
            </motion.div>
          )}

          {postsLoading ? (
            <div className="flex justify-center py-12"><div className="h-8 w-8 rounded-full border-2 border-accent/20 border-t-accent animate-spin" /></div>
          ) : !posts?.length ? (
            <EmptyState icon={<Activity size={32} />} title={t('status.noPosts')} />
          ) : (
            <div className="space-y-3">
              {posts.map((post: { id: string; content: string; mediaUrl?: string; createdAt: string; schedules: unknown[] }) => (
                <div key={post.id} className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary whitespace-pre-wrap">{post.content}</p>
                      {post.mediaUrl && <p className="mt-1 text-xs text-accent">{t('campaigns.attachMedia')}</p>}
                      <p className="mt-1 text-xs text-text-muted">{new Date(post.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => setShowSchedule(showSchedule === post.id ? null : post.id)}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors">
                        <Calendar size={12} /> {t('status.schedulePost')}
                      </button>
                      <button onClick={() => setDeletePostId(post.id)}
                        className="rounded-lg p-1.5 text-text-muted hover:bg-red-500/10 hover:text-red-400 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {showSchedule === post.id && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="mt-4 border-t border-border pt-4 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <select value={schedSessionId} onChange={(e) => setSchedSess(e.target.value)}
                          className="rounded-xl border border-border bg-secondary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none">
                          <option value="">{t('campaigns.selectSession')}</option>
                          {connectedSessions.map((s: { sessionId: string }) => (
                            <option key={s.sessionId} value={s.sessionId}>{s.sessionId}</option>
                          ))}
                        </select>
                        <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}
                          className="rounded-xl border border-border bg-secondary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none">
                          {(['ONCE', 'DAILY', 'WEEKLY', 'CUSTOM_INTERVAL'] as Frequency[]).map((f) => (
                            <option key={f} value={f}>{t(`status.${f.toLowerCase().replace('_interval', 'Interval').replace('custom_i', 'customI')}`)}</option>
                          ))}
                        </select>
                        <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)}
                          className="rounded-xl border border-border bg-secondary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none" />
                        {frequency === 'CUSTOM_INTERVAL' && (
                          <input type="number" value={intervalMs} onChange={(e) => setIntervalMs(e.target.value)}
                            placeholder={t('status.intervalMs')}
                            className="rounded-xl border border-border bg-secondary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none" />
                        )}
                      </div>
                      <button onClick={() => handleCreateSchedule(post.id)} disabled={createSchedule.isPending}
                        className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60 transition-colors">
                        {t('status.schedulePost')}
                      </button>
                    </motion.div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'schedules' && (
        <>
          {schedLoading ? (
            <div className="flex justify-center py-12"><div className="h-8 w-8 rounded-full border-2 border-accent/20 border-t-accent animate-spin" /></div>
          ) : !schedules?.length ? (
            <EmptyState icon={<Calendar size={32} />} title={t('status.noSchedules')} />
          ) : (
            <div className="space-y-3">
              {schedules.map((s: { id: string; frequency: string; isActive: boolean; nextRun: string; lastRun?: string; post: { content: string } }) => (
                <div key={s.id} className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm text-text-primary">{s.post.content}</p>
                      <div className="mt-1 flex items-center gap-3 flex-wrap">
                        <span className="text-xs text-text-muted">{s.frequency}</span>
                        <span className="text-xs text-text-muted">{t('status.nextRun')}: {new Date(s.nextRun).toLocaleString()}</span>
                        {s.lastRun && <span className="text-xs text-text-muted">{t('status.lastRun')}: {new Date(s.lastRun).toLocaleString()}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge variant={s.isActive ? 'active' : 'inactive'} label={s.isActive ? t('status.active') : t('status.inactive')} />
                      <button onClick={() => toggleSchedule.mutate({ id: s.id, isActive: !s.isActive })}
                        className="text-text-muted hover:text-accent transition-colors">
                        {s.isActive ? <ToggleRight size={20} className="text-accent" /> : <ToggleLeft size={20} />}
                      </button>
                      <button onClick={() => setDeleteSchedId(s.id)}
                        className="rounded-lg p-1.5 text-text-muted hover:bg-red-500/10 hover:text-red-400 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <ConfirmModal open={!!deletePostId} danger
        title={t('common.delete')} description="Delete this status post and all its schedules?"
        onConfirm={async () => { if (deletePostId) await deletePost.mutateAsync(deletePostId).catch(() => {}); setDeletePostId(null) }}
        onClose={() => setDeletePostId(null)}
      />
      <ConfirmModal open={!!deleteSchedId} danger
        title={t('common.delete')} description="Delete this schedule?"
        onConfirm={async () => { if (deleteSchedId) await deleteSchedule.mutateAsync(deleteSchedId).catch(() => {}); setDeleteSchedId(null) }}
        onClose={() => setDeleteSchedId(null)}
      />
    </div>
  )
}
