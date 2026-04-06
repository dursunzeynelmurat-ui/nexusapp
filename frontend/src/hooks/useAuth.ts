import { useMutation } from '@tanstack/react-query'
import api from '../utils/apiClient'
import { useAuthStore } from '../stores/authStore'
import { disconnectAll } from '../utils/socketClient'

type AuthUser = { id: string; email: string; name: string; role: string }
// Backend returns { accessToken, user } — refresh token is in httpOnly cookie
type AuthResponse = { accessToken: string; user: AuthUser }

export function useLogin() {
  const setAuth = useAuthStore((s) => s.setAuth)

  return useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const res = await api.post('/auth/login', data)
      return res.data as AuthResponse
    },
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken, '')
    },
  })
}

export function useRegister() {
  const setAuth = useAuthStore((s) => s.setAuth)

  return useMutation({
    mutationFn: async (data: { email: string; password: string; name: string }) => {
      const res = await api.post('/auth/register', data)
      return res.data as AuthResponse
    },
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken, '')
    },
  })
}

export function useLogout() {
  const logout = useAuthStore((s) => s.logout)

  return useMutation({
    mutationFn: async () => {
      // Cookie is sent automatically; backend clears it and revokes the token
      await api.post('/auth/logout').catch(() => {})
    },
    onSettled: () => {
      disconnectAll()
      logout()
    },
  })
}
