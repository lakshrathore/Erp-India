import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { formatINR } from '../../lib/india'
import { Button, Badge, PageHeader, Spinner, EmptyState } from '../../components/ui'
import { useAuthStore } from '../../stores/auth.store'
import { Printer, ChevronDown, ChevronRight, TrendingUp, TrendingDown, Scale } from 'lucide-react'
import { cn } from '../../components/ui/utils'
import dayjs from 'dayjs'

// ─── FY Selector ──────────────────────────────────────────────────────────────

function FYInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text" value={value}
      onChange={e => onChange(e.target.value)}
      placeholder="25-26"
      className="h-9 w-24 rounded-md border border-input bg-background px-3 text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-ring"
    />
  )
}

// ─── Collapsible Group ────────────────────────────────────────────────────────

function LedgerGroup({
  groupName, ledgers, nature, showZero = false
}: {
  groupName: string
  ledgers: any[]
  nature: string
  showZero?: boolean
}) {
  const [open, setOpen] = useState(true)
  const groupTotal = ledgers.reduce((s, l) => s + (l.balance || 0), 0)
  if (groupTotal === 0 && !showZero) return null

  return (
    <div className="border-t border-border/40 first:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2 bg-muted/20 hover:bg-muted/40 transition-colors text-left"
      >
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {groupName}
        </span>
        <span className="font-mono text-sm font-semibold">{formatINR(groupTotal)}</span>
      </button>
      {open && ledgers.map((l: any) => (
        l.balance > 0 && (
          <div key={l.ledgerId} className="flex justify-between items-center px-8 py-1.5 border-t border-border/20 hover:bg-muted/10 text-sm">
            <span className="text-foreground">{l.ledgerName}</span>
            <span className="font-mono text-sm">{formatINR(l.balance)}</span>
          </div>
        )
      ))}
    </div>
  )
}

// ─── Balance Sheet ────────────────────────────────────────────────────────────

export function BalanceSheetPage() {
  const { activeFY } = useAuthStore()
  const [fy, setFY] = useState(activeFY || '25-26')

  const { data, isLoading } = useQuery({
    queryKey: ['balance-sheet', fy],
    queryFn: async () => {
      const { data } = await api.get('/accounting/balance-sheet', { params: { fy } })
      return data.data
    },
    enabled: fy.includes('-'),
  })

  const groupLedgers = (items: any[]) => {
    const map: Record<string, any[]> = {}
    for (const l of (items || [])) {
      const k = l.groupName || 'Other'
      if (!map[k]) map[k] = []
      map[k].push(l)
    }
    return Object.entries(map)
  }

  const totalsMatch = data ? Math.abs(data.totalAssets - (data.totalLiabilities + data.totalEquity)) < 1 : false

  return (
    <div>
      <PageHeader
        title="Balance Sheet"
        subtitle={`As on ${dayjs().format('DD-MMM-YYYY')} · FY ${fy}`}
        breadcrumbs={[{ label: 'Reports' }, { label: 'Balance Sheet' }]}
        actions={
          <div className="flex gap-2 items-center">
            <FYInput value={fy} onChange={setFY} />
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer size={14} /> Print</Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : !data ? (
        <EmptyState title="No data" description="No ledger data found for this financial year" />
      ) : (
        <>
          {/* Balance check banner */}
          <div className={cn(
            'mb-4 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium border',
            totalsMatch
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          )}>
            <Scale size={14} />
            {totalsMatch
              ? '✓ Balance Sheet is Balanced'
              : `✗ Difference: ${formatINR(Math.abs(data.totalAssets - (data.totalLiabilities + data.totalEquity)))}`
            }
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* LEFT: Liabilities + Capital */}
            <div className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1">Liabilities & Capital</h2>

              {/* Capital & Equity */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex justify-between items-center">
                  <span className="font-semibold text-blue-900 text-sm">Capital Account</span>
                  <span className="font-mono font-bold text-blue-900">{formatINR(data.totalEquity)}</span>
                </div>
                {groupLedgers(data.equity).map(([group, ledgers]) => (
                  <LedgerGroup key={group} groupName={group} ledgers={ledgers} nature="EQUITY" />
                ))}
              </div>

              {/* Liabilities */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-orange-50 border-b border-orange-100 flex justify-between items-center">
                  <span className="font-semibold text-orange-900 text-sm">Liabilities</span>
                  <span className="font-mono font-bold text-orange-900">{formatINR(data.totalLiabilities)}</span>
                </div>
                {groupLedgers(data.liabilities).map(([group, ledgers]) => (
                  <LedgerGroup key={group} groupName={group} ledgers={ledgers} nature="LIABILITY" />
                ))}
              </div>

              {/* Total */}
              <div className="bg-muted rounded-xl px-4 py-3 flex justify-between font-bold text-base border border-border">
                <span>Total Liabilities & Capital</span>
                <span className="font-mono">{formatINR(data.totalLiabilities + data.totalEquity)}</span>
              </div>
            </div>

            {/* RIGHT: Assets */}
            <div className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1">Assets</h2>

              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-green-50 border-b border-green-100 flex justify-between items-center">
                  <span className="font-semibold text-green-900 text-sm">Assets</span>
                  <span className="font-mono font-bold text-green-900">{formatINR(data.totalAssets)}</span>
                </div>
                {groupLedgers(data.assets).map(([group, ledgers]) => (
                  <LedgerGroup key={group} groupName={group} ledgers={ledgers} nature="ASSET" />
                ))}
              </div>

              <div className="bg-muted rounded-xl px-4 py-3 flex justify-between font-bold text-base border border-border">
                <span>Total Assets</span>
                <span className="font-mono">{formatINR(data.totalAssets)}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Profit & Loss ────────────────────────────────────────────────────────────

export function ProfitLossPage() {
  const { activeFY } = useAuthStore()
  const [fy, setFY] = useState(activeFY || '25-26')

  const { data, isLoading } = useQuery({
    queryKey: ['profit-loss', fy],
    queryFn: async () => {
      const { data } = await api.get('/accounting/profit-loss', { params: { fy } })
      return data.data
    },
    enabled: fy.includes('-'),
  })

  const groupItems = (items: any[] = []) => {
    const map: Record<string, any[]> = {}
    for (const item of items) {
      const k = item.groupName || 'Other'
      if (!map[k]) map[k] = []
      map[k].push(item)
    }
    return Object.entries(map)
  }

  return (
    <div>
      <PageHeader
        title="Profit & Loss Statement"
        subtitle={`For FY ${fy} · Generated ${dayjs().format('DD-MMM-YYYY')}`}
        breadcrumbs={[{ label: 'Reports' }, { label: 'P&L' }]}
        actions={
          <div className="flex gap-2 items-center">
            <FYInput value={fy} onChange={setFY} />
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer size={14} /> Print</Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : !data ? (
        <EmptyState title="No data" description="No income or expense data found" />
      ) : (
        <>
          {/* Net result banner */}
          <div className={cn(
            'mb-4 flex items-center justify-between gap-3 rounded-xl px-5 py-4 border',
            data.isProfitable
              ? 'bg-green-50 border-green-200'
              : 'bg-red-50 border-red-200'
          )}>
            <div className="flex items-center gap-2">
              {data.isProfitable
                ? <TrendingUp size={20} className="text-green-700" />
                : <TrendingDown size={20} className="text-red-700" />
              }
              <span className={cn('font-bold text-base', data.isProfitable ? 'text-green-800' : 'text-red-800')}>
                Net {data.isProfitable ? 'Profit' : 'Loss'}
              </span>
            </div>
            <span className={cn('font-mono font-bold text-2xl', data.isProfitable ? 'text-green-700' : 'text-red-700')}>
              {formatINR(Math.abs(data.netProfit))}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* LEFT: Income */}
            <div className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1">Income</h2>
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                {groupItems(data.incomes).map(([group, items]) => (
                  <div key={group} className="border-t border-border/40 first:border-0">
                    <div className="px-4 py-2 bg-muted/20">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{group}</span>
                    </div>
                    {items.map((item: any) => (
                      <div key={item.name} className="flex justify-between px-6 py-2 border-t border-border/20 text-sm hover:bg-muted/10">
                        <span>{item.name}</span>
                        <span className="font-mono text-green-700">{formatINR(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                ))}
                <div className="flex justify-between px-4 py-3 bg-green-50 border-t-2 border-green-200 font-bold text-sm">
                  <span className="text-green-900">Total Income</span>
                  <span className="font-mono text-green-800">{formatINR(data.totalIncome)}</span>
                </div>
              </div>
            </div>

            {/* RIGHT: Expenses */}
            <div className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1">Expenses</h2>
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                {groupItems(data.expenses).map(([group, items]) => (
                  <div key={group} className="border-t border-border/40 first:border-0">
                    <div className="px-4 py-2 bg-muted/20">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{group}</span>
                    </div>
                    {items.map((item: any) => (
                      <div key={item.name} className="flex justify-between px-6 py-2 border-t border-border/20 text-sm hover:bg-muted/10">
                        <span>{item.name}</span>
                        <span className="font-mono text-orange-700">{formatINR(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                ))}
                <div className="flex justify-between px-4 py-3 bg-orange-50 border-t-2 border-orange-200 font-bold text-sm">
                  <span className="text-orange-900">Total Expenses</span>
                  <span className="font-mono text-orange-800">{formatINR(data.totalExpense)}</span>
                </div>
                {/* Net shown in expenses column (Tally style) */}
                {!data.isProfitable && (
                  <div className="flex justify-between px-4 py-3 bg-red-50 border-t border-red-200 text-sm">
                    <span className="font-semibold text-red-800">Net Loss</span>
                    <span className="font-mono font-bold text-red-700">{formatINR(Math.abs(data.netProfit))}</span>
                  </div>
                )}
              </div>

              {/* Gross / Net Profit breakdown */}
              {data.isProfitable && (
                <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-green-800">Total Income</span>
                    <span className="font-mono text-green-800">{formatINR(data.totalIncome)}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-green-700">Less: Total Expenses</span>
                    <span className="font-mono text-green-700">({formatINR(data.totalExpense)})</span>
                  </div>
                  <div className="flex justify-between font-bold text-base border-t border-green-200 pt-2">
                    <span className="text-green-900">Net Profit</span>
                    <span className="font-mono text-green-800">{formatINR(data.netProfit)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Trial Balance ────────────────────────────────────────────────────────────

export function TrialBalancePage() {
  const { activeFY } = useAuthStore()
  const [fy, setFY] = useState(activeFY || '25-26')
  const [search, setSearch] = useState('')
  const [natureFilter, setNatureFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['trial-balance', fy],
    queryFn: async () => {
      const { data } = await api.get('/accounting/trial-balance', { params: { fy } })
      return data.data
    },
    enabled: fy.includes('-'),
  })

  const NATURE_COLORS: Record<string, string> = {
    ASSET: 'bg-green-100 text-green-700',
    LIABILITY: 'bg-orange-100 text-orange-700',
    EQUITY: 'bg-blue-100 text-blue-700',
    INCOME: 'bg-teal-100 text-teal-700',
    EXPENSE: 'bg-red-100 text-red-700',
  }

  const filtered = (data?.ledgers || []).filter((l: any) => {
    const matchSearch = !search || l.ledgerName.toLowerCase().includes(search.toLowerCase()) || l.groupName.toLowerCase().includes(search.toLowerCase())
    const matchNature = !natureFilter || l.nature === natureFilter
    return matchSearch && matchNature
  })

  return (
    <div>
      <PageHeader
        title="Trial Balance"
        subtitle={`FY ${fy} · All ledger closing balances`}
        breadcrumbs={[{ label: 'Reports' }, { label: 'Trial Balance' }]}
        actions={
          <div className="flex gap-2 items-center">
            <FYInput value={fy} onChange={setFY} />
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer size={14} /> Print</Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : !data ? null : (
        <>
          {/* Status + filters */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border',
              data.isBalanced ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
            )}>
              <Scale size={14} />
              {data.isBalanced ? '✓ Balanced' : `✗ Diff: ${formatINR(Math.abs(data.grandTotals.closingDebit - data.grandTotals.closingCredit))}`}
            </div>

            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search ledger..."
              className="h-8 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring w-48"
            />

            <div className="flex gap-1">
              {['', 'ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'].map(n => (
                <button key={n} onClick={() => setNatureFilter(n)}
                  className={cn('px-2 py-1 rounded text-xs font-medium border transition-colors',
                    natureFilter === n ? 'bg-primary text-white border-primary' : 'border-border text-muted-foreground hover:bg-muted')}>
                  {n || 'All'}
                </button>
              ))}
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Total Debit', value: data.grandTotals.closingDebit, color: 'text-blue-700' },
              { label: 'Total Credit', value: data.grandTotals.closingCredit, color: 'text-orange-700' },
              { label: 'Ledgers', value: data.ledgers.length },
              { label: 'Status', value: data.isBalanced ? 'Balanced ✓' : 'Unbalanced ✗' },
            ].map(c => (
              <div key={c.label} className="stat-card">
                <span className="stat-label">{c.label}</span>
                <span className={cn('stat-value', c.color || '')}>{typeof c.value === 'number' ? formatINR(c.value) : c.value}</span>
              </div>
            ))}
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Ledger Account</th>
                  <th>Group</th>
                  <th>Nature</th>
                  <th className="text-right">Opening Dr</th>
                  <th className="text-right">Opening Cr</th>
                  <th className="text-right">Txn Dr</th>
                  <th className="text-right">Txn Cr</th>
                  <th className="text-right text-blue-700">Closing Dr</th>
                  <th className="text-right text-orange-700">Closing Cr</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l: any, i: number) => (
                  <tr key={l.ledgerId} className="hover:bg-muted/10">
                    <td className="text-xs text-muted-foreground">{i + 1}</td>
                    <td className="font-medium text-sm">{l.ledgerName}</td>
                    <td className="text-xs text-muted-foreground">{l.groupName}</td>
                    <td>
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', NATURE_COLORS[l.nature] || 'bg-gray-100 text-gray-700')}>
                        {l.nature}
                      </span>
                    </td>
                    <td className="amount-col text-sm">{l.openingDebit > 0 ? formatINR(l.openingDebit) : '—'}</td>
                    <td className="amount-col text-sm">{l.openingCredit > 0 ? formatINR(l.openingCredit) : '—'}</td>
                    <td className="amount-col text-sm">{l.txnDebit > 0 ? formatINR(l.txnDebit) : '—'}</td>
                    <td className="amount-col text-sm">{l.txnCredit > 0 ? formatINR(l.txnCredit) : '—'}</td>
                    <td className="amount-col text-sm font-medium">
                      {l.closingDebit > 0 ? <span className="text-blue-700">{formatINR(l.closingDebit)}</span> : '—'}
                    </td>
                    <td className="amount-col text-sm font-medium">
                      {l.closingCredit > 0 ? <span className="text-orange-700">{formatINR(l.closingCredit)}</span> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted font-bold border-t-2 border-border">
                  <td colSpan={4} className="px-3 py-2.5 text-sm">Grand Total ({filtered.length} ledgers)</td>
                  <td className="amount-col px-3 py-2.5">{formatINR(filtered.reduce((s: number, l: any) => s + l.openingDebit, 0))}</td>
                  <td className="amount-col px-3 py-2.5">{formatINR(filtered.reduce((s: number, l: any) => s + l.openingCredit, 0))}</td>
                  <td className="amount-col px-3 py-2.5">{formatINR(filtered.reduce((s: number, l: any) => s + l.txnDebit, 0))}</td>
                  <td className="amount-col px-3 py-2.5">{formatINR(filtered.reduce((s: number, l: any) => s + l.txnCredit, 0))}</td>
                  <td className="amount-col px-3 py-2.5 text-blue-700">{formatINR(data.grandTotals.closingDebit)}</td>
                  <td className="amount-col px-3 py-2.5 text-orange-700">{formatINR(data.grandTotals.closingCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
