import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiResponse, PaginatedResponse } from '../lib/api'
import { useAuthStore } from '../stores/auth.store'

// ═══════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════
export function useLogin() {
  const setAuth = useAuthStore(s => s.setAuth)
  return useMutation({
    mutationFn: async (creds: { email: string; password: string }) => {
      const { data } = await api.post<ApiResponse<any>>('/auth/login', creds)
      return data.data
    },
    onSuccess: d => setAuth(d.user, d.accessToken, d.refreshToken, d.companies),
  })
}

export function useLogout() {
  const logout = useAuthStore(s => s.logout)
  return useMutation({
    mutationFn: async () => {
      const store = useAuthStore.getState()
      await api.post('/auth/logout', { refreshToken: store.refreshToken })
    },
    onSettled: () => logout(),
  })
}

export function useMe() {
  const token = useAuthStore(s => s.accessToken)
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => { const { data } = await api.get<ApiResponse<any>>('/auth/me'); return data.data },
    enabled: !!token,
    staleTime: 5 * 60_000,
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (payload: { currentPassword: string; newPassword: string }) => {
      const { data } = await api.put<ApiResponse<any>>('/auth/change-password', payload)
      return data.data
    },
  })
}

// ═══════════════════════════════════════════════════════════════
// COMPANY
// ═══════════════════════════════════════════════════════════════
export function useCompanies() {
  return useQuery({ queryKey: ['companies'], queryFn: async () => { const { data } = await api.get<ApiResponse<any[]>>('/companies'); return data.data } })
}

export function useCompany(id: string) {
  return useQuery({ queryKey: ['company', id], queryFn: async () => { const { data } = await api.get<ApiResponse<any>>(`/companies/${id}`); return data.data }, enabled: !!id })
}

export function useCreateCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: any) => { const { data } = await api.post<ApiResponse<any>>('/companies', payload); return data.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['companies'] }),
  })
}

export function useUpdateCompany(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: any) => { const { data } = await api.put<ApiResponse<any>>(`/companies/${id}`, payload); return data.data },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['companies'] }); qc.invalidateQueries({ queryKey: ['company', id] }) },
  })
}

export function useFinancialYears(companyId: string) {
  return useQuery({ queryKey: ['financial-years', companyId], queryFn: async () => { const { data } = await api.get<ApiResponse<any[]>>(`/companies/${companyId}/financial-years`); return data.data }, enabled: !!companyId })
}

export function useBranches(companyId: string) {
  return useQuery({ queryKey: ['branches', companyId], queryFn: async () => { const { data } = await api.get<ApiResponse<any[]>>(`/companies/${companyId}/branches`); return data.data }, enabled: !!companyId })
}

export function useCreateBranch(companyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: any) => { const { data } = await api.post<ApiResponse<any>>(`/companies/${companyId}/branches`, payload); return data.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['branches', companyId] }),
  })
}

export function useCompanyUsers(companyId: string) {
  return useQuery({ queryKey: ['company-users', companyId], queryFn: async () => { const { data } = await api.get<ApiResponse<any[]>>(`/companies/${companyId}/users`); return data.data }, enabled: !!companyId })
}

// ═══════════════════════════════════════════════════════════════
// PARTIES
// ═══════════════════════════════════════════════════════════════
export function useParties(params?: Record<string, any>) {
  return useQuery({ queryKey: ['parties', params], queryFn: async () => { const { data } = await api.get<PaginatedResponse<any>>('/masters/parties', { params }); return data } })
}

export function useParty(id: string) {
  return useQuery({ queryKey: ['party', id], queryFn: async () => { const { data } = await api.get<ApiResponse<any>>(`/masters/parties/${id}`); return data.data }, enabled: !!id && id !== 'new' })
}

export function useCreateParty() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: any) => { const { data } = await api.post<ApiResponse<any>>('/masters/parties', payload); return data.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parties'] }),
  })
}

export function useUpdateParty(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: any) => { const { data } = await api.put<ApiResponse<any>>(`/masters/parties/${id}`, payload); return data.data },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['parties'] }); qc.invalidateQueries({ queryKey: ['party', id] }) },
  })
}

// ═══════════════════════════════════════════════════════════════
// ITEMS
// ═══════════════════════════════════════════════════════════════
export function useItems(params?: Record<string, any>) {
  return useQuery({ queryKey: ['items', params], queryFn: async () => { const { data } = await api.get<PaginatedResponse<any>>('/masters/items', { params }); return data } })
}

export function useItem(id: string) {
  return useQuery({ queryKey: ['item', id], queryFn: async () => { const { data } = await api.get<ApiResponse<any>>(`/masters/items/${id}`); return data.data }, enabled: !!id && id !== 'new' })
}

export function useCreateItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: any) => { const { data } = await api.post<ApiResponse<any>>('/masters/items', payload); return data.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  })
}

export function useUpdateItem(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: any) => { const { data } = await api.put<ApiResponse<any>>(`/masters/items/${id}`, payload); return data.data },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['items'] }); qc.invalidateQueries({ queryKey: ['item', id] }) },
  })
}

// ═══════════════════════════════════════════════════════════════
// ITEM CATEGORIES
// ═══════════════════════════════════════════════════════════════
export function useItemCategories() {
  return useQuery({ queryKey: ['item-categories'], queryFn: async () => { const { data } = await api.get<ApiResponse<any[]>>('/masters/item-categories'); return data.data } })
}

export function useCreateItemCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: any) => { const { data } = await api.post<ApiResponse<any>>('/masters/item-categories', payload); return data.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['item-categories'] }),
  })
}

export function useUpdateItemCategory(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: any) => { const { data } = await api.put<ApiResponse<any>>(`/masters/item-categories/${id}`, payload); return data.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['item-categories'] }),
  })
}

// ═══════════════════════════════════════════════════════════════
// LEDGERS
// ═══════════════════════════════════════════════════════════════
export function useLedgerGroups() {
  return useQuery({ queryKey: ['ledger-groups'], queryFn: async () => { const { data } = await api.get<ApiResponse<any[]>>('/masters/ledger-groups'); return data.data } })
}

export function useLedgers(params?: Record<string, any>) {
  return useQuery({ queryKey: ['ledgers', params], queryFn: async () => { const { data } = await api.get<ApiResponse<any[]>>('/masters/ledgers', { params }); return data.data } })
}

export function useCreateLedger() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: any) => { const { data } = await api.post<ApiResponse<any>>('/masters/ledgers', payload); return data.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ledgers'] }),
  })
}

export function useUpdateLedger(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: any) => { const { data } = await api.put<ApiResponse<any>>(`/masters/ledgers/${id}`, payload); return data.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ledgers'] }),
  })
}

// ═══════════════════════════════════════════════════════════════
// TAX / GODOWNS / NUMBER SERIES
// ═══════════════════════════════════════════════════════════════
export function useTaxMasters() {
  return useQuery({ queryKey: ['tax-masters'], queryFn: async () => { const { data } = await api.get<ApiResponse<any[]>>('/masters/tax-masters'); return data.data } })
}

export function useGodowns() {
  return useQuery({ queryKey: ['godowns'], queryFn: async () => { const { data } = await api.get<ApiResponse<any[]>>('/masters/godowns'); return data.data } })
}

export function useCreateGodown() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: any) => { const { data } = await api.post<ApiResponse<any>>('/masters/godowns', payload); return data.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['godowns'] }),
  })
}

export function useNumberSeries() {
  return useQuery({ queryKey: ['number-series'], queryFn: async () => { const { data } = await api.get<ApiResponse<any[]>>('/masters/number-series'); return data.data } })
}

export function useUpdateNumberSeries(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: any) => { const { data } = await api.put<ApiResponse<any>>(`/masters/number-series/${id}`, payload); return data.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['number-series'] }),
  })
}

// ═══════════════════════════════════════════════════════════════
// VOUCHERS
// ═══════════════════════════════════════════════════════════════
export function useVouchers(params?: Record<string, any>) {
  return useQuery({ queryKey: ['vouchers', params], queryFn: async () => { const { data } = await api.get<PaginatedResponse<any>>('/billing/vouchers', { params }); return data } })
}

export function useVoucher(id: string) {
  return useQuery({ queryKey: ['voucher', id], queryFn: async () => { const { data } = await api.get<ApiResponse<any>>(`/billing/vouchers/${id}`); return data.data }, enabled: !!id && id !== 'new' })
}

export function useCreateVoucher() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: any) => { const { data } = await api.post<ApiResponse<any>>('/billing/vouchers', payload); return data.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vouchers'] }),
  })
}

export function useUpdateVoucher(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: any) => { const { data } = await api.put<ApiResponse<any>>(`/billing/vouchers/${id}`, payload); return data.data },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vouchers'] }); qc.invalidateQueries({ queryKey: ['voucher', id] }) },
  })
}

export function usePostVoucher(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => { await api.post(`/billing/vouchers/${id}/post`) },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vouchers'] }); qc.invalidateQueries({ queryKey: ['voucher', id] }) },
  })
}

export function useCancelVoucher(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (reason: string) => { await api.post(`/billing/vouchers/${id}/cancel`, { reason }) },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vouchers'] }); qc.invalidateQueries({ queryKey: ['voucher', id] }) },
  })
}

export function useOutstanding(params?: Record<string, any>) {
  return useQuery({ queryKey: ['outstanding', params], queryFn: async () => { const { data } = await api.get<ApiResponse<any>>('/billing/outstanding', { params }); return data.data } })
}

// ═══════════════════════════════════════════════════════════════
// INVENTORY
// ═══════════════════════════════════════════════════════════════
export function useStockSummary(params?: Record<string, any>) {
  return useQuery({ queryKey: ['stock-summary', params], queryFn: async () => { const { data } = await api.get<ApiResponse<any[]>>('/inventory/stock', { params }); return data.data } })
}

export function useItemLedger(itemId: string, from: string, to: string) {
  return useQuery({ queryKey: ['item-ledger', itemId, from, to], queryFn: async () => { const { data } = await api.get<ApiResponse<any[]>>(`/inventory/item-ledger/${itemId}`, { params: { from, to } }); return data.data }, enabled: !!itemId })
}

export function useInventoryProfit(from: string, to: string) {
  return useQuery({ queryKey: ['inventory-profit', from, to], queryFn: async () => { const { data } = await api.get<ApiResponse<any[]>>('/inventory/profit', { params: { from, to } }); return data.data } })
}

// ═══════════════════════════════════════════════════════════════
// PAYROLL
// ═══════════════════════════════════════════════════════════════
export function useEmployees(params?: Record<string, any>) {
  return useQuery({ queryKey: ['employees', params], queryFn: async () => { const { data } = await api.get<PaginatedResponse<any>>('/payroll/employees', { params }); return data } })
}

export function useEmployee(id: string) {
  return useQuery({ queryKey: ['employee', id], queryFn: async () => { const { data } = await api.get<ApiResponse<any>>(`/payroll/employees/${id}`); return data.data }, enabled: !!id && id !== 'new' })
}

export function useCreateEmployee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: any) => { const { data } = await api.post<ApiResponse<any>>('/payroll/employees', payload); return data.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  })
}

export function useUpdateEmployee(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: any) => { const { data } = await api.put<ApiResponse<any>>(`/payroll/employees/${id}`, payload); return data.data },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }); qc.invalidateQueries({ queryKey: ['employee', id] }) },
  })
}

export function useDepartments() {
  return useQuery({ queryKey: ['departments'], queryFn: async () => { const { data } = await api.get<ApiResponse<any[]>>('/payroll/departments'); return data.data } })
}

export function useDesignations() {
  return useQuery({ queryKey: ['designations'], queryFn: async () => { const { data } = await api.get<ApiResponse<any[]>>('/payroll/designations'); return data.data } })
}

export function useSalaryStructures() {
  return useQuery({ queryKey: ['salary-structures'], queryFn: async () => { const { data } = await api.get<ApiResponse<any[]>>('/payroll/salary-structures'); return data.data } })
}

export function useCreateSalaryStructure() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: any) => { const { data } = await api.post<ApiResponse<any>>('/payroll/salary-structures', payload); return data.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['salary-structures'] }),
  })
}

export function useAttendance(month: number, year: number) {
  return useQuery({ queryKey: ['attendance', month, year], queryFn: async () => { const { data } = await api.get<ApiResponse<any[]>>('/payroll/attendance', { params: { month, year } }); return data.data } })
}

export function useBulkAttendance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (records: any[]) => { await api.post('/payroll/attendance/bulk', { records }) },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
  })
}

export function useLeaveApplications(params?: Record<string, any>) {
  return useQuery({ queryKey: ['leave-applications', params], queryFn: async () => { const { data } = await api.get<ApiResponse<any[]>>('/payroll/leave-applications', { params }); return data.data } })
}

export function useApplyLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: any) => { const { data } = await api.post<ApiResponse<any>>('/payroll/leave-applications', payload); return data.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave-applications'] }),
  })
}

export function useUpdateLeave(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: any) => { const { data } = await api.put<ApiResponse<any>>(`/payroll/leave-applications/${id}`, payload); return data.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave-applications'] }),
  })
}

export function useProcessPayroll() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { month: number; year: number; employeeIds?: string[] }) => {
      const { data } = await api.post<ApiResponse<any>>('/payroll/process', payload); return data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['paysheet'] }),
  })
}

export function usePaysheet(month: number, year: number) {
  return useQuery({ queryKey: ['paysheet', month, year], queryFn: async () => { const { data } = await api.get<ApiResponse<any>>(`/payroll/paysheet/${month}/${year}`); return data.data } })
}

export function usePayslip(empId: string, month: number, year: number) {
  return useQuery({ queryKey: ['payslip', empId, month, year], queryFn: async () => { const { data } = await api.get<ApiResponse<any>>(`/payroll/payslip/${empId}/${month}/${year}`); return data.data }, enabled: !!empId })
}

export function usePFECR(month: number, year: number) {
  return useQuery({ queryKey: ['pf-ecr', month, year], queryFn: async () => { const { data } = await api.get<ApiResponse<any>>(`/payroll/pf-ecr/${month}/${year}`); return data.data } })
}
