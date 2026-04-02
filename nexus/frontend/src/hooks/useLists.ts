import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../utils/apiClient'

export function useLists() {
  return useQuery({
    queryKey: ['lists'],
    queryFn:  async () => {
      const res = await api.get('/lists')
      return res.data
    },
  })
}

export function useList(id: string) {
  return useQuery({
    queryKey: ['lists', id],
    queryFn:  async () => {
      const res = await api.get(`/lists/${id}`)
      return res.data
    },
    enabled: !!id,
  })
}

export function useCreateList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const res = await api.post('/lists', data)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lists'] }),
  })
}

export function useUpdateList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; description?: string }) => {
      const res = await api.patch(`/lists/${id}`, data)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lists'] }),
  })
}

export function useDeleteList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/lists/${id}`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lists'] }),
  })
}

export function useAddContactsToList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ listId, contactIds }: { listId: string; contactIds: string[] }) => {
      const res = await api.post(`/lists/${listId}/contacts`, { contactIds })
      return res.data
    },
    onSuccess: (_data, { listId }) => {
      qc.invalidateQueries({ queryKey: ['lists', listId] })
      qc.invalidateQueries({ queryKey: ['lists'] })
    },
  })
}

export function useRemoveContactFromList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ listId, contactId }: { listId: string; contactId: string }) => {
      await api.delete(`/lists/${listId}/contacts/${contactId}`)
    },
    onSuccess: (_data, { listId }) => {
      qc.invalidateQueries({ queryKey: ['lists', listId] })
    },
  })
}
