import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, useFieldArray } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2, Save, ArrowLeft, AlertCircle, CheckCircle2 } from 'lucide-react'
import dayjs from 'dayjs'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, extractError } from '../../lib/api'
import { formatINR, formatDate } from '../../lib/india'
import { useLedgers, useParties, useBranches } from '../../hooks/api.hooks'
import { Button, Input, Select, Textarea, Badge, PageHeader, EmptyState, Spinner } from '../../components/ui'
import { useAuthStore } from '../../stores/auth.store'
import VoucherListPage from '../../components/forms/VoucherListPage'

// ─── Schema ───────────────────────────────────────────────────────────────────

const ledgerEntrySchema = z.object({
  ledgerId: z.string().min(1, 'Select ledger'),
  debit: z.coerce.number().default(0),
  credit: z.coerce.number().default(0),
  narration: z.string().optional(),
})

const acctVoucherSchema = z.object({
  voucherType: z.enum(['RECEIPT', 'PAYMENT', 'CONTRA', 'JOURNAL']),
  date: z.string().min(1, 'Date required'),
  branchId: z.string().optional(),
  narration: z.string().optional(),
  ledgerEntries: z.array(ledgerEntrySchema).min(2, 'Add at least 2 entries'),
})

type AcctVoucherForm = z.infer<typeof acctVoucherSchema>

type AcctVoucherType = 'RECEIPT' | 'PAYMENT' | 'CONTRA' | 'JOURNAL'

const TYPE_CONFIG: Record<AcctVoucherType, { label: string; hint: string; debitLabel: string; creditLabel: string }> = {
  RECEIPT: { label: 'Receipt', hint: 'Dr: Bank/Cash  |  Cr: Party/Income', debitLabel: 'Received Into', creditLabel: 'Received From' },
  PAYMENT: { label: 'Payment', hint: 'Dr: Expense/Party  |  Cr: Bank/Cash', debitLabel: 'Paid To', creditLabel: 'Paid From' },
  CONTRA: { label: 'Contra', hint: 'Cash ↔ Bank transfers only', debitLabel: 'To Account', creditLabel: 'From Account' },
  JOURNAL: { label: 'Journal', hint: 'Any double-entry adjustment', debitLabel: 'Debit Account', creditLabel: 'Credit Account' },
}

// ─── Ledger Search ────────────────────────────────────────────────────────────

function LedgerSelect({ value, onChange, placeholder }: { value: string; onChange: (id: string) => void; placeholder?: string }) {
  const { data: ledgers = [] } = useLedgers()
  return (
    <select
      className="h-8 w-full rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      <option value="">{placeholder || 'Select ledger...'}</option>
      {(ledgers as any[]).map((l: any) => (
        <option key={l.id} value={l.id}>{l.name}</option>
      ))}
    </select>
  )
}

// ─── Accounting Voucher Form ──────────────────────────────────────────────────

function AcctVoucherForm({ voucherType }: { voucherType: AcctVoucherType }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { activeCompany, activeFY } = useAuthStore()
  const { data: branches = [] } = useBranches(activeCompany?.companyId || '')
  const cfg = TYPE_CONFIG[voucherType]

  const [saveError, setSaveError] = useState('')
  const [savedNumber, setSavedNumber] = useState('')

  const form = useForm<AcctVoucherForm>({
    resolver: zodResolver(acctVoucherSchema),
    defaultValues: {
      voucherType,
      date: dayjs().format('YYYY-MM-DD'),
      ledgerEntries: [
        { ledgerId: '', debit: 0, credit: 0 },
        { ledgerId: '', debit: 0, credit: 0 },
      ],
    },
  })

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'ledgerEntries' })
  const watchedEntries = form.watch('ledgerEntries')

  const totalDebit = watchedEntries.reduce((s, e) => s + Number(e.debit || 0), 0)
  const totalCredit = watchedEntries.reduce((s, e) => s + Number(e.credit || 0), 0)
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0

  const saveMutation = useMutation({
    mutationFn: async (values: AcctVoucherForm) => {
      const { data } = await api.post('/billing/vouchers', {
        ...values,
        items: [],
      })
      return data.data
    },
    onSuccess: (data) => {
      setSavedNumber(data.voucherNumber)
      qc.invalidateQueries({ queryKey: ['vouchers'] })
    },
  })

  const postMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/billing/vouchers/${id}/post`)
    },
    onSuccess: () => navigate(-1),
  })

  const handleSaveAndPost = async (values: AcctVoucherForm) => {
    setSaveError('')
    if (!isBalanced) { setSaveError('Debit and Credit must be equal'); return }
    try {
      const voucher = await saveMutation.mutateAsync(values)
      await postMutation.mutateAsync(voucher.id)
    } catch (e) {
      setSaveError(extractError(e))
    }
  }

  return (
    <div>
      <PageHeader
        title={`New ${cfg.label}`}
        breadcrumbs={[{ label: 'Accounting' }, { label: `${cfg.label}s` }, { label: 'New' }]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(-1)}><ArrowLeft size={15} /> Back</Button>
            <Button onClick={form.handleSubmit(handleSaveAndPost)}
              loading={saveMutation.isPending || postMutation.isPending}>
              <Save size={15} /> Save & Post
            </Button>
          </div>
        }
      />

      {saveError && (
        <div className="mb-4 flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-md px-4 py-3 text-sm text-destructive">
          <AlertCircle size={15} /> {saveError}
        </div>
      )}

      {savedNumber && (
        <div className="mb-4 flex items-center gap-2 bg-success-muted border border-success/20 rounded-md px-4 py-3 text-sm text-success">
          <CheckCircle2 size={15} /> Saved as {savedNumber}
        </div>
      )}

      <div className="form-section mb-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">{cfg.hint}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <Input label="Date" type="date" required
            error={form.formState.errors.date?.message}
            {...form.register('date')} />
          {(branches as any[]).length > 1 && (
            <Select label="Branch"
              options={(branches as any[]).map((b: any) => ({ value: b.id, label: b.name }))}
              {...form.register('branchId')} />
          )}
          <div className="col-span-2">
            <Textarea label="Narration" rows={1} placeholder="Voucher narration..."
              {...form.register('narration')} />
          </div>
        </div>

        {/* Ledger entries grid */}
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted">
                <th className="px-3 py-2 text-left font-medium uppercase tracking-wide text-muted-foreground">Ledger Account</th>
                <th className="px-3 py-2 text-right font-medium uppercase tracking-wide text-muted-foreground w-32">Debit (₹)</th>
                <th className="px-3 py-2 text-right font-medium uppercase tracking-wide text-muted-foreground w-32">Credit (₹)</th>
                <th className="px-3 py-2 text-left font-medium uppercase tracking-wide text-muted-foreground">Narration</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => (
                <tr key={field.id} className="border-t border-border/50">
                  <td className="px-3 py-2">
                    <LedgerSelect
                      value={form.watch(`ledgerEntries.${index}.ledgerId`)}
                      onChange={id => form.setValue(`ledgerEntries.${index}.ledgerId`, id)}
                    />
                    {form.formState.errors.ledgerEntries?.[index]?.ledgerId && (
                      <p className="text-[10px] text-destructive mt-0.5">
                        {form.formState.errors.ledgerEntries[index]?.ledgerId?.message}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" min="0" step="0.01" placeholder="0.00"
                      className="h-8 w-full rounded border border-input bg-background px-2 text-xs text-right font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                      {...form.register(`ledgerEntries.${index}.debit`)} />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" min="0" step="0.01" placeholder="0.00"
                      className="h-8 w-full rounded border border-input bg-background px-2 text-xs text-right font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                      {...form.register(`ledgerEntries.${index}.credit`)} />
                  </td>
                  <td className="px-3 py-2">
                    <input type="text" placeholder="Line narration"
                      className="h-8 w-full rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      {...form.register(`ledgerEntries.${index}.narration`)} />
                  </td>
                  <td className="px-2">
                    {fields.length > 2 && (
                      <button type="button" onClick={() => remove(index)}
                        className="text-muted-foreground hover:text-destructive">
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
                  <button type="button" onClick={() => append({ ledgerId: '', debit: 0, credit: 0 })}
                    className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
                    <Plus size={12} /> Add Row
                  </button>
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold text-sm">
                  {formatINR(totalDebit)}
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold text-sm">
                  {formatINR(totalCredit)}
                </td>
                <td colSpan={2} className="px-3 py-2">
                  {totalDebit > 0 && (
                    isBalanced ? (
                      <span className="text-xs text-success flex items-center gap-1">
                        <CheckCircle2 size={12} /> Balanced
                      </span>
                    ) : (
                      <span className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle size={12} /> Difference: {formatINR(Math.abs(totalDebit - totalCredit))}
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
export function ReceiptFormPage() { return <AcctVoucherForm voucherType="RECEIPT" /> }

export function PaymentListPage() {
  return <VoucherListPage voucherType="PAYMENT" title="Payments" newPath="/accounting/payment/new" />
}
export function PaymentFormPage() { return <AcctVoucherForm voucherType="PAYMENT" /> }

export function ContraListPage() {
  return <VoucherListPage voucherType="CONTRA" title="Contra Vouchers" newPath="/accounting/contra/new" />
}
export function ContraFormPage() { return <AcctVoucherForm voucherType="CONTRA" /> }

export function JournalListPage() {
  return <VoucherListPage voucherType="JOURNAL" title="Journal Vouchers" newPath="/accounting/journal/new" />
}
export function JournalFormPage() { return <AcctVoucherForm voucherType="JOURNAL" /> }
