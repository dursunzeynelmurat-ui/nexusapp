import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Users, Trash2, Plus, Search } from 'lucide-react'
import { useContacts, useDeleteContact, useCreateContact } from '../hooks/useContacts'
import { EmptyState } from '../components/EmptyState'
import { ConfirmModal } from '../components/ConfirmModal'
import { toast } from '../components/Toast'

export default function ContactsPage() {
  const { t } = useTranslation()
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState<'all' | 'group' | 'individual'>('all')
  const [page,   setPage]     = useState(1)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newPhone, setNewPhone] = useState('')
  const [newName,  setNewName]  = useState('')

  const isGroup = filter === 'group' ? true : filter === 'individual' ? false : undefined

  const { data, isLoading } = useContacts({ search: search || undefined, isGroup, page, limit: 50 })
  const deleteMutation = useDeleteContact()
  const createMutation = useCreateContact()

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteMutation.mutateAsync(deleteId)
      toast.success(t('common.success'))
    } catch {
      toast.error(t('errors.serverError'))
    } finally {
      setDeleteId(null)
    }
  }

  const handleCreate = async () => {
    if (!newPhone.trim() || !newName.trim()) return
    try {
      await createMutation.mutateAsync({ phone: newPhone.trim(), name: newName.trim() })
      setNewPhone('')
      setNewName('')
      setShowAdd(false)
      toast.success(t('common.success'))
    } catch {
      toast.error(t('errors.serverError'))
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary font-display">{t('contacts.title')}</h1>
        <button
          onClick={() => setShowAdd((p) => !p)}
          className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
        >
          <Plus size={16} /> {t('contacts.add')}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <div className="flex gap-3">
            <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder={t('contacts.phonePlaceholder')}
              className="flex-1 rounded-xl border border-border bg-secondary px-4 py-2 text-sm text-text-primary placeholder-text-muted/50 focus:border-accent focus:outline-none" />
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('common.name')}
              className="flex-1 rounded-xl border border-border bg-secondary px-4 py-2 text-sm text-text-primary placeholder-text-muted/50 focus:border-accent focus:outline-none" />
            <button onClick={handleCreate} disabled={createMutation.isPending}
              className="rounded-xl bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60 transition-colors">
              {t('common.save')}
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder={t('common.search')}
            className="rounded-xl border border-border bg-secondary pl-9 pr-4 py-2 text-sm text-text-primary placeholder-text-muted/50 focus:border-accent focus:outline-none w-64"
          />
        </div>
        {(['all', 'individual', 'group'] as const).map((f) => (
          <button key={f} onClick={() => { setFilter(f); setPage(1) }}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${filter === f ? 'bg-accent text-white' : 'bg-secondary text-text-muted hover:bg-card'}`}>
            {t(`contacts.${f === 'individual' ? 'individuals' : f === 'group' ? 'groups' : 'all'}`)}
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12"><div className="h-8 w-8 rounded-full border-2 border-accent/20 border-t-accent animate-spin" /></div>
      ) : !data?.contacts?.length ? (
        <EmptyState icon={<Users size={32} />} title={t('contacts.noContacts')} />
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="px-6 py-3 text-left font-medium">{t('common.name')}</th>
                <th className="px-6 py-3 text-left font-medium">{t('contacts.phone')}</th>
                <th className="px-6 py-3 text-left font-medium">{t('common.status')}</th>
                <th className="px-6 py-3 text-right font-medium">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.contacts.map((c: { id: string; name: string; phone: string; isGroup: boolean }) => (
                <tr key={c.id} className="hover:bg-secondary/50 transition-colors">
                  <td className="px-6 py-3 text-text-primary font-medium">{c.name}</td>
                  <td className="px-6 py-3 text-text-muted font-mono">{c.phone}</td>
                  <td className="px-6 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${c.isGroup ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'}`}>
                      {c.isGroup ? t('contacts.groups') : t('contacts.individuals')}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button onClick={() => setDeleteId(c.id)} className="rounded-lg p-1.5 text-text-muted hover:bg-red-500/10 hover:text-red-400 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {data.total > 50 && (
            <div className="border-t border-border px-6 py-3 flex items-center justify-between">
              <p className="text-xs text-text-muted">{data.total} total</p>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  className="rounded-lg px-3 py-1 text-xs font-medium bg-secondary text-text-muted hover:bg-card disabled:opacity-40">Prev</button>
                <button onClick={() => setPage((p) => p + 1)} disabled={page * 50 >= data.total}
                  className="rounded-lg px-3 py-1 text-xs font-medium bg-secondary text-text-muted hover:bg-card disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        open={!!deleteId}
        title={t('common.delete')}
        description={t('contacts.deleteConfirm')}
        danger
        onConfirm={handleDelete}
        onClose={() => setDeleteId(null)}
      />
    </div>
  )
}
