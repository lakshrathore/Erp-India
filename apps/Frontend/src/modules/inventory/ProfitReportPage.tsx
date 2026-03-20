import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatINR , parseFYDates } from '../../lib/india'
import { Button, PageHeader, Spinner, EmptyState } from '../../components/ui'
import { TrendingUp, Printer, Download } from 'lucide-react'
import { useAuthStore } from '../../stores/auth.store'
import dayjs from 'dayjs'

export default function InventoryProfitPage() {
  const { activeFY } = useAuthStore()
  const [from, setFrom] = useState(activeFY ? parseFYDates(activeFY).from : dayjs().subtract(1, 'year').format('YYYY-MM-DD'))
  const [to, setTo] = useState(dayjs().format('YYYY-MM-DD'))

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-profit', from, to],
    queryFn: async () => {
      const { data } = await api.get('/inventory/profit', { params: { from, to } })
      return data.data
    },
  })

  const items: any[] = data || []
  const totals = items.reduce((s, i) => ({
    saleValue: s.saleValue + i.saleValue,
    cogs: s.cogs + i.cogs,
    grossProfit: s.grossProfit + i.grossProfit,
  }), { saleValue: 0, cogs: 0, grossProfit: 0 })
  const overallMargin = totals.saleValue > 0 ? (totals.grossProfit / totals.saleValue * 100).toFixed(1) : '0'

  return (
    <div>
      <PageHeader title="Inventory Profit Report"
        subtitle="Item-wise gross profit using FIFO costing"
        breadcrumbs={[{ label: 'Inventory' }, { label: 'Profit Report' }]}
        actions={
          <div className="flex gap-2 items-end">
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
      {items.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="stat-card"><span className="stat-label">Sale Value</span><span className="stat-value text-base">{formatINR(totals.saleValue)}</span></div>
          <div className="stat-card"><span className="stat-label">COGS (FIFO)</span><span className="stat-value text-base text-destructive">{formatINR(totals.cogs)}</span></div>
          <div className="stat-card"><span className="stat-label">Gross Profit</span><span className="stat-value text-base text-success">{formatINR(totals.grossProfit)}</span></div>
          <div className="stat-card border-success/30"><span className="stat-label">Gross Margin</span><span className="stat-value text-success">{overallMargin}%</span></div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={<TrendingUp size={40} />} title="No profit data"
          description="Post sale invoices and purchase challans to see profit analysis" />
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="erp-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Item Name</th>
                <th className="text-right">Sale Qty</th>
                <th className="text-right">Sale Value</th>
                <th className="text-right">COGS (FIFO)</th>
                <th className="text-right">Gross Profit</th>
                <th className="text-right">Margin %</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any, i: number) => (
                <tr key={item.itemId}>
                  <td className="text-muted-foreground text-xs">{i + 1}</td>
                  <td className="font-medium text-sm">{item.itemName}</td>
                  <td className="amount-col text-sm">{Number(item.saleQty).toFixed(3)}</td>
                  <td className="amount-col text-sm">{formatINR(item.saleValue)}</td>
                  <td className="amount-col text-sm text-muted-foreground">{formatINR(item.cogs)}</td>
                  <td className="amount-col text-sm">
                    <span className={item.grossProfit >= 0 ? 'text-success font-medium' : 'text-destructive font-medium'}>
                      {formatINR(item.grossProfit)}
                    </span>
                  </td>
                  <td className="amount-col text-sm">
                    <span className={item.grossMarginPct >= 20 ? 'text-success' : item.grossMarginPct >= 10 ? 'text-warning' : 'text-destructive'}>
                      {Number(item.grossMarginPct).toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted font-semibold">
                <td colSpan={3} className="px-3 py-2 text-sm">Total</td>
                <td className="amount-col px-3 py-2">{formatINR(totals.saleValue)}</td>
                <td className="amount-col px-3 py-2 text-muted-foreground">{formatINR(totals.cogs)}</td>
                <td className="amount-col px-3 py-2 text-success">{formatINR(totals.grossProfit)}</td>
                <td className="amount-col px-3 py-2 text-success">{overallMargin}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
