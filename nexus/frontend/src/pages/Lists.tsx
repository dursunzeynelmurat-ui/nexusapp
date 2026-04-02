import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { List as ListIcon, Plus, Trash2, Users, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import {
  useLists, useCreateList, useDeleteList, useList,
  useAddContactsToList, useRemoveContactFromList,
} from '../hooks/useLists'
import { useContacts } from '../hooks/useContacts'
import { EmptyState } from '../components/EmptyState'
import { ConfirmModal } from '../components/ConfirmModal'
import { toast } from '../components/Toast'

export default function ListsPage() {
  const { t } = useTranslation()
  const [showCreate, setShowCreate] = useState(false)
  const [newName,    setNewName]    = useState('')
  const [newDesc,    setNewDesc]    = useState('')
  const [deleteId,   setDeleteId]   = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [contactSearch, setContactSearch] = useState('')

  const { data: lists, isLoading } = useLists()
  const { data: expandedList }     = useList(expandedId ?? '')
  const { data: allContacts }      = useContacts({ search: contactSearch || undefined, limit: 100 })

  const createMutation = useCreateList()
  const deleteMutation = useDeleteList()
  const addMutation    = useAddContactsToList()
  const removeMutation = useRemoveContactFromList()

  const handleCreate = async () => {
    if (!newName.trim()) return
    try {
      await createMutation.mutateAsync({ name: newName.trim(), description: newDesc.trim() || undefined })
      setNewName('')
      setNewDesc('')
      setShowCreate(false)
      toast.success(t('common.success'))
    } catch {
      toast.error(t('errors.serverError'))
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteMutation.mutateAsync(deleteId)
      if (expandedId === deleteId) setExpandedId(null)
      toast.success(t('common.success'))
    } catch {
      toast.error(t('errors.serverError'))
    } finally {
      setDeleteId(null)
    }
  }

  const handleAddContact = async (listId: string, contactId: string) => {
    try {
      await addMutation.mutateAsync({ listId, contactIds: [contactId] })
    } catch {
      toast.error(t('errors.serverError'))
    }
  }

  const handleRemoveContact = async (listId: string, contactId: string) => {
    try {
      await removeMutation.mutateAsync({ listId, contactId })
    } catch {
      toast.error(t('errors.serverError'))
    }
  }

  const memberIds = new Set(expandedList?.contacts?.map((lc: { contact: { id: string } }) => lc.contact.id) ?? [])

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary font-display">{t('lists.title')}</h1>
        <button onClick={() => setShowCreate((p) => !p)}
          className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors">
          <Plus size={16} /> {t('lists.create')}
        </button>
      </div>

      {showCreate && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <div className="flex gap-3">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('lists.namePlaceholder')}
              className="flex-1 rounded-xl border border-border bg-secondary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none" />
            <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder={t('lists.descriptionPlaceholder')}
              className="flex-1 rounded-xl border border-border bg-secondary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none" />
            <button onClick={handleCreate} disabled={createMutation.isPending}
              className="rounded-xl bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60 transition-colors">
              {t('common.save')}
            </button>
          </div>
        </motion.div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="h-8 w-8 rounded-full border-2 border-accent/20 border-t-accent animate-spin" /></div>
      ) : !lists?.length ? (
        <EmptyState icon={<ListIcon size={32} />} title={t('lists.noLists')} />
      ) : (
        <div className="space-y-3">
          {lists.map((list: { id: string; name: string; description?: string; _count?: { contacts: number } }) => (
            <div key={list.id} className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-text-primary">{list.name}</p>
                  {list.description && <p className="text-xs text-text-muted">{list.description}</p>}
                  <p className="text-xs text-text-muted mt-0.5">{list._count?.contacts ?? 0} {t('lists.contacts')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setExpandedId(expandedId === list.id ? null : list.id)}
                    className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium bg-secondary text-text-muted hover:bg-card hover:text-accent transition-colors">
                    <Users size={12} /> {t('lists.members')}
                    <ChevronRight size={12} className={`transition-transform ${expandedId === list.id ? 'rotate-90' : ''}`} />
                  </button>
                  <button onClick={() => setDeleteId(list.id)}
                    className="rounded-lg p-1.5 text-text-muted hover:bg-red-500/10 hover:text-red-400 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {expandedId === list.id && (
                <div className="border-t border-border px-5 py-4 space-y-3">
                  <input value={contactSearch} onChange={(e) => setContactSearch(e.target.value)}
                    placeholder={t('lists.searchContacts')}
                    className="w-full rounded-xl border border-border bg-secondary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none" />
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {allContacts?.contacts?.map((c: { id: string; name: string; phone: string }) => {
                      const isMember = memberIds.has(c.id)
                      return (
                        <div key={c.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-secondary transition-colors">
                          <div className="flex-1 min-w-0">
                            <p className="truncate text-sm text-text-primary">{c.name}</p>
                            <p className="text-xs text-text-muted font-mono">{c.phone}</p>
                          </div>
                          <button
                            onClick={() => isMember
                              ? handleRemoveContact(list.id, c.id)
                              : handleAddContact(list.id, c.id)
                            }
                            className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                              isMember
                                ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                                : 'bg-accent/10 text-accent hover:bg-accent/20'
                            }`}
                          >
                            {isMember ? t('lists.removeContact') : t('lists.addContacts')}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={!!deleteId} danger
        title={t('common.delete')}
        description={t('lists.deleteConfirm')}
        onConfirm={handleDelete}
        onClose={() => setDeleteId(null)}
      />
    </div>
  )
}
