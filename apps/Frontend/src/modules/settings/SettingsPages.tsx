import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { api, extractError } from '../../lib/api'
import { formatDate } from '../../lib/india'
import { Button, Input, Select, Badge, PageHeader, Spinner, EmptyState } from '../../components/ui'
import { useAuthStore } from '../../stores/auth.store'
import { Save, Plus, Check, Users, Building, Calendar, Settings2, AlertCircle } from 'lucide-react'
import { INDIAN_STATES } from '../../lib/india'

const STATE_OPTS = INDIAN_STATES.map(s => ({ value: s.code, label: `${s.code} — ${s.name}` }))

// ─── Company Settings ─────────────────────────────────────────────────────────

export function CompanySettingsPage() {
  const { activeCompany } = useAuthStore()
  const qc = useQueryClient()
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)

  const { data: company, isLoading } = useQuery({
    queryKey: ['company', activeCompany?.companyId],
    queryFn: async () => { const { data } = await api.get(`/companies/${activeCompany?.companyId}`); return data.data },
    enabled: !!activeCompany?.companyId,
  })

  const form = useForm({ defaultValues: { name: '', legalName: '', gstin: '', pan: '', tan: '', addressLine1: '', city: '', state: '', stateCode: '', pincode: '', phone: '', email: '' } })

  useEffect(() => {
    if (company) form.reset({
      name: company.name, legalName: company.legalName, gstin: company.gstin || '',
      pan: company.pan || '', tan: company.tan || '',
      addressLine1: company.addressLine1, city: company.city, state: company.state,
      stateCode: company.stateCode, pincode: company.pincode,
      phone: company.phone || '', email: company.email || '',
    })
  }, [company])

  const saveMutation = useMutation({
    mutationFn: async (data: any) => { await api.put(`/companies/${activeCompany?.companyId}`, data) },
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 3000); qc.invalidateQueries({ queryKey: ['company'] }) },
    onError: (e) => setSaveError(extractError(e)),
  })

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>

  return (
    <div>
      <PageHeader title="Company Settings" breadcrumbs={[{ label: 'Settings' }, { label: 'Company' }]}
        actions={
          <Button onClick={form.handleSubmit(v => saveMutation.mutate(v))} loading={saveMutation.isPending}>
            <Save size={15} /> {saved ? 'Saved!' : 'Save Changes'}
          </Button>
        }
      />
      {saveError && <div className="mb-4 bg-destructive/10 border border-destructive/20 rounded-md px-4 py-3 text-sm text-destructive flex items-center gap-2"><AlertCircle size={14} /> {saveError}</div>}
      <form className="space-y-4">
        <div className="form-section">
          <h3 className="form-section-title">Company Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Company Name" required {...form.register('name')} />
            <Input label="Legal Name" {...form.register('legalName')} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="GSTIN" className="font-mono uppercase" {...form.register('gstin')} />
            <Input label="PAN" className="font-mono uppercase" {...form.register('pan')} />
            <Input label="TAN" className="font-mono uppercase" {...form.register('tan')} />
          </div>
        </div>
        <div className="form-section">
          <h3 className="form-section-title">Address</h3>
          <Input label="Address Line 1" {...form.register('addressLine1')} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Input label="City" {...form.register('city')} />
            <Select label="State" options={[{ value: '', label: 'Select state' }, ...STATE_OPTS]}
              {...form.register('stateCode')} />
            <Input label="Pincode" maxLength={6} {...form.register('pincode')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Phone" {...form.register('phone')} />
            <Input label="Email" type="email" {...form.register('email')} />
          </div>
        </div>
      </form>
    </div>
  )
}

// ─── Financial Years ──────────────────────────────────────────────────────────

export function FinancialYearsPage() {
  const { activeCompany, setActiveFY } = useAuthStore()
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const { data: fys = [], isLoading } = useQuery({
    queryKey: ['financial-years', activeCompany?.companyId],
    queryFn: async () => { const { data } = await api.get(`/companies/${activeCompany?.companyId}/financial-years`); return data.data },
    enabled: !!activeCompany?.companyId,
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/companies/${activeCompany?.companyId}/financial-years`, { name, startDate, endDate })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['financial-years'] }); setShowForm(false); setName(''); setStartDate(''); setEndDate('') },
  })

  const activateMutation = useMutation({
    mutationFn: async (fyId: string) => {
      await api.put(`/companies/${activeCompany?.companyId}/financial-years/${fyId}/activate`)
    },
    onSuccess: (_, fyId) => {
      const fy = (fys as any[]).find((f: any) => f.id === fyId)
      if (fy) setActiveFY(fy.name)
      qc.invalidateQueries({ queryKey: ['financial-years'] })
    },
  })

  return (
    <div>
      <PageHeader title="Financial Years" breadcrumbs={[{ label: 'Settings' }, { label: 'Financial Years' }]}
        actions={<Button size="sm" onClick={() => setShowForm(s => !s)}><Plus size={14} /> New FY</Button>} />

      {showForm && (
        <div className="form-section mb-4">
          <h3 className="form-section-title">New Financial Year</h3>
          <div className="grid grid-cols-3 gap-4">
            <Input label="FY Name" placeholder="25-26" value={name} onChange={e => setName(e.target.value)} helperText="e.g. 25-26 for 2025-2026" />
            <Input label="Start Date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            <Input label="End Date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          <div className="flex gap-2 mt-2">
            <Button size="sm" onClick={() => createMutation.mutate()} loading={createMutation.isPending}><Check size={13} /> Create</Button>
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? <div className="flex justify-center py-8"><Spinner /></div> :
          <table className="erp-table">
            <thead><tr><th>FY Name</th><th>Start Date</th><th>End Date</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {(fys as any[]).map((fy: any) => (
                <tr key={fy.id}>
                  <td className="font-mono font-medium">FY {fy.name}</td>
                  <td className="text-sm">{formatDate(fy.startDate)}</td>
                  <td className="text-sm">{formatDate(fy.endDate)}</td>
                  <td>
                    {fy.isActive ? <Badge variant="success" className="text-[10px]">Active</Badge>
                      : fy.isClosed ? <Badge variant="outline" className="text-[10px]">Closed</Badge>
                        : <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                  </td>
                  <td>
                    {!fy.isActive && !fy.isClosed && (
                      <Button variant="ghost" size="sm" onClick={() => activateMutation.mutate(fy.id)} loading={activateMutation.isPending}>
                        Set Active
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      </div>
    </div>
  )
}

// ─── Number Series ────────────────────────────────────────────────────────────

export function NumberSeriesPage() {
  const { activeCompany, activeFY } = useAuthStore()
  const qc = useQueryClient()

  const { data: series = [], isLoading } = useQuery({
    queryKey: ['number-series', activeCompany?.companyId],
    queryFn: async () => { const { data } = await api.get('/masters/number-series'); return data.data },
  })

  const [editing, setEditing] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<any>({})

  const saveMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: any }) => {
      await api.put(`/masters/number-series/${id}`, values)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['number-series'] }); setEditing(null) },
  })

  return (
    <div>
      <PageHeader title="Number Series" subtitle="Configure voucher numbering format per type"
        breadcrumbs={[{ label: 'Settings' }, { label: 'Number Series' }]} />
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? <div className="flex justify-center py-8"><Spinner /></div> :
          <table className="erp-table">
            <thead>
              <tr><th>Voucher Type</th><th>Prefix</th><th>Separator</th><th>Current No</th><th>Pad Length</th><th>Sample</th><th></th></tr>
            </thead>
            <tbody>
              {(series as any[]).map((s: any) => {
                const isEditing = editing === s.id
                const vals = isEditing ? editValues : s
                const sample = `${vals.prefix || ''}${vals.separator || '-'}${activeFY || '25-26'}${vals.separator || '-'}${'0'.repeat((vals.padLength || 4) - 1)}1`
                return (
                  <tr key={s.id}>
                    <td><Badge variant="secondary" className="text-[10px]">{s.voucherType}</Badge></td>
                    <td>
                      {isEditing ? (
                        <input value={editValues.prefix || ''} onChange={e => setEditValues((v: any) => ({ ...v, prefix: e.target.value }))}
                          className="h-7 w-20 rounded border border-input px-2 text-xs font-mono" />
                      ) : <span className="font-mono text-sm">{s.prefix}</span>}
                    </td>
                    <td>
                      {isEditing ? (
                        <input value={editValues.separator || ''} onChange={e => setEditValues((v: any) => ({ ...v, separator: e.target.value }))}
                          className="h-7 w-12 rounded border border-input px-2 text-xs font-mono text-center" maxLength={2} />
                      ) : <span className="font-mono text-sm">{s.separator}</span>}
                    </td>
                    <td className="font-mono text-sm">{s.currentNumber}</td>
                    <td>
                      {isEditing ? (
                        <input type="number" value={editValues.padLength || ''} onChange={e => setEditValues((v: any) => ({ ...v, padLength: Number(e.target.value) }))}
                          className="h-7 w-16 rounded border border-input px-2 text-xs text-center" min={1} max={8} />
                      ) : <span className="text-sm">{s.padLength}</span>}
                    </td>
                    <td className="font-mono text-xs text-muted-foreground">{sample}</td>
                    <td>
                      {isEditing ? (
                        <div className="flex gap-1">
                          <Button size="sm" variant="default" onClick={() => saveMutation.mutate({ id: s.id, values: editValues })} loading={saveMutation.isPending}>
                            <Check size={12} />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>✕</Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => { setEditing(s.id); setEditValues({ prefix: s.prefix, separator: s.separator, padLength: s.padLength }) }}>
                          Edit
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        }
      </div>
    </div>
  )
}

// ─── Company Users ────────────────────────────────────────────────────────────

export function CompanyUsersPage() {
  const { activeCompany } = useAuthStore()

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['company-users', activeCompany?.companyId],
    queryFn: async () => { const { data } = await api.get(`/companies/${activeCompany?.companyId}/users`); return data.data },
    enabled: !!activeCompany?.companyId,
  })

  const ROLE_BADGE: Record<string, any> = {
    COMPANY_ADMIN: 'destructive', MANAGER: 'warning', ACCOUNTANT: 'info',
    BILLING_OPERATOR: 'default', VIEWER: 'secondary',
  }

  return (
    <div>
      <PageHeader title="Users & Access" subtitle="Manage who can access this company"
        breadcrumbs={[{ label: 'Settings' }, { label: 'Users' }]} />
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? <div className="flex justify-center py-8"><Spinner /></div> :
          <table className="erp-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
            <tbody>
              {(users as any[]).map((cu: any) => (
                <tr key={cu.id}>
                  <td className="font-medium text-sm">{cu.user?.name}</td>
                  <td className="text-sm text-muted-foreground">{cu.user?.email}</td>
                  <td><Badge variant={ROLE_BADGE[cu.role] || 'outline'} className="text-[10px]">{cu.role.replace('_', ' ')}</Badge></td>
                  <td><Badge variant={cu.isActive ? 'success' : 'outline'} className="text-[10px]">{cu.isActive ? 'Active' : 'Inactive'}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      </div>
    </div>
  )
}

// ─── Branches ─────────────────────────────────────────────────────────────────

export function BranchesPage() {
  const { activeCompany } = useAuthStore()
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const form = useForm({ defaultValues: { name: '', gstin: '', addressLine1: '', city: '', state: '', stateCode: '', pincode: '', phone: '' } })

  const { data: branches = [], isLoading } = useQuery({
    queryKey: ['branches-settings', activeCompany?.companyId],
    queryFn: async () => { const { data } = await api.get(`/companies/${activeCompany?.companyId}/branches`); return data.data },
    enabled: !!activeCompany?.companyId,
  })

  const createMutation = useMutation({
    mutationFn: async (values: any) => {
      await api.post(`/companies/${activeCompany?.companyId}/branches`, values)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['branches-settings'] }); setShowForm(false); form.reset() },
  })

  return (
    <div>
      <PageHeader title="Branches" breadcrumbs={[{ label: 'Settings' }, { label: 'Branches' }]}
        actions={<Button size="sm" onClick={() => setShowForm(s => !s)}><Plus size={14} /> New Branch</Button>} />

      {showForm && (
        <div className="form-section mb-4">
          <h3 className="form-section-title">New Branch</h3>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Branch Name" required {...form.register('name')} />
            <Input label="GSTIN" className="font-mono uppercase" {...form.register('gstin')} />
          </div>
          <Input label="Address" {...form.register('addressLine1')} />
          <div className="grid grid-cols-3 gap-4">
            <Input label="City" {...form.register('city')} />
            <Select label="State" options={[{ value: '', label: 'Select state' }, ...STATE_OPTS]}
              {...form.register('stateCode')} onChange={e => { form.setValue('stateCode', e.target.value); const st = INDIAN_STATES.find(s => s.code === e.target.value); if (st) form.setValue('state', st.name) }} />
            <Input label="Pincode" maxLength={6} {...form.register('pincode')} />
          </div>
          <Input label="Phone" {...form.register('phone')} />
          <div className="flex gap-2 mt-2">
            <Button size="sm" onClick={form.handleSubmit(v => createMutation.mutate(v))} loading={createMutation.isPending}><Check size={13} /> Save</Button>
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? <div className="flex justify-center py-8"><Spinner /></div> :
          <table className="erp-table">
            <thead><tr><th>Branch Name</th><th>GSTIN</th><th>City</th><th>Phone</th><th>Type</th></tr></thead>
            <tbody>
              {(branches as any[]).map((b: any) => (
                <tr key={b.id}>
                  <td className="font-medium text-sm">{b.name}</td>
                  <td className="font-mono text-xs">{b.gstin || '—'}</td>
                  <td className="text-sm">{b.city}, {b.state}</td>
                  <td className="text-sm">{b.phone || '—'}</td>
                  <td>{b.isHO ? <Badge variant="info" className="text-[10px]">Head Office</Badge> : <Badge variant="secondary" className="text-[10px]">Branch</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      </div>
    </div>
  )
}
