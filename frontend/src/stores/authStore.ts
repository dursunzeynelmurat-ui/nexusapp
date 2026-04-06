import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AuthUser {
  id:    string
  email: string
  name:  string
  role:  string
}

interface AuthState {
  user:            AuthUser | null
  accessToken:     string | null
  isAuthenticated: boolean

  setAuth:  (user: AuthUser, accessToken: string, _refreshToken?: string) => void
  setToken: (accessToken: string) => void
  logout:   () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user:            null,
      accessToken:     null,
      isAuthenticated: false,

      setAuth: (user, accessToken) => {
        set({ user, accessToken, isAuthenticated: true })
      },

      setToken: (accessToken) => {
        set({ accessToken })
      },

      logout: () => {
        set({ user: null, accessToken: null, isAuthenticated: false })
      },
    }),
    {
      name: 'nexus-auth',
      partialize: (state) => ({
        user:            state.user,
        accessToken:     state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
