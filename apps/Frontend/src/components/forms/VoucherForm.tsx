import { useState, useEffect, useCallback, useRef } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2, Save, ArrowLeft, Printer, AlertCircle, Search, Info } from 'lucide-react'
import dayjs from 'dayjs'
import { Button, Input, Select, Textarea, Badge } from '../ui'
import { formatINR, amountInWords, roundOff, INDIAN_STATES, calculateLineGST } from '../../lib/india'
import { useParties, useItems, useBranches } from '../../hooks/api.hooks'
import { useAuthStore } from '../../stores/auth.store'
import { api, extractError } from '../../lib/api'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

const SALE_TYPES = [
  { value: 'REGULAR', label: 'Regular (B2B/B2C)' },
  { value: 'EXPORT_WITH_LUT', label: 'Export — With LUT (Zero Rated)' },
  { value: 'EXPORT_WITHOUT_LUT', label: 'Export — Without LUT (IGST paid)' },
  { value: 'SEZ_WITH_PAYMENT', label: 'SEZ — With Payment of Tax' },
  { value: 'SEZ_WITHOUT_PAYMENT', label: 'SEZ — Without Payment (Zero Rated)' },
  { value: 'DEEMED_EXPORT', label: 'Deemed Export' },
  { value: 'COMPOSITION', label: 'Composition Dealer (no GST)' },
]

const PURCHASE_TYPES = [
  { value: 'REGULAR', label: 'Regular Purchase' },
  { value: 'IMPORT', label: 'Import (Overseas Supplier)' },
  { value: 'SEZ', label: 'From SEZ Unit' },
  { value: 'UNREGISTERED', label: 'From Unregistered Dealer (URD)' },
  { value: 'COMPOSITION', label: 'From Composition Dealer' },
]

const ZERO_GST_TYPES = ['EXPORT_WITH_LUT', 'SEZ_WITHOUT_PAYMENT', 'COMPOSITION']

const itemRowSchema = z.object({
  itemId: z.string().min(1, 'Select item'),
  description: z.string().optional(),
  unit: z.string().default('PCS'),
  qty: z.coerce.number().positive(),
  freeQty: z.coerce.number().default(0),
  rate: z.coerce.number().min(0),
  discountPct: z.coerce.number().min(0).max(100).default(0),
  discount2Pct: z.coerce.number().min(0).max(100).default(0),
  discount3Pct: z.coerce.number().min(0).max(100).default(0),
  gstRate: z.coerce.number().default(18),
  taxType: z.string().default('CGST_SGST'),
  batchNo: z.string().optional(),
  _itemName: z.string().optional(),
  _item: z.any().optional(),
})

const voucherFormSchema = z.object({
  date: z.string().min(1),
  branchId: z.string().optional(),
  partyId: z.string().optional(),
  narration: z.string().optional(),
  placeOfSupply: z.string().optional(),
  saleType: z.string().default('REGULAR'),
  lut: z.string().optional(),
  lutDate: z.string().optional(),
  isReverseCharge: z.boolean().default(false),
  items: z.array(itemRowSchema).min(1),
  roundOff: z.coerce.number().default(0),
})

export type VoucherFormValues = z.infer<typeof voucherFormSchema>
export type VoucherType = 'SALE' | 'PURCHASE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'SALE_CHALLAN' | 'PURCHASE_ORDER' | 'PURCHASE_CHALLAN' | 'PRODUCTION'

const PARTY_LABEL: Record<string, string> = {
  SALE: 'Customer', PURCHASE: 'Vendor', CREDIT_NOTE: 'Customer', DEBIT_NOTE: 'Vendor',
  SALE_CHALLAN: 'Customer', PURCHASE_ORDER: 'Vendor', PURCHASE_CHALLAN: 'Vendor',
}
const PARTY_TYPE: Record<string, string> = {
  SALE: 'CUSTOMER', PURCHASE: 'VENDOR', CREDIT_NOTE: 'CUSTOMER', DEBIT_NOTE: 'VENDOR',
  SALE_CHALLAN: 'CUSTOMER', PURCHASE_ORDER: 'VENDOR', PURCHASE_CHALLAN: 'VENDOR',
}

const STATE_OPTS = [{ value: '', label: 'Select state' }, ...INDIAN_STATES.map(s => ({ value: s.code, label: `${s.code} - ${s.name}` }))]

function calcLineTotals(qty: number, rate: number, d1: number, d2: number, d3: number, gstRate: number, taxType: string) {
  const netRate = rate * (1 - d1 / 100) * (1 - d2 / 100) * (1 - d3 / 100)
  return calculateLineGST(qty, netRate, 0, gstRate, taxType as any)
}

function PartySearch({ onChange, type }: { onChange: (id: string, name: string, party?: any) => void; type: string }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [selName, setSelName] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const { data } = useParties({ search: q, type: type || undefined, limit: 20 })
  const parties = (data as any)?.data || []
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder={`Search ${PARTY_LABEL[type] || 'party'}...`}
          value={open ? q : selName}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => { setOpen(true); setQ('') }} />
      </div>
      {open && parties.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {parties.map((p: any) => (
            <button key={p.id} type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between"
              onClick={() => { onChange(p.id, p.name, p); setSelName(p.name); setQ(''); setOpen(false) }}>
              <span>{p.name}</span>
              <div className="flex gap-1.5">
                {p.gstin && <span className="text-xs text-muted-foreground font-mono">{p.gstin}</span>}
                {p.gstRegType && p.gstRegType !== 'REGULAR' && <Badge variant="warning" className="text-[9px]">{p.gstRegType}</Badge>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ItemSearch({ onSelect }: { onSelect: (item: any) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { data } = useItems({ search: q, limit: 20 })
  const items = (data as any)?.data || []
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input className="h-8 w-full rounded border border-input bg-background pl-7 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Search item..." value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)} />
      </div>
      {open && items.length > 0 && (
        <div className="absolute z-50 mt-1 w-72 bg-card border border-border rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {items.map((item: any) => (
            <button key={item.id} type="button"
              className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 flex items-center justify-between gap-2"
              onClick={() => { onSelect(item); setQ(item.name); setOpen(false) }}>
              <span className="truncate font-medium">{item.name}</span>
              <div className="flex items-center gap-1 shrink-0">
                {Number(item.ptr || 0) > 0 && <span className="text-[9px] bg-primary/10 text-primary px-1 rounded">PTR ₹{Number(item.ptr).toFixed(0)}</span>}
                <span className="text-muted-foreground">{item.unit}</span>
                <Badge variant="secondary" className="text-[9px] px-1">{item.gstRate}%</Badge>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface Props { voucherType: VoucherType; title: string; initial?: any; onSuccess?: () => void }

export default function VoucherForm({ voucherType, title, initial, onSuccess }: Props) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { activeCompany, activeFY } = useAuthStore()
  const { data: branches = [] } = useBranches(activeCompany?.companyId || '')
  const [saving, setSaving] = useState(false)
  const [posting, setPosting] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [savedId, setSavedId] = useState(initial?.id || '')
  const [savedNumber, setSavedNumber] = useState(initial?.voucherNumber || '')
  const [savedStatus, setSavedStatus] = useState(initial?.status || '')
  const [showDisc2, setShowDisc2] = useState(false)
  const [showDisc3, setShowDisc3] = useState(false)

  const isSale = ['SALE', 'CREDIT_NOTE', 'SALE_CHALLAN'].includes(voucherType)
  const isPurchase = voucherType === 'PURCHASE'

  const form = useForm<VoucherFormValues>({
    resolver: zodResolver(voucherFormSchema),
    defaultValues: {
      date: dayjs().format('YYYY-MM-DD'), branchId: '', partyId: '',
      narration: '', placeOfSupply: '08', saleType: 'REGULAR',
      lut: '', isReverseCharge: false,
      items: [{ itemId: '', unit: 'PCS', qty: 1, freeQty: 0, rate: 0, discountPct: 0, discount2Pct: 0, discount3Pct: 0, gstRate: 18, taxType: 'CGST_SGST' }],
      roundOff: 0,
    },
  })

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' })
  const watchedItems = form.watch('items')
  const saleType = form.watch('saleType')
  const zeroGST = ZERO_GST_TYPES.includes(saleType)

  useEffect(() => {
    if (zeroGST) {
      watchedItems.forEach((_, i) => form.setValue(`items.${i}.gstRate`, 0))
    }
  }, [saleType])

  const totals = useCallback(() => {
    let subtotal = 0, taxable = 0, cgst = 0, sgst = 0, igst = 0, cess = 0
    for (const item of watchedItems) {
      if (!item.qty || !item.rate) continue
      const c = calcLineTotals(Number(item.qty), Number(item.rate),
        Number(item.discountPct || 0), Number(item.discount2Pct || 0), Number(item.discount3Pct || 0),
        Number(item.gstRate || 0), item.taxType)
      subtotal += Number(item.qty) * Number(item.rate)
      taxable += c.taxableAmount; cgst += c.cgstAmount; sgst += c.sgstAmount; igst += c.igstAmount; cess += c.cessAmount
    }
    const beforeRound = taxable + cgst + sgst + igst + cess
    const ro = roundOff(beforeRound)
    return { subtotal, taxable, cgst, sgst, igst, cess, roundOff: ro, grand: Math.round(beforeRound) }
  }, [watchedItems])

  const t = totals()
  useEffect(() => { form.setValue('roundOff', t.roundOff) }, [t.roundOff])

  const handleItemSelect = (index: number, item: any) => {
    const rate = isPurchase ? Number(item.purchaseRate) : Number(item.saleRate)
    form.setValue(`items.${index}`, {
      ...form.getValues(`items.${index}`),
      itemId: item.id, _itemName: item.name, _item: item, unit: item.unit, rate,
      gstRate: zeroGST ? 0 : Number(item.gstRate), taxType: item.taxType,
      discountPct: Number(item.tradeDiscount || 0),
      discount2Pct: Number(item.cashDiscount || 0),
      discount3Pct: Number(item.schemeDiscount || 0),
    })
    if (Number(item.cashDiscount || 0) > 0) setShowDisc2(true)
    if (Number(item.schemeDiscount || 0) > 0) setShowDisc3(true)
  }

  const buildPayload = (values: VoucherFormValues) => ({
    voucherType, date: values.date, branchId: values.branchId || null, partyId: values.partyId || null,
    narration: values.narration, placeOfSupply: values.placeOfSupply,
    saleType: values.saleType, lut: values.lut || null, lutDate: values.lutDate || null,
    isReverseCharge: values.isReverseCharge,
    isExport: ['EXPORT_WITH_LUT', 'EXPORT_WITHOUT_LUT'].includes(values.saleType),
    items: values.items.map(r => ({
      itemId: r.itemId, unit: r.unit, qty: Number(r.qty), freeQty: Number(r.freeQty || 0),
      rate: Number(r.rate), discountPct: Number(r.discountPct || 0),
      discount2Pct: Number(r.discount2Pct || 0), discount3Pct: Number(r.discount3Pct || 0),
      gstRate: Number(r.gstRate), taxType: r.taxType, batchNo: r.batchNo,
    })),
    ledgerEntries: [],
  })

  const onSaveDraft = async (values: VoucherFormValues) => {
    setSaveError(''); setSaving(true)
    try {
      if (savedId) { await api.put(`/billing/vouchers/${savedId}`, buildPayload(values)) }
      else {
        const { data } = await api.post('/billing/vouchers', buildPayload(values))
        setSavedId(data.data.id); setSavedNumber(data.data.voucherNumber); setSavedStatus(data.data.status)
      }
      qc.invalidateQueries({ queryKey: ['vouchers'] })
    } catch (e) { setSaveError(extractError(e)) }
    finally { setSaving(false) }
  }

  const onPost = async () => {
    if (!savedId) { const valid = await form.trigger(); if (!valid) return; await form.handleSubmit(onSaveDraft)() }
    if (!savedId) return
    setSaveError(''); setPosting(true)
    try {
      await api.post(`/billing/vouchers/${savedId}/post`)
      setSavedStatus('POSTED'); qc.invalidateQueries({ queryKey: ['vouchers'] }); onSuccess?.()
    } catch (e) { setSaveError(extractError(e)) }
    finally { setPosting(false) }
  }

  const isPosted = savedStatus === 'POSTED'

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="page-title">{title}</h1>
            {savedNumber && <Badge variant={isPosted ? 'success' : 'outline'} className="text-xs">{savedNumber} · {savedStatus}</Badge>}
          </div>
          <p className="page-subtitle">{activeFY ? `FY ${activeFY}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}><ArrowLeft size={15} /> Back</Button>
          {!isPosted && (
            <>
              <Button variant="secondary" onClick={form.handleSubmit(onSaveDraft)} loading={saving}><Save size={15} /> Draft</Button>
              <Button onClick={onPost} loading={posting}><Save size={15} /> Save & Post</Button>
            </>
          )}
          {isPosted && <Button variant="outline" onClick={() => window.print()}><Printer size={15} /> Print</Button>}
        </div>
      </div>

      {saveError && <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-md px-4 py-3 text-sm text-destructive"><AlertCircle size={15} /> {saveError}</div>}

      <fieldset disabled={isPosted} className="space-y-4">
        <div className="form-section">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Input label="Date" type="date" required {...form.register('date')} />
            {(branches as any[]).length > 1 && (
              <Select label="Branch" options={(branches as any[]).map((b: any) => ({ value: b.id, label: b.name }))} {...form.register('branchId')} />
            )}
            {PARTY_LABEL[voucherType] && (
              <div className="col-span-2">
                <label className="text-xs font-medium text-foreground block mb-1.5">{PARTY_LABEL[voucherType]} *</label>
                <PartySearch type={PARTY_TYPE[voucherType] || ''}
                  onChange={(id, name, party) => {
                    form.setValue('partyId', id)
                    if (party?.stateCode) form.setValue('placeOfSupply', party.stateCode)
                  }} />
              </div>
            )}
            <Select label="Place of Supply" options={STATE_OPTS} {...form.register('placeOfSupply')} />

            {isSale && (
              <div className="col-span-2">
                <Select label="Sale Type" options={SALE_TYPES} {...form.register('saleType')} />
              </div>
            )}
            {isPurchase && (
              <div className="col-span-2">
                <Select label="Purchase Type" options={PURCHASE_TYPES} {...form.register('saleType')} />
              </div>
            )}

            {['EXPORT_WITH_LUT', 'SEZ_WITHOUT_PAYMENT'].includes(saleType) && (
              <>
                <Input label="LUT Number" placeholder="AD123456789012" className="font-mono" {...form.register('lut')} helperText="Letter of Undertaking" />
                <Input label="LUT Date" type="date" {...form.register('lutDate')} />
              </>
            )}

            {zeroGST && (
              <div className="col-span-4 flex items-center gap-2 bg-info-muted border border-info/20 rounded-md px-3 py-2 text-xs text-info">
                <Info size={13} /> GST will be ZERO — {SALE_TYPES.find(s => s.value === saleType)?.label}
              </div>
            )}

            <div className="flex gap-4 col-span-2 pt-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" {...form.register('isReverseCharge')} className="w-4 h-4" /> Reverse Charge (RCM)
              </label>
            </div>
          </div>
        </div>

        {/* Discount columns toggle */}
        <div className="flex items-center gap-4 text-xs">
          <span className="text-muted-foreground">Show discount columns:</span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked className="w-3.5 h-3.5" readOnly /> Disc 1 (Trade)
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer" onClick={() => setShowDisc2(s => !s)}>
            <input type="checkbox" checked={showDisc2} readOnly className="w-3.5 h-3.5" /> Disc 2 (Cash/Scheme)
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer" onClick={() => setShowDisc3(s => !s)}>
            <input type="checkbox" checked={showDisc3} readOnly className="w-3.5 h-3.5" /> Disc 3 (Special)
          </label>
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-primary/5">
                  {['#','Item','Unit','Qty','Free','Rate','Disc1%', ...(showDisc2?['Disc2%']:[]), ...(showDisc3?['Disc3%']:[]),'Taxable','GST%','Tax','Total',''].map((h, i) => (
                    <th key={i} className={`px-2 py-2 font-semibold text-primary uppercase tracking-wide ${['Taxable','Tax','Total','Rate'].includes(h) ? 'text-right' : ['Qty','Free','Disc1%','Disc2%','Disc3%','GST%'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fields.map((field, index) => {
                  const row = watchedItems[index] || {}
                  const calc = row.qty && row.rate ? calcLineTotals(Number(row.qty), Number(row.rate), Number(row.discountPct||0), Number(row.discount2Pct||0), Number(row.discount3Pct||0), Number(row.gstRate||0), row.taxType) : null
                  const inp = (w: string | number, cls = '') => `h-7 w-${w} rounded border border-input bg-background px-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-ring ${cls}`
                  return (
                    <tr key={field.id} className="border-t border-border/50 hover:bg-muted/20">
                      <td className="px-2 py-1.5 text-muted-foreground">{index+1}</td>
                      <td className="px-2 py-1.5 min-w-[180px]">
                        <ItemSearch onSelect={item => handleItemSelect(index, item)} />
                        {(row as any)._itemName && (
                          <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[170px]">
                            {(row as any)._itemName}
                            {Number((row as any)._item?.ptr||0) > 0 && <span className="ml-1 text-primary">PTR:₹{Number((row as any)._item.ptr).toFixed(0)}</span>}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5"><input className="h-7 w-12 rounded border border-input bg-background px-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-ring" {...form.register(`items.${index}.unit`)} /></td>
                      <td className="px-2 py-1.5"><input type="number" min="0" step="0.001" className={inp(16)} {...form.register(`items.${index}.qty`)} /></td>
                      <td className="px-2 py-1.5"><input type="number" min="0" step="0.001" className={inp(14)} {...form.register(`items.${index}.freeQty`)} /></td>
                      <td className="px-2 py-1.5"><input type="number" min="0" step="0.0001" className={inp(20)} {...form.register(`items.${index}.rate`)} /></td>
                      <td className="px-2 py-1.5"><input type="number" min="0" max="100" step="0.01" className={inp(12)} {...form.register(`items.${index}.discountPct`)} /></td>
                      {showDisc2 && <td className="px-2 py-1.5"><input type="number" min="0" max="100" step="0.01" className={inp(12)} {...form.register(`items.${index}.discount2Pct`)} /></td>}
                      {showDisc3 && <td className="px-2 py-1.5"><input type="number" min="0" max="100" step="0.01" className={inp(12)} {...form.register(`items.${index}.discount3Pct`)} /></td>}
                      <td className="px-2 py-1.5 text-right font-mono">{calc ? formatINR(calc.taxableAmount, 2) : '—'}</td>
                      <td className="px-2 py-1.5"><select className="h-7 w-12 rounded border border-input bg-background px-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-ring" {...form.register(`items.${index}.gstRate`)} disabled={zeroGST}>{[0,5,12,18,28].map(r=><option key={r} value={r}>{r}%</option>)}</select></td>
                      <td className="px-2 py-1.5 text-right font-mono">{calc ? formatINR(calc.totalTax, 2) : '—'}</td>
                      <td className="px-2 py-1.5 text-right font-mono font-medium">{calc ? formatINR(calc.lineTotal, 2) : '—'}</td>
                      <td className="px-2 py-1.5">{fields.length > 1 && <button type="button" onClick={() => remove(index)} className="text-muted-foreground hover:text-destructive"><Trash2 size={13} /></button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {!isPosted && (
            <div className="px-4 py-2 border-t border-border/50">
              <button type="button" onClick={() => append({ itemId:'',unit:'PCS',qty:1,freeQty:0,rate:0,discountPct:0,discount2Pct:0,discount3Pct:0,gstRate:18,taxType:'CGST_SGST' } as any)} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80">
                <Plus size={13} /> Add Item Row
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-section">
            <Textarea label="Narration" rows={3} {...form.register('narration')} />
          </div>
          <div className="bg-card border border-border rounded-lg p-4 space-y-2 text-sm">
            {[
              { label: 'Subtotal', value: formatINR(t.subtotal) },
              t.subtotal !== t.taxable ? { label: 'Taxable (after disc)', value: formatINR(t.taxable) } : null,
              t.cgst > 0 ? { label: 'CGST', value: formatINR(t.cgst) } : null,
              t.sgst > 0 ? { label: 'SGST', value: formatINR(t.sgst) } : null,
              t.igst > 0 ? { label: 'IGST', value: formatINR(t.igst) } : null,
              t.cess > 0 ? { label: 'Cess', value: formatINR(t.cess) } : null,
              Math.abs(t.roundOff) > 0 ? { label: 'Round Off', value: (t.roundOff > 0 ? '+' : '') + formatINR(t.roundOff) } : null,
            ].filter(Boolean).map((r: any) => (
              <div key={r.label} className="flex justify-between text-muted-foreground"><span>{r.label}</span><span className="font-mono">{r.value}</span></div>
            ))}
            <div className="flex justify-between font-bold text-base border-t border-border pt-2 mt-2">
              <span>Grand Total</span><span className="font-mono">{formatINR(t.grand)}</span>
            </div>
            <p className="text-xs text-muted-foreground italic">{amountInWords(t.grand)}</p>
          </div>
        </div>
      </fieldset>
    </div>
  )
}
