/**
 * StatementPages.tsx
 * Party Statement — CA ledger format with running balance
 * Ledger Statement — full journal detail with configurable columns
 * Outstanding — aging analysis
 */

import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { formatINR, formatDate, parseFYDates } from '../../lib/india'
import { Button, Badge, PageHeader, Spinner, Select, EmptyState } from '../../components/ui'
import { useParties, useLedgers } from '../../hooks/api.hooks'
import { useAuthStore } from '../../stores/auth.store'
import dayjs from 'dayjs'
import { Printer, Download, ExternalLink, Settings2, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '../../components/ui/utils'

// ─── Voucher type badge colors ────────────────────────────────────────────────
const VBadge = ({ type }: { type: string }) => {
  const colors: Record<string, string> = {
    SALE: 'bg-green-100 text-green-700', PURCHASE: 'bg-blue-100 text-blue-700',
    RECEIPT: 'bg-teal-100 text-teal-700', PAYMENT: 'bg-orange-100 text-orange-700',
    CREDIT_NOTE: 'bg-red-100 text-red-700', DEBIT_NOTE: 'bg-yellow-100 text-yellow-700',
    CONTRA: 'bg-purple-100 text-purple-700', JOURNAL: 'bg-gray-100 text-gray-700',
  }
  const short: Record<string, string> = {
    SALE: 'Sale', PURCHASE: 'Purch', RECEIPT: 'Rcpt', PAYMENT: 'Pymt',
    CREDIT_NOTE: 'CrN', DEBIT_NOTE: 'DbN', CONTRA: 'Contra', JOURNAL: 'JV',
    SALE_CHALLAN: 'SC', PURCHASE_ORDER: 'PO',
  }
  return <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-medium', colors[type] || 'bg-gray-100 text-gray-600')}>{short[type] || type}</span>
}

// ─── Print styles injected into head ─────────────────────────────────────────
const PRINT_STYLES = `
@media print {
  body * { visibility: hidden; }
  .print-area, .print-area * { visibility: visible; }
  .print-area { position: absolute; left: 0; top: 0; width: 100%; }
  .no-print { display: none !important; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ccc; padding: 4px 8px; font-size: 11px; }
  thead { background: #f5f5f5; }
}
`

function injectPrintStyles() {
  if (!document.getElementById('stmt-print-styles')) {
    const s = document.createElement('style')
    s.id = 'stmt-print-styles'
    s.innerHTML = PRINT_STYLES
    document.head.appendChild(s)
  }
}

// ─── Party Statement (CA Format) ─────────────────────────────────────────────

export function PartyStatementPage() {
  const { activeFY } = useAuthStore()
  const fyDates = activeFY ? parseFYDates(activeFY) : null
  const [partyId, setPartyId] = useState('')
  const [from, setFrom] = useState(fyDates?.from || dayjs().startOf('year').format('YYYY-MM-DD'))
  const [to, setTo] = useState(dayjs().format('YYYY-MM-DD'))
  const [showConfig, setShowConfig] = useState(false)
  const [config, setConfig] = useState({
    showVoucherType: true,
    showNarration: true,
    showRunningBalance: true,
    showRefNumber: false,
  })
  const printRef = useRef<HTMLDivElement>(null)

  const { data: partiesData } = useParties({ limit: 500 })
  const parties = partiesData?.data || []
  const partyOptions = [
    { value: '', label: 'Select party...' },
    ...(parties as any[]).map((p: any) => ({ value: p.id, label: p.name })),
  ]

  const { data, isLoading } = useQuery({
    queryKey: ['party-statement', partyId, from, to],
    queryFn: async () => {
      const { data } = await api.get('/accounting/party-statement', { params: { partyId, from, to } })
      return data.data
    },
    enabled: !!partyId,
  })

  const handlePrint = () => {
    injectPrintStyles()
    window.print()
  }

  const selectedParty = (parties as any[]).find((p: any) => p.id === partyId)

  return (
    <div>
      <PageHeader title="Party Statement" subtitle="Account statement in CA ledger format"
        breadcrumbs={[{ label: 'Accounting' }, { label: 'Party Statement' }]}
        actions={
          <div className="flex gap-2 no-print">
            {data && <Button variant="outline" size="sm" onClick={handlePrint}><Printer size={14} /> Print</Button>}
            <Button variant="ghost" size="sm" onClick={() => setShowConfig(s => !s)}>
              <Settings2 size={14} /> Config {showConfig ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap no-print">
        <Select options={partyOptions} value={partyId} onChange={e => setPartyId(e.target.value)} className="w-64" />
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        <span className="text-muted-foreground text-sm">to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>

      {/* Config panel */}
      {showConfig && (
        <div className="mb-4 p-3 bg-muted/30 rounded-lg border border-border flex flex-wrap gap-4 no-print">
          {Object.entries(config).map(([key, val]) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={val} onChange={e => setConfig(c => ({ ...c, [key]: e.target.checked }))}
                className="rounded" />
              {key.replace(/([A-Z])/g, ' $1').replace('show ', '').trim()}
            </label>
          ))}
        </div>
      )}

      {!partyId ? (
        <EmptyState title="Select a party" description="Choose a party to view their account statement" />
      ) : isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : data ? (
        <div ref={printRef} className="print-area">
          {/* Header */}
          <div className="bg-card border border-border rounded-t-lg px-5 py-4 flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold">{data.party.name}</h2>
              {data.party.gstin && <p className="text-xs text-muted-foreground font-mono">GSTIN: {data.party.gstin}</p>}
              <p className="text-xs text-muted-foreground mt-0.5">
                Statement from <strong>{formatDate(from)}</strong> to <strong>{formatDate(to)}</strong>
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Opening Balance</div>
              <div className={cn('font-mono font-semibold text-base', data.openingType === 'Dr' ? 'text-blue-700' : 'text-orange-700')}>
                {formatINR(data.openingBalance)} {data.openingType}
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="border border-t-0 border-border rounded-b-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Date</th>
                  {config.showVoucherType && <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground">Type</th>}
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Voucher No.</th>
                  {config.showNarration && <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Particulars</th>}
                  <th className="px-3 py-2 text-right text-xs font-semibold text-blue-700">Debit (₹)</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-orange-700">Credit (₹)</th>
                  {config.showRunningBalance && <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Balance</th>}
                </tr>
              </thead>
              <tbody>
                {/* Opening row */}
                <tr className="bg-muted/20 border-b border-border/40">
                  <td className="px-3 py-2 text-xs text-muted-foreground">{formatDate(from)}</td>
                  {config.showVoucherType && <td className="px-2 py-2"></td>}
                  <td className="px-3 py-2 text-xs font-medium text-muted-foreground">Opening Balance</td>
                  {config.showNarration && <td className="px-3 py-2"></td>}
                  <td className="px-3 py-2 text-right text-xs"></td>
                  <td className="px-3 py-2 text-right text-xs"></td>
                  {config.showRunningBalance && (
                    <td className="px-3 py-2 text-right text-xs font-medium">
                      <span className={data.openingType === 'Dr' ? 'text-blue-700' : 'text-orange-700'}>
                        {formatINR(data.openingBalance)} {data.openingType}
                      </span>
                    </td>
                  )}
                </tr>

                {data.statement.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">No transactions in this period</td></tr>
                ) : data.statement.map((row: any, i: number) => (
                  <tr key={i} className={cn('border-b border-border/30 hover:bg-muted/10', i % 2 === 0 ? '' : 'bg-muted/5')}>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{formatDate(row.date)}</td>
                    {config.showVoucherType && <td className="px-2 py-2"><VBadge type={row.voucherType} /></td>}
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs">{row.voucherNumber}</span>
                    </td>
                    {config.showNarration && (
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-[200px] truncate">
                        {row.narration || '—'}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right text-sm">
                      {row.debit ? <span className="font-mono text-blue-700">{formatINR(row.debit)}</span> : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-sm">
                      {row.credit ? <span className="font-mono text-orange-700">{formatINR(row.credit)}</span> : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    {config.showRunningBalance && (
                      <td className="px-3 py-2 text-right text-sm font-medium">
                        <span className={row.balanceType === 'Dr' ? 'text-blue-700' : 'text-orange-700'}>
                          {formatINR(row.balance)} {row.balanceType}
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted border-t-2 border-border font-semibold">
                  <td colSpan={config.showVoucherType ? 2 : 1} className="px-3 py-2.5 text-sm">Closing Balance</td>
                  <td className="px-3 py-2.5"></td>
                  {config.showNarration && <td></td>}
                  <td className="px-3 py-2.5 text-right font-mono text-blue-700">{formatINR(data.totalDebit)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-orange-700">{formatINR(data.totalCredit)}</td>
                  {config.showRunningBalance && (
                    <td className="px-3 py-2.5 text-right">
                      <span className={cn('font-mono text-base', data.closingType === 'Dr' ? 'text-blue-700' : 'text-orange-700')}>
                        {formatINR(data.closingBalance)} {data.closingType}
                      </span>
                    </td>
                  )}
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Summary footer */}
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground px-1">
            <span>{data.statement.length} transaction(s) in period</span>
            <span>Printed on {dayjs().format('DD-MM-YYYY HH:mm')}</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ─── Ledger Statement (CA Format) ────────────────────────────────────────────

export function LedgerStatementPage() {
  const { activeFY } = useAuthStore()
  const fyDates = activeFY ? parseFYDates(activeFY) : null
  const [ledgerId, setLedgerId] = useState('')
  const [from, setFrom] = useState(fyDates?.from || dayjs().startOf('year').format('YYYY-MM-DD'))
  const [to, setTo] = useState(dayjs().format('YYYY-MM-DD'))
  const [showConfig, setShowConfig] = useState(false)
  const [config, setConfig] = useState({
    showParty: true,
    showVoucherType: true,
    showNarration: true,
    showRunningBalance: true,
    groupByMonth: false,
  })

  const { data: ledgers = [] } = useLedgers()
  const ledgerOptions = [
    { value: '', label: 'Select ledger...' },
    ...(ledgers as any[]).map((l: any) => ({ value: l.id, label: l.name })),
  ]

  const { data, isLoading } = useQuery({
    queryKey: ['ledger-statement', ledgerId, from, to],
    queryFn: async () => {
      const { data } = await api.get('/accounting/ledger-statement', { params: { ledgerId, from, to } })
      return data.data
    },
    enabled: !!ledgerId,
  })

  // Group by month if enabled
  const groupedStatement = (() => {
    if (!data || !config.groupByMonth) return null
    const groups: Record<string, any[]> = {}
    for (const row of data.statement) {
      const month = dayjs(row.date).format('MMM YYYY')
      if (!groups[month]) groups[month] = []
      groups[month].push(row)
    }
    return groups
  })()

  const renderRows = (rows: any[]) => rows.map((row: any, i: number) => (
    <tr key={i} className={cn('border-b border-border/30 hover:bg-muted/10', i % 2 === 0 ? '' : 'bg-muted/5')}>
      <td className="px-3 py-1.5 text-xs whitespace-nowrap">{formatDate(row.date)}</td>
      {config.showVoucherType && <td className="px-2 py-1.5"><VBadge type={row.voucherType} /></td>}
      <td className="px-3 py-1.5 font-mono text-xs">{row.voucherNumber}</td>
      {config.showParty && <td className="px-3 py-1.5 text-xs text-muted-foreground truncate max-w-[120px]">{row.party || '—'}</td>}
      {config.showNarration && <td className="px-3 py-1.5 text-xs text-muted-foreground truncate max-w-[160px]">{row.narration || '—'}</td>}
      <td className="px-3 py-1.5 text-right text-sm">
        {row.debit ? <span className="font-mono text-blue-700">{formatINR(row.debit)}</span> : <span className="text-muted-foreground text-xs">—</span>}
      </td>
      <td className="px-3 py-1.5 text-right text-sm">
        {row.credit ? <span className="font-mono text-orange-700">{formatINR(row.credit)}</span> : <span className="text-muted-foreground text-xs">—</span>}
      </td>
      {config.showRunningBalance && (
        <td className="px-3 py-1.5 text-right text-sm font-medium">
          <span className={row.balanceType === 'Dr' ? 'text-blue-700' : 'text-orange-700'}>
            {formatINR(row.balance)} {row.balanceType}
          </span>
        </td>
      )}
    </tr>
  ))

  const colCount = 3 + (config.showVoucherType ? 1 : 0) + (config.showParty ? 1 : 0) + (config.showNarration ? 1 : 0) + (config.showRunningBalance ? 1 : 0)

  return (
    <div>
      <PageHeader title="Ledger Statement" subtitle="Detailed ledger account in CA format"
        breadcrumbs={[{ label: 'Accounting' }, { label: 'Ledger Statement' }]}
        actions={
          <div className="flex gap-2 no-print">
            {data && <Button variant="outline" size="sm" onClick={() => { injectPrintStyles(); window.print() }}><Printer size={14} /> Print</Button>}
            <Button variant="ghost" size="sm" onClick={() => setShowConfig(s => !s)}>
              <Settings2 size={14} /> Config
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-3 mb-4 flex-wrap no-print">
        <Select options={ledgerOptions} value={ledgerId} onChange={e => setLedgerId(e.target.value)} className="w-64" />
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        <span className="text-muted-foreground text-sm">to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>

      {showConfig && (
        <div className="mb-4 p-3 bg-muted/30 rounded-lg border border-border flex flex-wrap gap-4 no-print">
          {Object.entries(config).map(([key, val]) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={val as boolean}
                onChange={e => setConfig(c => ({ ...c, [key]: e.target.checked }))} className="rounded" />
              {key.replace(/([A-Z])/g, ' $1').replace('show ', '').trim()}
            </label>
          ))}
        </div>
      )}

      {!ledgerId ? (
        <EmptyState title="Select a ledger" description="Choose a ledger to view its statement" />
      ) : isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : data ? (
        <div className="print-area">
          {/* Ledger header */}
          <div className="bg-card border border-border rounded-t-lg px-5 py-4 flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold">{data.ledger.name}</h2>
              <p className="text-xs text-muted-foreground">{data.ledger.groupName} · {data.ledger.nature}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatDate(from)} to {formatDate(to)}
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Opening Balance</div>
              <div className={cn('font-mono font-semibold', data.openingType === 'Dr' ? 'text-blue-700' : 'text-orange-700')}>
                {formatINR(data.openingBalance)} {data.openingType}
              </div>
            </div>
          </div>

          <div className="border border-t-0 border-border rounded-b-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Date</th>
                  {config.showVoucherType && <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground">Type</th>}
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Voucher No.</th>
                  {config.showParty && <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Party</th>}
                  {config.showNarration && <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Narration</th>}
                  <th className="px-3 py-2 text-right text-xs font-semibold text-blue-700">Debit (₹)</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-orange-700">Credit (₹)</th>
                  {config.showRunningBalance && <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Balance</th>}
                </tr>
              </thead>
              <tbody>
                <tr className="bg-muted/20 border-b border-border/40">
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{formatDate(from)}</td>
                  {config.showVoucherType && <td />}
                  <td className="px-3 py-1.5 text-xs font-medium text-muted-foreground" colSpan={1 + (config.showParty ? 1 : 0) + (config.showNarration ? 1 : 0)}>
                    Opening Balance
                  </td>
                  <td /><td />
                  {config.showRunningBalance && (
                    <td className="px-3 py-1.5 text-right text-xs font-medium">
                      <span className={data.openingType === 'Dr' ? 'text-blue-700' : 'text-orange-700'}>
                        {formatINR(data.openingBalance)} {data.openingType}
                      </span>
                    </td>
                  )}
                </tr>

                {!groupedStatement ? (
                  data.statement.length === 0 ? (
                    <tr><td colSpan={colCount} className="px-3 py-8 text-center text-sm text-muted-foreground">No transactions in period</td></tr>
                  ) : renderRows(data.statement)
                ) : (
                  Object.entries(groupedStatement).map(([month, rows]: [string, any]) => (
                    <>
                      <tr key={`month-${month}`} className="bg-blue-50/50">
                        <td colSpan={colCount} className="px-3 py-1.5 text-xs font-semibold text-blue-800">— {month} —</td>
                      </tr>
                      {renderRows(rows)}
                      <tr className="bg-muted/30 border-t border-border/50">
                        <td colSpan={colCount - 2} className="px-3 py-1.5 text-xs text-muted-foreground text-right pr-3">Month Total</td>
                        <td className="px-3 py-1.5 text-right text-xs font-mono text-blue-700">
                          {formatINR(rows.reduce((s: number, r: any) => s + (r.debit || 0), 0))}
                        </td>
                        <td className="px-3 py-1.5 text-right text-xs font-mono text-orange-700">
                          {formatINR(rows.reduce((s: number, r: any) => s + (r.credit || 0), 0))}
                        </td>
                        {config.showRunningBalance && <td />}
                      </tr>
                    </>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="bg-muted border-t-2 border-border font-semibold">
                  <td colSpan={colCount - 3} className="px-3 py-2.5 text-sm">Closing Balance</td>
                  <td className="px-3 py-2.5 text-right font-mono text-blue-700">{formatINR(data.totalDebit)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-orange-700">{formatINR(data.totalCredit)}</td>
                  {config.showRunningBalance && (
                    <td className="px-3 py-2.5 text-right">
                      <span className={cn('font-mono text-base', data.closingType === 'Dr' ? 'text-blue-700' : 'text-orange-700')}>
                        {formatINR(data.closingBalance)} {data.closingType}
                      </span>
                    </td>
                  )}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ─── Outstanding / Aging Report ───────────────────────────────────────────────

const AGING_BUCKETS = [
  { label: 'Current (0–30)', min: 0, max: 30, color: 'text-green-700 bg-green-50' },
  { label: '31–60 days', min: 31, max: 60, color: 'text-yellow-700 bg-yellow-50' },
  { label: '61–90 days', min: 61, max: 90, color: 'text-orange-700 bg-orange-50' },
  { label: '90+ days', min: 91, max: Infinity, color: 'text-red-700 bg-red-50' },
]

export function OutstandingPage() {
  const [type, setType] = useState<'receivable' | 'payable'>('receivable')
  const [partyId, setPartyId] = useState('')

  const { data: partiesData } = useParties({
    type: type === 'receivable' ? 'CUSTOMER' : 'VENDOR', limit: 500,
  })
  const parties = (partiesData as any)?.data || []
  const partyOptions = [
    { value: '', label: `All ${type === 'receivable' ? 'Customers' : 'Vendors'}` },
    ...(parties as any[]).map((p: any) => ({ value: p.id, label: p.name })),
  ]

  const { data, isLoading } = useQuery({
    queryKey: ['outstanding', type, partyId],
    queryFn: async () => {
      const { data } = await api.get('/billing/outstanding', {
        params: { type, partyId: partyId || undefined },
      })
      return data.data
    },
  })

  const vouchers: any[] = data?.vouchers || []
  const today = new Date()

  const withAging = vouchers.map(v => {
    const days = Math.floor((today.getTime() - new Date(v.date).getTime()) / 86400000)
    const creditDays = Number(v.creditDays || 0)
    const overdueDays = Math.max(0, days - creditDays)
    const bucket = AGING_BUCKETS.find(b => overdueDays >= b.min && overdueDays <= b.max) || AGING_BUCKETS[3]
    return { ...v, daysElapsed: days, overdueDays, bucket }
  })

  const bucketSummary = AGING_BUCKETS.map(b => ({
    ...b,
    count: withAging.filter(v => v.bucket.label === b.label).length,
    amount: withAging.filter(v => v.bucket.label === b.label).reduce((s, v) => s + Number(v.balanceDue), 0),
  }))

  // Group by party
  const byParty: Record<string, { name: string; vouchers: any[]; total: number }> = {}
  for (const v of withAging) {
    const pid = v.party?.id || 'unknown'
    if (!byParty[pid]) byParty[pid] = { name: v.party?.name || 'Unknown', vouchers: [], total: 0 }
    byParty[pid].vouchers.push(v)
    byParty[pid].total += Number(v.balanceDue)
  }

  return (
    <div>
      <PageHeader title="Outstanding Report" subtitle="Aging analysis of receivables & payables"
        breadcrumbs={[{ label: 'Reports' }, { label: 'Outstanding' }]}
        actions={<Button variant="outline" size="sm" onClick={() => window.print()}><Printer size={14} /></Button>}
      />

      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="flex gap-2">
          <Button variant={type === 'receivable' ? 'default' : 'outline'} size="sm"
            onClick={() => { setType('receivable'); setPartyId('') }}>
            📥 Receivable (Customers)
          </Button>
          <Button variant={type === 'payable' ? 'default' : 'outline'} size="sm"
            onClick={() => { setType('payable'); setPartyId('') }}>
            📤 Payable (Vendors)
          </Button>
        </div>
        <Select options={partyOptions} value={partyId} onChange={e => setPartyId(e.target.value)} className="w-56" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : (
        <>
          {/* Aging buckets summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {bucketSummary.map(b => (
              <div key={b.label} className={cn('rounded-lg border p-3', b.color.includes('green') ? 'border-green-200' : b.color.includes('yellow') ? 'border-yellow-200' : b.color.includes('orange') ? 'border-orange-200' : 'border-red-200')}>
                <p className="text-xs font-medium text-muted-foreground">{b.label}</p>
                <p className={cn('font-mono font-bold text-lg mt-1', b.color.split(' ')[0])}>{formatINR(b.amount)}</p>
                <p className="text-xs text-muted-foreground">{b.count} invoice{b.count !== 1 ? 's' : ''}</p>
              </div>
            ))}
          </div>

          {/* Total */}
          {data?.totalOutstanding > 0 && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
              <span className="text-sm font-medium">Total {type === 'receivable' ? 'Receivable' : 'Payable'}</span>
              <span className={cn('font-mono font-bold text-xl', type === 'receivable' ? 'text-blue-700' : 'text-orange-700')}>
                {formatINR(data.totalOutstanding)}
              </span>
            </div>
          )}

          {/* Table */}
          {vouchers.length === 0 ? (
            <EmptyState title="No outstanding" description={`No ${type} invoices pending`} />
          ) : (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Voucher No</th>
                    <th>Date</th>
                    <th>Party</th>
                    <th className="text-right">Invoice</th>
                    <th className="text-right">Balance Due</th>
                    <th>Credit Days</th>
                    <th>Overdue By</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(byParty).map((group: any) => (
                    <>
                      {(partyId === '' && Object.keys(byParty).length > 1) && (
                        <tr key={`header-${group.name}`} className="bg-muted/30">
                          <td colSpan={7} className="px-3 py-1.5 text-xs font-semibold">{group.name}</td>
                          <td className="px-3 py-1.5 text-right text-xs font-mono font-semibold">{formatINR(group.total)}</td>
                        </tr>
                      )}
                      {group.vouchers.map((v: any) => (
                        <tr key={v.id}>
                          <td className="font-mono text-xs">{v.voucherNumber}</td>
                          <td className="text-sm whitespace-nowrap">{formatDate(v.date)}</td>
                          <td className="text-sm">{v.party?.name || '—'}</td>
                          <td className="amount-col text-sm">{formatINR(v.grandTotal)}</td>
                          <td className="amount-col text-sm font-medium">
                            <span className={type === 'receivable' ? 'text-blue-700' : 'text-orange-700'}>
                              {formatINR(v.balanceDue)}
                            </span>
                          </td>
                          <td className="text-sm text-center">{v.creditDays || 0}d</td>
                          <td className="text-sm text-center">
                            <span className={v.overdueDays > 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                              {v.overdueDays > 0 ? `+${v.overdueDays}d` : `${v.daysElapsed}d`}
                            </span>
                          </td>
                          <td>
                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', v.bucket.color)}>
                              {v.overdueDays > 0 ? 'Overdue' : 'Current'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
