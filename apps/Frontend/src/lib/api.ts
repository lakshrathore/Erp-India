import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '../stores/auth.store'

// ─── Axios Instance ───────────────────────────────────────────────────────────

export const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

// ─── Get auth — tries Zustand store first, falls back to localStorage ─────────
// Zustand persist middleware is async on first load, so we fallback to localStorage
// to ensure company header is always sent correctly.

function getAuth() {
  // First try live Zustand state (in-memory, most up-to-date)
  const state = useAuthStore.getState()
  const token = state.accessToken
  const companyId = state.activeCompany?.companyId

  // If store is hydrated and has data, use it
  if (token && companyId) {
    return { accessToken: token, refreshToken: state.refreshToken, companyId }
  }

  // Fallback: read directly from localStorage (handles page refresh before hydration)
  try {
    const raw = localStorage.getItem('erp-auth')
    if (!raw) return { accessToken: token, refreshToken: state.refreshToken, companyId: companyId || null }
    const parsed = JSON.parse(raw)
    const s = parsed?.state
    return {
      accessToken: s?.accessToken || token || null,
      refreshToken: s?.refreshToken || state.refreshToken || null,
      companyId: s?.activeCompany?.companyId || companyId || null,
    }
  } catch {
    return { accessToken: token, refreshToken: state.refreshToken, companyId: companyId || null }
  }
}

// ─── Request Interceptor ──────────────────────────────────────────────────────

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const auth = getAuth()
  if (auth.accessToken) {
    config.headers.Authorization = `Bearer ${auth.accessToken}`
  }
  if (auth.companyId) {
    config.headers['x-company-id'] = auth.companyId
  }
  return config
})

// ─── Response Interceptor: auto-refresh ──────────────────────────────────────

let isRefreshing = false
let failedQueue: Array<{ resolve: (v: string) => void; reject: (e: unknown) => void }> = []

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token!)))
  failedQueue = []
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`
          return api(original)
        })
      }

      original._retry = true
      isRefreshing = true

      const auth = getAuth()
      if (!auth.refreshToken) {
        useAuthStore.getState().logout()
        window.location.href = '/login'
        return Promise.reject(error)
      }

      try {
        const { data } = await axios.post('/api/auth/refresh', {
          refreshToken: auth.refreshToken,
        })
        const { accessToken, refreshToken } = data.data
        useAuthStore.getState().updateTokens(accessToken, refreshToken)
        processQueue(null, accessToken)
        original.headers.Authorization = `Bearer ${accessToken}`
        return api(original)
      } catch (refreshError) {
        processQueue(refreshError, null)
        useAuthStore.getState().logout()
        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApiResponse<T> = {
  success: boolean
  message: string
  data: T
}

export type PaginatedResponse<T> = ApiResponse<T[]> & {
  pagination: { total: number; page: number; limit: number; totalPages: number }
}

export function extractError(error: unknown): string {
  if (error instanceof AxiosError) {
    return error.response?.data?.message || error.message
  }
  if (error instanceof Error) return error.message
  return 'An unexpected error occurred'
}

// ─── Legacy compat ────────────────────────────────────────────────────────────

export interface Session {
  accessToken: string; refreshToken: string; companyId?: string
  userId: string; userName: string; userEmail: string; isSuperAdmin: boolean
}
export function getSession(): Session | null {
  const auth = getAuth()
  if (!auth.accessToken) return null
  return { accessToken: auth.accessToken, refreshToken: auth.refreshToken || '', companyId: auth.companyId || undefined, userId: '', userName: '', userEmail: '', isSuperAdmin: false }
}
export function setSession(_s: Session) { /* no-op */ }
export function clearSession() { useAuthStore.getState().logout() }
export function setActiveCompany(_id: string) { /* no-op */ }
