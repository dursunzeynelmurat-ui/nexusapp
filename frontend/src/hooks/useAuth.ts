import { useMutation } from '@tanstack/react-query'
import api from '../utils/apiClient'
import { useAuthStore } from '../stores/authStore'
import { disconnectAll } from '../utils/socketClient'

export function useLogin() {
  const setAuth = useAuthStore((s) => s.setAuth)

  return useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const res = await api.post('/auth/login', data)
      return res.data as { user: { id: string; email: string; name: string; role: string }; tokens: { accessToken: string; refreshToken: string } }
    },
    onSuccess: (data) => {
      setAuth(data.user, data.tokens.accessToken, data.tokens.refreshToken)
    },
  })
}

export function useRegister() {
  const setAuth = useAuthStore((s) => s.setAuth)

  return useMutation({
    mutationFn: async (data: { email: string; password: string; name: string }) => {
      const res = await api.post('/auth/register', data)
      return res.data as { user: { id: string; email: string; name: string; role: string }; tokens: { accessToken: string; refreshToken: string } }
    },
    onSuccess: (data) => {
      setAuth(data.user, data.tokens.accessToken, data.tokens.refreshToken)
    },
  })
}

export function useLogout() {
  const { logout, refreshToken } = useAuthStore()

  return useMutation({
    mutationFn: async () => {
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken }).catch(() => {})
      }
    },
    onSettled: () => {
      disconnectAll()
      logout()
    },
  })
}
