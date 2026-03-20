import { useState, useEffect, useCallback, useRef } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus, Trash2, Save, ArrowLeft, Printer, AlertCircle,
  Search, Info, X, Package, ChevronRight
} from 'lucide-react'
import dayjs from 'dayjs'
import { Button, Input, Select, Textarea, Badge, Spinner } from '../ui'
import { formatINR, amountInWords, roundOff, INDIAN_STATES, calculateLineGST } from '../../lib/india'
import { useBranches } from '../../hooks/api.hooks'
import { useAuthStore } from '../../stores/auth.store'
import { api, extractError } from '../../lib/api'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { cn } from '../ui/utils'

// ─── Constants ────────────────────────────────────────────────────────────────

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

const STATE_OPTS = [
  { value: '', label: 'Select state' },
  ...INDIAN_STATES.map(s => ({ value: s.code, label: `${s.code} - ${s.name}` })),
]

const PARTY_LABEL: Record<string, string> = {
  SALE: 'Customer', PURCHASE: 'Vendor', CREDIT_NOTE: 'Customer', DEBIT_NOTE: 'Vendor',
  SALE_CHALLAN: 'Customer', PURCHASE_ORDER: 'Vendor', PURCHASE_CHALLAN: 'Vendor',
}
const PARTY_TYPE: Record<string, string> = {
  SALE: 'CUSTOMER', PURCHASE: 'VENDOR', CREDIT_NOTE: 'CUSTOMER', DEBIT_NOTE: 'VENDOR',
  SALE_CHALLAN: 'CUSTOMER', PURCHASE_ORDER: 'VENDOR', PURCHASE_CHALLAN: 'VENDOR',
}

export type VoucherType = 'SALE' | 'PURCHASE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'SALE_CHALLAN' | 'PURCHASE_ORDER' | 'PURCHASE_CHALLAN' | 'PRODUCTION'

// ─── Schema ───────────────────────────────────────────────────────────────────

const itemRowSchema = z.object({
  itemId: z.string().min(1, 'Select item'),
  variantId: z.string().optional().nullable(),
  _itemName: z.string().optional(),
  _variantLabel: z.string().optional(),
  _item: z.any().optional(),
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
  isInclusive: z.boolean().default(false),
  items: z.array(itemRowSchema).min(1),
  roundOff: z.coerce.number().default(0),
})

type VoucherFormValues = z.infer<typeof voucherFormSchema>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcLine(qty: number, rate: number, d1: number, d2: number, d3: number, gstRate: number, taxType: string, inclusive = false) {
  const netRate = rate * (1 - d1 / 100) * (1 - d2 / 100) * (1 - d3 / 100)
  return calculateLineGST(qty, netRate, 0, gstRate, taxType as any, 0, inclusive)
}

// ─── Party Search ─────────────────────────────────────────────────────────────

function PartySearch({ type, onChange }: { type: string; onChange: (id: string, name: string, party?: any) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [selName, setSelName] = useState('')
  const [parties, setParties] = useState<any[]>([])
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get('/masters/parties', { params: { search: q, type: type || undefined, limit: 25 } })
        setParties(data.data || [])
      } catch { setParties([]) }
    }, 250)
    return () => clearTimeout(t)
  }, [q, open, type])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder={`Search ${PARTY_LABEL[type] || 'party'}...`}
          value={open ? q : selName}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => { setOpen(true); setQ('') }}
        />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-lg shadow-xl max-h-56 overflow-y-auto">
          {parties.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground text-center">{q ? 'No results' : 'Start typing to search...'}</p>
          ) : parties.map((p: any) => (
            <button key={p.id} type="button"
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted/60 flex items-center justify-between border-b border-border/20 last:border-0"
              onClick={() => { onChange(p.id, p.name, p); setSelName(p.name); setOpen(false) }}>
              <div>
                <div className="font-medium">{p.name}</div>
                {p.city && <div className="text-xs text-muted-foreground">{p.city}</div>}
              </div>
              <div className="flex gap-1.5 items-center shrink-0 ml-2">
                {p.gstin && <span className="text-[10px] font-mono text-muted-foreground">{p.gstin.substring(0, 15)}</span>}
                {p.gstType && p.gstType !== 'REGULAR' && <Badge variant="warning" className="text-[9px]">{p.gstType}</Badge>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Item + Variant Popup ─────────────────────────────────────────────────────

interface ItemPickerProps {
  isPurchase: boolean
  zeroGST: boolean
  currentLabel: string
  onSelect: (item: any, variant: any | null) => void
}

function ItemPickerCell({ isPurchase, zeroGST, currentLabel, onSelect }: ItemPickerProps) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'items' | 'variants'>('items')
  const [selItem, setSelItem] = useState<any>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const openPicker = () => { setOpen(true); setQ(''); setStep('items'); setSelItem(null) }
  const closePicker = () => { setOpen(false); setQ(''); setStep('items'); setSelItem(null) }

  useEffect(() => {
    if (!open || step !== 'items') return
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get('/masters/items', { params: { search: q, limit: 40, isActive: 'true' } })
        // Fetch with variants included
        setItems(data.data || [])
      } catch { setItems([]) }
      finally { setLoading(false) }
    }, 200)
    return () => clearTimeout(t)
  }, [q, open, step])

  useEffect(() => {
    if (open && step === 'items') setTimeout(() => searchRef.current?.focus(), 50)
  }, [open, step])

  const pickItem = async (item: any) => {
    // Fetch full item with variants
    try {
      const { data } = await api.get(`/masters/items/${item.id}`)
      const full = data.data
      const variants = full.variants?.filter((v: any) => v.isActive) || []
      if (variants.length === 0) {
        onSelect(full, null)
        closePicker()
      } else {
        setSelItem(full)
        setStep('variants')
      }
    } catch {
      onSelect(item, null)
      closePicker()
    }
  }

  const pickVariant = (variant: any) => {
    onSelect(selItem, variant)
    closePicker()
  }

  const pickNoVariant = () => {
    onSelect(selItem, null)
    closePicker()
  }

  return (
    <>
      {/* Trigger cell */}
      <button
        type="button"
        onClick={openPicker}
        className={cn(
          'h-8 w-full rounded border text-xs px-2 flex items-center gap-1.5 transition-all text-left',
          currentLabel
            ? 'border-border bg-background hover:border-primary/50'
            : 'border-dashed border-primary/40 bg-primary/5 text-primary hover:border-primary hover:bg-primary/10'
        )}
      >
        <Package size={11} className={cn('shrink-0', currentLabel ? 'text-muted-foreground' : 'text-primary')} />
        <span className="truncate font-medium">{currentLabel || 'Click to select item...'}</span>
        {!currentLabel && <ChevronRight size={11} className="ml-auto shrink-0 text-primary" />}
      </button>

      {/* Popup */}
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onMouseDown={e => { if (e.target === e.currentTarget) closePicker() }}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card">
              <div className="flex items-center gap-2">
                <Package size={18} className="text-primary" />
                <h2 className="font-bold text-base">
                  {step === 'items' ? 'Select Item' : `Select Variant — ${selItem?.name}`}
                </h2>
                {step === 'variants' && (
                  <button onClick={() => setStep('items')} className="text-xs text-primary hover:underline ml-1">
                    ← Back
                  </button>
                )}
              </div>
              <button onClick={closePicker} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Search bar (items step) */}
            {step === 'items' && (
              <div className="px-5 py-3 border-b border-border">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    ref={searchRef}
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    placeholder="Search by name, code, barcode, HSN..."
                    className="h-10 w-full rounded-lg border border-input bg-background pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto">

              {/* ── Step 1: Items ── */}
              {step === 'items' && (
                loading ? (
                  <div className="flex justify-center items-center h-32"><Spinner /></div>
                ) : items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                    <Package size={28} className="mb-2 opacity-30" />
                    <p className="text-sm">{q ? `No items found for "${q}"` : 'Start typing to search items'}</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-muted/60 border-b border-border">
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Item</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">HSN/SAC</th>
                        <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Unit</th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {isPurchase ? 'Purchase Rate' : 'Sale Rate'}
                        </th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">MRP</th>
                        <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">GST</th>
                        <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Variants</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item: any, i: number) => {
                        const rate = isPurchase ? Number(item.purchaseRate) : Number(item.saleRate)
                        const variantCount = item._count?.variants || item.variants?.length || 0
                        return (
                          <tr key={item.id}
                            onClick={() => pickItem(item)}
                            className={cn(
                              'border-b border-border/30 cursor-pointer hover:bg-primary/5 transition-colors',
                              i % 2 === 1 && 'bg-muted/10'
                            )}>
                            <td className="px-4 py-2.5">
                              <div className="font-semibold">{item.name}</div>
                              {item.code && <div className="text-xs text-muted-foreground font-mono">{item.code}</div>}
                              {item.category?.name && <div className="text-xs text-muted-foreground">{item.category.name}</div>}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                              {item.hsnCode || item.sacCode || '—'}
                            </td>
                            <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">{item.unit}</td>
                            <td className="px-3 py-2.5 text-right">
                              <span className="font-bold text-primary font-mono">{formatINR(rate)}</span>
                              {Number(item.ptr || 0) > 0 && !isPurchase && (
                                <div className="text-[10px] text-muted-foreground">PTR: {formatINR(Number(item.ptr))}</div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">
                              {Number(item.mrp || 0) > 0 ? formatINR(Number(item.mrp)) : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <Badge variant={zeroGST ? 'secondary' : 'outline'} className="text-[10px] font-mono">
                                {zeroGST ? '0%' : `${item.gstRate}%`}
                              </Badge>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {variantCount > 0 ? (
                                <Badge variant="warning" className="text-[10px]">
                                  {variantCount} var <ChevronRight size={9} className="inline" />
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )
              )}

              {/* ── Step 2: Variants ── */}
              {step === 'variants' && selItem && (
                <div className="p-5 space-y-3">
                  {/* Item summary */}
                  <div className="bg-muted/30 rounded-xl p-4 text-sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-base">{selItem.name}</div>
                        {selItem.category?.name && <div className="text-xs text-muted-foreground">{selItem.category.name}</div>}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Base {isPurchase ? 'Purchase' : 'Sale'} Rate</div>
                        <div className="font-bold text-primary font-mono">
                          {formatINR(isPurchase ? Number(selItem.purchaseRate) : Number(selItem.saleRate))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* No variant option */}
                  <button
                    onClick={pickNoVariant}
                    className="w-full text-left border-2 border-dashed border-border rounded-xl p-3 hover:border-primary hover:bg-primary/5 transition-all group">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium text-sm text-muted-foreground group-hover:text-foreground">
                          Without Variant (base rates)
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">Uses item's default rate</div>
                      </div>
                      <div className="font-bold font-mono text-sm">
                        {formatINR(isPurchase ? Number(selItem.purchaseRate) : Number(selItem.saleRate))}
                      </div>
                    </div>
                  </button>

                  {/* Variant list */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      {(selItem.variants || []).filter((v: any) => v.isActive).length} Variants Available
                    </p>
                    <div className="space-y-2">
                      {(selItem.variants || [])
                        .filter((v: any) => v.isActive)
                        .map((v: any) => {
                          const vRate = isPurchase ? Number(v.purchaseRate) : Number(v.saleRate)
                          const baseRate = isPurchase ? Number(selItem.purchaseRate) : Number(selItem.saleRate)
                          const attrEntries = Object.entries(v.attributeValues || {}).filter(([, val]) => val != null && val !== '')
                          const rateChanged = Math.abs(vRate - baseRate) > 0.001

                          return (
                            <button key={v.id}
                              onClick={() => pickVariant(v)}
                              className="w-full text-left border-2 border-border rounded-xl p-3 hover:border-primary hover:bg-primary/5 transition-all group">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {v.code && (
                                      <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded font-bold">{v.code}</span>
                                    )}
                                    {attrEntries.map(([k, val]) => (
                                      <span key={k} className="text-sm font-semibold">
                                        {String(val)}
                                      </span>
                                    ))}
                                    {attrEntries.length === 0 && v.code && (
                                      <span className="text-sm text-muted-foreground">Variant</span>
                                    )}
                                  </div>
                                  {v.barcode && (
                                    <div className="text-xs text-muted-foreground font-mono mt-1">📦 {v.barcode}</div>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  <div className={cn(
                                    'font-bold font-mono text-sm',
                                    rateChanged ? 'text-primary' : 'text-foreground'
                                  )}>
                                    {formatINR(vRate)}
                                  </div>
                                  {rateChanged && (
                                    <div className="text-[10px] text-muted-foreground line-through">
                                      {formatINR(baseRate)}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </button>
                          )
                        })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {step === 'items'
                  ? `${items.length} item${items.length !== 1 ? 's' : ''} · click to select`
                  : `${(selItem?.variants || []).filter((v: any) => v.isActive).length} variants · click to select`}
              </span>
              <span className="text-[10px]">Press Esc to close</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Main VoucherForm ─────────────────────────────────────────────────────────

interface Props {
  voucherType: VoucherType
  title: string
  initial?: any
  onSuccess?: () => void
}

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

  const isPurchase = ['PURCHASE', 'PURCHASE_ORDER', 'PURCHASE_CHALLAN', 'DEBIT_NOTE'].includes(voucherType)
  const isSale = ['SALE', 'CREDIT_NOTE', 'SALE_CHALLAN'].includes(voucherType)

  const form = useForm<VoucherFormValues>({
    resolver: zodResolver(voucherFormSchema),
    defaultValues: {
      date: dayjs().format('YYYY-MM-DD'),
      branchId: '', partyId: '', narration: '',
      placeOfSupply: '08', saleType: 'REGULAR',
      lut: '', isReverseCharge: false, isInclusive: false,
      items: [{
        itemId: '', variantId: null, unit: 'PCS',
        qty: 1, freeQty: 0, rate: 0,
        discountPct: 0, discount2Pct: 0, discount3Pct: 0,
        gstRate: 18, taxType: 'CGST_SGST',
      }],
      roundOff: 0,
    },
  })

  // Load initial values when editing
  useEffect(() => {
    if (initial && initial.id) {
      form.reset({
        date: initial.date || dayjs().format('YYYY-MM-DD'),
        partyId: initial.partyId || '',
        narration: initial.narration || '',
        placeOfSupply: initial.placeOfSupply || '08',
        saleType: initial.saleType || 'REGULAR',
        isReverseCharge: initial.isReverseCharge || false,
        items: initial.items?.length > 0 ? initial.items.map((it: any) => ({
          itemId: it.itemId, variantId: it.variantId || null,
          _itemName: it._itemName || it.item?.name,
          _variantLabel: it._variantLabel || '',
          unit: it.unit || 'PCS', qty: Number(it.qty),
          freeQty: Number(it.freeQty || 0), rate: Number(it.rate),
          discountPct: Number(it.discountPct || 0),
          discount2Pct: Number(it.discount2Pct || 0),
          discount3Pct: Number(it.discount3Pct || 0),
          gstRate: Number(it.gstRate), taxType: it.taxType || 'CGST_SGST',
        })) : form.getValues('items'),
        roundOff: 0,
      })
    }
  }, [initial?.id])

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' })
  const watchedItems = form.watch('items')
  const saleType = form.watch('saleType')
  const isInclusive = form.watch('isInclusive')
  const zeroGST = ZERO_GST_TYPES.includes(saleType)

  useEffect(() => {
    if (zeroGST) watchedItems.forEach((_, i) => form.setValue(`items.${i}.gstRate`, 0))
  }, [saleType])

  // ── Totals ─────────────────────────────────────────────────────────────────

  const totals = useCallback(() => {
    let subtotal = 0, taxable = 0, cgst = 0, sgst = 0, igst = 0, cess = 0, lineTotalSum = 0
    for (const row of watchedItems) {
      if (!row.qty || !row.rate) continue
      const c = calcLine(Number(row.qty), Number(row.rate),
        Number(row.discountPct || 0), Number(row.discount2Pct || 0), Number(row.discount3Pct || 0),
        Number(row.gstRate || 0), row.taxType, isInclusive)
      subtotal += Number(row.qty) * Number(row.rate)
      taxable += c.taxableAmount
      cgst += c.cgstAmount; sgst += c.sgstAmount; igst += c.igstAmount; cess += c.cessAmount
      lineTotalSum += c.lineTotal
    }
    // Inclusive: grand = sum of lineTotals (rate already has GST)
    // Exclusive: grand = taxable + all taxes
    const beforeRound = isInclusive ? lineTotalSum : (taxable + cgst + sgst + igst + cess)
    const ro = roundOff(beforeRound)
    return { subtotal, taxable, cgst, sgst, igst, cess, roundOff: ro, grand: Math.round(beforeRound) }
  }, [watchedItems, isInclusive])

  const t = totals()
  useEffect(() => { form.setValue('roundOff', t.roundOff) }, [t.roundOff])

  // ── Item + Variant select ───────────────────────────────────────────────────

  const handleItemVariantSelect = (index: number, item: any, variant: any | null) => {
    // KEY FIX: Use variant's rate if variant selected, otherwise use item's rate
    const rate = variant
      ? (isPurchase ? Number(variant.purchaseRate) : Number(variant.saleRate))
      : (isPurchase ? Number(item.purchaseRate) : Number(item.saleRate))

    // Build display label from variant attributes
    const variantLabel = variant
      ? Object.values(variant.attributeValues || {}).filter(Boolean).join(' · ')
      : ''

    form.setValue(`items.${index}`, {
      ...form.getValues(`items.${index}`),
      itemId: item.id,
      variantId: variant?.id || null,
      _itemName: item.name,
      _variantLabel: variantLabel,
      _item: item,
      unit: item.unit,
      rate,
      gstRate: zeroGST ? 0 : Number(item.gstRate),
      taxType: item.taxType || 'CGST_SGST',
      discountPct: Number(item.tradeDiscount || 0),
      discount2Pct: Number(item.cashDiscount || 0),
      discount3Pct: Number(item.schemeDiscount || 0),
    })

    if (Number(item.cashDiscount || 0) > 0) setShowDisc2(true)
    if (Number(item.schemeDiscount || 0) > 0) setShowDisc3(true)
  }

  // ── Save / Post ─────────────────────────────────────────────────────────────

  const buildPayload = (values: VoucherFormValues) => ({
    voucherType, date: values.date,
    branchId: values.branchId || null,
    partyId: values.partyId || null,
    narration: values.narration,
    placeOfSupply: values.placeOfSupply,
    saleType: values.saleType,
    lut: values.lut || null,
    lutDate: values.lutDate || null,
    isReverseCharge: values.isReverseCharge,
    isInclusive: values.isInclusive,
    isExport: ['EXPORT_WITH_LUT', 'EXPORT_WITHOUT_LUT'].includes(values.saleType),
    items: values.items.map(r => ({
      itemId: r.itemId,
      variantId: r.variantId || null,
      unit: r.unit,
      qty: Number(r.qty),
      freeQty: Number(r.freeQty || 0),
      rate: Number(r.rate),
      discountPct: Number(r.discountPct || 0),
      discount2Pct: Number(r.discount2Pct || 0),
      discount3Pct: Number(r.discount3Pct || 0),
      gstRate: Number(r.gstRate),
      taxType: r.taxType,
      batchNo: r.batchNo || null,
    })),
    ledgerEntries: [],
  })

  const onSaveDraft = async (values: VoucherFormValues) => {
    setSaveError(''); setSaving(true)
    try {
      if (savedId) {
        await api.put(`/billing/vouchers/${savedId}`, buildPayload(values))
      } else {
        const { data } = await api.post('/billing/vouchers', buildPayload(values))
        setSavedId(data.data.id)
        setSavedNumber(data.data.voucherNumber)
        setSavedStatus(data.data.status)
      }
      qc.invalidateQueries({ queryKey: ['vouchers'] })
    } catch (e) { setSaveError(extractError(e)) }
    finally { setSaving(false) }
  }

  const onPost = async () => {
    if (!savedId) {
      const valid = await form.trigger()
      if (!valid) return
      await form.handleSubmit(onSaveDraft)()
      await new Promise(r => setTimeout(r, 300))
    }
    setSaveError(''); setPosting(true)
    try {
      const id = savedId || form.getValues('items')[0]?.itemId // fallback
      if (!savedId) return
      await api.post(`/billing/vouchers/${savedId}/post`)
      setSavedStatus('POSTED')
      qc.invalidateQueries({ queryKey: ['vouchers'] })
      onSuccess?.()
    } catch (e) { setSaveError(extractError(e)) }
    finally { setPosting(false) }
  }

  const isPosted = savedStatus === 'POSTED'

  const defaultRow = () => ({
    itemId: '', variantId: null, unit: 'PCS',
    qty: 1, freeQty: 0, rate: 0,
    discountPct: 0, discount2Pct: 0, discount3Pct: 0,
    gstRate: 18, taxType: 'CGST_SGST',
  } as any)

  return (
    <div className="space-y-4">

      {/* Page header */}
      <div className="page-header">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="page-title">{title}</h1>
            {savedNumber && (
              <Badge variant={isPosted ? 'success' : 'outline'} className="text-xs">
                {savedNumber} · {savedStatus}
              </Badge>
            )}
          </div>
          <p className="page-subtitle">{activeFY ? `FY ${activeFY}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}><ArrowLeft size={15} /> Back</Button>
          {!isPosted && (
            <>
              <Button variant="secondary" onClick={form.handleSubmit(onSaveDraft)} loading={saving}>
                <Save size={15} /> Draft
              </Button>
              <Button onClick={onPost} loading={posting}>
                <Save size={15} /> Save & Post
              </Button>
            </>
          )}
          {isPosted && (
            <Button variant="outline" onClick={() => window.print()}>
              <Printer size={15} /> Print
            </Button>
          )}
        </div>
      </div>

      {saveError && (
        <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 text-sm text-destructive">
          <AlertCircle size={15} /> {saveError}
        </div>
      )}

      <fieldset disabled={isPosted} className="space-y-4">

        {/* ── Header fields ─────────────────────────────────────────────── */}
        <div className="form-section">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Input label="Date" type="date" required {...form.register('date')} />

            {(branches as any[]).length > 1 && (
              <Select label="Branch"
                options={(branches as any[]).map((b: any) => ({ value: b.id, label: b.name }))}
                {...form.register('branchId')} />
            )}

            {PARTY_LABEL[voucherType] && (
              <div className="col-span-2">
                <label className="text-xs font-medium text-foreground block mb-1.5">
                  {PARTY_LABEL[voucherType]} <span className="text-destructive">*</span>
                </label>
                <PartySearch
                  type={PARTY_TYPE[voucherType] || ''}
                  onChange={(id, name, party) => {
                    form.setValue('partyId', id)
                    if (party?.stateCode) form.setValue('placeOfSupply', party.stateCode)
                  }}
                />
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
                <Input label="LUT Number" className="font-mono" placeholder="AD123456789012" {...form.register('lut')} />
                <Input label="LUT Date" type="date" {...form.register('lutDate')} />
              </>
            )}

            {zeroGST && (
              <div className="col-span-4 flex items-center gap-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
                <Info size={13} /> GST = 0% on all items — {SALE_TYPES.find(s => s.value === saleType)?.label}
              </div>
            )}

            <div className="flex gap-6 col-span-2 items-center pt-4 flex-wrap">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" {...form.register('isReverseCharge')} className="w-4 h-4 rounded" />
                Reverse Charge (RCM)
              </label>
              {!isPurchase && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <div className="relative">
                    <input type="checkbox" {...form.register('isInclusive')} className="sr-only peer" />
                    <div className="w-9 h-5 bg-muted-foreground/30 rounded-full peer-checked:bg-primary transition-colors" />
                    <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
                  </div>
                  <div>
                    <span className="text-sm font-medium">
                      {isInclusive ? 'GST Inclusive' : 'GST Exclusive'}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1.5">
                      {isInclusive ? '(Rate includes GST — back-calculate)' : '(GST added on top of rate)'}
                    </span>
                  </div>
                </label>
              )}
            </div>
          </div>
        </div>

        {/* ── Discount toggles ──────────────────────────────────────────── */}
        <div className="flex items-center gap-4 text-xs bg-muted/30 rounded-lg px-4 py-2">
          <span className="text-muted-foreground font-medium">Discount columns:</span>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked readOnly className="w-3.5 h-3.5 pointer-events-none" />
            Disc 1 — Trade
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer select-none" onClick={() => setShowDisc2(s => !s)}>
            <input type="checkbox" checked={showDisc2} readOnly className="w-3.5 h-3.5 pointer-events-none" />
            Disc 2 — Cash/Scheme
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer select-none" onClick={() => setShowDisc3(s => !s)}>
            <input type="checkbox" checked={showDisc3} readOnly className="w-3.5 h-3.5 pointer-events-none" />
            Disc 3 — Special
          </label>
        </div>

        {/* ── Items table ───────────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: '12px' }}>
              <thead>
                <tr className="bg-primary/5 border-b-2 border-primary/20">
                  <th className="px-2 py-2.5 text-left text-primary font-bold uppercase tracking-wide w-7">#</th>
                  <th className="px-2 py-2.5 text-left text-primary font-bold uppercase tracking-wide" style={{ minWidth: 240 }}>Item / Variant</th>
                  <th className="px-2 py-2.5 text-center text-primary font-bold uppercase tracking-wide w-14">Unit</th>
                  <th className="px-2 py-2.5 text-right text-primary font-bold uppercase tracking-wide w-16">Qty</th>
                  <th className="px-2 py-2.5 text-right text-primary font-bold uppercase tracking-wide w-14">Free</th>
                  <th className="px-2 py-2.5 text-right text-primary font-bold uppercase tracking-wide w-24">Rate</th>
                  <th className="px-2 py-2.5 text-right text-primary font-bold uppercase tracking-wide w-14">D1%</th>
                  {showDisc2 && <th className="px-2 py-2.5 text-right text-primary font-bold uppercase tracking-wide w-14">D2%</th>}
                  {showDisc3 && <th className="px-2 py-2.5 text-right text-primary font-bold uppercase tracking-wide w-14">D3%</th>}
                  <th className="px-2 py-2.5 text-right text-primary font-bold uppercase tracking-wide w-24">Taxable</th>
                  <th className="px-2 py-2.5 text-center text-primary font-bold uppercase tracking-wide w-14">GST%</th>
                  <th className="px-2 py-2.5 text-right text-primary font-bold uppercase tracking-wide w-20">Tax</th>
                  <th className="px-2 py-2.5 text-right text-primary font-bold uppercase tracking-wide w-24">Total</th>
                  <th className="w-7"></th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, index) => {
                  const row = watchedItems[index] || {}
                  const hasItem = !!(row as any)._itemName
                  const calc = (row.qty && row.rate)
                    ? calcLine(Number(row.qty), Number(row.rate),
                        Number(row.discountPct || 0), Number(row.discount2Pct || 0), Number(row.discount3Pct || 0),
                        Number(row.gstRate || 0), row.taxType, isInclusive)
                    : null

                  const numInput = (field: any, w = 'w-16') =>
                    `h-7 ${w} rounded border border-input bg-background px-1 text-right focus:outline-none focus:ring-1 focus:ring-ring`

                  return (
                    <tr key={field.id} className={cn('border-t border-border/40 hover:bg-muted/20 transition-colors', index % 2 === 1 && 'bg-muted/5')}>

                      <td className="px-2 py-1.5 text-center text-muted-foreground text-xs">{index + 1}</td>

                      {/* Item picker */}
                      <td className="px-2 py-1.5" style={{ minWidth: 240 }}>
                        <ItemPickerCell
                          isPurchase={isPurchase}
                          zeroGST={zeroGST}
                          currentLabel={
                            hasItem
                              ? `${(row as any)._itemName}${(row as any)._variantLabel ? ` [${(row as any)._variantLabel}]` : ''}`
                              : ''
                          }
                          onSelect={(item, variant) => handleItemVariantSelect(index, item, variant)}
                        />
                      </td>

                      <td className="px-2 py-1.5">
                        <input className="h-7 w-12 rounded border border-input bg-background px-1 text-center focus:outline-none focus:ring-1 focus:ring-ring"
                          style={{ fontSize: 12 }} {...form.register(`items.${index}.unit`)} />
                      </td>

                      <td className="px-2 py-1.5">
                        <input type="number" min="0" step="0.001" style={{ fontSize: 12 }}
                          className={numInput({}, 'w-16')} {...form.register(`items.${index}.qty`)} />
                      </td>

                      <td className="px-2 py-1.5">
                        <input type="number" min="0" step="0.001" style={{ fontSize: 12 }}
                          className={numInput({}, 'w-12')} {...form.register(`items.${index}.freeQty`)} />
                      </td>

                      <td className="px-2 py-1.5">
                        <input type="number" min="0" step="0.0001" style={{ fontSize: 12 }}
                          className={numInput({}, 'w-20')} {...form.register(`items.${index}.rate`)} />
                      </td>

                      <td className="px-2 py-1.5">
                        <input type="number" min="0" max="100" step="0.01" style={{ fontSize: 12 }}
                          className={numInput({}, 'w-12')} {...form.register(`items.${index}.discountPct`)} />
                      </td>

                      {showDisc2 && (
                        <td className="px-2 py-1.5">
                          <input type="number" min="0" max="100" step="0.01" style={{ fontSize: 12 }}
                            className={numInput({}, 'w-12')} {...form.register(`items.${index}.discount2Pct`)} />
                        </td>
                      )}

                      {showDisc3 && (
                        <td className="px-2 py-1.5">
                          <input type="number" min="0" max="100" step="0.01" style={{ fontSize: 12 }}
                            className={numInput({}, 'w-12')} {...form.register(`items.${index}.discount3Pct`)} />
                        </td>
                      )}

                      <td className="px-2 py-1.5 text-right font-mono">
                        {calc ? formatINR(calc.taxableAmount, 2) : <span className="text-muted-foreground">—</span>}
                      </td>

                      <td className="px-2 py-1.5 text-center">
                        <select style={{ fontSize: 11 }}
                          className="h-7 w-12 rounded border border-input bg-background px-1 text-center focus:outline-none focus:ring-1 focus:ring-ring"
                          {...form.register(`items.${index}.gstRate`)} disabled={zeroGST}>
                          {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
                        </select>
                      </td>

                      <td className="px-2 py-1.5 text-right font-mono">
                        {calc ? formatINR(calc.totalTax, 2) : <span className="text-muted-foreground">—</span>}
                      </td>

                      <td className="px-2 py-1.5 text-right font-mono font-bold">
                        {calc ? formatINR(calc.lineTotal, 2) : <span className="text-muted-foreground">—</span>}
                      </td>

                      <td className="px-2 py-1.5 text-center">
                        {fields.length > 1 && (
                          <button type="button" onClick={() => remove(index)}
                            className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {!isPosted && (
            <div className="px-4 py-2.5 border-t border-border/40 bg-muted/10">
              <button type="button" onClick={() => append(defaultRow())}
                className="flex items-center gap-1.5 text-xs text-primary font-medium hover:text-primary/80 transition-colors">
                <Plus size={13} /> Add Item Row
              </button>
            </div>
          )}
        </div>

        {/* ── Narration + Totals ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="md:col-span-2 form-section">
            <Textarea label="Narration / Remarks" rows={4} placeholder="Optional notes for this voucher..."
              {...form.register('narration')} />
          </div>

          <div className="md:col-span-3 bg-card border border-border rounded-xl p-5 space-y-2 text-sm">
            {[
              { label: isInclusive ? 'Total (incl. GST)' : 'Subtotal (Gross)', value: t.subtotal, show: true },
              { label: 'Taxable (excl. GST)', value: t.taxable, show: isInclusive || t.subtotal !== t.taxable },
              { label: `CGST${isInclusive ? ' (included)' : ''}`, value: t.cgst, show: t.cgst > 0 },
              { label: `SGST${isInclusive ? ' (included)' : ''}`, value: t.sgst, show: t.sgst > 0 },
              { label: `IGST${isInclusive ? ' (included)' : ''}`, value: t.igst, show: t.igst > 0 },
              { label: 'Cess', value: t.cess, show: t.cess > 0 },
              { label: 'Round Off', value: t.roundOff, show: Math.abs(t.roundOff) > 0, prefix: t.roundOff > 0 ? '+' : '' },
            ].filter(r => r.show).map(r => (
              <div key={r.label} className="flex justify-between text-muted-foreground">
                <span>{r.label}</span>
                <span className="font-mono">{r.prefix || ''}{formatINR(r.value)}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold text-lg border-t-2 border-border pt-3 mt-2 text-foreground">
              <span>Grand Total</span>
              <span className="font-mono text-primary">{formatINR(t.grand)}</span>
            </div>
            <p className="text-xs text-muted-foreground italic leading-relaxed">
              {amountInWords(t.grand)}
            </p>
          </div>
        </div>

      </fieldset>
    </div>
  )
}
