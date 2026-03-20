import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'

// ─── Axios Instance ───────────────────────────────────────────────────────────

export const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

// ─── Read from Zustand persisted store (erp-auth) ────────────────────────────

function getZustandAuth() {
  try {
    const raw = localStorage.getItem('erp-auth')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const state = parsed?.state
    return {
      accessToken: state?.accessToken || null,
      refreshToken: state?.refreshToken || null,
      companyId: state?.activeCompany?.companyId || null,
    }
  } catch {
    return null
  }
}

function updateZustandTokens(accessToken: string, refreshToken: string) {
  try {
    const raw = localStorage.getItem('erp-auth')
    if (!raw) return
    const parsed = JSON.parse(raw)
    parsed.state.accessToken = accessToken
    parsed.state.refreshToken = refreshToken
    localStorage.setItem('erp-auth', JSON.stringify(parsed))
  } catch { /* ignore */ }
}

function clearZustandAuth() {
  try {
    const raw = localStorage.getItem('erp-auth')
    if (!raw) return
    const parsed = JSON.parse(raw)
    parsed.state.accessToken = null
    parsed.state.refreshToken = null
    parsed.state.user = null
    parsed.state.companies = []
    parsed.state.activeCompany = null
    parsed.state.activeFY = null
    localStorage.setItem('erp-auth', JSON.stringify(parsed))
  } catch { /* ignore */ }
}

// ─── Request Interceptor ──────────────────────────────────────────────────────

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const auth = getZustandAuth()
  if (auth?.accessToken) {
    config.headers.Authorization = `Bearer ${auth.accessToken}`
  }
  if (auth?.companyId) {
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

      const auth = getZustandAuth()
      if (!auth?.refreshToken) {
        clearZustandAuth()
        window.location.href = '/login'
        return Promise.reject(error)
      }

      try {
        const { data } = await axios.post('/api/auth/refresh', {
          refreshToken: auth.refreshToken,
        })
        const { accessToken, refreshToken } = data.data
        updateZustandTokens(accessToken, refreshToken)
        processQueue(null, accessToken)
        original.headers.Authorization = `Bearer ${accessToken}`
        return api(original)
      } catch (refreshError) {
        processQueue(refreshError, null)
        clearZustandAuth()
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
  accessToken: string
  refreshToken: string
  companyId?: string
  userId: string
  userName: string
  userEmail: string
  isSuperAdmin: boolean
}

export function getSession(): Session | null {
  const auth = getZustandAuth()
  if (!auth?.accessToken) return null
  return { accessToken: auth.accessToken, refreshToken: auth.refreshToken || '', companyId: auth.companyId || undefined, userId: '', userName: '', userEmail: '', isSuperAdmin: false }
}
export function setSession(_s: Session) { /* no-op */ }
export function clearSession() { clearZustandAuth() }
export function setActiveCompany(_id: string) { /* no-op */ }
