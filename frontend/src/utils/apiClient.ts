import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'

const BASE_URL = '/api'

const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

// Attach access token from Zustand-persisted storage to every request
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  try {
    const stored = localStorage.getItem('nexus-auth')
    if (stored) {
      const parsed = JSON.parse(stored) as { state?: { accessToken?: string } }
      const token = parsed?.state?.accessToken
      if (token) config.headers.Authorization = `Bearer ${token}`
    }
  } catch {
    // ignore parse errors
  }
  return config
})

// Auto-refresh on 401 — refresh token is in httpOnly cookie, sent automatically
let isRefreshing = false
let failedQueue: { resolve: (token: string) => void; reject: (err: unknown) => void }[] = []

function processQueue(error: unknown, token: string | null): void {
  for (const prom of failedQueue) {
    if (error) prom.reject(error)
    else       prom.resolve(token!)
  }
  failedQueue = []
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`
            return api(originalRequest)
          })
          .catch((err) => Promise.reject(err))
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        // Cookie is sent automatically (withCredentials: true)
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true })
        // Update persisted store with new access token
        try {
          const stored = localStorage.getItem('nexus-auth')
          if (stored) {
            const parsed = JSON.parse(stored) as { state?: object }
            parsed.state = { ...(parsed.state ?? {}), accessToken: data.accessToken }
            localStorage.setItem('nexus-auth', JSON.stringify(parsed))
          }
        } catch { /* ignore */ }
        api.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`
        processQueue(null, data.accessToken)
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`
        return api(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        localStorage.removeItem('nexus-auth')
        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

export default api
