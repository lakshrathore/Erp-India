import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Save, ArrowLeft, AlertCircle, ChevronDown, ChevronUp,
  Search, Package, Wrench, History, Plus, Trash2, Info, X,
} from 'lucide-react'
import { useItem, useCreateItem, useUpdateItem, useItemCategories, useUnits, useTaxMasters, useLedgers } from '../../hooks/api.hooks'
import { Button, Input, Select, SearchSelect, Textarea, PageHeader, Badge, Spinner } from '../../components/ui'
import { extractError, api } from '../../lib/api'
import ItemVariantsManager from '../../components/forms/ItemVariantsManager'
import { cn } from '../../components/ui/utils'

// ─── Schema ───────────────────────────────────────────────────────────────────

const itemSchema = z.object({
  name: z.string().min(2, 'Name required'),
  code: z.string().optional(),
  isService: z.boolean().default(false),
  categoryId: z.string().optional(),
  description: z.string().optional(),
  unit: z.string().default('PCS'),
  alternateUnit: z.string().optional(),
  conversionFactor: z.coerce.number().optional(),
  hsnCode: z.string().optional(),
  sacCode: z.string().optional(),
  taxMasterId: z.string().optional().nullable(),
  gstRate: z.coerce.number().min(0).max(100).default(0),
  cessRate: z.coerce.number().default(0),
  taxType: z.enum(['CGST_SGST', 'IGST', 'EXEMPT', 'NIL_RATED', 'NON_GST']).default('CGST_SGST'),
  // Service accounting ledgers
  incomeLedgerId: z.string().optional().nullable(),
  expenseLedgerId: z.string().optional().nullable(),
  // TDS on service purchase
  tdsApplicable: z.boolean().default(false),
  tdsSection: z.string().optional().nullable(),
  tdsRate: z.coerce.number().optional().nullable(),
  purchaseRate: z.coerce.number().default(0),
  saleRate: z.coerce.number().default(0),
  mrp: z.coerce.number().default(0),
  ptr: z.coerce.number().default(0),
  pts: z.coerce.number().default(0),
  wholesaleRate: z.coerce.number().default(0),
  tradeDiscount: z.coerce.number().min(0).max(100).default(0),
  cashDiscount: z.coerce.number().min(0).max(100).default(0),
  schemeDiscount: z.coerce.number().min(0).max(100).default(0),
  maintainStock: z.boolean().default(true),
  reorderLevel: z.coerce.number().default(0),
  reorderQty: z.coerce.number().default(0),
  minSaleQty: z.coerce.number().default(1),
})
type ItemForm = z.infer<typeof itemSchema>

const TAX_TYPES = [
  { value: 'CGST_SGST', label: 'CGST + SGST (Intra-state)' },
  { value: 'IGST', label: 'IGST (Inter-state)' },
  { value: 'EXEMPT', label: 'Exempt' },
  { value: 'NIL_RATED', label: 'Nil Rated' },
  { value: 'NON_GST', label: 'Non-GST Supply' },
]

// ─── HSN/SAC Search Component ─────────────────────────────────────────────────

interface HsnSacResult { id: string; code: string; description: string; codeType: 'HSN' | 'SAC' }

function HsnSacSearch({ value, codeType, onChange, label }: {
  value: string; codeType: 'HSN' | 'SAC'
  onChange: (code: string) => void; label: string
}) {
  const [q, setQ] = useState(value)
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<HsnSacResult[]>([])
  const [searching, setSearching] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setQ(value) }, [value])

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const search = useCallback(async (query: string) => {
    if (!query || query.length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const res = await api.get('/masters/hsn-sac/search', { params: { q: query, type: codeType, limit: 15 } })
      setResults(res.data.data || [])
      setOpen(true)
    } catch { setResults([]) }
    finally { setSearching(false) }
  }, [codeType])

  const handleChange = (val: string) => {
    setQ(val)
    onChange(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(val), 300)
  }

  const handleSelect = (r: HsnSacResult) => {
    setQ(r.code)
    onChange(r.code)
    setOpen(false)
    setResults([])
  }

  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-medium mb-1">{label}</label>
      <div className="relative">
        <input
          value={q}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => q.length >= 2 && search(q)}
          placeholder={`Type ${codeType} code or keyword...`}
          className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        {searching && <Spinner className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full min-w-[380px] bg-card border border-border rounded-lg shadow-xl overflow-hidden">
          <div className="px-3 py-1.5 border-b border-border bg-muted/30 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{results.length} results — click to select</span>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X size={12} /></button>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {results.map(r => (
              <button key={r.id} type="button" onClick={() => handleSelect(r)}
                className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors border-b border-border/30 last:border-0">
                <div className="flex items-start gap-2">
                  <span className="font-mono font-semibold text-xs text-primary w-20 shrink-0 pt-0.5">{r.code}</span>
                  <span className="text-xs text-foreground line-clamp-2 leading-snug">{r.description}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tax History Section ──────────────────────────────────────────────────────

function TaxHistorySection({ itemId }: { itemId: string }) {
  const qc = useQueryClient()
  const { data: taxMasters = [] } = useTaxMasters()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ taxMasterId: '', effectiveFrom: '', notificationNo: '', remarks: '' })
  const [err, setErr] = useState('')

  const { data: history = [], isLoading } = useQuery({
    queryKey: ['item-tax-history', itemId],
    queryFn: () => api.get(`/masters/items/${itemId}/tax-history`).then(r => r.data.data),
    enabled: !!itemId,
  })

  const addMut = useMutation({
    mutationFn: (data: any) => api.post(`/masters/items/${itemId}/tax-history`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['item-tax-history', itemId] })
      qc.invalidateQueries({ queryKey: ['item', itemId] })
      setShowForm(false)
      setForm({ taxMasterId: '', effectiveFrom: '', notificationNo: '', remarks: '' })
    },
    onError: (e) => setErr(extractError(e)),
  })

  const deleteMut = useMutation({
    mutationFn: (histId: string) => api.delete(`/masters/items/${itemId}/tax-history/${histId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['item-tax-history', itemId] }),
  })

  const handleAdd = () => {
    setErr('')
    if (!form.taxMasterId) return setErr('Select a tax master')
    if (!form.effectiveFrom) return setErr('Effective date is required')
    addMut.mutate(form)
  }

  const taxOptions = [
    { value: '', label: '-- Select Tax Rate --' },
    ...(taxMasters as any[]).map((t: any) => ({
      value: t.id,
      label: `${t.name} (GST ${t.gstRate}%${Number(t.cessRate) > 0 ? ` + Cess ${t.cessRate}%` : ''})`,
    })),
  ]

  return (
    <div className="form-section">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="form-section-title flex items-center gap-2"><History size={14} /> GST Rate History</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Government rate changes — transactions use the rate applicable on the transaction date.
          </p>
        </div>
        <Button size="sm" variant="outline" type="button" onClick={() => setShowForm(s => !s)}>
          <Plus size={13} className="mr-1" /> Add Rate Change
        </Button>
      </div>

      {showForm && (
        <div className="mb-4 p-3 rounded-lg border border-border bg-muted/20">
          {err && <p className="text-xs text-destructive mb-2">{err}</p>}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <SearchSelect label="New Tax Rate *" value={form.taxMasterId}
              onChange={v => setForm(f => ({ ...f, taxMasterId: v }))} options={taxOptions} placeholder="Select..." />
            <div>
              <label className="block text-xs font-medium mb-1">Effective From *</label>
              <Input type="date" value={form.effectiveFrom}
                onChange={e => setForm(f => ({ ...f, effectiveFrom: e.target.value }))} />
            </div>
            <Input label="Notification No." value={form.notificationNo}
              onChange={e => setForm(f => ({ ...f, notificationNo: e.target.value }))}
              placeholder="e.g. 01/2023-CT(Rate)" />
            <Input label="Remarks" value={form.remarks}
              onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} placeholder="Optional" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" type="button" onClick={handleAdd} disabled={addMut.isPending}>
              {addMut.isPending && <Spinner className="h-3.5 w-3.5 mr-1" />} Save Rate Change
            </Button>
            <Button size="sm" variant="outline" type="button" onClick={() => { setShowForm(false); setErr('') }}>Cancel</Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-4"><Spinner className="h-5 w-5" /></div>
      ) : (history as any[]).length === 0 ? (
        <div className="text-center py-6 border border-dashed border-border rounded-lg text-xs text-muted-foreground">
          No rate history. Current rate applies to all transactions.
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="text-left px-3 py-2 font-medium">Tax Rate</th>
                <th className="text-right px-3 py-2 font-medium">GST %</th>
                <th className="text-right px-3 py-2 font-medium">Cess %</th>
                <th className="text-left px-3 py-2 font-medium">Effective From</th>
                <th className="text-left px-3 py-2 font-medium">Effective To</th>
                <th className="text-left px-3 py-2 font-medium">Notification</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {(history as any[]).map((h: any) => (
                <tr key={h.id} className={cn('hover:bg-muted/20', !h.effectiveTo && 'bg-green-50/50')}>
                  <td className="px-3 py-2 font-medium">{h.taxMaster?.name}</td>
                  <td className="px-3 py-2 text-right font-mono">{Number(h.gstRate)}%</td>
                  <td className="px-3 py-2 text-right font-mono">{Number(h.cessRate) > 0 ? `${Number(h.cessRate)}%` : '—'}</td>
                  <td className="px-3 py-2">{new Date(h.effectiveFrom).toLocaleDateString('en-IN')}</td>
                  <td className="px-3 py-2">
                    {h.effectiveTo
                      ? new Date(h.effectiveTo).toLocaleDateString('en-IN')
                      : <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">Active</Badge>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{h.notificationNo || '—'}</td>
                  <td className="px-2 py-2">
                    <button type="button" onClick={() => deleteMut.mutate(h.id)}
                      className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ItemFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id && id !== 'new'
  const [saveError, setSaveError] = useState('')
  const [showPTR, setShowPTR] = useState(false)
  const [activeTab, setActiveTab] = useState<'details' | 'variants' | 'tax-history'>('details')

  const { data: item, isLoading } = useItem(isEdit ? id : '')
  const { data: categories = [] } = useItemCategories()
  const { data: unitsData = [] } = useUnits()
  const { data: taxMasters = [] } = useTaxMasters()
  const { data: ledgers = [] } = useLedgers()
  const createItem = useCreateItem()
  const updateItem = useUpdateItem(id || '')

  const form = useForm<ItemForm>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      isService: false, taxType: 'CGST_SGST', gstRate: 0, cessRate: 0, taxMasterId: null,
      incomeLedgerId: null, expenseLedgerId: null,
      tdsApplicable: false, tdsSection: null, tdsRate: null,
      purchaseRate: 0, saleRate: 0, mrp: 0, ptr: 0, pts: 0, wholesaleRate: 0,
      tradeDiscount: 0, cashDiscount: 0, schemeDiscount: 0,
      unit: 'PCS', maintainStock: true, reorderLevel: 0, reorderQty: 0, minSaleQty: 1,
    },
  })

  useEffect(() => {
    if (item && isEdit) {
      form.reset({
        name: item.name, code: item.code || '', isService: item.isService || false,
        categoryId: item.categoryId || '', description: item.description || '',
        unit: item.unit, alternateUnit: item.alternateUnit || '',
        conversionFactor: item.conversionFactor ? Number(item.conversionFactor) : undefined,
        hsnCode: item.hsnCode || '', sacCode: item.sacCode || '',
        taxMasterId: item.taxMasterId || null,
        gstRate: Number(item.gstRate), cessRate: Number(item.cessRate), taxType: item.taxType,
        incomeLedgerId: item.incomeLedgerId || null,
        expenseLedgerId: item.expenseLedgerId || null,
        tdsApplicable: item.tdsApplicable || false,
        tdsSection: item.tdsSection || null,
        tdsRate: item.tdsRate ? Number(item.tdsRate) : null,
        purchaseRate: Number(item.purchaseRate), saleRate: Number(item.saleRate),
        mrp: Number(item.mrp), ptr: Number(item.ptr || 0), pts: Number(item.pts || 0),
        wholesaleRate: Number(item.wholesaleRate || 0),
        tradeDiscount: Number(item.tradeDiscount || 0), cashDiscount: Number(item.cashDiscount || 0),
        schemeDiscount: Number(item.schemeDiscount || 0),
        maintainStock: item.maintainStock, reorderLevel: Number(item.reorderLevel),
        reorderQty: Number(item.reorderQty), minSaleQty: Number(item.minSaleQty),
      })
      if (Number(item.ptr || 0) > 0 || Number(item.pts || 0) > 0) setShowPTR(true)
    }
  }, [item, isEdit])

  const onSubmit = async (data: ItemForm) => {
    setSaveError('')
    try {
      if (isEdit) await updateItem.mutateAsync(data)
      else await createItem.mutateAsync(data)
      navigate('/masters/items')
    } catch (e) { setSaveError(extractError(e)) }
  }

  const isSaving = createItem.isPending || updateItem.isPending
  const w = form.watch()
  const isService = w.isService

  const handleTaxMasterChange = (taxMasterId: string) => {
    form.setValue('taxMasterId', taxMasterId || null)
    if (taxMasterId) {
      const tm = (taxMasters as any[]).find((t: any) => t.id === taxMasterId)
      if (tm) { form.setValue('gstRate', Number(tm.gstRate)); form.setValue('cessRate', Number(tm.cessRate)) }
    }
  }

  const selectedCategory = (categories as any[]).find((c: any) => c.id === w.categoryId)
  const categoryAttributes = (() => {
    const attrs = selectedCategory?.attributes || item?.category?.attributes || []
    if (typeof attrs === 'string') { try { return JSON.parse(attrs) } catch { return [] } }
    return attrs
  })()

  const margin = w.saleRate > 0 && w.purchaseRate > 0
    ? (((w.saleRate - w.purchaseRate) / w.saleRate) * 100).toFixed(1) : null
  const netRate = w.saleRate > 0 && (w.tradeDiscount > 0 || w.cashDiscount > 0 || w.schemeDiscount > 0)
    ? (w.saleRate * (1 - (w.tradeDiscount || 0) / 100) * (1 - (w.cashDiscount || 0) / 100) * (1 - (w.schemeDiscount || 0) / 100)).toFixed(2)
    : null

  const taxMasterOptions = [
    { value: '', label: '-- Select Tax Rate --' },
    ...(taxMasters as any[]).map((t: any) => ({
      value: t.id,
      label: `${t.name}  (GST ${t.gstRate}%${Number(t.cessRate) > 0 ? ` + Cess ${t.cessRate}%` : ''})`,
    })),
  ]

  const tabs = [
    { key: 'details' as const, label: 'Item Details' },
    ...(isEdit ? [{ key: 'variants' as const, label: 'Variants / Size / Color' }] : []),
    ...(isEdit ? [{ key: 'tax-history' as const, label: 'GST Rate History' }] : []),
  ]

  if (isLoading && isEdit) return <div className="skeleton h-96 rounded-lg" />

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Edit Item' : 'New Item'}
        breadcrumbs={[{ label: 'Masters' }, { label: 'Items', href: '/masters/items' }, { label: isEdit ? 'Edit' : 'New' }]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/masters/items')}><ArrowLeft size={15} /> Back</Button>
            <Button onClick={form.handleSubmit(onSubmit)} loading={isSaving}><Save size={15} /> {isEdit ? 'Update' : 'Save'}</Button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-4">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {saveError && (
        <div className="mb-4 flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          <AlertCircle size={15} /> {saveError}
        </div>
      )}

      {/* ── Details Tab ── */}
      {activeTab === 'details' && (
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

          {/* Goods / Service Toggle */}
          <div className="form-section">
            <h3 className="form-section-title">Item Type</h3>
            <div className="flex gap-3">
              {[
                { val: false, icon: Package, title: 'Goods', sub: 'Physical products — uses HSN code' },
                { val: true, icon: Wrench, title: 'Service', sub: 'Intangible services — uses SAC code' },
              ].map(({ val, icon: Icon, title, sub }) => (
                <button key={String(val)} type="button" onClick={() => form.setValue('isService', val)}
                  className={cn('flex items-center gap-2.5 px-4 py-3 rounded-lg border-2 transition-all text-sm font-medium',
                    isService === val ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-muted-foreground/50')}>
                  <Icon size={16} />
                  <div className="text-left">
                    <p className="font-semibold">{title}</p>
                    <p className="text-xs font-normal opacity-70">{sub}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Basic Info */}
          <div className="form-section">
            <h3 className="form-section-title">Basic Information</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <Input label="Item Name" required error={form.formState.errors.name?.message} {...form.register('name')} />
              </div>
              <Input label="Item Code" placeholder="Auto or manual" {...form.register('code')} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <SearchSelect label="Category" value={w.categoryId || ''} onChange={v => form.setValue('categoryId', v)}
                options={[{ value: '', label: '-- No Category --' }, ...(categories as any[]).map((c: any) => ({ value: c.id, label: c.name }))]}
                placeholder="Select category..." />
              <SearchSelect label="Unit *" value={w.unit || ''} onChange={v => form.setValue('unit', v, { shouldValidate: true })}
                options={(unitsData as any[]).map((u: any) => ({ value: u.name, label: `${u.name} (${u.symbol})` }))}
                placeholder="Select unit..." />
              <SearchSelect label="Alternate Unit" value={w.alternateUnit || ''} onChange={v => form.setValue('alternateUnit', v)}
                options={[{ value: '', label: 'None' }, ...(unitsData as any[]).map((u: any) => ({ value: u.name, label: `${u.name} (${u.symbol})` }))]}
                placeholder="None" />
            </div>
            {w.alternateUnit && (
              <Input label={`1 ${w.unit} = ? ${w.alternateUnit}`} type="number" step="0.0001"
                {...form.register('conversionFactor')} className="w-48" />
            )}
            <Textarea label="Description" rows={2} {...form.register('description')} />
          </div>

          {/* GST & Tax */}
          <div className="form-section">
            <h3 className="form-section-title">GST & Tax</h3>
            <div className="grid grid-cols-2 gap-4 mb-3">
              {!isService ? (
                <HsnSacSearch label="HSN Code (Goods)" value={w.hsnCode || ''} codeType="HSN"
                  onChange={code => form.setValue('hsnCode', code)} />
              ) : (
                <HsnSacSearch label="SAC Code (Services)" value={w.sacCode || ''} codeType="SAC"
                  onChange={code => form.setValue('sacCode', code)} />
              )}
              <div className="flex items-end gap-2 text-xs text-muted-foreground pb-2">
                <Info size={13} className="shrink-0 mb-0.5" />
                <span>{!isService ? 'Type code (e.g. 3004) or keyword to search 22,000+ HSN codes' : 'Type code (e.g. 9954) or keyword to search 680+ SAC codes'}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="col-span-2">
                <SearchSelect label="Tax Rate (from Tax Master)" value={w.taxMasterId || ''}
                  onChange={handleTaxMasterChange} options={taxMasterOptions} placeholder="Select tax rate..." />
                <p className="text-xs text-muted-foreground mt-0.5">Selecting auto-fills GST % below</p>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">GST %</label>
                <Input type="number" step="0.01" min={0} max={100} {...form.register('gstRate')} className="bg-blue-50/40" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Cess %</label>
                <Input type="number" step="0.01" min={0} {...form.register('cessRate')} className="bg-blue-50/40" />
              </div>
            </div>
            <div className="mt-3">
              <Select label="Tax Type" options={TAX_TYPES} {...form.register('taxType')} className="max-w-xs" />
            </div>
            {Number(w.gstRate) > 0 && (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">CGST: {(Number(w.gstRate) / 2).toFixed(3)}%</Badge>
                <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">SGST: {(Number(w.gstRate) / 2).toFixed(3)}%</Badge>
                <Badge variant="secondary" className="bg-orange-50 text-orange-700 border-orange-200">IGST: {Number(w.gstRate)}%</Badge>
                {Number(w.cessRate) > 0 && <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-200">Cess: {Number(w.cessRate)}%</Badge>}
              </div>
            )}
          </div>

          {/* Pricing */}
          <div className="form-section">
            <h3 className="form-section-title">Pricing</h3>
            <div className="grid grid-cols-3 gap-4">
              <Input label="Purchase Rate (₹)" type="number" step="0.0001" {...form.register('purchaseRate')} helperText="Your cost price" />
              <Input label="Sale Rate (₹)" type="number" step="0.0001" {...form.register('saleRate')} helperText={margin ? `Gross margin: ${margin}%` : 'Default selling price'} />
              <Input label="MRP (₹)" type="number" step="0.01" {...form.register('mrp')} helperText="Max retail price" />
            </div>
            <button type="button" onClick={() => setShowPTR(s => !s)} className="flex items-center gap-1.5 text-xs text-primary font-medium mt-3">
              {showPTR ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {showPTR ? 'Hide' : 'Add'} PTR / PTS / Wholesale Rates
            </button>
            {showPTR && (
              <div className="grid grid-cols-3 gap-4 mt-3 p-4 bg-muted/30 rounded-lg">
                <Input label="PTR (₹)" type="number" step="0.0001" {...form.register('ptr')} helperText="Price to Retailer" />
                <Input label="PTS (₹)" type="number" step="0.0001" {...form.register('pts')} helperText="Price to Stockist" />
                <Input label="Wholesale Rate (₹)" type="number" step="0.0001" {...form.register('wholesaleRate')} helperText="Bulk rate" />
              </div>
            )}
          </div>

          {/* Discounts */}
          <div className="form-section">
            <h3 className="form-section-title">Default Discounts</h3>
            <p className="text-xs text-muted-foreground mb-3">Auto-fill on vouchers — can be overridden per transaction.</p>
            <div className="grid grid-cols-3 gap-4">
              <Input label="Trade Discount %" type="number" step="0.01" min={0} max={100} {...form.register('tradeDiscount')} helperText="Applied automatically" />
              <Input label="Cash/Prompt Discount %" type="number" step="0.01" min={0} max={100} {...form.register('cashDiscount')} helperText="For prompt payment" />
              <Input label="Scheme Discount %" type="number" step="0.01" min={0} max={100} {...form.register('schemeDiscount')} helperText="Seasonal / festival" />
            </div>
            {netRate && (
              <div className="mt-3 bg-card border border-border rounded-lg px-4 py-3 text-sm flex items-center justify-between">
                <span className="text-muted-foreground text-xs">Net Rate after all discounts</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground line-through">₹{w.saleRate.toFixed(2)}</span>
                  <span className="font-bold text-primary font-mono">₹{netRate}</span>
                  <span className="text-xs text-green-600">({(((w.saleRate - Number(netRate)) / w.saleRate) * 100).toFixed(1)}% off)</span>
                </div>
              </div>
            )}
          </div>

          {/* Inventory — only for Goods */}
          {!isService && (
            <div className="form-section">
              <h3 className="form-section-title">Inventory Control</h3>
              <label className="flex items-center gap-3 mb-4 cursor-pointer">
                <input type="checkbox" {...form.register('maintainStock')} className="w-4 h-4 rounded" />
                <span className="text-sm font-medium">Maintain Stock</span>
              </label>
              {w.maintainStock && (
                <div className="grid grid-cols-3 gap-4">
                  <Input label="Reorder Level" type="number" step="0.001" {...form.register('reorderLevel')} helperText="Alert when below this" />
                  <Input label="Reorder Qty" type="number" step="0.001" {...form.register('reorderQty')} helperText="Suggested order qty" />
                  <Input label="Min Sale Qty" type="number" step="0.001" {...form.register('minSaleQty')} helperText="Min qty per order" />
                </div>
              )}
            </div>
          )}

          {/* Service Accounting — only for Services */}
          {isService && (
            <div className="form-section">
              <h3 className="form-section-title flex items-center gap-2">
                <Wrench size={14} /> Service Accounting Ledgers
              </h3>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs mb-4">
                <Info size={13} className="shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium">How it works: </span>
                  When this service is sold → <strong>Income Ledger</strong> credited.
                  When purchased → <strong>Expense Ledger</strong> debited.
                  If left blank, company defaults from <strong>Settings → Ledger Mapping</strong> are used
                  (<em>Service Income</em> and <em>Service Charges</em>).
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <SearchSelect
                  label="Income Ledger (when sold)"
                  value={w.incomeLedgerId || ''}
                  onChange={v => form.setValue('incomeLedgerId', v || null)}
                  options={[
                    { value: '', label: '— Use company default (Service Income) —' },
                    ...(ledgers as any[])
                      .filter((l: any) => ['INCOME', 'LIABILITY'].includes(l.group?.nature))
                      .map((l: any) => ({ value: l.id, label: `${l.name} (${l.group?.name})` })),
                  ]}
                  placeholder="Select income ledger..."
                />
                <SearchSelect
                  label="Expense Ledger (when purchased)"
                  value={w.expenseLedgerId || ''}
                  onChange={v => form.setValue('expenseLedgerId', v || null)}
                  options={[
                    { value: '', label: '— Use company default (Service Charges) —' },
                    ...(ledgers as any[])
                      .filter((l: any) => ['EXPENSE', 'ASSET'].includes(l.group?.nature))
                      .map((l: any) => ({ value: l.id, label: `${l.name} (${l.group?.name})` })),
                  ]}
                  placeholder="Select expense ledger..."
                />
              </div>

              {/* TDS Section */}
              <div className="mt-4 pt-4 border-t border-border">
                <label className="flex items-center gap-3 mb-3 cursor-pointer">
                  <input type="checkbox" {...form.register('tdsApplicable')} className="w-4 h-4 rounded" />
                  <div>
                    <span className="text-sm font-medium">TDS Applicable on Purchase</span>
                    <p className="text-xs text-muted-foreground">Enable if TDS must be deducted when purchasing this service</p>
                  </div>
                </label>
                {w.tdsApplicable && (
                  <div className="grid grid-cols-3 gap-4 mt-3 p-3 bg-orange-50/50 border border-orange-200/60 rounded-lg">
                    <SearchSelect
                      label="TDS Section *"
                      value={w.tdsSection || ''}
                      onChange={v => form.setValue('tdsSection', v || null)}
                      options={[
                        { value: '', label: '-- Select Section --' },
                        { value: '194C', label: '194C — Contractor / Sub-contractor' },
                        { value: '194J', label: '194J — Professional / Technical Services' },
                        { value: '194I', label: '194I — Rent' },
                        { value: '194IB', label: '194IB — Rent by Individual/HUF' },
                        { value: '194H', label: '194H — Commission / Brokerage' },
                        { value: '194A', label: '194A — Interest (non-bank)' },
                        { value: '194D', label: '194D — Insurance Commission' },
                        { value: '194O', label: '194O — E-commerce Operator' },
                        { value: '194Q', label: '194Q — Purchase of Goods' },
                        { value: '195', label: '195 — Non-resident Payments' },
                      ]}
                      placeholder="Select section..."
                    />
                    <div>
                      <label className="block text-xs font-medium mb-1">TDS Rate %</label>
                      <Input
                        type="number" step="0.01" min={0} max={100}
                        placeholder="e.g. 2, 10"
                        {...form.register('tdsRate')}
                      />
                      <p className="text-xs text-muted-foreground mt-0.5">Auto-applied on purchase</p>
                    </div>
                    <div className="flex items-end pb-1">
                      <div className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded p-2 leading-relaxed">
                        <strong>Example:</strong> 194J at 10% on ₹50,000 → TDS ₹5,000 deducted, vendor paid ₹45,000
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </form>
      )}

      {/* ── Variants Tab ── */}
      {activeTab === 'variants' && isEdit && item && (
        <div className="form-section">
          <h3 className="form-section-title">Item Variants</h3>
          <p className="text-xs text-muted-foreground mb-4">Manage Color+Size, Batch+Expiry combinations. Attributes defined in Masters → Item Categories.</p>
          <ItemVariantsManager itemId={item.id} itemName={item.name}
            categoryAttributes={categoryAttributes as any[]}
            basePrice={{ purchaseRate: Number(item.purchaseRate), saleRate: Number(item.saleRate) }} />
        </div>
      )}

      {/* ── GST History Tab ── */}
      {activeTab === 'tax-history' && isEdit && id && <TaxHistorySection itemId={id} />}
    </div>
  )
}
