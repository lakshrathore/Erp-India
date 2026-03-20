import { useState, useRef, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, extractError } from '../../lib/api'
import { INDIAN_STATES } from '../../lib/india'
import { useAuthStore } from '../../stores/auth.store'
import { Button, Input, Select, PageHeader, Spinner, Badge } from '../../components/ui'
import {
  Save, Upload, X, Plus, Check, MapPin, Calendar,
  Building2, Trash2, Star, AlertCircle, ChevronDown,
} from 'lucide-react'
import { cn } from '../../components/ui/utils'

const STATE_OPTS = [{ value: '', label: 'Select state...' }, ...INDIAN_STATES.map(s => ({ value: s.code, label: `${s.code} — ${s.name}` }))]

const GST_REG_TYPES = [
  { value: 'REGULAR', label: 'Regular' },
  { value: 'COMPOSITION', label: 'Composition' },
  { value: 'UNREGISTERED', label: 'Unregistered' },
  { value: 'SEZ', label: 'SEZ Unit' },
  { value: 'DEEMED_EXPORT', label: 'Deemed Export' },
  { value: 'EXPORT', label: 'Export' },
]

type Tab = 'general' | 'gst' | 'addresses' | 'financial-years' | 'print'

export function CompanySettingsPage() {
  const [tab, setTab] = useState<Tab>('general')
  const { activeCompany, setActiveFY } = useAuthStore()
  const companyId = activeCompany?.companyId || ''
  const qc = useQueryClient()

  const { data: company, isLoading } = useQuery({
    queryKey: ['company', companyId],
    queryFn: async () => { const { data } = await api.get(`/companies/${companyId}`); return data.data },
    enabled: !!companyId,
  })

  const TABS = [
    { key: 'general', label: 'General' },
    { key: 'gst', label: 'GST & Tax' },
    { key: 'addresses', label: 'Addresses' },
    { key: 'financial-years', label: 'Financial Years' },
    { key: 'print', label: 'Logo & Print' },
  ]

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>

  return (
    <div>
      <PageHeader title="Company Settings"
        breadcrumbs={[{ label: 'Settings' }, { label: 'Company' }]} />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-5">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key as Tab)}
            className={cn('px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && <GeneralTab company={company} companyId={companyId} />}
      {tab === 'gst' && <GSTTab company={company} companyId={companyId} />}
      {tab === 'addresses' && <AddressesTab companyId={companyId} addresses={company?.addresses || []} />}
      {tab === 'financial-years' && <FinancialYearsTab companyId={companyId} fys={company?.financialYears || []} />}
      {tab === 'print' && <PrintTab company={company} companyId={companyId} />}
    </div>
  )
}

// ─── General Tab ──────────────────────────────────────────────────────────────

function GeneralTab({ company, companyId }: { company: any; companyId: string }) {
  const qc = useQueryClient()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const form = useForm({ defaultValues: { name: '', legalName: '', phone: '', email: '', website: '', dateFormat: 'DD-MM-YYYY', decimalPlaces: '2', roundOffSales: true, bookBeginningDate: '' } })

  useEffect(() => {
    if (company) form.reset({
      name: company.name, legalName: company.legalName, phone: company.phone || '', email: company.email || '',
      website: company.website || '', dateFormat: company.dateFormat || 'DD-MM-YYYY',
      decimalPlaces: String(company.decimalPlaces || 2), roundOffSales: company.roundOffSales ?? true,
      bookBeginningDate: company.bookBeginningDate ? company.bookBeginningDate.substring(0, 10) : '',
    })
  }, [company])

  const saveMutation = useMutation({
    mutationFn: async (data: any) => { await api.put(`/companies/${companyId}`, data) },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['company', companyId] }); setSaved(true); setTimeout(() => setSaved(false), 2000) },
    onError: e => setError(extractError(e)),
  })

  const v = form.watch()

  return (
    <div className="max-w-xl space-y-4">
      <div className="form-section">
        <h3 className="form-section-title">Company Name</h3>
        <Input label="Trade / Display Name" required {...form.register('name')} />
        <Input label="Legal / Registered Name" required {...form.register('legalName')} helperText="As per MCA registration" />
      </div>
      <div className="form-section">
        <h3 className="form-section-title">Contact</h3>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Phone" {...form.register('phone')} />
          <Input label="Email" type="email" {...form.register('email')} />
        </div>
        <Input label="Website" {...form.register('website')} />
      </div>
      <div className="form-section">
        <h3 className="form-section-title">Preferences</h3>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Date Format" options={[{ value: 'DD-MM-YYYY', label: 'DD-MM-YYYY (Indian)' }, { value: 'MM-DD-YYYY', label: 'MM-DD-YYYY' }, { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' }]} {...form.register('dateFormat')} />
          <Select label="Decimal Places" options={[{ value: '2', label: '2 places' }, { value: '3', label: '3 places' }]} {...form.register('decimalPlaces')} />
        </div>
        <Input label="Books Beginning Date" type="date" helperText="Start date for opening balances" {...form.register('bookBeginningDate')} />
        <label className="flex items-center gap-3 mt-2 cursor-pointer">
          <input type="checkbox" checked={v.roundOffSales} onChange={e => form.setValue('roundOffSales', e.target.checked)} className="w-4 h-4 rounded" />
          <span className="text-sm">Round off invoice totals automatically</span>
        </label>
      </div>
      {error && <div className="text-sm text-destructive flex items-center gap-2"><AlertCircle size={14} /> {error}</div>}
      <Button onClick={form.handleSubmit(d => saveMutation.mutate(d))} loading={saveMutation.isPending}>
        <Save size={14} /> {saved ? 'Saved!' : 'Save Changes'}
      </Button>
    </div>
  )
}

// ─── GST Tab ──────────────────────────────────────────────────────────────────

function GSTTab({ company, companyId }: { company: any; companyId: string }) {
  const qc = useQueryClient()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const form = useForm({ defaultValues: { gstRegType: 'REGULAR', gstin: '', pan: '', tan: '', cin: '', compositionRate: '' } })

  useEffect(() => {
    if (company) form.reset({
      gstRegType: company.gstRegType || 'REGULAR', gstin: company.gstin || '',
      pan: company.pan || '', tan: company.tan || '', cin: company.cin || '',
      compositionRate: company.compositionRate ? String(company.compositionRate) : '',
    })
  }, [company])

  const saveMutation = useMutation({
    mutationFn: async (data: any) => { await api.put(`/companies/${companyId}`, data) },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['company', companyId] }); setSaved(true); setTimeout(() => setSaved(false), 2000) },
    onError: e => setError(extractError(e)),
  })

  const gstType = form.watch('gstRegType')

  return (
    <div className="max-w-xl space-y-4">
      <div className="form-section">
        <h3 className="form-section-title">GST Registration Type</h3>
        <div className="grid grid-cols-3 gap-2">
          {GST_REG_TYPES.map(t => (
            <button key={t.value} type="button"
              onClick={() => form.setValue('gstRegType', t.value)}
              className={cn('p-2.5 rounded-lg border text-sm font-medium transition-all text-left',
                gstType === t.value ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary/40')}>
              {t.label}
            </button>
          ))}
        </div>
        {gstType === 'COMPOSITION' && (
          <Select label="Composition Rate" options={[{ value: '1', label: '1% — Traders' }, { value: '2', label: '2% — Manufacturers' }, { value: '5', label: '5% — Restaurants' }, { value: '6', label: '6% — Services' }]}
            {...form.register('compositionRate')} />
        )}
      </div>
      <div className="form-section">
        <h3 className="form-section-title">Tax IDs</h3>
        <Input label="GSTIN" className="font-mono uppercase" placeholder="22AAAAA0000A1Z5"
          {...form.register('gstin', { onChange: e => { e.target.value = e.target.value.toUpperCase() } })} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="PAN" className="font-mono uppercase"
            {...form.register('pan', { onChange: e => { e.target.value = e.target.value.toUpperCase() } })} />
          <Input label="TAN" className="font-mono uppercase" helperText="For TDS"
            {...form.register('tan', { onChange: e => { e.target.value = e.target.value.toUpperCase() } })} />
        </div>
        <Input label="CIN" className="font-mono uppercase" helperText="Company Identification Number (optional)"
          {...form.register('cin', { onChange: e => { e.target.value = e.target.value.toUpperCase() } })} />
      </div>
      {error && <div className="text-sm text-destructive flex items-center gap-2"><AlertCircle size={14} /> {error}</div>}
      <Button onClick={form.handleSubmit(d => saveMutation.mutate(d))} loading={saveMutation.isPending}>
        <Save size={14} /> {saved ? 'Saved!' : 'Save'}
      </Button>
    </div>
  )
}

// ─── Addresses Tab ────────────────────────────────────────────────────────────

function AddressesTab({ companyId, addresses: initialAddresses }: { companyId: string; addresses: any[] }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ label: '', addressLine1: '', addressLine2: '', city: '', state: '', stateCode: '', pincode: '', phone: '', email: '', gstin: '', isDefault: false })
  const [error, setError] = useState('')

  const { data: addresses = [] } = useQuery({
    queryKey: ['company-addresses', companyId],
    queryFn: async () => { const { data } = await api.get(`/companies/${companyId}/addresses`); return data.data },
    initialData: initialAddresses,
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editId) await api.put(`/companies/${companyId}/addresses/${editId}`, form)
      else await api.post(`/companies/${companyId}/addresses`, form)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['company-addresses', companyId] }); setShowForm(false); setEditId(null); setForm({ label: '', addressLine1: '', city: '', state: '', stateCode: '', pincode: '', addressLine2: '', phone: '', email: '', gstin: '', isDefault: false }) },
    onError: e => setError(extractError(e)),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/companies/${companyId}/addresses/${id}`) },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['company-addresses', companyId] }),
  })

  const setDefault = useMutation({
    mutationFn: async (id: string) => { await api.put(`/companies/${companyId}/addresses/${id}`, { isDefault: true }) },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['company-addresses', companyId] }),
  })

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Multiple addresses — Registered office, Warehouse, Dispatch address etc.</p>
        <Button size="sm" onClick={() => { setShowForm(true); setEditId(null) }}><Plus size={13} /> Add Address</Button>
      </div>

      {showForm && (
        <div className="form-section">
          <h3 className="form-section-title">{editId ? 'Edit Address' : 'New Address'}</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Input label="Label" required placeholder="e.g. Registered Office, Warehouse" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
            <Input label="GSTIN (for this address)" className="font-mono uppercase" placeholder="22AAAAA0000A1Z5" value={form.gstin} onChange={e => setForm(f => ({ ...f, gstin: e.target.value.toUpperCase() }))} />
          </div>
          <Input label="Address Line 1" required value={form.addressLine1} onChange={e => setForm(f => ({ ...f, addressLine1: e.target.value }))} />
          <Input label="Address Line 2" value={form.addressLine2} onChange={e => setForm(f => ({ ...f, addressLine2: e.target.value }))} />
          <div className="grid grid-cols-3 gap-3 mb-3">
            <Input label="City" required value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
            <Select label="State" required options={STATE_OPTS} value={form.stateCode}
              onChange={e => { const s = INDIAN_STATES.find(x => x.code === e.target.value); setForm(f => ({ ...f, stateCode: e.target.value, state: s?.name || '' })) }} />
            <Input label="Pincode" maxLength={6} value={form.pincode} onChange={e => setForm(f => ({ ...f, pincode: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Input label="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            <Input label="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer mb-3">
            <input type="checkbox" checked={form.isDefault} onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))} className="w-4 h-4" />
            Set as default address (used on invoices)
          </label>
          {error && <p className="text-sm text-destructive mb-2">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}><Check size={13} /> Save</Button>
            <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setError('') }}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {(addresses as any[]).map((addr: any) => (
          <div key={addr.id} className={cn('bg-card border rounded-lg p-4 flex items-start gap-3', addr.isDefault ? 'border-primary/40' : 'border-border')}>
            <MapPin size={16} className={addr.isDefault ? 'text-primary mt-0.5' : 'text-muted-foreground mt-0.5'} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-sm">{addr.label}</span>
                {addr.isDefault && <Badge variant="info" className="text-[10px]">Default</Badge>}
                {addr.gstin && <span className="font-mono text-xs text-muted-foreground">{addr.gstin}</span>}
              </div>
              <p className="text-sm text-muted-foreground">
                {[addr.addressLine1, addr.addressLine2, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ')}
              </p>
              {(addr.phone || addr.email) && (
                <p className="text-xs text-muted-foreground mt-0.5">{[addr.phone, addr.email].filter(Boolean).join(' · ')}</p>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              {!addr.isDefault && (
                <Button size="icon-sm" variant="ghost" title="Set as default" onClick={() => setDefault.mutate(addr.id)}>
                  <Star size={13} />
                </Button>
              )}
              <Button size="icon-sm" variant="ghost" onClick={() => deleteMutation.mutate(addr.id)}>
                <Trash2 size={13} className="text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Financial Years Tab ──────────────────────────────────────────────────────

function FinancialYearsTab({ companyId, fys: initialFYs }: { companyId: string; fys: any[] }) {
  const qc = useQueryClient()
  const { setActiveFY } = useAuthStore()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [error, setError] = useState('')

  const { data: fys = [] } = useQuery({
    queryKey: ['financial-years', companyId],
    queryFn: async () => { const { data } = await api.get(`/companies/${companyId}/financial-years`); return data.data },
    initialData: initialFYs,
  })

  const createMutation = useMutation({
    mutationFn: async () => { await api.post(`/companies/${companyId}/financial-years`, { name, startDate, endDate }) },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['financial-years', companyId] }); setShowForm(false); setName(''); setStartDate(''); setEndDate('') },
    onError: e => setError(extractError(e)),
  })

  const activateMutation = useMutation({
    mutationFn: async (fyId: string) => {
      const { data } = await api.put(`/companies/${companyId}/financial-years/${fyId}/activate`)
      return data.data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['financial-years', companyId] })
      if (data?.activeFY) setActiveFY(data.activeFY)
    },
  })

  const closeMutation = useMutation({
    mutationFn: async (fyId: string) => { await api.put(`/companies/${companyId}/financial-years/${fyId}/close`) },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['financial-years', companyId] }),
  })

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Manage financial years and switch active year</p>
        <Button size="sm" onClick={() => setShowForm(s => !s)}><Plus size={13} /> New FY</Button>
      </div>

      {showForm && (
        <div className="form-section">
          <h3 className="form-section-title">New Financial Year</h3>
          <div className="grid grid-cols-3 gap-3">
            <Input label="FY Name" placeholder="26-27" value={name} onChange={e => setName(e.target.value)} helperText="e.g. 26-27" />
            <Input label="Start Date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            <Input label="End Date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive mt-1">{error}</p>}
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={() => createMutation.mutate()} loading={createMutation.isPending}><Check size={13} /> Create</Button>
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead><tr><th>FY</th><th>Period</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {(fys as any[]).map((fy: any) => (
              <tr key={fy.id}>
                <td className="font-mono font-medium">FY {fy.name}</td>
                <td className="text-sm text-muted-foreground">
                  {new Date(fy.startDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  {' — '}
                  {new Date(fy.endDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </td>
                <td>
                  {fy.isActive ? <Badge variant="success" className="text-[10px]">Active</Badge>
                    : fy.isClosed ? <Badge variant="outline" className="text-[10px]">Closed</Badge>
                    : <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                </td>
                <td>
                  <div className="flex gap-1">
                    {!fy.isActive && !fy.isClosed && (
                      <Button size="sm" variant="outline" onClick={() => activateMutation.mutate(fy.id)} loading={activateMutation.isPending}>
                        Switch
                      </Button>
                    )}
                    {fy.isActive && (
                      <Button size="sm" variant="ghost" className="text-destructive"
                        onClick={() => confirm('Close this financial year? This cannot be undone.') && closeMutation.mutate(fy.id)}>
                        Close FY
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Print Tab ────────────────────────────────────────────────────────────────

function PrintTab({ company, companyId }: { company: any; companyId: string }) {
  const qc = useQueryClient()
  const logoRef = useRef<HTMLInputElement>(null)
  const sigRef = useRef<HTMLInputElement>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [sigPreview, setSigPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState<'logo' | 'signature' | null>(null)
  const [printSettings, setPrintSettings] = useState({ printLogoOnInvoice: true, printSignatureOnInvoice: true })

  useEffect(() => {
    if (company) {
      if (company.logo) setLogoPreview(company.logo)
      if (company.signature) setSigPreview(company.signature)
      setPrintSettings({ printLogoOnInvoice: company.printLogoOnInvoice ?? true, printSignatureOnInvoice: company.printSignatureOnInvoice ?? true })
    }
  }, [company])

  const uploadFile = async (type: 'logo' | 'signature', file: File) => {
    setUploading(type)
    const fd = new FormData()
    fd.append(type, file)
    try {
      const { data } = await api.post(`/companies/${companyId}/${type}`, fd)
      const url = data.data[type]
      if (type === 'logo') setLogoPreview(url)
      else setSigPreview(url)
      qc.invalidateQueries({ queryKey: ['company', companyId] })
    } catch (e) {
      alert(extractError(e))
    } finally {
      setUploading(null)
    }
  }

  const savePrintSettings = async () => {
    await api.put(`/companies/${companyId}`, printSettings)
    qc.invalidateQueries({ queryKey: ['company', companyId] })
  }

  const handleFile = (type: 'logo' | 'signature') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const src = ev.target?.result as string
      if (type === 'logo') setLogoPreview(src)
      else setSigPreview(src)
    }
    reader.readAsDataURL(file)
    uploadFile(type, file)
  }

  return (
    <div className="max-w-xl space-y-5">
      <div className="form-section">
        <h3 className="form-section-title">Company Logo</h3>
        <div className="flex items-center gap-5">
          <div className="w-24 h-24 border border-border rounded-lg bg-white flex items-center justify-center overflow-hidden">
            {logoPreview
              ? <img src={logoPreview.startsWith('http') || logoPreview.startsWith('data') ? logoPreview : `http://localhost:5000${logoPreview}`} alt="Logo" className="w-full h-full object-contain p-2" />
              : <Building2 size={32} className="text-muted-foreground" />}
          </div>
          <div>
            <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleFile('logo')} />
            <Button variant="outline" size="sm" onClick={() => logoRef.current?.click()} loading={uploading === 'logo'}>
              <Upload size={13} /> {logoPreview ? 'Change Logo' : 'Upload Logo'}
            </Button>
            {logoPreview && (
              <Button variant="ghost" size="sm" className="text-destructive ml-2"
                onClick={async () => { setLogoPreview(null); await api.put(`/companies/${companyId}`, { logo: null }) }}>
                <X size={13} /> Remove
              </Button>
            )}
            <p className="text-xs text-muted-foreground mt-2">PNG/SVG with transparent background · Max 5MB</p>
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3 className="form-section-title">Authorised Signature</h3>
        <div className="flex items-center gap-5">
          <div className="w-36 h-16 border border-border rounded-lg bg-white flex items-center justify-center overflow-hidden">
            {sigPreview
              ? <img src={sigPreview.startsWith('http') || sigPreview.startsWith('data') ? sigPreview : `http://localhost:5000${sigPreview}`} alt="Signature" className="w-full h-full object-contain p-1" />
              : <span className="text-xs text-muted-foreground">No signature</span>}
          </div>
          <div>
            <input ref={sigRef} type="file" accept="image/*" className="hidden" onChange={handleFile('signature')} />
            <Button variant="outline" size="sm" onClick={() => sigRef.current?.click()} loading={uploading === 'signature'}>
              <Upload size={13} /> {sigPreview ? 'Change Signature' : 'Upload Signature'}
            </Button>
            {sigPreview && (
              <Button variant="ghost" size="sm" className="text-destructive ml-2"
                onClick={async () => { setSigPreview(null); await api.put(`/companies/${companyId}`, { signature: null }) }}>
                <X size={13} /> Remove
              </Button>
            )}
            <p className="text-xs text-muted-foreground mt-2">PNG with white/transparent background</p>
          </div>
        </div>
      </div>

      <div className="form-section space-y-3">
        <h3 className="form-section-title">Print Settings</h3>
        {[
          { key: 'printLogoOnInvoice', label: 'Print logo on invoices & documents' },
          { key: 'printSignatureOnInvoice', label: 'Print signature on invoices & certificates' },
        ].map(s => (
          <label key={s.key} className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={printSettings[s.key as keyof typeof printSettings]}
              onChange={e => setPrintSettings(p => ({ ...p, [s.key]: e.target.checked }))} className="w-4 h-4 rounded" />
            <span className="text-sm">{s.label}</span>
          </label>
        ))}
        <Button size="sm" onClick={savePrintSettings}><Save size={13} /> Save Print Settings</Button>
      </div>
    </div>
  )
}
