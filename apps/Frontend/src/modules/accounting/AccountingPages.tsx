/**
 * AccountingPages.tsx
 * Receipt, Payment, Contra, Journal — completely rebuilt
 *
 * RECEIPT:  Party/Ledger → Cash/Bank received  (Cr Party, Dr Cash/Bank)
 * PAYMENT:  Cash/Bank → Party/Ledger paid      (Dr Party/Expense, Cr Cash/Bank)
 * CONTRA:   Cash ↔ Bank transfer only
 * JOURNAL:  Free double-entry, any ledger
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Plus, Trash2, Save, ArrowLeft, AlertCircle, CheckCircle2,
  Search, X, Wallet, CreditCard, Building, BookOpen, ChevronDown,
} from 'lucide-react'
import dayjs from 'dayjs'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, extractError } from '../../lib/api'
import { formatINR, formatDate } from '../../lib/india'
import { useLedgers, useParties, useBranches, useAuthStore as useAuth } from '../../hooks/api.hooks'
import { Button, Input, AmountInput, Select, Textarea, Badge, PageHeader, Spinner } from '../../components/ui'
import { useAuthStore } from '../../stores/auth.store'
import { cn } from '../../components/ui/utils'
import VoucherListPage from '../../components/forms/VoucherListPage'

// ─── Types ────────────────────────────────────────────────────────────────────

type AcctType = 'RECEIPT' | 'PAYMENT' | 'CONTRA' | 'JOURNAL'
type PayMode = 'CASH' | 'CHEQUE' | 'NEFT' | 'RTGS' | 'UPI' | 'CARD' | 'OTHER'

// ─── Searchable Ledger Picker ──────────────────────────────────────────────────

interface LedgerPickerProps {
  value: string
  onChange: (id: string, name?: string) => void
  placeholder?: string
  filter?: (l: any) => boolean
  className?: string
  autoFocus?: boolean
}

function LedgerPicker({ value, onChange, placeholder = 'Search ledger...', filter, className, autoFocus }: LedgerPickerProps) {
  const { data: allLedgers = [] } = useLedgers()
  const ledgers = filter ? (allLedgers as any[]).filter(filter) : (allLedgers as any[])
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = ledgers.find((l: any) => l.id === value)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = ledgers.filter((l: any) =>
    !q || l.name.toLowerCase().includes(q.toLowerCase())
  )

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setTimeout(() => inputRef.current?.focus(), 50) }}
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm',
          'focus:outline-none focus:ring-2 focus:ring-ring',
          !selected && 'text-muted-foreground'
        )}
      >
        <span className="truncate">{selected?.name || placeholder}</span>
        <ChevronDown size={14} className="shrink-0 text-muted-foreground ml-1" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[220px] bg-card border border-border rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border">
            <input
              ref={inputRef}
              autoFocus={autoFocus}
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search..."
              className="h-7 w-full rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">No results</p>
            ) : filtered.map((l: any) => (
              <button
                key={l.id}
                type="button"
                onClick={() => { onChange(l.id, l.name); setOpen(false); setQ('') }}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm hover:bg-muted/60 transition-colors',
                  l.id === value && 'bg-primary/10 text-primary font-medium'
                )}
              >
                <div className="font-medium text-sm">{l.name}</div>
                <div className="text-[10px] text-muted-foreground">{l.group?.name}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Receipt Form ─────────────────────────────────────────────────────────────
// Simplified: Party/Ledger (who paid) → Amount → Cash/Bank/Cheque

const receiptSchema = z.object({
  date: z.string().min(1, 'Date required'),
  branchId: z.string().optional(),
  // What/Who we received from
  fromLedgerId: z.string().min(1, 'Select party or income ledger'),
  fromAmount: z.coerce.number().positive('Amount must be positive'),
  // Received into (cash/bank)
  toLedgerId: z.string().min(1, 'Select cash or bank account'),
  paymentMode: z.enum(['CASH', 'CHEQUE', 'NEFT', 'RTGS', 'UPI', 'CARD', 'OTHER']).default('CASH'),
  chequeNumber: z.string().optional(),
  chequeDate: z.string().optional(),
  narration: z.string().optional(),
})
type ReceiptForm = z.infer<typeof receiptSchema>

function ReceiptFormPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { activeCompany, activeFY } = useAuthStore()
  const { data: branches = [] } = useBranches(activeCompany?.companyId || '')
  const [error, setError] = useState('')
  const [savedNo, setSavedNo] = useState('')

  const form = useForm<ReceiptForm>({
    resolver: zodResolver(receiptSchema),
    defaultValues: {
      date: dayjs().format('YYYY-MM-DD'),
      paymentMode: 'CASH',
    },
  })
  const w = form.watch()
  const mode = w.paymentMode

  const saveMut = useMutation({
    mutationFn: async (v: ReceiptForm) => {
      const entries = [
        { ledgerId: v.toLedgerId, debit: v.fromAmount, credit: 0, narration: v.narration },
        { ledgerId: v.fromLedgerId, debit: 0, credit: v.fromAmount, narration: v.narration },
      ]
      const { data } = await api.post('/billing/vouchers', {
        voucherType: 'RECEIPT',
        date: v.date,
        branchId: v.branchId || null,
        narration: v.narration,
        paymentMode: v.paymentMode,
        chequeNumber: v.chequeNumber || null,
        chequeDate: v.chequeDate || null,
        items: [],
        ledgerEntries: entries,
      })
      const voucher = data.data
      // Post immediately in same mutation — prevents double-save
      await api.post(`/billing/vouchers/${voucher.id}/post`)
      return voucher
    },
    onSuccess: (voucher) => {
      setSavedNo(voucher.voucherNumber)
      qc.invalidateQueries({ queryKey: ['vouchers'] })
      setTimeout(() => navigate(-1), 1500)
    },
    onError: (e) => setError(extractError(e)),
  })

  return (
    <div>
      <PageHeader
        title="New Receipt"
        subtitle="Record money received from a party or ledger"
        breadcrumbs={[{ label: 'Accounting' }, { label: 'Receipts' }, { label: 'New' }]}
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
      {savedNo && <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm flex items-center gap-2"><CheckCircle2 size={14} /> Saved as <strong>{savedNo}</strong> — Redirecting...</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Source */}
        <div className="form-section">
          <h3 className="form-section-title flex items-center gap-2"><BookOpen size={14} /> Received From</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1">Date *</label>
              <Input type="date" {...form.register('date')} error={form.formState.errors.date?.message} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">From (Party / Ledger) *</label>
              <Controller
                control={form.control}
                name="fromLedgerId"
                render={({ field }) => (
                  <LedgerPicker
                    value={field.value || ''}
                    onChange={id => field.onChange(id)}
                    placeholder="Select party or income account..."
                  />
                )}
              />
              {form.formState.errors.fromLedgerId && (
                <p className="text-xs text-destructive mt-1">{form.formState.errors.fromLedgerId.message}</p>
              )}
            </div>
            <div>
              <AmountInput
                label="Amount Received (₹) *"
                value={w.fromAmount || ''}
                onChange={val => form.setValue('fromAmount', val, { shouldValidate: true })}
                error={form.formState.errors.fromAmount?.message}
                className="text-lg"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Narration / Remark</label>
              <Textarea rows={2} {...form.register('narration')} placeholder="e.g. Receipt against Invoice INV-25-26-0001" />
            </div>
          </div>
        </div>

        {/* Right: Destination */}
        <div className="form-section">
          <h3 className="form-section-title flex items-center gap-2"><Wallet size={14} /> Received Into</h3>
          <div className="space-y-3">
            {/* Payment Mode */}
            <div>
              <label className="block text-xs font-medium mb-1">Payment Mode *</label>
              <div className="grid grid-cols-3 gap-2">
                {(['CASH', 'CHEQUE', 'UPI', 'NEFT', 'RTGS', 'CARD'] as PayMode[]).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => form.setValue('paymentMode', m)}
                    className={cn(
                      'py-2 px-3 rounded-lg border text-xs font-medium transition-all',
                      mode === m ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-muted-foreground/50'
                    )}
                  >
                    {m === 'CASH' ? '💵 Cash' : m === 'CHEQUE' ? '📄 Cheque' : m === 'UPI' ? '📱 UPI' :
                      m === 'NEFT' ? '🏦 NEFT' : m === 'RTGS' ? '🏦 RTGS' : '💳 Card'}
                  </button>
                ))}
              </div>
            </div>

            {/* Cash/Bank account */}
            <div>
              <label className="block text-xs font-medium mb-1">
                {mode === 'CASH' ? 'Cash Account *' : 'Bank Account *'}
              </label>
              <Controller
                control={form.control}
                name="toLedgerId"
                render={({ field }) => (
                  <LedgerPicker
                    value={field.value || ''}
                    onChange={id => field.onChange(id)}
                    placeholder={mode === 'CASH' ? 'Select cash account...' : 'Select bank account...'}
                    filter={mode === 'CASH'
                      ? (l: any) => l.group?.name === 'Cash-in-Hand'
                      : (l: any) => ['Bank Accounts', 'Cash-in-Hand'].includes(l.group?.name)}
                  />
                )}
              />
              {form.formState.errors.toLedgerId && (
                <p className="text-xs text-destructive mt-1">{form.formState.errors.toLedgerId.message}</p>
              )}
            </div>

            {/* Cheque details */}
            {mode === 'CHEQUE' && (
              <div className="grid grid-cols-2 gap-3 p-3 bg-muted/30 rounded-lg">
                <Input label="Cheque Number" {...form.register('chequeNumber')} placeholder="123456" />
                <Input label="Cheque Date" type="date" {...form.register('chequeDate')} />
              </div>
            )}

            {/* Journal preview */}
            {w.fromLedgerId && w.toLedgerId && w.fromAmount > 0 && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs font-semibold text-blue-800 mb-2">Accounting Entry Preview</p>
                <table className="w-full text-xs">
                  <tbody>
                    <tr>
                      <td className="text-foreground py-0.5">Dr — {'Cash/Bank Account'}</td>
                      <td className="text-right font-mono text-blue-700">{formatINR(w.fromAmount)}</td>
                    </tr>
                    <tr>
                      <td className="text-muted-foreground py-0.5 pl-4">Cr — {'Party/Income Account'}</td>
                      <td className="text-right font-mono text-muted-foreground">{formatINR(w.fromAmount)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Payment Form ─────────────────────────────────────────────────────────────

const paymentSchema = z.object({
  date: z.string().min(1, 'Date required'),
  branchId: z.string().optional(),
  toLedgerId: z.string().min(1, 'Select party or expense ledger'),
  amount: z.coerce.number().positive('Amount must be positive'),
  fromLedgerId: z.string().min(1, 'Select cash or bank account'),
  paymentMode: z.enum(['CASH', 'CHEQUE', 'NEFT', 'RTGS', 'UPI', 'CARD', 'OTHER']).default('CASH'),
  chequeNumber: z.string().optional(),
  chequeDate: z.string().optional(),
  narration: z.string().optional(),
})
type PaymentForm = z.infer<typeof paymentSchema>

function PaymentFormPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { activeCompany } = useAuthStore()
  const { data: branches = [] } = useBranches(activeCompany?.companyId || '')
  const { data: allLedgers = [] } = useLedgers()
  const [error, setError] = useState('')
  const [savedNo, setSavedNo] = useState('')

  const form = useForm<PaymentForm>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { date: dayjs().format('YYYY-MM-DD'), paymentMode: 'CASH' },
  })
  const w = form.watch()
  const mode = w.paymentMode

  const saveMut = useMutation({
    mutationFn: async (v: PaymentForm) => {
      const entries = [
        { ledgerId: v.toLedgerId, debit: v.amount, credit: 0, narration: v.narration },
        { ledgerId: v.fromLedgerId, debit: 0, credit: v.amount, narration: v.narration },
      ]
      const { data } = await api.post('/billing/vouchers', {
        voucherType: 'PAYMENT',
        date: v.date,
        branchId: v.branchId || null,
        narration: v.narration,
        paymentMode: v.paymentMode,
        chequeNumber: v.chequeNumber || null,
        chequeDate: v.chequeDate || null,
        items: [],
        ledgerEntries: entries,
      })
      const voucher = data.data
      await api.post(`/billing/vouchers/${voucher.id}/post`)
      return voucher
    },
    onSuccess: (voucher) => {
      setSavedNo(voucher.voucherNumber)
      qc.invalidateQueries({ queryKey: ['vouchers'] })
      setTimeout(() => navigate(-1), 1500)
    },
    onError: (e) => setError(extractError(e)),
  })

  return (
    <div>
      <PageHeader
        title="New Payment"
        subtitle="Record payment made to a party or expense"
        breadcrumbs={[{ label: 'Accounting' }, { label: 'Payments' }, { label: 'New' }]}
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
      {savedNo && <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm flex items-center gap-2"><CheckCircle2 size={14} /> Saved as <strong>{savedNo}</strong> — Redirecting...</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="form-section">
          <h3 className="form-section-title flex items-center gap-2"><BookOpen size={14} /> Paid To</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1">Date *</label>
              <Input type="date" {...form.register('date')} error={form.formState.errors.date?.message} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">To (Party / Expense) *</label>
              <Controller control={form.control} name="toLedgerId"
                render={({ field }) => (
                  <LedgerPicker value={field.value || ''} onChange={id => field.onChange(id)} placeholder="Select vendor, expense account..." />
                )}
              />
              {form.formState.errors.toLedgerId && <p className="text-xs text-destructive mt-1">{form.formState.errors.toLedgerId.message}</p>}
            </div>
            <div>
              <AmountInput
                label="Amount (₹) *"
                value={w.amount || ''}
                onChange={val => form.setValue('amount', val, { shouldValidate: true })}
                error={form.formState.errors.amount?.message}
                className="text-lg"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Narration / Remark</label>
              <Textarea rows={2} {...form.register('narration')} placeholder="e.g. Payment against Bill No. PUR-25-26-0001" />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3 className="form-section-title flex items-center gap-2"><CreditCard size={14} /> Paid From</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1">Payment Mode *</label>
              <div className="grid grid-cols-3 gap-2">
                {(['CASH', 'CHEQUE', 'UPI', 'NEFT', 'RTGS', 'CARD'] as PayMode[]).map(m => (
                  <button key={m} type="button" onClick={() => form.setValue('paymentMode', m)}
                    className={cn('py-2 px-3 rounded-lg border text-xs font-medium transition-all',
                      mode === m ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-muted-foreground/50')}>
                    {m === 'CASH' ? '💵 Cash' : m === 'CHEQUE' ? '📄 Cheque' : m === 'UPI' ? '📱 UPI' :
                      m === 'NEFT' ? '🏦 NEFT' : m === 'RTGS' ? '🏦 RTGS' : '💳 Card'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">{mode === 'CASH' ? 'Cash Account *' : 'Bank Account *'}</label>
              <Controller control={form.control} name="fromLedgerId"
                render={({ field }) => (
                  <LedgerPicker value={field.value || ''} onChange={id => field.onChange(id)}
                    placeholder={mode === 'CASH' ? 'Select cash account...' : 'Select bank account...'}
                    filter={mode === 'CASH' ? (l: any) => l.group?.name === 'Cash-in-Hand' : (l: any) => ['Bank Accounts', 'Cash-in-Hand'].includes(l.group?.name)}
                  />
                )}
              />
              {form.formState.errors.fromLedgerId && <p className="text-xs text-destructive mt-1">{form.formState.errors.fromLedgerId.message}</p>}
            </div>
            {mode === 'CHEQUE' && (
              <div className="grid grid-cols-2 gap-3 p-3 bg-muted/30 rounded-lg">
                <Input label="Cheque Number" {...form.register('chequeNumber')} />
                <Input label="Cheque Date" type="date" {...form.register('chequeDate')} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Contra Form ──────────────────────────────────────────────────────────────

const contraSchema = z.object({
  date: z.string().min(1),
  fromLedgerId: z.string().min(1, 'Select source account'),
  toLedgerId: z.string().min(1, 'Select destination account'),
  amount: z.coerce.number().positive('Amount required'),
  paymentMode: z.enum(['CASH', 'CHEQUE', 'NEFT', 'RTGS', 'UPI', 'CARD', 'OTHER']).default('NEFT'),
  chequeNumber: z.string().optional(),
  chequeDate: z.string().optional(),
  narration: z.string().optional(),
})
type ContraForm = z.infer<typeof contraSchema>

function ContraFormPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [error, setError] = useState('')
  const [savedNo, setSavedNo] = useState('')

  const form = useForm<ContraForm>({
    resolver: zodResolver(contraSchema),
    defaultValues: { date: dayjs().format('YYYY-MM-DD'), paymentMode: 'NEFT' },
  })
  const w = form.watch()
  const mode = w.paymentMode

  const bankCashFilter = (l: any) => ['Bank Accounts', 'Cash-in-Hand'].includes(l.group?.name)

  const saveMut = useMutation({
    mutationFn: async (v: ContraForm) => {
      const entries = [
        { ledgerId: v.toLedgerId, debit: v.amount, credit: 0 },
        { ledgerId: v.fromLedgerId, debit: 0, credit: v.amount },
      ]
      const { data } = await api.post('/billing/vouchers', {
        voucherType: 'CONTRA',
        date: v.date, narration: v.narration,
        paymentMode: v.paymentMode,
        chequeNumber: v.chequeNumber || null,
        chequeDate: v.chequeDate || null,
        items: [], ledgerEntries: entries,
      })
      const voucher = data.data
      await api.post(`/billing/vouchers/${voucher.id}/post`)
      return voucher
    },
    onSuccess: (voucher) => {
      setSavedNo(voucher.voucherNumber)
      qc.invalidateQueries({ queryKey: ['vouchers'] })
      setTimeout(() => navigate(-1), 1500)
    },
    onError: (e) => setError(extractError(e)),
  })

  return (
    <div>
      <PageHeader
        title="New Contra"
        subtitle="Transfer between Cash and Bank accounts only"
        breadcrumbs={[{ label: 'Accounting' }, { label: 'Contra' }, { label: 'New' }]}
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
      {savedNo && <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm flex items-center gap-2"><CheckCircle2 size={14} /> Saved as <strong>{savedNo}</strong> — Redirecting...</div>}

      <div className="form-section max-w-xl">
        <h3 className="form-section-title flex items-center gap-2"><Building size={14} /> Cash / Bank Transfer</h3>
        <div className="space-y-4">
          <Input label="Date *" type="date" {...form.register('date')} error={form.formState.errors.date?.message} />

          <div>
            <label className="block text-xs font-medium mb-1">Transfer From *</label>
            <Controller control={form.control} name="fromLedgerId"
              render={({ field }) => (
                <LedgerPicker value={field.value || ''} onChange={id => field.onChange(id)}
                  placeholder="Cash / Bank (source)..." filter={bankCashFilter} />
              )} />
            {form.formState.errors.fromLedgerId && <p className="text-xs text-destructive mt-1">{form.formState.errors.fromLedgerId.message}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Transfer To *</label>
            <Controller control={form.control} name="toLedgerId"
              render={({ field }) => (
                <LedgerPicker value={field.value || ''} onChange={id => field.onChange(id)}
                  placeholder="Cash / Bank (destination)..." filter={bankCashFilter} />
              )} />
            {form.formState.errors.toLedgerId && <p className="text-xs text-destructive mt-1">{form.formState.errors.toLedgerId.message}</p>}
          </div>

          <AmountInput
            label="Amount (₹) *"
            value={w.amount || ''}
            onChange={val => form.setValue('amount', val, { shouldValidate: true })}
            error={form.formState.errors.amount?.message}
            className="text-lg"
            required
          />

          <div>
            <label className="block text-xs font-medium mb-1">Transfer Mode *</label>
            <div className="grid grid-cols-4 gap-2">
              {(['NEFT', 'RTGS', 'CHEQUE', 'CASH'] as PayMode[]).map(m => (
                <button key={m} type="button" onClick={() => form.setValue('paymentMode', m)}
                  className={cn('py-1.5 rounded-lg border text-xs font-medium transition-all',
                    mode === m ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground')}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          {mode === 'CHEQUE' && (
            <div className="grid grid-cols-2 gap-3 p-3 bg-muted/30 rounded-lg">
              <Input label="Cheque No." {...form.register('chequeNumber')} />
              <Input label="Cheque Date" type="date" {...form.register('chequeDate')} />
            </div>
          )}

          <Textarea label="Narration" rows={2} {...form.register('narration')} placeholder="e.g. Transfer from HDFC to Cash for petty expenses" />

          {w.fromLedgerId && w.toLedgerId && w.amount > 0 && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs">
              <p className="font-semibold text-blue-800 mb-1">Accounting Entry</p>
              <div className="text-blue-700">Dr — Destination  <span className="float-right font-mono">{formatINR(w.amount)}</span></div>
              <div className="text-blue-600 pl-4">Cr — Source  <span className="float-right font-mono">{formatINR(w.amount)}</span></div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Journal Form ─────────────────────────────────────────────────────────────

const journalEntrySchema = z.object({
  ledgerId: z.string().min(1, 'Select ledger'),
  debit: z.coerce.number().min(0).default(0),
  credit: z.coerce.number().min(0).default(0),
  narration: z.string().optional(),
})

const journalSchema = z.object({
  date: z.string().min(1, 'Date required'),
  narration: z.string().optional(),
  branchId: z.string().optional(),
  entries: z.array(journalEntrySchema).min(2, 'At least 2 entries required'),
})
type JournalFormType = z.infer<typeof journalSchema>

function JournalFormPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { activeCompany } = useAuthStore()
  const { data: branches = [] } = useBranches(activeCompany?.companyId || '')
  const [error, setError] = useState('')
  const [savedNo, setSavedNo] = useState('')

  const form = useForm<JournalFormType>({
    resolver: zodResolver(journalSchema),
    defaultValues: {
      date: dayjs().format('YYYY-MM-DD'),
      entries: [
        { ledgerId: '', debit: 0, credit: 0 },
        { ledgerId: '', debit: 0, credit: 0 },
      ],
    },
  })

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'entries' })
  const watched = form.watch('entries')
  const totalDr = watched.reduce((s, e) => s + Number(e.debit || 0), 0)
  const totalCr = watched.reduce((s, e) => s + Number(e.credit || 0), 0)
  const diff = Math.abs(totalDr - totalCr)
  const isBalanced = diff < 0.01 && totalDr > 0

  const saveMut = useMutation({
    mutationFn: async (v: JournalFormType) => {
      if (!isBalanced) throw new Error(`Not balanced. Difference: ₹${diff.toFixed(2)}`)
      const { data } = await api.post('/billing/vouchers', {
        voucherType: 'JOURNAL',
        date: v.date, narration: v.narration, branchId: v.branchId || null,
        items: [], ledgerEntries: v.entries,
      })
      const voucher = data.data
      await api.post(`/billing/vouchers/${voucher.id}/post`)
      return voucher
    },
    onSuccess: (voucher) => {
      setSavedNo(voucher.voucherNumber)
      qc.invalidateQueries({ queryKey: ['vouchers'] })
      setTimeout(() => navigate(-1), 1500)
    },
    onError: (e) => setError(extractError(e)),
  })

  return (
    <div>
      <PageHeader
        title="New Journal Entry"
        subtitle="Free double-entry — any ledger debit/credit"
        breadcrumbs={[{ label: 'Accounting' }, { label: 'Journal' }, { label: 'New' }]}
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
      {savedNo && <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm flex items-center gap-2"><CheckCircle2 size={14} /> Saved as <strong>{savedNo}</strong> — Redirecting...</div>}

      <div className="form-section">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <Input label="Date *" type="date" {...form.register('date')} error={form.formState.errors.date?.message} />
          {(branches as any[]).length > 1 && (
            <Select label="Branch"
              options={(branches as any[]).map((b: any) => ({ value: b.id, label: b.name }))}
              {...form.register('branchId')} />
          )}
          <div className="col-span-2">
            <Textarea label="Narration" rows={1} {...form.register('narration')} placeholder="Journal narration..." />
          </div>
        </div>

        {/* Entries table */}
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Ledger Account</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground w-36">Debit (₹)</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground w-36">Credit (₹)</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-48">Narration</th>
                <th className="w-8 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, i) => (
                <tr key={field.id} className="border-t border-border/50 hover:bg-muted/20">
                  <td className="px-3 py-2">
                    <Controller control={form.control} name={`entries.${i}.ledgerId`}
                      render={({ field: f }) => (
                        <LedgerPicker value={f.value || ''} onChange={id => f.onChange(id)} placeholder="Select ledger..." />
                      )} />
                    {form.formState.errors.entries?.[i]?.ledgerId && (
                      <p className="text-[10px] text-destructive mt-0.5">{form.formState.errors.entries[i]?.ledgerId?.message}</p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" min="0" step="0.01" placeholder="0.00"
                      className="h-8 w-full rounded border border-input bg-background px-2 text-xs text-right font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                      {...form.register(`entries.${i}.debit`)}
                      onChange={e => {
                        form.setValue(`entries.${i}.debit`, Number(e.target.value))
                        if (Number(e.target.value) > 0) form.setValue(`entries.${i}.credit`, 0)
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" min="0" step="0.01" placeholder="0.00"
                      className="h-8 w-full rounded border border-input bg-background px-2 text-xs text-right font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                      {...form.register(`entries.${i}.credit`)}
                      onChange={e => {
                        form.setValue(`entries.${i}.credit`, Number(e.target.value))
                        if (Number(e.target.value) > 0) form.setValue(`entries.${i}.debit`, 0)
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input type="text" placeholder="Line narration"
                      className="h-8 w-full rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      {...form.register(`entries.${i}.narration`)} />
                  </td>
                  <td className="px-2 py-2">
                    {fields.length > 2 && (
                      <button type="button" onClick={() => remove(i)}
                        className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/40">
                <td className="px-3 py-2">
                  <button type="button"
                    onClick={() => append({ ledgerId: '', debit: 0, credit: 0 })}
                    className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
                    <Plus size={12} /> Add Row
                  </button>
                </td>
                <td className="px-3 py-2 text-right font-mono font-bold text-sm">{formatINR(totalDr)}</td>
                <td className="px-3 py-2 text-right font-mono font-bold text-sm">{formatINR(totalCr)}</td>
                <td colSpan={2} className="px-3 py-2">
                  {totalDr > 0 && (
                    isBalanced ? (
                      <span className="text-xs text-green-600 flex items-center gap-1 font-medium">
                        <CheckCircle2 size={12} /> Balanced
                      </span>
                    ) : (
                      <span className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle size={12} /> Diff: {formatINR(diff)}
                      </span>
                    )
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Page exports ─────────────────────────────────────────────────────────────

export function ReceiptListPage() {
  return <VoucherListPage voucherType="RECEIPT" title="Receipts" newPath="/accounting/receipt/new" />
}
export { ReceiptFormPage }

export function PaymentListPage() {
  return <VoucherListPage voucherType="PAYMENT" title="Payments" newPath="/accounting/payment/new" />
}
export { PaymentFormPage }

export function ContraListPage() {
  return <VoucherListPage voucherType="CONTRA" title="Contra Vouchers" newPath="/accounting/contra/new" />
}
export { ContraFormPage }

export function JournalListPage() {
  return <VoucherListPage voucherType="JOURNAL" title="Journal Vouchers" newPath="/accounting/journal/new" />
}
export { JournalFormPage }
