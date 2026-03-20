import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import {
  Building2, Plus, ArrowRight, CheckCircle2,
  LogOut, Edit, RefreshCw
} from 'lucide-react'
import { useAuthStore } from '../../stores/auth.store'
import { useCompanies } from '../../hooks/api.hooks'
import { Button, Badge, Spinner } from '../../components/ui'
import { cn } from '../../components/ui/utils'
import { api } from '../../lib/api'

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin', COMPANY_ADMIN: 'Admin', MANAGER: 'Manager',
  ACCOUNTANT: 'Accountant', BILLING_OPERATOR: 'Billing',
  INVENTORY_OPERATOR: 'Inventory', PAYROLL_OPERATOR: 'Payroll', VIEWER: 'Viewer',
}

const GST_LABELS: Record<string, { label: string; variant: any }> = {
  REGULAR: { label: 'Regular', variant: 'info' },
  COMPOSITION: { label: 'Composition', variant: 'warning' },
  UNREGISTERED: { label: 'Unregistered', variant: 'secondary' },
  SEZ: { label: 'SEZ', variant: 'default' },
  DEEMED_EXPORT: { label: 'Deemed Export', variant: 'default' },
  EXPORT: { label: 'Export', variant: 'default' },
}

export default function SelectCompanyPage() {
  const { user, activeCompany, setActiveCompany, setActiveFY, logout } = useAuthStore()
  const navigate = useNavigate()
  const { data: companies, isLoading, refetch } = useCompanies()
  const [selecting, setSelecting] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  if (!user) return <Navigate to="/login" replace />

  // Switch to company and go to dashboard
  const handleSelect = async (co: any) => {
    if (selecting) return
    const companyName = co.companyName || co.name || ''
    setSelecting(co.companyId)
    try {
      const { data } = await api.get(`/companies/${co.companyId}/financial-years`, {
        headers: { 'x-company-id': co.companyId },
      })
      const activeFY = data.data?.find((fy: any) => fy.isActive)?.name || null
      setActiveCompany({ companyId: co.companyId, companyName, gstin: co.gstin, logo: co.logo, role: co.role })
      setActiveFY(activeFY)
      navigate('/dashboard')
    } catch {
      setSelecting(null)
    }
  }

  // Switch to company and go to settings/edit
  const handleEdit = async (e: React.MouseEvent, co: any) => {
    e.stopPropagation()
    const companyName = co.companyName || co.name || ''
    setActiveCompany({ companyId: co.companyId, companyName, gstin: co.gstin, logo: co.logo, role: co.role })
    try {
      const { data } = await api.get(`/companies/${co.companyId}/financial-years`, {
        headers: { 'x-company-id': co.companyId },
      })
      const activeFY = data.data?.find((fy: any) => fy.isActive)?.name || null
      setActiveFY(activeFY)
    } catch {}
    navigate('/settings/company')
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg animate-fade-in">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mx-auto mb-3">
            <Building2 className="text-white" size={22} />
          </div>
          <h1 className="text-xl font-display font-semibold">Select Company</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Hello, {user.name} — choose a firm to open
          </p>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : !companies || (companies as any[]).length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <Building2 size={36} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">No company created yet.</p>
            <Button onClick={() => navigate('/companies/create')}>
              <Plus size={15} /> Create First Company
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {(companies as any[]).map((co: any) => {
              const displayName = co.companyName || co.name || 'Unknown'
              const isCurrentlyActive = activeCompany?.companyId === co.companyId
              const isSelecting = selecting === co.companyId
              const isAdmin = ['SUPER_ADMIN', 'COMPANY_ADMIN'].includes(co.role)
              const gst = GST_LABELS[co.gstRegType] || GST_LABELS['REGULAR']

              return (
                <div
                  key={co.companyId}
                  className={cn(
                    'relative bg-card border rounded-xl transition-all',
                    isCurrentlyActive ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/30',
                    !co.isActive && 'opacity-50',
                  )}
                  onMouseEnter={() => setHoveredId(co.companyId)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  {/* Clickable row */}
                  <button
                    onClick={() => co.isActive && handleSelect(co)}
                    disabled={!co.isActive || !!selecting}
                    className="w-full text-left p-4 flex items-center gap-3"
                  >
                    {/* Avatar / Logo */}
                    <div className={cn(
                      'w-11 h-11 rounded-lg flex items-center justify-center shrink-0 font-bold text-lg overflow-hidden',
                      isCurrentlyActive ? 'bg-primary text-white' : 'bg-primary/10 text-primary'
                    )}>
                      {co.logo ? (
                        <img
                          src={co.logo.startsWith('http') || co.logo.startsWith('data')
                            ? co.logo : `http://localhost:5000${co.logo}`}
                          alt="" className="w-full h-full object-contain p-0.5"
                          onError={(e) => { (e.target as any).style.display = 'none' }}
                        />
                      ) : displayName.charAt(0).toUpperCase()}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0 pr-6">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-sm truncate max-w-[200px]">{displayName}</span>
                        {isCurrentlyActive && <CheckCircle2 size={13} className="text-primary shrink-0" />}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <Badge variant={gst.variant} className="text-[10px] px-1.5 py-0">{gst.label}</Badge>
                        {co.gstin && <span className="text-[11px] text-muted-foreground font-mono">{co.gstin}</span>}
                        {co.city && !co.gstin && <span className="text-[11px] text-muted-foreground">{co.city}</span>}
                        {co.activeFY && <Badge variant="outline" className="text-[10px] px-1.5 py-0">FY {co.activeFY}</Badge>}
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{ROLE_LABELS[co.role] || co.role}</Badge>
                        {!co.isActive && <Badge variant="destructive" className="text-[10px]">Inactive</Badge>}
                      </div>
                    </div>

                    {/* Right arrow */}
                    {isSelecting ? (
                      <Spinner className="h-4 w-4 shrink-0" />
                    ) : (
                      <ArrowRight size={15} className={cn('shrink-0 transition-colors', isCurrentlyActive ? 'text-primary' : 'text-muted-foreground')} />
                    )}
                  </button>

                  {/* Edit pencil — visible on hover for admins */}
                  {isAdmin && hoveredId === co.companyId && !selecting && (
                    <button
                      onClick={(e) => handleEdit(e, co)}
                      title="Edit company settings"
                      className="absolute top-1/2 -translate-y-1/2 right-9 p-1.5 rounded-md bg-muted hover:bg-primary/10 hover:text-primary text-muted-foreground transition-all"
                    >
                      <Edit size={13} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-5 pt-4 border-t border-border">
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => navigate('/companies/create')} className="text-muted-foreground">
              <Plus size={14} /> New Company
            </Button>
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="text-muted-foreground" title="Refresh">
              <RefreshCw size={13} />
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { logout(); navigate('/login') }} className="text-muted-foreground">
            <LogOut size={14} /> Sign out
          </Button>
        </div>
      </div>
    </div>
  )
}
