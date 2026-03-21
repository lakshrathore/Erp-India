/**
 * CustomerReceiptPage.tsx / VendorPaymentPage.tsx
 * Dedicated pages for:
 * - Receiving payment from customer (with outstanding invoice view + settlement)
 * - Making payment to vendor (with outstanding bill view + settlement)
 *
 * Features:
 * - Only shows customers (for receipt) or vendors (for payment)
 * - Shows outstanding invoices on the right
 * - One-click advance or bill-by-bill settlement
 * - Cheque / UPI / NEFT / Cash modes
 * - Auto-creates Receipt/Payment voucher + journal entry + settlement
 */

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Save, ArrowLeft, AlertCircle, CheckCircle2, Plus, X,
  Wallet, CreditCard, FileText, ChevronDown, ChevronRight, Search,
} from 'lucide-react'
import dayjs from 'dayjs'
import { api, extractError } from '../../lib/api'
import { formatINR, formatDate } from '../../lib/india'
import { Button, Input, AmountInput, Select, Textarea, Badge, PageHeader, Spinner } from '../../components/ui'
import { useAuthStore } from '../../stores/auth.store'
import { useLedgers, useParties } from '../../hooks/api.hooks'
import { cn } from '../../components/ui/utils'

// ─── Searchable party picker ──────────────────────────────────────────────────

function PartyPicker({ value, onChange, partyType, placeholder }: {
  value: string; onChange: (id: string, name?: string) => void
  partyType: 'CUSTOMER' | 'VENDOR'; placeholder: string
}) {
  const { data: partiesData } = useParties({ type: partyType, limit: 500 })
  const parties: any[] = (partiesData as any)?.data || []
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const selected = parties.find((p: any) => p.id === value)
  const filtered = parties.filter((p: any) => !q || p.name.toLowerCase().includes(q.toLowerCase()))

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm',
          'focus:outline-none focus:ring-2 focus:ring-ring',
          !selected && 'text-muted-foreground'
        )}>
        <span className="truncate">{selected?.name || placeholder}</span>
        <ChevronDown size={14} className="shrink-0 ml-1 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input autoFocus value={q} onChange={e => setQ(e.target.value)}
                placeholder="Search..."
                className="h-7 w-full rounded border border-input bg-background pl-6 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-center py-3 text-muted-foreground">No results</p>
            ) : filtered.map((p: any) => (
              <button key={p.id} type="button"
                onClick={() => { onChange(p.id, p.name); setOpen(false); setQ('') }}
                className={cn('w-full text-left px-3 py-2 text-sm hover:bg-muted/60 transition-colors',
                  p.id === value && 'bg-primary/10 text-primary font-medium')}>
                <div>{p.name}</div>
                {p.gstin && <div className="text-[10px] text-muted-foreground font-mono">{p.gstin}</div>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Ledger picker (for cash/bank) ────────────────────────────────────────────

function LedgerPicker({ value, onChange, filter, placeholder }: {
  value: string; onChange: (id: string) => void
  filter?: (l: any) => boolean; placeholder?: string
}) {
  const { data: allLedgers = [] } = useLedgers()
  const ledgers = filter ? (allLedgers as any[]).filter(filter) : (allLedgers as any[])
  const selected = ledgers.find((l: any) => l.id === value)

  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
      <option value="">{placeholder || 'Select...'}</option>
      {ledgers.map((l: any) => (
        <option key={l.id} value={l.id}>{l.name}</option>
      ))}
    </select>
  )
}

// ─── Main shared component ────────────────────────────────────────────────────

type Mode = 'CUSTOMER_RECEIPT' | 'VENDOR_PAYMENT'
type PayMode = 'CASH' | 'CHEQUE' | 'NEFT' | 'RTGS' | 'UPI' | 'CARD'

const formSchema = z.object({
  partyId: z.string().min(1, 'Select a party'),
  date: z.string().min(1, 'Date required'),
  amount: z.coerce.number().positive('Enter amount'),
  ledgerId: z.string().min(1, 'Select cash/bank account'),
  paymentMode: z.enum(['CASH', 'CHEQUE', 'NEFT', 'RTGS', 'UPI', 'CARD']).default('CASH'),
  chequeNumber: z.string().optional(),
  chequeDate: z.string().optional(),
  narration: z.string().optional(),
})
type FormValues = z.infer<typeof formSchema>

function ReceiptPaymentForm({ mode }: { mode: Mode }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const isReceipt = mode === 'CUSTOMER_RECEIPT'
  const partyType = isReceipt ? 'CUSTOMER' : 'VENDOR'
  const voucherType = isReceipt ? 'RECEIPT' : 'PAYMENT'

  const [partyName, setPartyName] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [allocations, setAllocations] = useState<Record<string, number>>({})
  const [showOutstanding, setShowOutstanding] = useState(true)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      date: dayjs().format('YYYY-MM-DD'),
      paymentMode: 'CASH',
    },
  })

  const w = form.watch()
  const mode_ = w.paymentMode as PayMode
  const partyId = w.partyId

  // Outstanding invoices for selected party
  const outstandingType = isReceipt ? 'receivable' : 'payable'
  const { data: outstandingData, isLoading: loadingOut } = useQuery({
    queryKey: ['outstanding-party', partyId, outstandingType],
    queryFn: async () => {
      const { data } = await api.get('/billing/outstanding', {
        params: { type: outstandingType, partyId },
      })
      return data.data
    },
    enabled: !!partyId,
  })

  const outstandingVouchers: any[] = outstandingData?.vouchers || []
  const totalOutstanding = outstandingData?.totalOutstanding || 0
  const totalAllocated = Object.values(allocations).reduce((s, v) => s + v, 0)
  const isAdvance = totalAllocated === 0
  const remaining = (w.amount || 0) - totalAllocated

  // Auto-fill amount from total outstanding
  const fillFromOutstanding = () => {
    if (totalOutstanding > 0) form.setValue('amount', Math.round(totalOutstanding * 100) / 100)
  }

  // Quick allocate to an invoice
  const allocateTo = (voucherId: string, maxAmount: number) => {
    const available = Math.max(0, (w.amount || 0) - totalAllocated + (allocations[voucherId] || 0))
    const alloc = Math.min(maxAmount, available)
    setAllocations(prev => ({ ...prev, [voucherId]: alloc }))
  }

  const saveMut = useMutation({
    mutationFn: async (v: FormValues) => {
      // 1. Build ledger entries
      let ledgerEntries: any[] = []

      // Get party's ledger
      const partyRes = await api.get(`/masters/parties/${v.partyId}`).catch(() => null)
      const partyLedgerId = partyRes?.data?.data?.ledgerId

      if (isReceipt) {
        // Dr Cash/Bank, Cr Party
        ledgerEntries = [
          { ledgerId: v.ledgerId, debit: v.amount, credit: 0, narration: v.narration },
          ...(partyLedgerId ? [{ ledgerId: partyLedgerId, debit: 0, credit: v.amount, narration: v.narration }] : []),
        ]
      } else {
        // Dr Party, Cr Cash/Bank
        ledgerEntries = [
          ...(partyLedgerId ? [{ ledgerId: partyLedgerId, debit: v.amount, credit: 0, narration: v.narration }] : []),
          { ledgerId: v.ledgerId, debit: 0, credit: v.amount, narration: v.narration },
        ]
      }

      // 2. Create voucher
      const { data: voucherRes } = await api.post('/billing/vouchers', {
        voucherType,
        date: v.date,
        partyId: v.partyId,
        narration: v.narration || `${isReceipt ? 'Receipt from' : 'Payment to'} ${partyName}`,
        paymentMode: v.paymentMode,
        chequeNumber: v.chequeNumber || null,
        chequeDate: v.chequeDate || null,
        items: [],
        ledgerEntries,
      })
      const voucher = voucherRes.data

      // 3. Post it
      await api.post(`/billing/vouchers/${voucher.id}/post`)

      // 4. Settle against invoices if allocations exist
      if (Object.keys(allocations).length > 0) {
        for (const [againstId, amount] of Object.entries(allocations)) {
          if (amount > 0) {
            await api.post('/billing/vouchers/settle', {
              fromVoucherId: voucher.id,
              againstVoucherId: againstId,
              amount,
              date: v.date,
              narration: `Settlement: ${partyName}`,
            })
          }
        }
      }

      return voucher
    },
    onSuccess: (voucher) => {
      setSuccess(`Saved as ${voucher.voucherNumber}`)
      qc.invalidateQueries({ queryKey: ['vouchers'] })
      qc.invalidateQueries({ queryKey: ['outstanding-party'] })
      setTimeout(() => navigate(-1), 2000)
    },
    onError: (e) => setError(extractError(e)),
  })

  const title = isReceipt ? 'Customer Receipt' : 'Vendor Payment'
  const subtitle = isReceipt
    ? 'Record payment received from customer — advance or against invoices'
    : 'Record payment made to vendor — advance or against bills'

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle}
        breadcrumbs={[{ label: 'Accounting' }, { label: title }, { label: 'New' }]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(-1)}><ArrowLeft size={15} /> Back</Button>
            <Button onClick={form.handleSubmit(v => { setError(''); saveMut.mutate(v) })} loading={saveMut.isPending}>
              <Save size={15} /> Save & Post
            </Button>
          </div>
        }
      />

      {error && <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2"><AlertCircle size={14} />{error}</div>}
      {success && <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm flex items-center gap-2"><CheckCircle2 size={14} />{success} — Redirecting...</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Left: Form ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Party */}
          <div className="form-section">
            <h3 className="form-section-title">{isReceipt ? '👤 Customer' : '🏢 Vendor'}</h3>
            <div>
              <label className="block text-xs font-medium mb-1">{isReceipt ? 'Customer *' : 'Vendor *'}</label>
              <Controller control={form.control} name="partyId"
                render={({ field }) => (
                  <PartyPicker
                    value={field.value || ''}
                    onChange={(id, name) => { field.onChange(id); setPartyName(name || ''); setAllocations({}) }}
                    partyType={partyType}
                    placeholder={`Select ${isReceipt ? 'customer' : 'vendor'}...`}
                  />
                )}
              />
              {form.formState.errors.partyId && <p className="text-xs text-destructive mt-1">{form.formState.errors.partyId.message}</p>}
            </div>
          </div>

          {/* Amount + Date */}
          <div className="form-section">
            <h3 className="form-section-title">💰 Amount & Date</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1">Date *</label>
                <Input type="date" {...form.register('date')} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Amount (₹) *</label>
                <div className="relative">
                  <AmountInput
                    value={w.amount || ''}
                    onChange={val => form.setValue('amount', val, { shouldValidate: true })}
                    error={form.formState.errors.amount?.message}
                    className="text-lg"
                    required
                  />
                  {totalOutstanding > 0 && !w.amount && (
                    <button type="button" onClick={fillFromOutstanding}
                      className="mt-1 text-[11px] text-primary hover:underline block">
                      Use outstanding: {formatINR(totalOutstanding)}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Payment Mode + Account */}
          <div className="form-section">
            <h3 className="form-section-title">{isReceipt ? '📥 Received Into' : '📤 Paid From'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Payment Mode *</label>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                  {(['CASH', 'CHEQUE', 'UPI', 'NEFT', 'RTGS', 'CARD'] as PayMode[]).map(m => (
                    <button key={m} type="button" onClick={() => form.setValue('paymentMode', m)}
                      className={cn('py-2 px-2 rounded-lg border text-xs font-medium transition-all',
                        mode_ === m ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-muted-foreground/40')}>
                      {m === 'CASH' ? '💵' : m === 'CHEQUE' ? '📄' : m === 'UPI' ? '📱' : m === 'CARD' ? '💳' : '🏦'} {m}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">
                  {mode_ === 'CASH' ? 'Cash Account *' : 'Bank Account *'}
                </label>
                <Controller control={form.control} name="ledgerId"
                  render={({ field }) => (
                    <LedgerPicker value={field.value || ''} onChange={id => field.onChange(id)}
                      filter={mode_ === 'CASH'
                        ? (l: any) => l.group?.name === 'Cash-in-Hand'
                        : (l: any) => ['Bank Accounts', 'Cash-in-Hand'].includes(l.group?.name)}
                      placeholder={mode_ === 'CASH' ? 'Select cash account...' : 'Select bank account...'}
                    />
                  )}
                />
                {form.formState.errors.ledgerId && <p className="text-xs text-destructive mt-1">{form.formState.errors.ledgerId.message}</p>}
              </div>

              {mode_ === 'CHEQUE' && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-muted/30 rounded-lg">
                  <Input label="Cheque Number" {...form.register('chequeNumber')} />
                  <Input label="Cheque Date" type="date" {...form.register('chequeDate')} />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium mb-1">Narration / Remark</label>
                <Textarea rows={2} {...form.register('narration')}
                  placeholder={isReceipt ? 'e.g. Received against INV-25-26-0001 by cheque' : 'e.g. Payment against PUR-25-26-0001'}
                />
              </div>
            </div>
          </div>

          {/* Accounting preview */}
          {w.ledgerId && w.amount > 0 && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs">
              <p className="font-semibold text-blue-800 mb-2">Accounting Entry</p>
              {isReceipt ? (
                <>
                  <div className="text-blue-700">Dr — Cash/Bank Account <span className="float-right font-mono">{formatINR(w.amount)}</span></div>
                  <div className="text-blue-600 pl-4">Cr — {partyName || 'Customer Ledger'} <span className="float-right font-mono">{formatINR(w.amount)}</span></div>
                </>
              ) : (
                <>
                  <div className="text-blue-700">Dr — {partyName || 'Vendor Ledger'} <span className="float-right font-mono">{formatINR(w.amount)}</span></div>
                  <div className="text-blue-600 pl-4">Cr — Cash/Bank Account <span className="float-right font-mono">{formatINR(w.amount)}</span></div>
                </>
              )}
              {totalAllocated > 0 && (
                <div className="mt-2 pt-2 border-t border-blue-200 text-blue-600">
                  Settles {Object.keys(allocations).length} invoice(s) — ₹{formatINR(totalAllocated)}
                  {isAdvance ? ' (Advance)' : ''}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right: Outstanding Invoices ── */}
        <div>
          <div className="form-section h-full">
            <div className="flex items-center justify-between mb-3">
              <h3 className="form-section-title mb-0">
                📋 Outstanding {isReceipt ? 'Invoices' : 'Bills'}
              </h3>
              <button type="button" onClick={() => setShowOutstanding(s => !s)}
                className="text-muted-foreground hover:text-foreground">
                {showOutstanding ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>

            {!partyId ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Select a party to see outstanding</p>
            ) : loadingOut ? (
              <div className="flex justify-center py-4"><Spinner className="h-5 w-5" /></div>
            ) : showOutstanding && (
              <>
                {outstandingVouchers.length === 0 ? (
                  <div className="text-center py-4">
                    <CheckCircle2 size={24} className="mx-auto text-green-500 mb-2" />
                    <p className="text-xs text-muted-foreground">No outstanding {isReceipt ? 'invoices' : 'bills'}</p>
                    <p className="text-xs text-muted-foreground">This will be recorded as advance payment</p>
                  </div>
                ) : (
                  <>
                    <div className="text-xs text-muted-foreground mb-2 flex justify-between">
                      <span>{outstandingVouchers.length} invoice(s)</span>
                      <span className="font-mono font-medium">{formatINR(totalOutstanding)}</span>
                    </div>
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {outstandingVouchers.map((v: any) => {
                        const alloc = allocations[v.id] || 0
                        const due = Number(v.balanceDue)
                        return (
                          <div key={v.id} className={cn('p-3 rounded-lg border transition-all',
                            alloc > 0 ? 'border-primary bg-primary/5' : 'border-border bg-card')}>
                            <div className="flex items-center justify-between mb-1.5">
                              <div>
                                <span className="font-mono text-xs font-medium">{v.voucherNumber}</span>
                                <span className="text-xs text-muted-foreground ml-2">{formatDate(v.date)}</span>
                              </div>
                              <div className="text-right">
                                <div className="text-xs text-muted-foreground">Due</div>
                                <div className="font-mono text-sm font-medium text-destructive">{formatINR(due)}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="number" min={0} max={due} step={0.01}
                                value={alloc || ''}
                                onChange={e => setAllocations(prev => ({ ...prev, [v.id]: Math.min(Number(e.target.value), due) }))}
                                placeholder="0.00"
                                className="h-7 flex-1 rounded border border-input bg-background px-2 text-xs text-right font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                              <button type="button"
                                onClick={() => allocateTo(v.id, due)}
                                className="text-xs h-7 px-2 rounded border border-primary text-primary hover:bg-primary/10 transition-colors">
                                Full
                              </button>
                              {alloc > 0 && (
                                <button type="button"
                                  onClick={() => setAllocations(prev => { const n = { ...prev }; delete n[v.id]; return n })}
                                  className="text-destructive hover:bg-destructive/10 rounded p-1">
                                  <X size={12} />
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Allocation summary */}
                    {w.amount > 0 && (
                      <div className="mt-3 pt-3 border-t border-border text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Amount</span>
                          <span className="font-mono">{formatINR(w.amount)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Allocated</span>
                          <span className="font-mono text-green-700">{formatINR(totalAllocated)}</span>
                        </div>
                        <div className={cn('flex justify-between font-medium', remaining < 0 ? 'text-destructive' : remaining > 0 ? 'text-orange-600' : 'text-green-700')}>
                          <span>{remaining > 0 ? 'Advance (unallocated)' : remaining < 0 ? 'Over-allocated!' : '✓ Fully allocated'}</span>
                          <span className="font-mono">{formatINR(Math.abs(remaining))}</span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── List pages for Customer Receipt and Vendor Payment ──────────────────────

import VoucherListPage from '../../components/forms/VoucherListPage'

export function CustomerReceiptListPage() {
  return (
    <VoucherListPage
      voucherType="RECEIPT"
      title="Customer Receipts"
      newPath="/accounting/customer-receipt/new"
    />
  )
}

export function VendorPaymentListPage() {
  return (
    <VoucherListPage
      voucherType="PAYMENT"
      title="Vendor Payments"
      newPath="/accounting/vendor-payment/new"
    />
  )
}

// ─── Page exports ─────────────────────────────────────────────────────────────

export function CustomerReceiptPage() {
  return <ReceiptPaymentForm mode="CUSTOMER_RECEIPT" />
}

export function VendorPaymentPage() {
  return <ReceiptPaymentForm mode="VENDOR_PAYMENT" />
}
