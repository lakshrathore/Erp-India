import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, extractError } from '../../lib/api'
import { formatINR, formatDate } from '../../lib/india'
import { Button, Badge, PageHeader, Spinner, Select, EmptyState } from '../../components/ui'
import { useLedgers } from '../../hooks/api.hooks'
import { Upload, CheckCircle2, AlertCircle, Link } from 'lucide-react'
import dayjs from 'dayjs'
import { useAuthStore } from '../../stores/auth.store'

export default function BankReconPage() {
  const { activeFY } = useAuthStore()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const { data: ledgers = [] } = useLedgers()
  const bankLedgers = (ledgers as any[]).filter((l: any) => l.group?.name === 'Bank Accounts')

  const [ledgerId, setLedgerId] = useState('')
  const [from, setFrom] = useState(activeFY ? `20${activeFY.split('-')[0]}-04-01` : dayjs().subtract(30, 'day').format('YYYY-MM-DD'))
  const [to, setTo] = useState(dayjs().format('YYYY-MM-DD'))
  const [uploadError, setUploadError] = useState('')
  const [selectedBankEntry, setSelectedBankEntry] = useState<string | null>(null)
  const [selectedBookEntry, setSelectedBookEntry] = useState<string | null>(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['bank-recon', ledgerId, from, to],
    queryFn: async () => {
      const { data } = await api.get(`/accounting/bank-recon/${ledgerId}`, { params: { from, to } })
      return data.data
    },
    enabled: !!ledgerId,
  })

  const reconMutation = useMutation({
    mutationFn: async ({ bankStatementId, voucherId }: { bankStatementId: string; voucherId?: string }) => {
      await api.post('/accounting/bank-recon/reconcile', { bankStatementId, voucherId })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-recon'] })
      setSelectedBankEntry(null)
      setSelectedBookEntry(null)
    },
  })

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !ledgerId) return
    setUploadError('')
    try {
      const text = await file.text()
      const lines = text.split('\n').filter(l => l.trim())
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
      const entries: any[] = []

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''))
        if (cols.length < 3) continue
        const row: any = {}
        headers.forEach((h, idx) => { row[h] = cols[idx] || '' })

        entries.push({
          txnDate: row.date || row.txndate || row['transaction date'] || '',
          description: row.description || row.narration || row.particulars || '',
          debit: parseFloat(row.debit || row.withdrawal || '0') || 0,
          credit: parseFloat(row.credit || row.deposit || '0') || 0,
          balance: parseFloat(row.balance || '0') || 0,
          refNo: row.ref || row.refno || row.chequeno || row['reference no'] || '',
        })
      }

      await api.post('/accounting/bank-recon/upload', { ledgerId, entries })
      refetch()
    } catch {
      setUploadError('Invalid CSV. Expected columns: Date, Description, Debit, Credit, Balance')
    }
  }

  const handleManualMatch = () => {
    if (!selectedBankEntry) return
    reconMutation.mutate({
      bankStatementId: selectedBankEntry,
      voucherId: selectedBookEntry || undefined,
    })
  }

  const ledgerOptions = [
    { value: '', label: 'Select bank ledger...' },
    ...bankLedgers.map((l: any) => ({ value: l.id, label: l.name })),
    // Also add all ledgers as fallback
    ...(ledgers as any[]).filter((l: any) => l.group?.name !== 'Bank Accounts').map((l: any) => ({
      value: l.id, label: `${l.name} (${l.group?.name})`
    })),
  ]

  const unreconciledBank = data?.bankStatements?.filter((s: any) => !s.isReconciled) || []
  const reconciledBank = data?.bankStatements?.filter((s: any) => s.isReconciled) || []

  return (
    <div>
      <PageHeader title="Bank Reconciliation"
        subtitle="Match bank statement with books"
        breadcrumbs={[{ label: 'Accounting' }, { label: 'Bank Reconciliation' }]}
        actions={
          <div className="flex gap-2 items-end">
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
            {ledgerId && (
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload size={14} /> Upload CSV
              </Button>
            )}
          </div>
        }
      />

      {/* Filters */}
      <div className="flex gap-3 mb-4 items-end flex-wrap">
        <Select options={ledgerOptions} value={ledgerId} onChange={e => setLedgerId(e.target.value)} className="w-60" />
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        <span className="text-muted-foreground text-sm">to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>

      {uploadError && (
        <div className="mb-4 bg-destructive/10 border border-destructive/20 rounded-md px-4 py-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle size={14} /> {uploadError}
        </div>
      )}

      {!ledgerId ? (
        <EmptyState title="Select a bank ledger" description="Choose the bank account ledger to reconcile" />
      ) : isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : data ? (
        <>
          {/* Summary */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Bank Entries', value: data.summary.totalBankStatements },
              { label: 'Reconciled', value: data.summary.reconciledCount, color: 'text-success' },
              { label: 'Unreconciled', value: data.summary.unreconciledCount, color: 'text-warning' },
              { label: 'Unreconciled Debit', value: formatINR(data.summary.unreconciledDebit), color: 'amount-debit' },
            ].map(s => (
              <div key={s.label} className="stat-card">
                <span className="stat-label">{s.label}</span>
                <span className={`stat-value text-lg ${s.color || ''}`}>{s.value}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Bank Statement — Unreconciled */}
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                Bank Statement
                <Badge variant="warning" className="text-[10px]">{unreconciledBank.length} pending</Badge>
              </h3>
              <div className="bg-card border border-border rounded-lg overflow-hidden max-h-[500px] overflow-y-auto">
                {unreconciledBank.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">All entries reconciled 🎉</div>
                ) : (
                  <table className="erp-table">
                    <thead className="sticky top-0 bg-card">
                      <tr>
                        <th>Date</th><th>Description</th>
                        <th className="text-right">Dr</th><th className="text-right">Cr</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {unreconciledBank.map((s: any) => (
                        <tr key={s.id}
                          className={`cursor-pointer ${selectedBankEntry === s.id ? 'bg-primary/10 border-l-2 border-primary' : 'hover:bg-muted/30'}`}
                          onClick={() => setSelectedBankEntry(selectedBankEntry === s.id ? null : s.id)}>
                          <td className="text-xs whitespace-nowrap">{formatDate(s.date)}</td>
                          <td className="text-xs truncate max-w-[140px]" title={s.description}>{s.description}</td>
                          <td className="amount-col text-xs">{s.debit > 0 ? <span className="amount-debit">{formatINR(s.debit)}</span> : '—'}</td>
                          <td className="amount-col text-xs">{s.credit > 0 ? <span className="amount-credit">{formatINR(s.credit)}</span> : '—'}</td>
                          <td className="px-2">
                            {selectedBankEntry === s.id && (
                              <CheckCircle2 size={12} className="text-primary" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Book Entries */}
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                Book Entries (Unmatched)
                <Badge variant="secondary" className="text-[10px]">{data.bookEntries?.length || 0}</Badge>
              </h3>
              <div className="bg-card border border-border rounded-lg overflow-hidden max-h-[500px] overflow-y-auto">
                {!data.bookEntries?.length ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">No book entries found</div>
                ) : (
                  <table className="erp-table">
                    <thead className="sticky top-0 bg-card">
                      <tr>
                        <th>Date</th><th>Voucher</th>
                        <th className="text-right">Dr</th><th className="text-right">Cr</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.bookEntries.map((e: any) => (
                        <tr key={e.id}
                          className={`cursor-pointer ${selectedBookEntry === e.id ? 'bg-primary/10 border-l-2 border-primary' : 'hover:bg-muted/30'}`}
                          onClick={() => setSelectedBookEntry(selectedBookEntry === e.id ? null : e.id)}>
                          <td className="text-xs whitespace-nowrap">{formatDate(e.date)}</td>
                          <td className="text-xs font-mono">{e.voucherNumber || '—'}</td>
                          <td className="amount-col text-xs">{e.debit > 0 ? <span className="amount-debit">{formatINR(e.debit)}</span> : '—'}</td>
                          <td className="amount-col text-xs">{e.credit > 0 ? <span className="amount-credit">{formatINR(e.credit)}</span> : '—'}</td>
                          <td className="px-2">
                            {selectedBookEntry === e.id && <CheckCircle2 size={12} className="text-primary" />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* Match action */}
          {selectedBankEntry && (
            <div className="mt-4 flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-lg px-4 py-3">
              <Link size={15} className="text-primary" />
              <span className="text-sm text-primary font-medium">
                {selectedBookEntry ? 'Match selected bank entry with selected book entry' : 'Mark bank entry as reconciled (no matching book entry)'}
              </span>
              <Button size="sm" onClick={handleManualMatch} loading={reconMutation.isPending} className="ml-auto">
                <CheckCircle2 size={13} /> Reconcile
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setSelectedBankEntry(null); setSelectedBookEntry(null) }}>
                Cancel
              </Button>
            </div>
          )}

          {/* Reconciled entries */}
          {reconciledBank.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <CheckCircle2 size={14} className="text-success" />
                Reconciled ({reconciledBank.length})
              </h3>
              <div className="bg-card border border-success/20 rounded-lg overflow-hidden">
                <table className="erp-table">
                  <thead>
                    <tr><th>Date</th><th>Description</th><th className="text-right">Dr</th><th className="text-right">Cr</th><th>Matched Voucher</th></tr>
                  </thead>
                  <tbody>
                    {reconciledBank.slice(0, 20).map((s: any) => (
                      <tr key={s.id} className="opacity-70">
                        <td className="text-xs">{formatDate(s.date)}</td>
                        <td className="text-xs truncate max-w-[160px]">{s.description}</td>
                        <td className="amount-col text-xs">{s.debit > 0 ? formatINR(s.debit) : '—'}</td>
                        <td className="amount-col text-xs">{s.credit > 0 ? formatINR(s.credit) : '—'}</td>
                        <td><Badge variant="success" className="text-[10px]">Matched</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
