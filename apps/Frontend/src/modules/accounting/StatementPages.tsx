import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatINR, formatDate } from '../../lib/india'
import { Button, Badge, PageHeader, Spinner, Select, EmptyState } from '../../components/ui'
import { useParties, useLedgers } from '../../hooks/api.hooks'
import { useAuthStore } from '../../stores/auth.store'
import dayjs from 'dayjs'
import { Download, Printer, Search } from 'lucide-react'

// ─── Party Statement ──────────────────────────────────────────────────────────

export function PartyStatementPage() {
  const { activeFY } = useAuthStore()
  const [partyId, setPartyId] = useState('')
  const [from, setFrom] = useState(activeFY ? `20${activeFY.split('-')[0]}-04-01` : dayjs().subtract(1, 'year').format('YYYY-MM-DD'))
  const [to, setTo] = useState(dayjs().format('YYYY-MM-DD'))

  const { data: parties = [] } = useParties({ limit: 500 })
  const partyOptions = [
    { value: '', label: 'Select party...' },
    ...(parties as any).data?.map((p: any) => ({ value: p.id, label: p.name })) || [],
  ]

  const { data, isLoading } = useQuery({
    queryKey: ['party-statement', partyId, from, to],
    queryFn: async () => {
      const { data } = await api.get('/accounting/party-statement', { params: { partyId, from, to } })
      return data.data
    },
    enabled: !!partyId,
  })

  return (
    <div>
      <PageHeader title="Party Statement" breadcrumbs={[{ label: 'Accounting' }, { label: 'Party Statement' }]}
        actions={partyId && data && (
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer size={14} /> Print
          </Button>
        )} />

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Select options={partyOptions} value={partyId} onChange={e => setPartyId(e.target.value)} className="w-64" />
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        <span className="text-muted-foreground text-sm">to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>

      {!partyId ? (
        <EmptyState title="Select a party" description="Choose a party from the dropdown to view their account statement" />
      ) : isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : data ? (
        <div>
          {/* Party info + opening */}
          <div className="bg-card border border-border rounded-lg p-4 mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-foreground">{data.party.name}</h2>
              {data.party.gstin && <p className="text-xs text-muted-foreground font-mono">{data.party.gstin}</p>}
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Opening Balance</p>
              <p className={`font-mono font-medium ${data.openingType === 'Dr' ? 'amount-debit' : 'amount-credit'}`}>
                {formatINR(data.openingBalance)} {data.openingType}
              </p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Voucher Type</th>
                  <th>Voucher No</th>
                  <th>Narration</th>
                  <th className="text-right">Debit</th>
                  <th className="text-right">Credit</th>
                  <th className="text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-muted/30">
                  <td colSpan={4} className="text-xs font-medium text-muted-foreground">Opening Balance</td>
                  <td />
                  <td />
                  <td className="amount-col font-medium">
                    <span className={data.openingType === 'Dr' ? 'amount-debit' : 'amount-credit'}>
                      {formatINR(data.openingBalance)} {data.openingType}
                    </span>
                  </td>
                </tr>
                {data.statement.map((row: any, i: number) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap">{formatDate(row.date)}</td>
                    <td><Badge variant="secondary" className="text-[10px]">{row.voucherType}</Badge></td>
                    <td className="font-mono text-xs">{row.voucherNumber}</td>
                    <td className="text-xs text-muted-foreground max-w-[180px] truncate">{row.narration || '—'}</td>
                    <td className="amount-col text-sm">{row.debit ? <span className="amount-debit">{formatINR(row.debit)}</span> : '—'}</td>
                    <td className="amount-col text-sm">{row.credit ? <span className="amount-credit">{formatINR(row.credit)}</span> : '—'}</td>
                    <td className="amount-col text-sm font-medium">
                      <span className={row.balanceType === 'Dr' ? 'amount-debit' : 'amount-credit'}>
                        {formatINR(row.balance)} {row.balanceType}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted font-semibold">
                  <td colSpan={4} className="px-3 py-2 text-sm">Closing Balance</td>
                  <td className="amount-col">{formatINR(data.totalDebit)}</td>
                  <td className="amount-col">{formatINR(data.totalCredit)}</td>
                  <td className="amount-col">
                    <span className={data.closingType === 'Dr' ? 'amount-debit' : 'amount-credit'}>
                      {formatINR(data.closingBalance)} {data.closingType}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ─── Ledger Statement ─────────────────────────────────────────────────────────

export function LedgerStatementPage() {
  const { activeFY } = useAuthStore()
  const [ledgerId, setLedgerId] = useState('')
  const [from, setFrom] = useState(activeFY ? `20${activeFY.split('-')[0]}-04-01` : dayjs().subtract(1, 'year').format('YYYY-MM-DD'))
  const [to, setTo] = useState(dayjs().format('YYYY-MM-DD'))

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

  return (
    <div>
      <PageHeader title="Ledger Statement" breadcrumbs={[{ label: 'Accounting' }, { label: 'Ledger Statement' }]} />

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Select options={ledgerOptions} value={ledgerId} onChange={e => setLedgerId(e.target.value)} className="w-64" />
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        <span className="text-muted-foreground text-sm">to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>

      {!ledgerId ? (
        <EmptyState title="Select a ledger" description="Choose a ledger to view its statement" />
      ) : isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : data ? (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="font-semibold">{data.ledger.name}</h3>
              <p className="text-xs text-muted-foreground">{data.ledger.groupName} · {data.ledger.nature}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Opening: <span className={data.openingType === 'Dr' ? 'amount-debit font-mono' : 'amount-credit font-mono'}>{formatINR(data.openingBalance)} {data.openingType}</span></p>
            </div>
          </div>
          <table className="erp-table">
            <thead>
              <tr>
                <th>Date</th><th>Voucher</th><th>Party</th><th>Narration</th>
                <th className="text-right">Debit</th><th className="text-right">Credit</th><th className="text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.statement.map((row: any, i: number) => (
                <tr key={i}>
                  <td className="whitespace-nowrap text-sm">{formatDate(row.date)}</td>
                  <td><div className="font-mono text-xs">{row.voucherNumber}</div><Badge variant="secondary" className="text-[9px]">{row.voucherType}</Badge></td>
                  <td className="text-xs text-muted-foreground truncate max-w-[120px]">{row.party || '—'}</td>
                  <td className="text-xs text-muted-foreground truncate max-w-[160px]">{row.narration || '—'}</td>
                  <td className="amount-col">{row.debit ? <span className="amount-debit text-sm">{formatINR(row.debit)}</span> : '—'}</td>
                  <td className="amount-col">{row.credit ? <span className="amount-credit text-sm">{formatINR(row.credit)}</span> : '—'}</td>
                  <td className="amount-col text-sm font-medium">
                    <span className={row.balanceType === 'Dr' ? 'amount-debit' : 'amount-credit'}>
                      {formatINR(row.balance)} {row.balanceType}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted font-semibold">
                <td colSpan={4} className="px-3 py-2">Closing Balance</td>
                <td className="amount-col px-3 py-2">{formatINR(data.totalDebit)}</td>
                <td className="amount-col px-3 py-2">{formatINR(data.totalCredit)}</td>
                <td className="amount-col px-3 py-2">
                  <span className={data.closingType === 'Dr' ? 'amount-debit' : 'amount-credit'}>
                    {formatINR(data.closingBalance)} {data.closingType}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </div>
  )
}

// ─── Outstanding Report ───────────────────────────────────────────────────────

export function OutstandingPage() {
  const [type, setType] = useState<'receivable' | 'payable'>('receivable')
  const { data, isLoading } = useQuery({
    queryKey: ['outstanding', type],
    queryFn: async () => {
      const { data } = await api.get('/billing/outstanding', { params: { type } })
      return data.data
    },
  })

  const vouchers: any[] = data?.vouchers || []
  const today = dayjs()

  return (
    <div>
      <PageHeader title="Outstanding Report"
        subtitle="Bill-wise pending payments"
        breadcrumbs={[{ label: 'Reports' }, { label: 'Outstanding' }]} />

      <div className="flex gap-2 mb-4">
        <Button variant={type === 'receivable' ? 'default' : 'outline'} size="sm" onClick={() => setType('receivable')}>
          Receivable (from customers)
        </Button>
        <Button variant={type === 'payable' ? 'default' : 'outline'} size="sm" onClick={() => setType('payable')}>
          Payable (to vendors)
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : (
        <>
          {data?.totalOutstanding > 0 && (
            <div className="bg-card border border-border rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Outstanding</span>
              <span className={`font-mono font-bold text-lg ${type === 'receivable' ? 'amount-debit' : 'amount-credit'}`}>
                {formatINR(data.totalOutstanding)}
              </span>
            </div>
          )}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Voucher No</th><th>Date</th><th>Party</th>
                  <th className="text-right">Invoice Amt</th>
                  <th className="text-right">Balance Due</th>
                  <th>Days</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {vouchers.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No outstanding entries</td></tr>
                ) : vouchers.map((v: any) => (
                  <tr key={v.id}>
                    <td className="font-mono text-xs">{v.voucherNumber}</td>
                    <td className="text-sm whitespace-nowrap">{formatDate(v.date)}</td>
                    <td className="text-sm">{v.party?.name || '—'}</td>
                    <td className="amount-col text-sm">{formatINR(v.grandTotal)}</td>
                    <td className="amount-col text-sm font-medium">
                      <span className={type === 'receivable' ? 'amount-debit' : 'amount-credit'}>
                        {formatINR(v.balanceDue)}
                      </span>
                    </td>
                    <td>
                      <span className={`text-xs font-medium ${v.daysElapsed > 30 ? 'text-destructive' : v.daysElapsed > 15 ? 'text-warning' : 'text-muted-foreground'}`}>
                        {v.daysElapsed}d
                      </span>
                    </td>
                    <td>
                      <Badge variant={v.daysElapsed > 30 ? 'destructive' : v.daysElapsed > 15 ? 'warning' : 'success'} className="text-[10px]">
                        {v.daysElapsed > 30 ? 'Overdue' : v.daysElapsed > 15 ? 'Due Soon' : 'Current'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
