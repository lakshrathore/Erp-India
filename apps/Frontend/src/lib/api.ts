import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '../stores/auth.store'

export const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

// Read ALWAYS from localStorage first - it's synchronous and always accurate
// Zustand in-memory state may not be hydrated on first render
function getAuth() {
  try {
    const raw = localStorage.getItem('erp-auth')
    if (raw) {
      const s = JSON.parse(raw)?.state
      if (s?.accessToken && s?.activeCompany?.companyId) {
        return {
          accessToken: s.accessToken,
          refreshToken: s.refreshToken || null,
          companyId: s.activeCompany.companyId,
        }
      }
    }
  } catch {}
  // Fallback to in-memory store
  const state = useAuthStore.getState()
  return {
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
    companyId: state.activeCompany?.companyId || null,
  }
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const auth = getAuth()
  if (auth.accessToken) config.headers.Authorization = `Bearer ${auth.accessToken}`
  if (auth.companyId) config.headers['x-company-id'] = auth.companyId
  return config
})

let isRefreshing = false
let failedQueue: Array<{ resolve: (v: string) => void; reject: (e: unknown) => void }> = []

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(p => error ? p.reject(error) : p.resolve(token!))
  failedQueue = []
}

api.interceptors.response.use(
  res => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean }
    if (error.response?.status === 401 && !original._retry) {
      // Already retried once — don't retry again, just logout
      if (original._retry) {
        useAuthStore.getState().logout()
        window.location.href = '/login'
        return Promise.reject(error)
      }

      // If a refresh is already in progress, queue this request
      if (isRefreshing) {
        return new Promise((resolve, reject) => { failedQueue.push({ resolve, reject }) })
          .then(token => {
            original.headers.Authorization = `Bearer ${token}`
            original._retry = true
            return api(original)
          })
          .catch(err => Promise.reject(err))
      }

      original._retry = true
      isRefreshing = true

      const auth = getAuth()
      if (!auth.refreshToken) {
        isRefreshing = false
        useAuthStore.getState().logout()
        window.location.href = '/login'
        return Promise.reject(error)
      }

      try {
        const { data } = await axios.post('/api/auth/refresh', { refreshToken: auth.refreshToken })
        const { accessToken, refreshToken } = data.data
        // Update store AND localStorage immediately
        useAuthStore.getState().updateTokens(accessToken, refreshToken)
        // Process all queued requests with new token
        processQueue(null, accessToken)
        original.headers.Authorization = `Bearer ${accessToken}`
        return api(original)
      } catch (e) {
        processQueue(e, null)
        useAuthStore.getState().logout()
        localStorage.removeItem('erp-auth')
        window.location.href = '/login'
        return Promise.reject(e)
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(error)
  }
)

export type ApiResponse<T> = { success: boolean; message: string; data: T }
export type PaginatedResponse<T> = ApiResponse<T[]> & {
  pagination: { total: number; page: number; limit: number; totalPages: number }
}
export function extractError(error: unknown): string {
  if (error instanceof AxiosError) return error.response?.data?.message || error.message
  if (error instanceof Error) return error.message
  return 'An unexpected error occurred'
}
export interface Session { accessToken: string; refreshToken: string; companyId?: string; userId: string; userName: string; userEmail: string; isSuperAdmin: boolean }
export function getSession(): Session | null { const a = getAuth(); if (!a.accessToken) return null; return { accessToken: a.accessToken, refreshToken: a.refreshToken || '', companyId: a.companyId || undefined, userId: '', userName: '', userEmail: '', isSuperAdmin: false } }
export function setSession(_s: Session) {}
export function clearSession() { useAuthStore.getState().logout() }
export function setActiveCompany(_id: string) {}
