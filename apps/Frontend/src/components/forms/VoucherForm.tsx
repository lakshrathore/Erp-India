import { useState, useEffect, useCallback, useRef } from 'react'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2, Save, ArrowLeft, Printer, AlertCircle, Search, ChevronDown } from 'lucide-react'
import dayjs from 'dayjs'
import { Button, Input, Select, Textarea, Badge } from '../ui'
import { cn } from '../ui/utils'
import { formatINR, calculateLineGST, amountInWords, roundOff, INDIAN_STATES } from '../../lib/india'
import { useParties, useItems, useLedgers, useBranches } from '../../hooks/api.hooks'
import { useAuthStore } from '../../stores/auth.store'
import { api, extractError } from '../../lib/api'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

// ─── Schema ───────────────────────────────────────────────────────────────────

const itemRowSchema = z.object({
  itemId: z.string().min(1, 'Select item'),
  variantId: z.string().optional(),
  description: z.string().optional(),
  unit: z.string().default('PCS'),
  qty: z.coerce.number().positive('Qty must be > 0'),
  freeQty: z.coerce.number().default(0),
  rate: z.coerce.number().min(0),
  discountPct: z.coerce.number().min(0).max(100).default(0),
  gstRate: z.coerce.number().default(18),
  taxType: z.string().default('CGST_SGST'),
  batchNo: z.string().optional(),
  mfgDate: z.string().optional(),
  expDate: z.string().optional(),
  // dynamic attrs stored here too
  _itemName: z.string().optional(),
  _categoryAttrs: z.any().optional(),
  _dynValues: z.record(z.string()).optional(),
})

const voucherFormSchema = z.object({
  date: z.string().min(1, 'Date required'),
  branchId: z.string().optional(),
  partyId: z.string().optional(),
  narration: z.string().optional(),
  placeOfSupply: z.string().optional(),
  isReverseCharge: z.boolean().default(false),
  isExport: z.boolean().default(false),
  refVoucherNumber: z.string().optional(),
  refVoucherDate: z.string().optional(),
  items: z.array(itemRowSchema).min(1, 'Add at least one item'),
  roundOff: z.coerce.number().default(0),
})

export type VoucherFormValues = z.infer<typeof voucherFormSchema>

export type VoucherType = 'SALE' | 'PURCHASE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'SALE_CHALLAN' | 'PURCHASE_ORDER' | 'PURCHASE_CHALLAN' | 'PRODUCTION'

interface VoucherFormProps {
  voucherType: VoucherType
  title: string
  initial?: Partial<VoucherFormValues> & { id?: string; voucherNumber?: string; status?: string }
  onSuccess?: () => void
}

const PARTY_LABEL: Record<string, string> = {
  SALE: 'Customer', PURCHASE: 'Vendor', CREDIT_NOTE: 'Customer', DEBIT_NOTE: 'Vendor',
  SALE_CHALLAN: 'Customer', PURCHASE_ORDER: 'Vendor', PURCHASE_CHALLAN: 'Vendor', PRODUCTION: '',
}

const PARTY_TYPE: Record<string, string> = {
  SALE: 'CUSTOMER', PURCHASE: 'VENDOR', CREDIT_NOTE: 'CUSTOMER', DEBIT_NOTE: 'VENDOR',
  SALE_CHALLAN: 'CUSTOMER', PURCHASE_ORDER: 'VENDOR', PURCHASE_CHALLAN: 'VENDOR',
}

const SHOW_REF: Record<string, boolean> = {
  CREDIT_NOTE: true, DEBIT_NOTE: true,
}

const STATE_OPTS = INDIAN_STATES.map(s => ({ value: s.code, label: `${s.code} - ${s.name}` }))

// ─── Party Search Dropdown ────────────────────────────────────────────────────

function PartySearch({ value, onChange, type }: { value: string; onChange: (id: string, name: string) => void; type: string }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [selectedName, setSelectedName] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const { data } = useParties({ search: q, type: type || undefined, limit: 20 })
  const parties = data?.data || []

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder={`Search ${PARTY_LABEL[type] || 'party'}...`}
          value={open ? q : selectedName || ''}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => { setOpen(true); setQ('') }}
        />
      </div>
      {open && parties.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {parties.map((p: any) => (
            <button key={p.id} type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between"
              onClick={() => { onChange(p.id, p.name); setSelectedName(p.name); setQ(''); setOpen(false) }}>
              <span>{p.name}</span>
              <span className="text-xs text-muted-foreground font-mono">{p.gstin || ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Item Search Dropdown ─────────────────────────────────────────────────────

function ItemSearch({ onSelect }: { onSelect: (item: any) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { data } = useItems({ search: q, limit: 20 })
  const items = data?.data || []

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          className="h-8 w-full rounded border border-input bg-background pl-7 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Search item..."
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && items.length > 0 && (
        <div className="absolute z-50 mt-1 w-64 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {items.map((item: any) => (
            <button key={item.id} type="button"
              className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 flex items-center justify-between gap-2"
              onClick={() => { onSelect(item); setQ(item.name); setOpen(false) }}>
              <span className="truncate">{item.name}</span>
              <div className="flex items-center gap-1 shrink-0">
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

// ─── Main Voucher Form ────────────────────────────────────────────────────────

export default function VoucherForm({ voucherType, title, initial, onSuccess }: VoucherFormProps) {
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

  const form = useForm<VoucherFormValues>({
    resolver: zodResolver(voucherFormSchema),
    defaultValues: {
      date: initial?.date || dayjs().format('YYYY-MM-DD'),
      branchId: initial?.branchId || (branches as any[])[0]?.id || '',
      partyId: initial?.partyId || '',
      narration: initial?.narration || '',
      placeOfSupply: initial?.placeOfSupply || activeCompany ? '08' : '',
      isReverseCharge: false,
      isExport: false,
      items: initial?.items || [{ itemId: '', unit: 'PCS', qty: 1, freeQty: 0, rate: 0, discountPct: 0, gstRate: 18, taxType: 'CGST_SGST' }],
      roundOff: 0,
    },
  })

  const { fields, append, remove, update } = useFieldArray({ control: form.control, name: 'items' })

  // ── Totals calculation ──────────────────────────────────────────────────────
  const watchedItems = form.watch('items')

  const totals = useCallback(() => {
    let subtotal = 0, discAmt = 0, taxable = 0
    let cgst = 0, sgst = 0, igst = 0, cess = 0

    for (const item of watchedItems) {
      if (!item.qty || !item.rate) continue
      const calc = calculateLineGST(
        Number(item.qty), Number(item.rate), Number(item.discountPct || 0),
        Number(item.gstRate || 0), item.taxType as any
      )
      subtotal += Number(item.qty) * Number(item.rate)
      discAmt += (Number(item.qty) * Number(item.rate) * Number(item.discountPct || 0)) / 100
      taxable += calc.taxableAmount
      cgst += calc.cgstAmount
      sgst += calc.sgstAmount
      igst += calc.igstAmount
      cess += calc.cessAmount
    }

    const beforeRound = taxable + cgst + sgst + igst + cess
    const ro = roundOff(beforeRound)
    const grand = Math.round(beforeRound)

    return { subtotal, discAmt, taxable, cgst, sgst, igst, cess, beforeRound, roundOff: ro, grand }
  }, [watchedItems])

  const t = totals()

  // Update roundOff in form
  useEffect(() => { form.setValue('roundOff', t.roundOff) }, [t.roundOff])

  // ── Item row helpers ────────────────────────────────────────────────────────

  const handleItemSelect = (index: number, item: any) => {
    const existing = form.getValues(`items.${index}`)
    form.setValue(`items.${index}`, {
      ...existing,
      itemId: item.id,
      _itemName: item.name,
      unit: item.unit,
      rate: voucherType.includes('PURCHASE') || voucherType === 'PURCHASE_ORDER' ? Number(item.purchaseRate) : Number(item.saleRate),
      gstRate: Number(item.gstRate),
      taxType: item.taxType,
      _categoryAttrs: item.category?.attributes || [],
    })
  }

  const addRow = () => append({
    itemId: '', unit: 'PCS', qty: 1, freeQty: 0,
    rate: 0, discountPct: 0, gstRate: 18, taxType: 'CGST_SGST',
  } as any)

  // ── Save / Post ─────────────────────────────────────────────────────────────

  const buildPayload = (values: VoucherFormValues) => ({
    voucherType,
    date: values.date,
    branchId: values.branchId || null,
    partyId: values.partyId || null,
    narration: values.narration,
    placeOfSupply: values.placeOfSupply,
    isReverseCharge: values.isReverseCharge,
    isExport: values.isExport,
    refVoucherNumber: values.refVoucherNumber,
    refVoucherDate: values.refVoucherDate,
    items: values.items.map(row => {
      const calc = calculateLineGST(Number(row.qty), Number(row.rate), Number(row.discountPct || 0), Number(row.gstRate || 0), row.taxType as any)
      return {
        itemId: row.itemId,
        variantId: row.variantId || null,
        description: row.description,
        unit: row.unit,
        qty: Number(row.qty),
        freeQty: Number(row.freeQty || 0),
        rate: Number(row.rate),
        discountPct: Number(row.discountPct || 0),
        gstRate: Number(row.gstRate),
        taxType: row.taxType,
        batchNo: row.batchNo,
        mfgDate: row.mfgDate || null,
        expDate: row.expDate || null,
      }
    }),
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
    } catch (e) {
      setSaveError(extractError(e))
    } finally {
      setSaving(false)
    }
  }

  const onPost = async () => {
    if (!savedId) {
      const valid = await form.trigger()
      if (!valid) return
      await form.handleSubmit(onSaveDraft)()
    }
    if (!savedId) return

    setSaveError(''); setPosting(true)
    try {
      await api.post(`/billing/vouchers/${savedId}/post`)
      setSavedStatus('POSTED')
      qc.invalidateQueries({ queryKey: ['vouchers'] })
      onSuccess?.()
    } catch (e) {
      setSaveError(extractError(e))
    } finally {
      setPosting(false)
    }
  }

  const isPosted = savedStatus === 'POSTED'

  return (
    <div className="space-y-4">
      {/* Header */}
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
                <Save size={15} /> Save Draft
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
        <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-md px-4 py-3 text-sm text-destructive">
          <AlertCircle size={15} /> {saveError}
        </div>
      )}

      <fieldset disabled={isPosted} className="space-y-4">
        {/* Top section */}
        <div className="form-section">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Input label="Date" type="date" required
              error={form.formState.errors.date?.message} {...form.register('date')} />

            {branches.length > 1 && (
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
                  value={form.watch('partyId') || ''}
                  type={PARTY_TYPE[voucherType] || ''}
                  onChange={(id, name) => form.setValue('partyId', id)}
                />
                {form.formState.errors.partyId && (
                  <p className="text-xs text-destructive mt-1">{form.formState.errors.partyId.message}</p>
                )}
              </div>
            )}

            <Select label="Place of Supply"
              options={[{ value: '', label: 'Select state' }, ...STATE_OPTS]}
              {...form.register('placeOfSupply')} />

            {SHOW_REF[voucherType] && (
              <>
                <Input label="Against Invoice No" placeholder="Original invoice number"
                  {...form.register('refVoucherNumber')} />
                <Input label="Invoice Date" type="date" {...form.register('refVoucherDate')} />
              </>
            )}

            <div className="flex gap-4 pt-5 col-span-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" {...form.register('isReverseCharge')} className="w-4 h-4" />
                Reverse Charge
              </label>
              {(voucherType === 'SALE' || voucherType === 'PURCHASE') && (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" {...form.register('isExport')} className="w-4 h-4" />
                  Export
                </label>
              )}
            </div>
          </div>
        </div>

        {/* Items grid */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-primary/5">
                  <th className="px-2 py-2.5 text-left font-semibold text-primary uppercase tracking-wide w-6">#</th>
                  <th className="px-2 py-2.5 text-left font-semibold text-primary uppercase tracking-wide min-w-[200px]">Item</th>
                  <th className="px-2 py-2.5 text-left font-semibold text-primary uppercase tracking-wide w-16">Unit</th>
                  <th className="px-2 py-2.5 text-right font-semibold text-primary uppercase tracking-wide w-20">Qty</th>
                  <th className="px-2 py-2.5 text-right font-semibold text-primary uppercase tracking-wide w-24">Rate</th>
                  <th className="px-2 py-2.5 text-right font-semibold text-primary uppercase tracking-wide w-16">Disc%</th>
                  <th className="px-2 py-2.5 text-right font-semibold text-primary uppercase tracking-wide w-24">Taxable</th>
                  <th className="px-2 py-2.5 text-center font-semibold text-primary uppercase tracking-wide w-16">GST%</th>
                  <th className="px-2 py-2.5 text-right font-semibold text-primary uppercase tracking-wide w-20">Tax</th>
                  <th className="px-2 py-2.5 text-right font-semibold text-primary uppercase tracking-wide w-24">Total</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, index) => {
                  const row = watchedItems[index] || {}
                  const calc = row.qty && row.rate
                    ? calculateLineGST(Number(row.qty), Number(row.rate), Number(row.discountPct || 0), Number(row.gstRate || 0), row.taxType as any)
                    : null
                  const categoryAttrs = (row as any)._categoryAttrs || []

                  return (
                    <tr key={field.id} className="border-t border-border/50 hover:bg-muted/20">
                      <td className="px-2 py-1.5 text-muted-foreground">{index + 1}</td>

                      {/* Item search */}
                      <td className="px-2 py-1.5">
                        <ItemSearch onSelect={item => handleItemSelect(index, item)} />
                        {(row as any)._itemName && (
                          <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[190px]">
                            {(row as any)._itemName}
                          </div>
                        )}
                        {form.formState.errors.items?.[index]?.itemId && (
                          <p className="text-[10px] text-destructive">{form.formState.errors.items[index]?.itemId?.message}</p>
                        )}
                        {/* Dynamic attributes */}
                        {categoryAttrs.map((attr: any) => (
                          <input key={attr.name} type={attr.type === 'date' ? 'date' : 'text'}
                            placeholder={attr.label + (attr.required ? '*' : '')}
                            className="mt-1 h-6 w-full rounded border border-input bg-background px-2 text-[10px] focus:outline-none focus:ring-1 focus:ring-ring"
                            {...form.register(`items.${index}._dynValues.${attr.name}` as any)} />
                        ))}
                      </td>

                      <td className="px-2 py-1.5">
                        <input className="h-7 w-14 rounded border border-input bg-background px-2 text-xs text-center focus:outline-none focus:ring-1 focus:ring-ring"
                          {...form.register(`items.${index}.unit`)} />
                      </td>

                      <td className="px-2 py-1.5">
                        <input type="number" min="0" step="0.001"
                          className="h-7 w-18 rounded border border-input bg-background px-2 text-xs text-right focus:outline-none focus:ring-1 focus:ring-ring"
                          {...form.register(`items.${index}.qty`)} />
                      </td>

                      <td className="px-2 py-1.5">
                        <input type="number" min="0" step="0.0001"
                          className="h-7 w-22 rounded border border-input bg-background px-2 text-xs text-right focus:outline-none focus:ring-1 focus:ring-ring"
                          {...form.register(`items.${index}.rate`)} />
                      </td>

                      <td className="px-2 py-1.5">
                        <input type="number" min="0" max="100" step="0.01"
                          className="h-7 w-14 rounded border border-input bg-background px-2 text-xs text-right focus:outline-none focus:ring-1 focus:ring-ring"
                          {...form.register(`items.${index}.discountPct`)} />
                      </td>

                      <td className="px-2 py-1.5 text-right font-mono">
                        {calc ? formatINR(calc.taxableAmount, 2) : '—'}
                      </td>

                      <td className="px-2 py-1.5">
                        <select className="h-7 w-14 rounded border border-input bg-background px-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-ring"
                          {...form.register(`items.${index}.gstRate`)}>
                          {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
                        </select>
                      </td>

                      <td className="px-2 py-1.5 text-right font-mono">
                        {calc ? formatINR(calc.totalTax, 2) : '—'}
                      </td>

                      <td className="px-2 py-1.5 text-right font-mono font-medium">
                        {calc ? formatINR(calc.lineTotal, 2) : '—'}
                      </td>

                      <td className="px-2 py-1.5">
                        {fields.length > 1 && (
                          <button type="button" onClick={() => remove(index)}
                            className="text-muted-foreground hover:text-destructive transition-colors">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Add row button */}
          {!isPosted && (
            <div className="px-4 py-2 border-t border-border/50">
              <button type="button" onClick={addRow}
                className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors">
                <Plus size={13} /> Add Item Row
              </button>
            </div>
          )}
        </div>

        {/* Bottom section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Narration */}
          <div className="form-section">
            <Textarea label="Narration" placeholder="Remarks or description for this voucher" rows={3}
              {...form.register('narration')} />
          </div>

          {/* Totals */}
          <div className="bg-card border border-border rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="font-mono">{formatINR(t.subtotal)}</span>
            </div>
            {t.discAmt > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Discount</span>
                <span className="font-mono text-destructive">- {formatINR(t.discAmt)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>Taxable Amount</span>
              <span className="font-mono">{formatINR(t.taxable)}</span>
            </div>
            {t.cgst > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>CGST</span>
                <span className="font-mono">{formatINR(t.cgst)}</span>
              </div>
            )}
            {t.sgst > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>SGST</span>
                <span className="font-mono">{formatINR(t.sgst)}</span>
              </div>
            )}
            {t.igst > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>IGST</span>
                <span className="font-mono">{formatINR(t.igst)}</span>
              </div>
            )}
            {t.cess > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Cess</span>
                <span className="font-mono">{formatINR(t.cess)}</span>
              </div>
            )}
            {Math.abs(t.roundOff) > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Round Off</span>
                <span className="font-mono">{t.roundOff > 0 ? '+' : ''}{formatINR(t.roundOff)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-base border-t border-border pt-2 mt-2">
              <span>Grand Total</span>
              <span className="font-mono font-bold">{formatINR(t.grand)}</span>
            </div>
            <p className="text-xs text-muted-foreground italic leading-snug">
              {amountInWords(t.grand)}
            </p>
          </div>
        </div>
      </fieldset>
    </div>
  )
}
