import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatINR } from '../../lib/india'
import { Button, Badge, PageHeader, Spinner, Select, EmptyState } from '../../components/ui'
import { useAuthStore } from '../../stores/auth.store'
import { Printer, Download } from 'lucide-react'

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
    enabled: !!JSON.parse(localStorage.getItem('erp-auth') || '{}')?.state?.activeCompany?.companyId,
  })

  const groupBy = (arr: any[], key: string) =>
    arr.reduce((acc, item) => {
      const k = item[key] || 'Other'
      if (!acc[k]) acc[k] = []
      acc[k].push(item)
      return acc
    }, {} as Record<string, any[]>)

  return (
    <div>
      <PageHeader title="Balance Sheet"
        breadcrumbs={[{ label: 'Reports' }, { label: 'Balance Sheet' }]}
        actions={
          <div className="flex gap-2">
            <input type="text" value={fy} onChange={e => setFY(e.target.value)} placeholder="25-26"
              className="h-9 w-20 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer size={14} /> Print</Button>
          </div>
        }
      />

      {isLoading ? <div className="flex justify-center py-12"><Spinner /></div> : data ? (
        <div className="grid grid-cols-2 gap-4">
          {/* Liabilities + Equity */}
          <div className="space-y-4">
            <h2 className="font-display font-semibold text-sm uppercase tracking-wide text-muted-foreground">Liabilities & Capital</h2>
            <BSSection title="Capital & Reserves" items={data.equity} nature="EQUITY" />
            <BSSection title="Liabilities" items={data.liabilities} nature="LIABILITY" />
            <div className="bg-muted rounded-lg px-4 py-3 flex justify-between font-semibold">
              <span>Total</span>
              <span className="font-mono">{formatINR(data.totalLiabilities + data.totalEquity)}</span>
            </div>
          </div>
          {/* Assets */}
          <div className="space-y-4">
            <h2 className="font-display font-semibold text-sm uppercase tracking-wide text-muted-foreground">Assets</h2>
            <BSSection title="Assets" items={data.assets} nature="ASSET" />
            <div className="bg-muted rounded-lg px-4 py-3 flex justify-between font-semibold">
              <span>Total</span>
              <span className="font-mono">{formatINR(data.totalAssets)}</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function BSSection({ title, items, nature }: { title: string; items: any[]; nature: string }) {
  if (!items || items.length === 0) return null
  // Group by groupName
  const grouped = items.reduce((acc: any, item: any) => {
    const k = item.groupName || 'Other'
    if (!acc[k]) acc[k] = []
    acc[k].push(item)
    return acc
  }, {})

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="bg-muted/50 px-4 py-2 font-medium text-sm">{title}</div>
      {Object.entries(grouped).map(([group, ledgers]: [string, any]) => (
        <div key={group}>
          <div className="px-4 py-1.5 bg-muted/20 text-xs font-medium text-muted-foreground">{group}</div>
          {ledgers.map((l: any) => (
            <div key={l.ledgerId} className="flex justify-between px-6 py-1.5 text-sm border-t border-border/30">
              <span className="text-foreground">{l.ledgerName}</span>
              <span className={`font-mono text-sm ${l.balanceType === 'Dr' && nature === 'ASSET' ? 'text-foreground' : nature === 'LIABILITY' || nature === 'EQUITY' ? 'text-foreground' : 'amount-debit'}`}>
                {formatINR(l.balance)}
              </span>
            </div>
          ))}
        </div>
      ))}
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
    enabled: !!JSON.parse(localStorage.getItem('erp-auth') || '{}')?.state?.activeCompany?.companyId,
  })

  return (
    <div>
      <PageHeader title="Profit & Loss Statement"
        breadcrumbs={[{ label: 'Reports' }, { label: 'P&L' }]}
        actions={
          <div className="flex gap-2">
            <input type="text" value={fy} onChange={e => setFY(e.target.value)} placeholder="25-26"
              className="h-9 w-20 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer size={14} /> Print</Button>
          </div>
        }
      />

      {isLoading ? <div className="flex justify-center py-12"><Spinner /></div> : data ? (
        <div className="grid grid-cols-2 gap-4">
          {/* Expenses */}
          <div>
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">Expenses</h2>
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              {groupPLItems(data.expenses).map(([group, items]: [string, any[]]) => (
                <div key={group}>
                  <div className="px-4 py-1.5 bg-muted/30 text-xs font-medium text-muted-foreground">{group}</div>
                  {items.map((e: any) => (
                    <div key={e.name} className="flex justify-between px-5 py-1.5 text-sm border-t border-border/30">
                      <span>{e.name}</span>
                      <span className="font-mono">{formatINR(e.amount)}</span>
                    </div>
                  ))}
                </div>
              ))}
              <div className="flex justify-between px-4 py-2.5 bg-muted font-semibold text-sm border-t border-border">
                <span>Total Expenses</span>
                <span className="font-mono">{formatINR(data.totalExpense)}</span>
              </div>
              {data.isProfitable && (
                <div className="flex justify-between px-4 py-2.5 bg-success-muted text-success text-sm border-t border-border font-medium">
                  <span>Net Profit</span>
                  <span className="font-mono">{formatINR(data.netProfit)}</span>
                </div>
              )}
            </div>
          </div>
          {/* Income */}
          <div>
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">Income</h2>
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              {groupPLItems(data.incomes).map(([group, items]: [string, any[]]) => (
                <div key={group}>
                  <div className="px-4 py-1.5 bg-muted/30 text-xs font-medium text-muted-foreground">{group}</div>
                  {items.map((e: any) => (
                    <div key={e.name} className="flex justify-between px-5 py-1.5 text-sm border-t border-border/30">
                      <span>{e.name}</span>
                      <span className="font-mono amount-credit">{formatINR(e.amount)}</span>
                    </div>
                  ))}
                </div>
              ))}
              <div className="flex justify-between px-4 py-2.5 bg-muted font-semibold text-sm border-t border-border">
                <span>Total Income</span>
                <span className="font-mono">{formatINR(data.totalIncome)}</span>
              </div>
              {!data.isProfitable && (
                <div className="flex justify-between px-4 py-2.5 bg-destructive/10 text-destructive text-sm border-t border-border font-medium">
                  <span>Net Loss</span>
                  <span className="font-mono">{formatINR(Math.abs(data.netProfit))}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function groupPLItems(items: any[] = []) {
  const map: Record<string, any[]> = {}
  for (const item of items) {
    const k = item.groupName || 'Other'
    if (!map[k]) map[k] = []
    map[k].push(item)
  }
  return Object.entries(map)
}

// ─── Trial Balance ────────────────────────────────────────────────────────────

export function TrialBalancePage() {
  const { activeFY } = useAuthStore()
  const [fy, setFY] = useState(activeFY || '25-26')

  const { data, isLoading } = useQuery({
    queryKey: ['trial-balance', fy],
    queryFn: async () => {
      const { data } = await api.get('/accounting/trial-balance', { params: { fy } })
      return data.data
    },
    enabled: !!JSON.parse(localStorage.getItem('erp-auth') || '{}')?.state?.activeCompany?.companyId,
  })

  return (
    <div>
      <PageHeader title="Trial Balance"
        breadcrumbs={[{ label: 'Reports' }, { label: 'Trial Balance' }]}
        actions={
          <div className="flex gap-2">
            <input type="text" value={fy} onChange={e => setFY(e.target.value)} placeholder="25-26"
              className="h-9 w-20 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer size={14} /> Print</Button>
          </div>
        }
      />

      {isLoading ? <div className="flex justify-center py-12"><Spinner /></div> : data ? (
        <>
          <div className={`mb-4 flex items-center gap-2 rounded-md px-4 py-2.5 text-sm border ${data.isBalanced ? 'bg-success-muted border-success/30 text-success' : 'bg-destructive/10 border-destructive/30 text-destructive'}`}>
            {data.isBalanced ? '✓ Trial Balance is balanced' : `✗ Difference: ${formatINR(Math.abs(data.grandTotals.closingDebit - data.grandTotals.closingCredit))}`}
          </div>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Ledger Account</th>
                  <th>Group</th>
                  <th>Nature</th>
                  <th className="text-right">Debit (₹)</th>
                  <th className="text-right">Credit (₹)</th>
                </tr>
              </thead>
              <tbody>
                {data.ledgers.map((l: any) => (
                  <tr key={l.ledgerId}>
                    <td className="text-sm font-medium">{l.ledgerName}</td>
                    <td className="text-xs text-muted-foreground">{l.groupName}</td>
                    <td>
                      <Badge variant="secondary" className="text-[10px]">{l.nature}</Badge>
                    </td>
                    <td className="amount-col text-sm">
                      {l.closingDebit > 0 ? <span className="amount-debit">{formatINR(l.closingDebit)}</span> : '—'}
                    </td>
                    <td className="amount-col text-sm">
                      {l.closingCredit > 0 ? <span className="amount-credit">{formatINR(l.closingCredit)}</span> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted font-bold">
                  <td colSpan={3} className="px-3 py-2.5">Grand Total</td>
                  <td className="amount-col px-3 py-2.5 amount-debit">{formatINR(data.grandTotals.closingDebit)}</td>
                  <td className="amount-col px-3 py-2.5 amount-credit">{formatINR(data.grandTotals.closingCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      ) : null}
    </div>
  )
}
