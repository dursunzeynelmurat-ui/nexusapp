import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import api from '../utils/apiClient'
import { useCampaignStore, type CampaignProgress } from '../stores/campaignStore'
import { getCampaignSocket } from '../utils/socketClient'

export function useCampaigns() {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn:  async () => {
      const res = await api.get('/campaigns')
      return res.data
    },
  })
}

export function useCampaignProgress(campaignId: string) {
  return useQuery({
    queryKey: ['campaigns', campaignId, 'progress'],
    queryFn:  async () => {
      const res = await api.get(`/campaigns/${campaignId}/progress`)
      return res.data
    },
    enabled: !!campaignId,
  })
}

export function useCampaignSocket(campaignId: string | null) {
  const setProgress = useCampaignStore((s) => s.setProgress)
  const qc          = useQueryClient()

  useEffect(() => {
    if (!campaignId) return

    const socket = getCampaignSocket()
    socket.connect()
    socket.emit('join', campaignId)

    socket.on('progress', (data: CampaignProgress) => setProgress(data))
    socket.on('complete', () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] })
      qc.invalidateQueries({ queryKey: ['campaigns', campaignId, 'progress'] })
    })

    return () => {
      socket.emit('leave', campaignId)
      socket.off('progress')
      socket.off('complete')
    }
  }, [campaignId, setProgress, qc])
}

export function useCreateCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: { listId: string; name: string; message: string; mediaUrl?: string; sessionId: string }) => {
      const res = await api.post('/campaigns', data)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  })
}

export function useStartCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/campaigns/${id}/start`)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  })
}

export function usePauseCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/campaigns/${id}/pause`)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  })
}

export function useResumeCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/campaigns/${id}/resume`)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  })
}

export function useDeleteCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/campaigns/${id}`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  })
}
