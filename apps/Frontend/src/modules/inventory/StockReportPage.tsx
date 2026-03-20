import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatINR } from '../../lib/india'
import { Button, Badge, PageHeader, Spinner, Select, EmptyState, Input } from '../../components/ui'
import { Package, Download, Printer, TrendingDown } from 'lucide-react'
import { useGodowns, useItemCategories } from '../../hooks/api.hooks'

export default function StockReportPage() {
  const [categoryId, setCategoryId] = useState('')
  const [godownId, setGodownId] = useState('')
  const [search, setSearch] = useState('')
  const [showZero, setShowZero] = useState(false)

  const { data: categories = [] } = useItemCategories()
  const { data: godowns = [] } = useGodowns()

  const { data, isLoading } = useQuery({
    queryKey: ['stock-report', categoryId, godownId],
    queryFn: async () => {
      const params: any = {}
      if (godownId) params.godownId = godownId
      const { data } = await api.get('/inventory/stock', { params })
      return data.data
    },
  })

  const stockItems: any[] = data || []

  // Get item details for display
  const { data: itemsData } = useQuery({
    queryKey: ['items-for-stock'],
    queryFn: async () => {
      const { data } = await api.get('/masters/items', { params: { limit: 500, isActive: 'true' } })
      return data.data
    },
  })
  const itemsMap: Record<string, any> = {}
  if (itemsData) {
    for (const item of (itemsData as any[])) itemsMap[item.id] = item
  }

  // Merge stock with item info
  const merged = stockItems
    .map((s: any) => {
      const item = itemsMap[s.itemId] || {}
      return {
        ...s,
        itemName: item.name || s.itemId,
        unit: item.unit || 'PCS',
        hsnCode: item.hsnCode || '',
        categoryName: item.category?.name || '',
        reorderLevel: Number(item.reorderLevel || 0),
        saleRate: Number(item.saleRate || 0),
      }
    })
    .filter((s: any) => {
      if (!showZero && s.totalQty <= 0) return false
      if (search && !s.itemName.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })

  const totalValue = merged.reduce((sum: number, s: any) => sum + (s.totalValue || 0), 0)
  const saleValue = merged.reduce((sum: number, s: any) => sum + (s.totalQty * s.saleRate), 0)
  const lowStock = merged.filter((s: any) => s.reorderLevel > 0 && s.totalQty <= s.reorderLevel)

  const catOptions = [
    { value: '', label: 'All Categories' },
    ...(categories as any[]).map((c: any) => ({ value: c.id, label: c.name })),
  ]
  const godownOptions = [
    { value: '', label: 'All Godowns' },
    ...(godowns as any[]).map((g: any) => ({ value: g.id, label: g.name })),
  ]

  return (
    <div>
      <PageHeader title="Stock Report"
        subtitle="Current stock with FIFO valuation"
        breadcrumbs={[{ label: 'Inventory' }, { label: 'Stock Report' }]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer size={14} /> Print</Button>
            <Button variant="outline" size="sm"><Download size={14} /> Excel</Button>
          </div>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="stat-card">
          <span className="stat-label">Total Items</span>
          <span className="stat-value">{merged.length}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Stock Value (Cost)</span>
          <span className="stat-value text-base">{formatINR(totalValue)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Stock Value (MRP)</span>
          <span className="stat-value text-base text-success">{formatINR(saleValue)}</span>
        </div>
        <div className={`stat-card ${lowStock.length > 0 ? 'border-warning/40' : ''}`}>
          <span className="stat-label">Low Stock Alerts</span>
          <span className={`stat-value ${lowStock.length > 0 ? 'text-warning' : ''}`}>{lowStock.length}</span>
        </div>
      </div>

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <div className="mb-4 bg-warning-muted border border-warning/30 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-warning mb-2">
            <TrendingDown size={14} /> {lowStock.length} items below reorder level
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStock.map((s: any) => (
              <span key={s.itemId} className="text-xs bg-warning/10 text-warning px-2 py-0.5 rounded">
                {s.itemName} ({s.totalQty.toFixed(2)} {s.unit})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <input className="h-9 w-full rounded-md border border-input bg-background pl-3 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Search item..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select options={catOptions} value={categoryId} onChange={e => setCategoryId(e.target.value)} className="w-44" />
        <Select options={godownOptions} value={godownId} onChange={e => setGodownId(e.target.value)} className="w-44" />
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={showZero} onChange={e => setShowZero(e.target.checked)} className="w-4 h-4" />
          Show zero stock
        </label>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : merged.length === 0 ? (
          <EmptyState icon={<Package size={40} />} title="No stock data"
            description="Stock entries appear after posting purchase challans" />
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Item Name</th>
                <th>Category</th>
                <th>HSN</th>
                <th>Unit</th>
                <th className="text-right">Stock Qty</th>
                <th className="text-right">Avg Cost Rate</th>
                <th className="text-right">Stock Value (Cost)</th>
                <th className="text-right">Sale Rate</th>
                <th className="text-right">Sale Value</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {merged.map((s: any) => {
                const isLow = s.reorderLevel > 0 && s.totalQty <= s.reorderLevel
                const profitPct = s.saleRate > 0 && s.avgRate > 0
                  ? ((s.saleRate - s.avgRate) / s.saleRate * 100).toFixed(1)
                  : null
                return (
                  <tr key={`${s.itemId}-${s.variantId || 'main'}`}
                    className={isLow ? 'bg-warning-muted/30' : ''}>
                    <td>
                      <div className="font-medium text-sm">{s.itemName}</div>
                      {s.variantId && (
                        <div className="text-[10px] text-muted-foreground">Variant</div>
                      )}
                    </td>
                    <td className="text-xs text-muted-foreground">{s.categoryName || '—'}</td>
                    <td className="font-mono text-xs">{s.hsnCode || '—'}</td>
                    <td className="text-sm">{s.unit}</td>
                    <td className={`amount-col font-medium text-sm ${s.totalQty <= 0 ? 'text-destructive' : isLow ? 'text-warning' : ''}`}>
                      {Number(s.totalQty).toFixed(3)}
                    </td>
                    <td className="amount-col text-sm">{formatINR(s.avgRate, 4)}</td>
                    <td className="amount-col text-sm font-medium">{formatINR(s.totalValue)}</td>
                    <td className="amount-col text-sm">{s.saleRate > 0 ? formatINR(s.saleRate, 2) : '—'}</td>
                    <td className="amount-col text-sm">
                      {s.saleRate > 0 ? formatINR(s.totalQty * s.saleRate) : '—'}
                    </td>
                    <td>
                      {isLow ? (
                        <Badge variant="warning" className="text-[10px]">Low Stock</Badge>
                      ) : s.totalQty <= 0 ? (
                        <Badge variant="destructive" className="text-[10px]">Out of Stock</Badge>
                      ) : profitPct ? (
                        <Badge variant="success" className="text-[10px]">Margin {profitPct}%</Badge>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted font-semibold">
                <td colSpan={6} className="px-3 py-2.5 text-sm">Total ({merged.length} items)</td>
                <td className="amount-col px-3 py-2.5">{formatINR(totalValue)}</td>
                <td />
                <td className="amount-col px-3 py-2.5 text-success">{formatINR(saleValue)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
