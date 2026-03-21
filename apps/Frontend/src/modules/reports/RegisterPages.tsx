import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { formatINR, formatDate, parseFYDates } from '../../lib/india'
import { Button, Badge, PageHeader, Spinner, Select, EmptyState } from '../../components/ui'
import { useAuthStore } from '../../stores/auth.store'
import { useLedgers } from '../../hooks/api.hooks'
import dayjs from 'dayjs'
import { Printer, ExternalLink } from 'lucide-react'
import { cn } from '../../components/ui/utils'

// ─── Voucher type color map ───────────────────────────────────────────────────

const VOUCHER_COLORS: Record<string, string> = {
  SALE: 'bg-green-100 text-green-700',
  PURCHASE: 'bg-blue-100 text-blue-700',
  RECEIPT: 'bg-teal-100 text-teal-700',
  PAYMENT: 'bg-orange-100 text-orange-700',
  CONTRA: 'bg-purple-100 text-purple-700',
  JOURNAL: 'bg-gray-100 text-gray-700',
  CREDIT_NOTE: 'bg-red-100 text-red-700',
  DEBIT_NOTE: 'bg-yellow-100 text-yellow-700',
}

const VOUCHER_PATH: Record<string, string> = {
  SALE: '/billing/sale', PURCHASE: '/billing/purchase',
  CREDIT_NOTE: '/billing/credit-note', DEBIT_NOTE: '/billing/debit-note',
  SALE_CHALLAN: '/billing/sale-challan', PURCHASE_ORDER: '/billing/purchase-order',
  RECEIPT: '/accounting/receipt', PAYMENT: '/accounting/payment',
  CONTRA: '/accounting/contra', JOURNAL: '/accounting/journal',
}

// ─── Day Book ─────────────────────────────────────────────────────────────────

export function DayBookPage() {
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'))

  const { data, isLoading } = useQuery({
    queryKey: ['day-book', date],
    queryFn: async () => {
      const { data } = await api.get('/accounting/day-book', { params: { date } })
      return data.data
    },
  })

  const vouchers: any[] = data?.vouchers || []
  const grandTotals = data?.grandTotals || { debit: 0, credit: 0, count: 0 }

  return (
    <div>
      <PageHeader title="Day Book" subtitle="All accounting entries for a date"
        breadcrumbs={[{ label: 'Reports' }, { label: 'Day Book' }]}
        actions={
          <div className="flex gap-2 items-center">
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer size={14} /></Button>
          </div>
        }
      />

      {/* Summary */}
      {vouchers.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="stat-card"><span className="stat-label">Vouchers</span><span className="stat-value">{grandTotals.count}</span></div>
          <div className="stat-card"><span className="stat-label">Total Debit</span><span className="stat-value text-blue-600 font-mono">{formatINR(grandTotals.debit)}</span></div>
          <div className="stat-card"><span className="stat-label">Total Credit</span><span className="stat-value text-orange-600 font-mono">{formatINR(grandTotals.credit)}</span></div>
        </div>
      )}

      {isLoading ? <div className="flex justify-center py-12"><Spinner /></div> :
        vouchers.length === 0 ? <EmptyState title="No entries" description={`No vouchers posted on ${formatDate(date)}`} /> :
        <div className="space-y-3">
          {vouchers.map((v: any, i: number) => (
            <div key={v.voucherId || i} className="bg-card border border-border rounded-lg overflow-hidden">
              {/* Voucher header */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border">
                <div className="flex items-center gap-2">
                  <Badge className={cn('text-xs', VOUCHER_COLORS[v.voucherType] || 'bg-gray-100 text-gray-700')}>
                    {v.voucherType}
                  </Badge>
                  <span className="font-mono font-semibold text-sm">{v.voucherNumber}</span>
                  {v.party && <span className="text-sm text-muted-foreground">— {v.party}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{formatDate(v.date)}</span>
                  {v.narration && <span className="text-xs text-muted-foreground truncate max-w-[180px]">{v.narration}</span>}
                  {v.voucherId && (
                    <Link
                      to={`${VOUCHER_PATH[v.voucherType] || '/billing/sale'}/${v.voucherId}`}
                      className="text-primary hover:text-primary/80"
                      title="View voucher"
                    >
                      <ExternalLink size={13} />
                    </Link>
                  )}
                </div>
              </div>
              {/* Journal entries */}
              <table className="w-full text-xs">
                <tbody>
                  {(v.entries || []).map((e: any, j: number) => (
                    <tr key={j} className="border-t border-border/30">
                      <td className="px-4 py-1.5 text-muted-foreground w-6">{e.debit > 0 ? 'Dr' : ''}</td>
                      <td className={cn('px-2 py-1.5', e.credit > 0 && 'pl-8')}>{e.ledgerName}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{e.groupName}</td>
                      <td className="px-4 py-1.5 text-right font-mono font-medium">
                        {e.debit > 0 && <span className="text-blue-700">{formatINR(e.debit)}</span>}
                        {e.credit > 0 && <span className="text-orange-700">{formatINR(e.credit)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/20">
                    <td colSpan={3} className="px-4 py-1.5 text-right text-muted-foreground text-xs">Total</td>
                    <td className="px-4 py-1.5 text-right font-mono font-semibold text-sm">
                      {formatINR(v.totalDebit || v.grandTotal || 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ))}
        </div>
      }
    </div>
  )
}

// ─── Sale Register ────────────────────────────────────────────────────────────

export function SaleRegisterPage() {
  return <RegisterPage voucherType="SALE" title="Sale Register" showGST />
}

export function PurchaseRegisterPage() {
  return <RegisterPage voucherType="PURCHASE" title="Purchase Register" showGST />
}

export function JournalRegisterPage() {
  return <RegisterPage voucherType="JOURNAL" title="Journal Register" />
}

function RegisterPage({ voucherType, title, showGST = false }: { voucherType: string; title: string; showGST?: boolean }) {
  const { activeFY } = useAuthStore()
  const [from, setFrom] = useState(activeFY ? parseFYDates(activeFY).from : dayjs().startOf('month').format('YYYY-MM-DD'))
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
  const cgst = vouchers.reduce((s: number, v: any) => s + Number(v.cgstAmount || 0), 0)
  const sgst = vouchers.reduce((s: number, v: any) => s + Number(v.sgstAmount || 0), 0)
  const igst = vouchers.reduce((s: number, v: any) => s + Number(v.igstAmount || 0), 0)
  const totalGST = cgst + sgst + igst

  const listPath = VOUCHER_PATH[voucherType] || '/billing/sale'

  return (
    <div>
      <PageHeader title={title} breadcrumbs={[{ label: 'Reports' }, { label: title }]}
        actions={
          <div className="flex gap-2 items-center flex-wrap">
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <span className="text-muted-foreground text-sm">to</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer size={14} /></Button>
          </div>
        }
      />

      {vouchers.length > 0 && (
        <div className={cn('grid gap-3 mb-4', showGST ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2')}>
          <div className="stat-card"><span className="stat-label">Vouchers</span><span className="stat-value">{vouchers.length}</span></div>
          {showGST && <div className="stat-card"><span className="stat-label">Taxable Value</span><span className="stat-value font-mono">{formatINR(taxable)}</span></div>}
          {showGST && <div className="stat-card"><span className="stat-label">Total GST</span><span className="stat-value font-mono text-orange-600">{formatINR(totalGST)}</span></div>}
          <div className="stat-card"><span className="stat-label">Grand Total</span><span className="stat-value font-mono text-primary">{formatINR(total)}</span></div>
        </div>
      )}

      {isLoading ? <div className="flex justify-center py-12"><Spinner /></div> :
        vouchers.length === 0 ? <EmptyState title="No entries" description="No vouchers for selected period" /> :
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="erp-table">
            <thead>
              <tr>
                <th>#</th>
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
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {vouchers.map((v: any, i: number) => (
                <tr key={v.id}>
                  <td className="text-muted-foreground text-xs">{i + 1}</td>
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
                  <td className="px-2">
                    <Link to={`${listPath}/${v.voucherNumber}`} className="text-muted-foreground hover:text-primary">
                      <ExternalLink size={13} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted font-semibold">
                <td colSpan={showGST ? 5 : 4} className="px-3 py-2 text-sm">Total ({vouchers.length})</td>
                {showGST && <>
                  <td className="amount-col px-3 py-2">{formatINR(taxable)}</td>
                  <td className="amount-col px-3 py-2">{formatINR(cgst)}</td>
                  <td className="amount-col px-3 py-2">{formatINR(sgst)}</td>
                  <td className="amount-col px-3 py-2">{formatINR(igst)}</td>
                </>}
                <td className="amount-col px-3 py-2 text-primary">{formatINR(total)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      }
    </div>
  )
}

// ─── Cash Book ────────────────────────────────────────────────────────────────

export function CashBookPage() {
  const { activeFY } = useAuthStore()
  const { data: allLedgers = [] } = useLedgers()
  const [from, setFrom] = useState(activeFY ? parseFYDates(activeFY).from : dayjs().startOf('month').format('YYYY-MM-DD'))
  const [to, setTo] = useState(dayjs().format('YYYY-MM-DD'))
  const [ledgerId, setLedgerId] = useState('')

  const cashLedgers = (allLedgers as any[]).filter((l: any) => l.group?.name === 'Cash-in-Hand')
  const ledgerOptions = [
    { value: '', label: 'All Cash Accounts' },
    ...cashLedgers.map((l: any) => ({ value: l.id, label: l.name })),
  ]

  const { data, isLoading } = useQuery({
    queryKey: ['cash-book', ledgerId, from, to],
    queryFn: async () => {
      const { data } = await api.get('/accounting/cash-book', { params: { ledgerId: ledgerId || undefined, from, to } })
      return data.data
    },
    enabled: cashLedgers.length > 0 || !!ledgerId,
  })

  return (
    <BookDisplay
      title="Cash Book"
      subtitle="All cash receipts and payments"
      ledgerOptions={ledgerOptions}
      ledgerId={ledgerId}
      setLedgerId={setLedgerId}
      from={from} setFrom={setFrom}
      to={to} setTo={setTo}
      data={data}
      isLoading={isLoading}
      showCheque={false}
      drLabel="Receipts (Dr)"
      crLabel="Payments (Cr)"
    />
  )
}

// ─── Bank Book ────────────────────────────────────────────────────────────────

export function BankBookPage() {
  const { activeFY } = useAuthStore()
  const { data: allLedgers = [] } = useLedgers()
  const [from, setFrom] = useState(activeFY ? parseFYDates(activeFY).from : dayjs().startOf('month').format('YYYY-MM-DD'))
  const [to, setTo] = useState(dayjs().format('YYYY-MM-DD'))
  const [ledgerId, setLedgerId] = useState('')

  const bankLedgers = (allLedgers as any[]).filter((l: any) => l.group?.name === 'Bank Accounts')
  const ledgerOptions = [
    { value: '', label: 'All Bank Accounts' },
    ...bankLedgers.map((l: any) => ({ value: l.id, label: l.name })),
  ]

  const { data, isLoading } = useQuery({
    queryKey: ['bank-book', ledgerId, from, to],
    queryFn: async () => {
      const { data } = await api.get('/accounting/bank-book', { params: { ledgerId: ledgerId || undefined, from, to } })
      return data.data
    },
    enabled: bankLedgers.length > 0 || !!ledgerId,
  })

  return (
    <BookDisplay
      title="Bank Book"
      subtitle="All bank receipts and payments"
      ledgerOptions={ledgerOptions}
      ledgerId={ledgerId}
      setLedgerId={setLedgerId}
      from={from} setFrom={setFrom}
      to={to} setTo={setTo}
      data={data}
      isLoading={isLoading}
      showCheque={true}
      drLabel="Receipts (Dr)"
      crLabel="Payments (Cr)"
    />
  )
}

// ─── Shared Book Display ──────────────────────────────────────────────────────

function BookDisplay({
  title, subtitle, ledgerOptions, ledgerId, setLedgerId,
  from, setFrom, to, setTo, data, isLoading, showCheque, drLabel, crLabel
}: any) {
  // data could be single account or { accounts: [] }
  const accounts: any[] = data?.accounts || (data?.ledger ? [data] : [])

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle}
        breadcrumbs={[{ label: 'Reports' }, { label: title }]}
        actions={
          <div className="flex gap-2 items-center flex-wrap">
            <Select options={ledgerOptions} value={ledgerId} onChange={(e: any) => setLedgerId(e.target.value)} className="w-44" />
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <span className="text-muted-foreground text-sm">to</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer size={14} /></Button>
          </div>
        }
      />

      {isLoading ? <div className="flex justify-center py-12"><Spinner /></div> :
        accounts.length === 0 ? <EmptyState title="No data" description="No transactions found for selected period" /> :
        <div className="space-y-4">
          {accounts.map((account: any) => (
            <div key={account.ledger?.id} className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex justify-between items-center bg-muted/20">
                <div>
                  <p className="font-semibold">{account.ledger?.name}</p>
                  <p className="text-xs text-muted-foreground">{account.ledger?.groupName}</p>
                </div>
                <div className="text-right text-sm">
                  <div className="text-muted-foreground text-xs">
                    Opening: <span className={cn('font-mono', account.openingType === 'Dr' ? 'text-blue-700' : 'text-orange-700')}>
                      {formatINR(account.openingBalance)} {account.openingType}
                    </span>
                  </div>
                  <div className="font-medium">
                    Closing: <span className={cn('font-mono', account.closingType === 'Dr' ? 'text-blue-700' : 'text-orange-700')}>
                      {formatINR(account.closingBalance)} {account.closingType}
                    </span>
                  </div>
                </div>
              </div>

              {account.statement?.length === 0 ? (
                <p className="text-center py-6 text-sm text-muted-foreground">No transactions in this period</p>
              ) : (
                <table className="erp-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Voucher</th>
                      <th>Party / Account</th>
                      {showCheque && <th>Cheque No</th>}
                      <th>Narration</th>
                      <th className="text-right">{drLabel}</th>
                      <th className="text-right">{crLabel}</th>
                      <th className="text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-muted/30">
                      <td colSpan={showCheque ? 5 : 4} className="px-3 py-1.5 text-xs font-medium text-muted-foreground">Opening Balance</td>
                      <td /><td />
                      <td className="amount-col text-sm font-medium">
                        <span className={account.openingType === 'Dr' ? 'text-blue-700' : 'text-orange-700'}>
                          {formatINR(account.openingBalance)} {account.openingType}
                        </span>
                      </td>
                    </tr>
                    {(account.statement || []).map((row: any, i: number) => (
                      <tr key={i} className={cn(row.debit ? 'hover:bg-blue-50/30' : 'hover:bg-orange-50/30')}>
                        <td className="text-sm whitespace-nowrap">{formatDate(row.date)}</td>
                        <td>
                          <div className="font-mono text-xs">{row.voucherNumber}</div>
                          {row.voucherType && <Badge variant="secondary" className={cn('text-[9px]', VOUCHER_COLORS[row.voucherType])}>{row.voucherType}</Badge>}
                        </td>
                        <td className="text-xs text-muted-foreground truncate max-w-[120px]">{row.party || '—'}</td>
                        {showCheque && <td className="text-xs font-mono">{row.chequeNumber || '—'}</td>}
                        <td className="text-xs text-muted-foreground truncate max-w-[140px]">{row.narration || '—'}</td>
                        <td className="amount-col text-sm">{row.debit ? <span className="text-blue-700 font-medium">{formatINR(row.debit)}</span> : '—'}</td>
                        <td className="amount-col text-sm">{row.credit ? <span className="text-orange-700 font-medium">{formatINR(row.credit)}</span> : '—'}</td>
                        <td className="amount-col text-sm font-medium">
                          <span className={row.balanceType === 'Dr' ? 'text-blue-700' : 'text-orange-700'}>
                            {formatINR(row.balance)} {row.balanceType}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted font-semibold border-t-2 border-border">
                      <td colSpan={showCheque ? 5 : 4} className="px-3 py-2 text-sm">Totals</td>
                      <td className="amount-col px-3 py-2 text-blue-700">{formatINR(account.totalDebit)}</td>
                      <td className="amount-col px-3 py-2 text-orange-700">{formatINR(account.totalCredit)}</td>
                      <td className="amount-col px-3 py-2">
                        <span className={account.closingType === 'Dr' ? 'text-blue-700' : 'text-orange-700'}>
                          {formatINR(account.closingBalance)} {account.closingType}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          ))}
        </div>
      }
    </div>
  )
}
