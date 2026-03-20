import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatINR, formatDate } from '../../lib/india'
import { Button, Badge, PageHeader, Spinner, Select, EmptyState } from '../../components/ui'
import { useAuthStore } from '../../stores/auth.store'
import { useLedgers } from '../../hooks/api.hooks'
import dayjs from 'dayjs'
import { Download, Printer } from 'lucide-react'

// ─── Day Book ─────────────────────────────────────────────────────────────────

export function DayBookPage() {
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'))

  const { data, isLoading } = useQuery({
    queryKey: ['day-book', date],
    queryFn: async () => {
      const { data } = await api.get('/billing/vouchers', {
        params: { from: date, to: date, limit: 500, status: 'POSTED' },
      })
      return data
    },
  })

  const vouchers: any[] = data?.data || []
  const totalDebit = vouchers.reduce((s: number, v: any) => s + Number(v.grandTotal || 0), 0)

  return (
    <div>
      <PageHeader title="Day Book" subtitle="All vouchers for a day"
        breadcrumbs={[{ label: 'Reports' }, { label: 'Day Book' }]}
        actions={
          <div className="flex gap-2 items-center">
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer size={14} /></Button>
          </div>
        }
      />
      <RegisterTable vouchers={vouchers} isLoading={isLoading} showType total={totalDebit} />
    </div>
  )
}

// ─── Sale Register ────────────────────────────────────────────────────────────

export function SaleRegisterPage() {
  return <RegisterPage voucherType="SALE" title="Sale Register" />
}

export function PurchaseRegisterPage() {
  return <RegisterPage voucherType="PURCHASE" title="Purchase Register" />
}

export function JournalRegisterPage() {
  return <RegisterPage voucherType="JOURNAL" title="Journal Register" />
}

function RegisterPage({ voucherType, title }: { voucherType: string; title: string }) {
  const { activeFY } = useAuthStore()
  const [from, setFrom] = useState(activeFY ? `20${activeFY.split('-')[0]}-04-01` : dayjs().subtract(1, 'year').format('YYYY-MM-DD'))
  const [to, setTo] = useState(dayjs().format('YYYY-MM-DD'))

  const { data, isLoading } = useQuery({
    queryKey: [title, from, to],
    queryFn: async () => {
      const { data } = await api.get('/billing/vouchers', {
        params: { voucherType, from, to, limit: 500, status: 'POSTED' },
      })
      return data
    },
  })

  const vouchers: any[] = data?.data || []
  const total = vouchers.reduce((s: number, v: any) => s + Number(v.grandTotal || 0), 0)
  const taxable = vouchers.reduce((s: number, v: any) => s + Number(v.taxableAmount || 0), 0)
  const gst = vouchers.reduce((s: number, v: any) => s + Number(v.cgstAmount || 0) + Number(v.sgstAmount || 0) + Number(v.igstAmount || 0), 0)

  return (
    <div>
      <PageHeader title={title} breadcrumbs={[{ label: 'Reports' }, { label: title }]}
        actions={
          <div className="flex gap-2 items-center">
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <span className="text-muted-foreground text-sm">to</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer size={14} /></Button>
          </div>
        }
      />

      {/* Summary */}
      {vouchers.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Vouchers', value: vouchers.length },
            { label: 'Taxable Value', value: formatINR(taxable) },
            { label: 'Total GST', value: formatINR(gst) },
            { label: 'Grand Total', value: formatINR(total) },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <span className="stat-label">{s.label}</span>
              <span className="stat-value text-lg">{s.value}</span>
            </div>
          ))}
        </div>
      )}
      <RegisterTable vouchers={vouchers} isLoading={isLoading} total={total} showGST />
    </div>
  )
}

// ─── Cash Book ────────────────────────────────────────────────────────────────

export function CashBookPage() {
  return <BookPage ledgerName="Cash" title="Cash Book" />
}

export function BankBookPage() {
  return <BookPage ledgerName="HDFC Bank" title="Bank Book" />
}

function BookPage({ ledgerName, title }: { ledgerName: string; title: string }) {
  const { activeFY } = useAuthStore()
  const { data: ledgers = [] } = useLedgers()
  const [from, setFrom] = useState(activeFY ? `20${activeFY.split('-')[0]}-04-01` : dayjs().subtract(1, 'year').format('YYYY-MM-DD'))
  const [to, setTo] = useState(dayjs().format('YYYY-MM-DD'))

  const defaultLedger = (ledgers as any[]).find((l: any) => l.name === ledgerName)
  const [ledgerId, setLedgerId] = useState('')

  const activeLedgerId = ledgerId || defaultLedger?.id

  const ledgerOptions = [
    { value: '', label: `Auto (${ledgerName})` },
    ...(ledgers as any[]).map((l: any) => ({ value: l.id, label: l.name })),
  ]

  const { data, isLoading } = useQuery({
    queryKey: ['ledger-statement', activeLedgerId, from, to],
    queryFn: async () => {
      const { data } = await api.get('/accounting/ledger-statement', {
        params: { ledgerId: activeLedgerId, from, to },
      })
      return data.data
    },
    enabled: !!activeLedgerId,
  })

  return (
    <div>
      <PageHeader title={title} breadcrumbs={[{ label: 'Reports' }, { label: title }]}
        actions={
          <div className="flex gap-2 items-center flex-wrap">
            <Select options={ledgerOptions} value={ledgerId} onChange={e => setLedgerId(e.target.value)} className="w-44" />
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <span className="text-muted-foreground text-sm">to</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer size={14} /></Button>
          </div>
        }
      />

      {isLoading ? <div className="flex justify-center py-12"><Spinner /></div> : data ? (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex justify-between items-center">
            <div>
              <p className="font-medium">{data.ledger.name}</p>
              <p className="text-xs text-muted-foreground">{data.ledger.groupName}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Opening: <span className="font-mono">{formatINR(data.openingBalance)} {data.openingType}</span></p>
              <p className="text-xs font-medium mt-0.5">Closing: <span className={`font-mono ${data.closingType === 'Dr' ? 'amount-debit' : 'amount-credit'}`}>{formatINR(data.closingBalance)} {data.closingType}</span></p>
            </div>
          </div>
          <table className="erp-table">
            <thead>
              <tr>
                <th>Date</th><th>Voucher</th><th>Party / Account</th><th>Narration</th>
                <th className="text-right">Receipts (Dr)</th>
                <th className="text-right">Payments (Cr)</th>
                <th className="text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.statement.map((row: any, i: number) => (
                <tr key={i}>
                  <td className="text-sm whitespace-nowrap">{formatDate(row.date)}</td>
                  <td>
                    <div className="font-mono text-xs">{row.voucherNumber}</div>
                    {row.voucherType && <Badge variant="secondary" className="text-[9px]">{row.voucherType}</Badge>}
                  </td>
                  <td className="text-xs text-muted-foreground">{row.party || '—'}</td>
                  <td className="text-xs text-muted-foreground truncate max-w-[160px]">{row.narration || '—'}</td>
                  <td className="amount-col text-sm">{row.debit ? <span className="amount-debit">{formatINR(row.debit)}</span> : '—'}</td>
                  <td className="amount-col text-sm">{row.credit ? <span className="amount-credit">{formatINR(row.credit)}</span> : '—'}</td>
                  <td className="amount-col text-sm font-medium">
                    <span className={row.balanceType === 'Dr' ? 'text-foreground' : 'amount-credit'}>
                      {formatINR(row.balance)} {row.balanceType}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted font-semibold">
                <td colSpan={4} className="px-3 py-2">Total</td>
                <td className="amount-col px-3 py-2 amount-debit">{formatINR(data.totalDebit)}</td>
                <td className="amount-col px-3 py-2 amount-credit">{formatINR(data.totalCredit)}</td>
                <td className="amount-col px-3 py-2">
                  <span className={data.closingType === 'Dr' ? 'amount-debit' : 'amount-credit'}>
                    {formatINR(data.closingBalance)} {data.closingType}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <EmptyState title="No data" description="No transactions found for selected period" />
      )}
    </div>
  )
}

// ─── Shared RegisterTable ─────────────────────────────────────────────────────

function RegisterTable({ vouchers, isLoading, showType = false, showGST = false, total }: {
  vouchers: any[]; isLoading: boolean; showType?: boolean; showGST?: boolean; total?: number
}) {
  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>
  if (vouchers.length === 0) return <EmptyState title="No entries found" description="No vouchers for selected period" />

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <table className="erp-table">
        <thead>
          <tr>
            {showType && <th>Type</th>}
            <th>Voucher No</th>
            <th>Date</th>
            <th>Party</th>
            <th>Narration</th>
            {showGST && <>
              <th className="text-right">Taxable</th>
              <th className="text-right">CGST</th>
              <th className="text-right">SGST</th>
              <th className="text-right">IGST</th>
            </>}
            <th className="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {vouchers.map((v: any) => (
            <tr key={v.id}>
              {showType && <td><Badge variant="secondary" className="text-[10px]">{v.voucherType}</Badge></td>}
              <td className="font-mono text-xs">{v.voucherNumber}</td>
              <td className="text-sm whitespace-nowrap">{formatDate(v.date)}</td>
              <td className="text-sm truncate max-w-[140px]">{v.party?.name || '—'}</td>
              <td className="text-xs text-muted-foreground truncate max-w-[120px]">{v.narration || '—'}</td>
              {showGST && <>
                <td className="amount-col text-sm">{formatINR(v.taxableAmount)}</td>
                <td className="amount-col text-xs text-muted-foreground">{formatINR(v.cgstAmount)}</td>
                <td className="amount-col text-xs text-muted-foreground">{formatINR(v.sgstAmount)}</td>
                <td className="amount-col text-xs text-muted-foreground">{formatINR(v.igstAmount)}</td>
              </>}
              <td className="amount-col text-sm font-medium">{formatINR(v.grandTotal)}</td>
            </tr>
          ))}
        </tbody>
        {total !== undefined && (
          <tfoot>
            <tr className="bg-muted font-semibold">
              <td colSpan={showType ? (showGST ? 8 : 4) : (showGST ? 7 : 3)} className="px-3 py-2">Total</td>
              <td className="amount-col px-3 py-2">{formatINR(total)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
