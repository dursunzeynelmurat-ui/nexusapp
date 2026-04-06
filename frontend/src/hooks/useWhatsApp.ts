import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import api from '../utils/apiClient'
import { useWhatsAppStore } from '../stores/whatsappStore'
import { getWhatsAppSocket } from '../utils/socketClient'

export function useSessions() {
  const setSessions = useWhatsAppStore((s) => s.setSessions)

  const query = useQuery({
    queryKey: ['whatsapp', 'sessions'],
    queryFn:  async () => {
      const res = await api.get('/whatsapp/sessions')
      return res.data
    },
  })

  useEffect(() => {
    if (query.data) setSessions(query.data)
  }, [query.data, setSessions])

  return query
}

export function useWhatsAppSocket() {
  const { setQR, markConnected, markDisconnected } = useWhatsAppStore()
  const qc = useQueryClient()

  useEffect(() => {
    const socket = getWhatsAppSocket()

    const onQR          = (data: { sessionId: string; qr: string }) => setQR(data)
    const onReady       = (data: { sessionId: string; phoneNumber: string; displayName: string }) => {
      markConnected(data.sessionId, data.phoneNumber, data.displayName)
      qc.invalidateQueries({ queryKey: ['whatsapp', 'sessions'] })
    }
    const onDisconnected = (data: { sessionId: string }) => {
      markDisconnected(data.sessionId)
      qc.invalidateQueries({ queryKey: ['whatsapp', 'sessions'] })
    }

    // Attach listeners before connecting so no events are missed
    socket.on('qr',          onQR)
    socket.on('ready',       onReady)
    socket.on('disconnected', onDisconnected)

    // Always refresh token and reconnect
    socket.auth = { token: localStorage.getItem('accessToken') }
    if (!socket.connected) {
      socket.connect()
    }

    // If already connected, re-register is sufficient (listeners already attached above)

    return () => {
      socket.off('qr',          onQR)
      socket.off('ready',       onReady)
      socket.off('disconnected', onDisconnected)
    }
  }, [setQR, markConnected, markDisconnected, qc])
}

export function useInitSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await api.post('/whatsapp/init', { sessionId })
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whatsapp', 'sessions'] }),
  })
}

export function useDisconnectSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (sessionId: string) => {
      await api.post('/whatsapp/disconnect', { sessionId })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whatsapp', 'sessions'] }),
  })
}

export function useSyncContacts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await api.post('/whatsapp/sync-contacts', { sessionId })
      return res.data as { synced: number }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  })
}
