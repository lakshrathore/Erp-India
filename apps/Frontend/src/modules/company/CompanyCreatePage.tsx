import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Building2, ArrowRight, ArrowLeft, Check, AlertCircle,
  Upload, X, Calendar, MapPin, FileText, Settings,
} from 'lucide-react'
import { Button, Input, Select } from '../../components/ui'
import { INDIAN_STATES } from '../../lib/india'
import { api, extractError } from '../../lib/api'
import { useAuthStore } from '../../stores/auth.store'
import { cn } from '../../components/ui/utils'

const schema = z.object({
  name: z.string().min(2, 'Company name required'),
  legalName: z.string().min(2, 'Legal name required'),
  phone: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
  gstRegType: z.string().default('REGULAR'),
  gstin: z.string().optional(),
  pan: z.string().optional(),
  tan: z.string().optional(),
  cin: z.string().optional(),
  compositionRate: z.coerce.number().optional(),
  addressLine1: z.string().min(3, 'Address required'),
  addressLine2: z.string().optional(),
  city: z.string().min(2, 'City required'),
  state: z.string().default(''),
  stateCode: z.string().min(2, 'Select state'),
  pincode: z.string().length(6, 'Must be 6 digits'),
  financialYearStart: z.coerce.number().default(4),
  bookBeginningDate: z.string().optional(),
  dateFormat: z.string().default('DD-MM-YYYY'),
  decimalPlaces: z.coerce.number().default(2),
  roundOffSales: z.boolean().default(true),
})

type CompanyForm = z.infer<typeof schema>

const STATE_OPTS = [
  { value: '', label: 'Select state...' },
  ...INDIAN_STATES.map(s => ({ value: s.code, label: `${s.code} — ${s.name}` })),
]

const GST_REG_TYPES = [
  { value: 'REGULAR', label: 'Regular', desc: 'Normal taxpayer with full ITC' },
  { value: 'COMPOSITION', label: 'Composition', desc: 'Small businesses, reduced rate' },
  { value: 'UNREGISTERED', label: 'Unregistered', desc: 'Below threshold, no GST' },
  { value: 'SEZ', label: 'SEZ Unit', desc: 'Special Economic Zone' },
  { value: 'DEEMED_EXPORT', label: 'Deemed Export', desc: 'Supplies treated as exports' },
  { value: 'EXPORT', label: 'Export', desc: 'Export with/without LUT' },
]

const FY_MONTHS = [
  { value: '4', label: 'April (Standard — Apr to Mar)' },
  { value: '1', label: 'January (Jan to Dec)' },
  { value: '7', label: 'July (Jul to Jun)' },
]

const STEPS = [
  { label: 'Basic', icon: Building2 },
  { label: 'GST', icon: FileText },
  { label: 'Address', icon: MapPin },
  { label: 'Books', icon: Calendar },
  { label: 'Finish', icon: Settings },
]

export default function CompanyCreatePage() {
  const navigate = useNavigate()
  const { setActiveCompany, setActiveFY, user, logout } = useAuthStore()
  const [step, setStep] = useState(0)
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [sigPreview, setSigPreview] = useState<string | null>(null)
  const [sigFile, setSigFile] = useState<File | null>(null)
  const logoRef = useRef<HTMLInputElement>(null)
  const sigRef = useRef<HTMLInputElement>(null)

  const form = useForm<CompanyForm>({
    resolver: zodResolver(schema),
    defaultValues: { gstRegType: 'REGULAR', financialYearStart: 4, dateFormat: 'DD-MM-YYYY', decimalPlaces: 2, roundOffSales: true, stateCode: '', state: '' },
  })

  const gstRegType = form.watch('gstRegType')

  const handleGSTIN = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase()
    form.setValue('gstin', val)
    if (val.length >= 2) {
      const code = val.substring(0, 2)
      const state = INDIAN_STATES.find(s => s.code === code)
      if (state) { form.setValue('stateCode', code); form.setValue('state', state.name) }
    }
  }

  const handleState = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const code = e.target.value
    form.setValue('stateCode', code)
    const state = INDIAN_STATES.find(s => s.code === code)
    if (state) form.setValue('state', state.name)
  }

  const handleFile = (type: 'logo' | 'sig') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const src = ev.target?.result as string
      if (type === 'logo') { setLogoPreview(src); setLogoFile(file) }
      else { setSigPreview(src); setSigFile(file) }
    }
    reader.readAsDataURL(file)
  }

  const FIELDS: (keyof CompanyForm)[][] = [
    ['name', 'legalName'],
    ['gstRegType'],
    ['addressLine1', 'city', 'stateCode', 'pincode'],
    ['financialYearStart'],
    [],
  ]

  const next = async () => {
    const ok = await form.trigger(FIELDS[step] as any)
    if (ok) setStep(s => s + 1)
  }

  const onSubmit = async (data: CompanyForm) => {
    setSaveError(''); setSaving(true)
    try {
      const { data: res } = await api.post('/companies', data)
      const companyId = res.data.id

      if (logoFile) {
        const fd = new FormData(); fd.append('logo', logoFile)
        try { await api.post(`/companies/${companyId}/logo`, fd, { headers: { 'x-company-id': companyId } }) } catch {}
      }
      if (sigFile) {
        const fd = new FormData(); fd.append('signature', sigFile)
        try { await api.post(`/companies/${companyId}/signature`, fd, { headers: { 'x-company-id': companyId } }) } catch {}
      }

      const { data: fyRes } = await api.get(`/companies/${companyId}/financial-years`, { headers: { 'x-company-id': companyId } })
      const activeFY = fyRes.data?.find((f: any) => f.isActive)?.name || null

      setActiveCompany({ companyId, companyName: res.data.name, gstin: res.data.gstin, role: 'COMPANY_ADMIN' })
      setActiveFY(activeFY)
      navigate('/dashboard')
    } catch (e) {
      setSaveError(extractError(e)); setSaving(false)
    }
  }

  const v = form.watch()

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-xl">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-11 h-11 bg-primary rounded-xl flex items-center justify-center mx-auto mb-3">
            <Building2 className="text-white" size={20} />
          </div>
          <h1 className="text-lg font-display font-semibold">Create Company</h1>
          <p className="text-xs text-muted-foreground mt-0.5">All data auto-setup on creation — ledgers, taxes, FY, number series</p>
        </div>

        {/* Steps */}
        <div className="flex items-center justify-center mb-6 gap-1">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            return (
              <div key={i} className="flex items-center">
                <div className={cn('flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all',
                  i < step ? 'bg-success/15 text-success' : i === step ? 'bg-primary text-white' : 'bg-muted text-muted-foreground')}>
                  {i < step ? <Check size={11} /> : <Icon size={11} />}
                  <span>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && <div className={cn('w-3 h-px mx-0.5', i < step ? 'bg-success' : 'bg-border')} />}
              </div>
            )
          })}
        </div>

        <div className="bg-card border border-border rounded-xl p-5">

          {/* STEP 0 — Basic */}
          {step === 0 && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Company Information</h3>
              <Input label="Company / Trade Name" required placeholder="e.g. Rajasthan Traders"
                error={form.formState.errors.name?.message} {...form.register('name')} />
              <Input label="Legal / Registered Name" required placeholder="e.g. Rajasthan Traders Pvt Ltd"
                helperText="As per MCA registration"
                error={form.formState.errors.legalName?.message} {...form.register('legalName')} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Phone" placeholder="+91 98765 43210" {...form.register('phone')} />
                <Input label="Email" type="email" placeholder="info@co.com" {...form.register('email')} />
              </div>
              <Input label="Website" placeholder="https://www.company.com" {...form.register('website')} />
            </div>
          )}

          {/* STEP 1 — GST */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">GST Registration Type</h3>
              <div className="grid grid-cols-2 gap-2">
                {GST_REG_TYPES.map(t => (
                  <button key={t.value} type="button"
                    onClick={() => form.setValue('gstRegType', t.value)}
                    className={cn('text-left p-3 rounded-lg border text-sm transition-all',
                      v.gstRegType === t.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/40')}>
                    <div className="font-medium text-sm">{t.label}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{t.desc}</div>
                  </button>
                ))}
              </div>

              {gstRegType === 'COMPOSITION' && (
                <Select label="Composition Rate" options={[
                  { value: '1', label: '1% — Traders' },
                  { value: '2', label: '2% — Manufacturers' },
                  { value: '5', label: '5% — Restaurants' },
                  { value: '6', label: '6% — Services' },
                ]} {...form.register('compositionRate')} />
              )}

              {gstRegType !== 'UNREGISTERED' && gstRegType !== 'EXPORT' && (
                <Input label="GSTIN" placeholder="22AAAAA0000A1Z5"
                  className="font-mono uppercase" helperText="Auto-fills state from GSTIN"
                  value={v.gstin || ''} onChange={handleGSTIN} />
              )}

              <div className="grid grid-cols-2 gap-3">
                <Input label="PAN" placeholder="ABCDE1234F" className="font-mono uppercase"
                  {...form.register('pan', { onChange: e => { e.target.value = e.target.value.toUpperCase() } })} />
                <Input label="TAN" placeholder="ABCD12345E" className="font-mono uppercase"
                  helperText="For TDS" {...form.register('tan', { onChange: e => { e.target.value = e.target.value.toUpperCase() } })} />
              </div>
              <Input label="CIN" placeholder="U12345AB2020PTC123456" className="font-mono uppercase"
                helperText="Company Identification Number (optional)"
                {...form.register('cin', { onChange: e => { e.target.value = e.target.value.toUpperCase() } })} />

              {gstRegType === 'UNREGISTERED' && (
                <div className="bg-warning-muted border border-warning/30 rounded-lg px-3 py-2.5 text-xs text-warning">
                  ⚠️ No GST will be charged on invoices. ITC not available.
                </div>
              )}
            </div>
          )}

          {/* STEP 2 — Address */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Registered Office Address</h3>
              <Input label="Address Line 1" required placeholder="Shop No / Building / Street"
                error={form.formState.errors.addressLine1?.message} {...form.register('addressLine1')} />
              <Input label="Address Line 2" placeholder="Area / Landmark (optional)" {...form.register('addressLine2')} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="City" required error={form.formState.errors.city?.message} {...form.register('city')} />
                <Input label="Pincode" required maxLength={6} error={form.formState.errors.pincode?.message} {...form.register('pincode')} />
              </div>
              <Select label="State" required options={STATE_OPTS}
                value={v.stateCode || ''} onChange={handleState}
                error={form.formState.errors.stateCode?.message} />
              <p className="text-[11px] text-muted-foreground bg-muted/40 rounded px-3 py-2">
                This becomes your default Registered Office. More addresses (warehouse etc.) can be added in Settings after setup.
              </p>
            </div>
          )}

          {/* STEP 3 — Books / FY */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Books & Financial Year</h3>
              <Select label="Financial Year Start" required options={FY_MONTHS} {...form.register('financialYearStart')} />
              <Input label="Books Beginning Date" type="date"
                helperText="Date from which you start entering transactions (for opening balances)"
                {...form.register('bookBeginningDate')} />
              <div className="grid grid-cols-2 gap-3">
                <Select label="Date Format" options={[
                  { value: 'DD-MM-YYYY', label: 'DD-MM-YYYY' },
                  { value: 'MM-DD-YYYY', label: 'MM-DD-YYYY' },
                  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
                ]} {...form.register('dateFormat')} />
                <Select label="Decimal Places" options={[
                  { value: '2', label: '2  (₹1,234.56)' },
                  { value: '3', label: '3  (₹1,234.567)' },
                ]} {...form.register('decimalPlaces')} />
              </div>
              <label className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg cursor-pointer">
                <input type="checkbox" checked={v.roundOffSales}
                  onChange={e => form.setValue('roundOffSales', e.target.checked)} className="w-4 h-4 rounded" />
                <div>
                  <p className="text-sm font-medium">Round off invoice totals</p>
                  <p className="text-xs text-muted-foreground">Add automatic round-off entry to invoices</p>
                </div>
              </label>
              <div className="bg-info-muted border border-info/20 rounded-lg px-3 py-2.5 text-xs text-info">
                ✓ Financial year, number series for all voucher types, and all required ledgers will be created automatically.
              </div>
            </div>
          )}

          {/* STEP 4 — Logo & Review */}
          {step === 4 && (
            <div className="space-y-5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Logo, Signature & Review</h3>

              {/* Uploads */}
              <div className="grid grid-cols-2 gap-4">
                {/* Logo */}
                <div>
                  <label className="text-xs font-medium text-foreground block mb-2">Company Logo</label>
                  <div className="flex flex-col items-center gap-2">
                    {logoPreview ? (
                      <div className="relative w-20 h-20 border rounded-lg bg-white overflow-hidden">
                        <img src={logoPreview} className="w-full h-full object-contain p-1" alt="logo" />
                        <button onClick={() => { setLogoPreview(null); setLogoFile(null) }}
                          className="absolute top-0.5 right-0.5 bg-destructive text-white rounded-full w-4 h-4 flex items-center justify-center"><X size={9} /></button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => logoRef.current?.click()}
                        className="w-20 h-20 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center hover:border-primary text-muted-foreground hover:text-primary transition-colors">
                        <Upload size={16} /><span className="text-[10px] mt-1">Upload</span>
                      </button>
                    )}
                    <p className="text-[10px] text-muted-foreground text-center">PNG/SVG, transparent bg</p>
                  </div>
                  <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleFile('logo')} />
                </div>

                {/* Signature */}
                <div>
                  <label className="text-xs font-medium text-foreground block mb-2">Auth. Signatory</label>
                  <div className="flex flex-col items-center gap-2">
                    {sigPreview ? (
                      <div className="relative w-28 h-14 border rounded-lg bg-white overflow-hidden">
                        <img src={sigPreview} className="w-full h-full object-contain p-1" alt="signature" />
                        <button onClick={() => { setSigPreview(null); setSigFile(null) }}
                          className="absolute top-0.5 right-0.5 bg-destructive text-white rounded-full w-4 h-4 flex items-center justify-center"><X size={9} /></button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => sigRef.current?.click()}
                        className="w-28 h-14 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center hover:border-primary text-muted-foreground hover:text-primary transition-colors">
                        <Upload size={14} /><span className="text-[10px] mt-1">Upload</span>
                      </button>
                    )}
                    <p className="text-[10px] text-muted-foreground text-center">PNG, white/transparent bg</p>
                  </div>
                  <input ref={sigRef} type="file" accept="image/*" className="hidden" onChange={handleFile('sig')} />
                </div>
              </div>

              {/* Review */}
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="bg-muted/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Review</div>
                {[
                  [v.name, v.legalName], [GST_REG_TYPES.find(g => g.value === v.gstRegType)?.label, v.gstin || 'No GSTIN'],
                  [v.pan || '—', v.tan || '—'], [[v.addressLine1, v.city, v.stateCode, v.pincode].filter(Boolean).join(', ')],
                  [FY_MONTHS.find(m => m.value === String(v.financialYearStart))?.label?.split(' ')[0], v.bookBeginningDate || 'Current FY'],
                ].map((row, i) => (
                  <div key={i} className={`flex gap-3 px-3 py-2 text-xs ${i > 0 ? 'border-t border-border/50' : ''}`}>
                    {row.map((cell, j) => (
                      <span key={j} className={j === 0 ? 'font-medium flex-1' : 'text-muted-foreground flex-1'}>{cell}</span>
                    ))}
                  </div>
                ))}
              </div>

              {saveError && (
                <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5 text-sm text-destructive">
                  <AlertCircle size={14} /> {saveError}
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => step === 0 ? navigate('/select-company') : setStep(s => s - 1)}>
              <ArrowLeft size={14} /> {step === 0 ? 'Cancel' : 'Back'}
            </Button>
            {step < STEPS.length - 1
              ? <Button onClick={next}>Next <ArrowRight size={14} /></Button>
              : <Button onClick={form.handleSubmit(onSubmit)} loading={saving}><Check size={14} /> Create Company</Button>
            }
          </div>
        </div>

        <p className="text-center text-[11px] text-muted-foreground mt-3">
          {user?.name} · <button onClick={() => { logout(); navigate('/login') }} className="underline">Sign out</button>
        </p>
      </div>
    </div>
  )
}
