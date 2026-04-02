import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../utils/apiClient'

export function useContacts(params?: { search?: string; isGroup?: boolean; page?: number; limit?: number }) {
  return useQuery({
    queryKey: ['contacts', params],
    queryFn:  async () => {
      const res = await api.get('/contacts', { params })
      return res.data as { contacts: { id: string; phone: string; name: string; isGroup: boolean }[]; total: number; page: number; limit: number }
    },
  })
}

export function useCreateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: { phone: string; name: string; isGroup?: boolean }) => {
      const res = await api.post('/contacts', data)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  })
}

export function useDeleteContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/contacts/${id}`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  })
}
