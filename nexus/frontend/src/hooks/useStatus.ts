import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import api from '../utils/apiClient'
import { useStatusStore } from '../stores/statusStore'
import { getStatusSocket } from '../utils/socketClient'

export function useStatusPosts() {
  return useQuery({
    queryKey: ['status', 'posts'],
    queryFn:  async () => {
      const res = await api.get('/status/posts')
      return res.data
    },
  })
}

export function useStatusSchedules() {
  return useQuery({
    queryKey: ['status', 'schedules'],
    queryFn:  async () => {
      const res = await api.get('/status/schedules')
      return res.data
    },
  })
}

export function useStatusSocket() {
  const addEvent = useStatusStore((s) => s.addEvent)
  const qc       = useQueryClient()

  useEffect(() => {
    const socket = getStatusSocket()
    socket.connect()

    socket.on('published', (data: { scheduleId: string; postId: string }) => {
      addEvent({ type: 'published', scheduleId: data.scheduleId, postId: data.postId })
      qc.invalidateQueries({ queryKey: ['status'] })
    })

    socket.on('failed', (data: { scheduleId: string; error: string }) => {
      addEvent({ type: 'failed', scheduleId: data.scheduleId, error: data.error })
    })

    return () => {
      socket.off('published')
      socket.off('failed')
    }
  }, [addEvent, qc])
}

export function useCreatePost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: { content: string; mediaUrl?: string; mediaType?: string }) => {
      const res = await api.post('/status/posts', data)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['status', 'posts'] }),
  })
}

export function useDeletePost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/status/posts/${id}`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['status', 'posts'] }),
  })
}

export function useCreateSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      postId: string; sessionId: string;
      frequency: 'ONCE' | 'DAILY' | 'WEEKLY' | 'CUSTOM_INTERVAL'
      scheduledAt: string; customIntervalMs?: number
    }) => {
      const res = await api.post('/status/schedules', data)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['status', 'schedules'] }),
  })
}

export function useToggleSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await api.patch(`/status/schedules/${id}/toggle`, { isActive })
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['status', 'schedules'] }),
  })
}

export function useDeleteSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/status/schedules/${id}`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['status', 'schedules'] }),
  })
}
