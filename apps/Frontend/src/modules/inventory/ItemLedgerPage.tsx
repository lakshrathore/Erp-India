import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatINR, formatDate , parseFYDates } from '../../lib/india'
import { Button, Badge, PageHeader, Spinner, Select, EmptyState } from '../../components/ui'
import { useItems } from '../../hooks/api.hooks'
import { BookOpen, Printer } from 'lucide-react'
import { useAuthStore } from '../../stores/auth.store'
import dayjs from 'dayjs'

export default function ItemLedgerPage() {
  const { activeFY } = useAuthStore()
  const [itemId, setItemId] = useState('')
  const [from, setFrom] = useState(activeFY ? parseFYDates(activeFY).from : dayjs().subtract(1, 'year').format('YYYY-MM-DD'))
  const [to, setTo] = useState(dayjs().format('YYYY-MM-DD'))

  const { data: itemsData } = useItems({ limit: 500, isActive: 'true' })
  const items = itemsData?.data || []
  const itemOptions = [
    { value: '', label: 'Select item...' },
    ...(items as any[]).map((i: any) => ({ value: i.id, label: `${i.name} (${i.unit})` })),
  ]

  const { data, isLoading } = useQuery({
    queryKey: ['item-ledger', itemId, from, to],
    queryFn: async () => {
      const { data } = await api.get(`/inventory/item-ledger/${itemId}`, { params: { from, to } })
      return data.data
    },
    enabled: !!itemId,
  })

  const movements: any[] = data || []
  const selectedItem = (items as any[]).find((i: any) => i.id === itemId)

  const totalIn = movements.filter(m => m.movementType === 'IN').reduce((s, m) => s + Number(m.qty), 0)
  const totalOut = movements.filter(m => m.movementType === 'OUT').reduce((s, m) => s + Number(m.qty), 0)
  const totalCOGS = movements.filter(m => m.movementType === 'OUT').reduce((s, m) => s + Number(m.value), 0)
  const closingQty = movements.length > 0 ? movements[movements.length - 1].runningQty : 0

  return (
    <div>
      <PageHeader title="Item Ledger (FIFO)"
        subtitle="Stock movement history with FIFO cost tracking"
        breadcrumbs={[{ label: 'Inventory' }, { label: 'Item Ledger' }]}
        actions={itemId && (
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer size={14} /> Print</Button>
        )}
      />

      <div className="flex gap-3 mb-4 items-end flex-wrap">
        <Select options={itemOptions} value={itemId} onChange={e => setItemId(e.target.value)} className="w-72" />
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        <span className="text-muted-foreground text-sm">to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>

      {!itemId ? (
        <EmptyState icon={<BookOpen size={40} />} title="Select an item"
          description="Choose an item to view its FIFO movement ledger" />
      ) : isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="stat-card">
              <span className="stat-label">Total Inward</span>
              <span className="stat-value text-success">{totalIn.toFixed(3)} {selectedItem?.unit}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Total Outward</span>
              <span className="stat-value text-destructive">{totalOut.toFixed(3)} {selectedItem?.unit}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Closing Stock</span>
              <span className={`stat-value ${closingQty < 0 ? 'text-destructive' : ''}`}>
                {closingQty.toFixed(3)} {selectedItem?.unit}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">COGS (FIFO)</span>
              <span className="stat-value text-base">{formatINR(totalCOGS)}</span>
            </div>
          </div>

          {/* Ledger */}
          {movements.length === 0 ? (
            <EmptyState title="No movements" description="No stock movements for this item in selected period" />
          ) : (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Voucher</th>
                    <th>Party</th>
                    <th>Type</th>
                    <th>Godown</th>
                    <th className="text-right">Inward Qty</th>
                    <th className="text-right">Outward Qty</th>
                    <th className="text-right">Rate (FIFO)</th>
                    <th className="text-right">Value</th>
                    <th className="text-right">Balance Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m: any, i: number) => (
                    <tr key={i} className={m.movementType === 'OUT' ? 'bg-destructive/5' : ''}>
                      <td className="text-sm whitespace-nowrap">{formatDate(m.date)}</td>
                      <td>
                        <div className="font-mono text-xs">{m.voucher?.voucherNumber || '—'}</div>
                        {m.voucher?.voucherType && (
                          <Badge variant="secondary" className="text-[9px]">{m.voucher.voucherType}</Badge>
                        )}
                      </td>
                      <td className="text-xs text-muted-foreground truncate max-w-[120px]">
                        {m.voucher?.party?.name || '—'}
                      </td>
                      <td>
                        <Badge variant={m.movementType === 'IN' ? 'success' : 'destructive'} className="text-[10px]">
                          {m.movementType}
                        </Badge>
                      </td>
                      <td className="text-xs text-muted-foreground">{m.godown?.name || 'Main'}</td>
                      <td className="amount-col text-sm">
                        {m.movementType === 'IN' ? (
                          <span className="text-success font-medium">{Number(m.qty).toFixed(3)}</span>
                        ) : '—'}
                      </td>
                      <td className="amount-col text-sm">
                        {m.movementType === 'OUT' ? (
                          <span className="text-destructive font-medium">{Number(m.qty).toFixed(3)}</span>
                        ) : '—'}
                      </td>
                      <td className="amount-col text-sm font-mono">{formatINR(m.rate, 4)}</td>
                      <td className="amount-col text-sm">{formatINR(m.value)}</td>
                      <td className="amount-col text-sm font-medium">
                        <span className={m.runningQty < 0 ? 'text-destructive' : ''}>
                          {Number(m.runningQty).toFixed(3)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted font-semibold">
                    <td colSpan={5} className="px-3 py-2">Total</td>
                    <td className="amount-col px-3 py-2 text-success">{totalIn.toFixed(3)}</td>
                    <td className="amount-col px-3 py-2 text-destructive">{totalOut.toFixed(3)}</td>
                    <td />
                    <td className="amount-col px-3 py-2">{formatINR(totalCOGS)}</td>
                    <td className="amount-col px-3 py-2">{closingQty.toFixed(3)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
