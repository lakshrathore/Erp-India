import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompanyInfo {
  companyId: string
  companyName: string
  gstin?: string
  logo?: string
  role: string
}

export interface UserInfo {
  id: string
  name: string
  email: string
  phone?: string
  isSuperAdmin: boolean
}

interface AuthState {
  user: UserInfo | null
  accessToken: string | null
  refreshToken: string | null
  companies: CompanyInfo[]
  activeCompany: CompanyInfo | null
  activeFY: string | null   // "2025-26"

  // Actions
  setAuth: (user: UserInfo, accessToken: string, refreshToken: string, companies: CompanyInfo[]) => void
  setActiveCompany: (company: CompanyInfo) => void
  setActiveFY: (fy: string) => void
  updateTokens: (accessToken: string, refreshToken: string) => void
  logout: () => void
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      companies: [],
      activeCompany: null,
      activeFY: null,

      setAuth: (user, accessToken, refreshToken, companies) =>
        set({ user, accessToken, refreshToken, companies }),

      setActiveCompany: (company) => set({ activeCompany: company }),

      setActiveFY: (fy) => set({ activeFY: fy }),

      updateTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),

      logout: () =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          companies: [],
          activeCompany: null,
          activeFY: null,
        }),
    }),
    {
      name: 'erp-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        companies: state.companies,
        activeCompany: state.activeCompany,
        activeFY: state.activeFY,
      }),
    }
  )
)

// ─── UI Store (sidebar, theme) ────────────────────────────────────────────────

interface UIState {
  sidebarOpen: boolean
  theme: 'light' | 'dark' | 'system'
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      theme: 'light',
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'erp-ui' }
  )
)
