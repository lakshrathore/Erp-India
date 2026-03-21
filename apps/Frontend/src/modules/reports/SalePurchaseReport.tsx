import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { formatINR, formatDate, parseFYDates } from '../../lib/india'
import { Button, Badge, PageHeader, Spinner, EmptyState } from '../../components/ui'
import { useParties } from '../../hooks/api.hooks'
import { useAuthStore } from '../../stores/auth.store'
import { Printer, TrendingUp, ShoppingCart, BarChart3, List, Users, ExternalLink } from 'lucide-react'
import dayjs from 'dayjs'
import { cn } from '../../components/ui/utils'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from 'recharts'

type GroupBy = 'invoice' | 'party' | 'month'

function SalePurchaseReportPage({ voucherType, title }: { voucherType: 'SALE' | 'PURCHASE'; title: string }) {
  const { activeFY } = useAuthStore()
  const fyDates = activeFY ? parseFYDates(activeFY) : null
  const [from, setFrom] = useState(fyDates?.from || dayjs().startOf('year').format('YYYY-MM-DD'))
  const [to, setTo] = useState(dayjs().format('YYYY-MM-DD'))
  const [partyId, setPartyId] = useState('')
  const [groupBy, setGroupBy] = useState<GroupBy>('invoice')

  const partyType = voucherType === 'SALE' ? 'CUSTOMER' : 'VENDOR'
  const isSale = voucherType === 'SALE'
  const color = isSale ? 'text-green-700' : 'text-blue-700'
  const bgColor = isSale ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'

  const { data: partiesData } = useParties({ type: partyType, limit: 500 })
  const parties = (partiesData as any)?.data || []
  const partyOptions = [
    { value: '', label: `All ${isSale ? 'Customers' : 'Vendors'}` },
    ...(parties as any[]).map((p: any) => ({ value: p.id, label: p.name })),
  ]

  const { data, isLoading } = useQuery({
    queryKey: [voucherType + '-report', from, to, partyId],
    queryFn: async () => {
      const params: any = { voucherType, from, to, limit: 1000, status: 'POSTED' }
      if (partyId) params.partyId = partyId
      const { data } = await api.get('/billing/vouchers', { params })
      return data
    },
  })

  const vouchers: any[] = data?.data || []

  // Totals
  const totals = useMemo(() => vouchers.reduce((s, v) => ({
    taxable: s.taxable + Number(v.taxableAmount || 0),
    cgst: s.cgst + Number(v.cgstAmount || 0),
    sgst: s.sgst + Number(v.sgstAmount || 0),
    igst: s.igst + Number(v.igstAmount || 0),
    cess: s.cess + Number(v.cessAmount || 0),
    discount: s.discount + Number(v.discountAmount || 0),
    total: s.total + Number(v.grandTotal || 0),
    count: s.count + 1,
  }), { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, discount: 0, total: 0, count: 0 }), [vouchers])

  // Party grouping
  const byParty = useMemo(() => {
    const map: Record<string, { id: string; name: string; count: number; taxable: number; gst: number; total: number }> = {}
    for (const v of vouchers) {
      const key = v.party?.id || 'unknown'
      if (!map[key]) map[key] = { id: key, name: v.party?.name || 'Unknown/Walk-in', count: 0, taxable: 0, gst: 0, total: 0 }
      map[key].count++
      map[key].taxable += Number(v.taxableAmount || 0)
      map[key].gst += Number(v.cgstAmount || 0) + Number(v.sgstAmount || 0) + Number(v.igstAmount || 0)
      map[key].total += Number(v.grandTotal || 0)
    }
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [vouchers])

  // Month grouping
  const byMonth = useMemo(() => {
    const map: Record<string, { month: string; count: number; taxable: number; total: number }> = {}
    for (const v of vouchers) {
      const key = dayjs(v.date).format('MMM YY')
      if (!map[key]) map[key] = { month: key, count: 0, taxable: 0, total: 0 }
      map[key].count++
      map[key].taxable += Number(v.taxableAmount || 0)
      map[key].total += Number(v.grandTotal || 0)
    }
    return Object.values(map)
  }, [vouchers])

  const chartData = byMonth.slice(-6).map(m => ({
    name: m.month,
    'Amount': Math.round(m.total / 1000),
  }))

  const listPath = isSale ? '/billing/sale' : '/billing/purchase'

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={`${vouchers.length} records · ${formatDate(from)} to ${formatDate(to)}`}
        breadcrumbs={[{ label: 'Reports' }, { label: title }]}
        actions={
          <div className="flex gap-2 items-center flex-wrap">
            <select
              value={partyId} onChange={e => setPartyId(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring w-52"
            >
              {partyOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <span className="text-muted-foreground text-sm">to</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer size={14} /></Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
            {[
              { label: 'Invoices', value: totals.count, mono: false },
              { label: 'Taxable Value', value: formatINR(totals.taxable), mono: true },
              { label: 'CGST', value: formatINR(totals.cgst), mono: true },
              { label: 'SGST', value: formatINR(totals.sgst), mono: true },
              { label: 'IGST', value: formatINR(totals.igst), mono: true },
              { label: 'Discount', value: formatINR(totals.discount), mono: true },
              { label: 'Grand Total', value: formatINR(totals.total), mono: true, highlight: true },
            ].map(s => (
              <div key={s.label} className={cn('stat-card', s.highlight && (isSale ? 'border-green-300 bg-green-50/50' : 'border-blue-300 bg-blue-50/50'))}>
                <span className="stat-label">{s.label}</span>
                <span className={cn('stat-value text-sm', s.highlight && color, s.mono && 'font-mono')}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-2 mb-4">
            <div className="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
              {([
                { key: 'invoice', icon: <List size={12} />, label: 'Invoices' },
                { key: 'party', icon: <Users size={12} />, label: isSale ? 'Customers' : 'Vendors' },
                { key: 'month', icon: <BarChart3 size={12} />, label: 'Month-wise' },
              ] as const).map(t => (
                <button key={t.key} onClick={() => setGroupBy(t.key)}
                  className={cn('px-3 py-2 flex items-center gap-1.5 transition-colors',
                    groupBy === t.key ? 'bg-primary text-white' : 'hover:bg-muted text-muted-foreground')}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Invoice view */}
          {groupBy === 'invoice' && (
            vouchers.length === 0 ? (
              <EmptyState title={`No ${title.toLowerCase()} found`} description="No records for selected period" />
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <table className="erp-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Voucher No</th>
                      <th>Date</th>
                      <th>{isSale ? 'Customer' : 'Vendor'}</th>
                      <th>Narration</th>
                      <th className="text-right">Taxable</th>
                      <th className="text-right">CGST</th>
                      <th className="text-right">SGST</th>
                      <th className="text-right">IGST</th>
                      <th className="text-right">Total</th>
                      <th>Status</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {vouchers.map((v: any, i: number) => (
                      <tr key={v.id}>
                        <td className="text-muted-foreground text-xs">{i + 1}</td>
                        <td className="font-mono text-xs font-medium">{v.voucherNumber}</td>
                        <td className="whitespace-nowrap text-sm">{formatDate(v.date)}</td>
                        <td className="text-sm truncate max-w-[140px]">{v.party?.name || '—'}</td>
                        <td className="text-xs text-muted-foreground truncate max-w-[100px]">{v.narration || '—'}</td>
                        <td className="amount-col text-sm">{formatINR(v.taxableAmount)}</td>
                        <td className="amount-col text-xs text-muted-foreground">{Number(v.cgstAmount) > 0 ? formatINR(v.cgstAmount) : '—'}</td>
                        <td className="amount-col text-xs text-muted-foreground">{Number(v.sgstAmount) > 0 ? formatINR(v.sgstAmount) : '—'}</td>
                        <td className="amount-col text-xs text-muted-foreground">{Number(v.igstAmount) > 0 ? formatINR(v.igstAmount) : '—'}</td>
                        <td className={cn('amount-col text-sm font-semibold', color)}>{formatINR(v.grandTotal)}</td>
                        <td>
                          <Badge variant={v.status === 'CANCELLED' ? 'destructive' : 'success'} className="text-[10px]">
                            {v.status}
                          </Badge>
                        </td>
                        <td className="px-2">
                          <Link to={`${listPath}/${v.voucherNumber}`} className="text-muted-foreground hover:text-primary">
                            <ExternalLink size={13} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted font-semibold border-t-2 border-border">
                      <td colSpan={5} className="px-3 py-2.5 text-sm">Total ({totals.count} invoices)</td>
                      <td className="amount-col px-3 py-2.5">{formatINR(totals.taxable)}</td>
                      <td className="amount-col px-3 py-2.5">{formatINR(totals.cgst)}</td>
                      <td className="amount-col px-3 py-2.5">{formatINR(totals.sgst)}</td>
                      <td className="amount-col px-3 py-2.5">{formatINR(totals.igst)}</td>
                      <td className={cn('amount-col px-3 py-2.5', color)}>{formatINR(totals.total)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          )}

          {/* Party view */}
          {groupBy === 'party' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border bg-muted/30 font-semibold text-sm">
                  {isSale ? 'Customer' : 'Vendor'}-wise Summary ({byParty.length})
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/10">
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">{isSale ? 'Customer' : 'Vendor'}</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Invoices</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Taxable</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byParty.map(p => (
                      <tr key={p.id} className="border-t border-border/30 hover:bg-muted/10">
                        <td className="px-4 py-2.5 font-medium">{p.name}</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">{p.count}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-sm">{formatINR(p.taxable)}</td>
                        <td className={cn('px-4 py-2.5 text-right font-mono font-semibold', color)}>{formatINR(p.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted font-bold">
                      <td className="px-4 py-2.5">Total</td>
                      <td className="px-4 py-2.5 text-right">{totals.count}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{formatINR(totals.taxable)}</td>
                      <td className={cn('px-4 py-2.5 text-right font-mono', color)}>{formatINR(totals.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Top parties bar chart */}
              {byParty.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="font-semibold text-sm mb-3">Top 10 {isSale ? 'Customers' : 'Vendors'}</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={byParty.slice(0, 10).reverse().map(p => ({
                      name: p.name.length > 15 ? p.name.substring(0, 15) + '…' : p.name,
                      Amount: Math.round(p.total / 1000),
                    }))} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                      <Tooltip formatter={(v: number) => [formatINR(v * 1000), 'Amount']}
                        contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Bar dataKey="Amount" fill={isSale ? 'hsl(142, 76%, 36%)' : 'hsl(222, 83%, 54%)'} radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Month view */}
          {groupBy === 'month' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border bg-muted/30 font-semibold text-sm">Month-wise Summary</div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/10">
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Month</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Count</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byMonth.map(m => (
                      <tr key={m.month} className="border-t border-border/30 hover:bg-muted/10">
                        <td className="px-4 py-2.5 font-medium">{m.month}</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">{m.count}</td>
                        <td className={cn('px-4 py-2.5 text-right font-mono font-semibold', color)}>{formatINR(m.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Trend chart */}
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="font-semibold text-sm mb-3">Monthly Trend (₹ thousands)</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={byMonth.map(m => ({ name: m.month, Amount: Math.round(m.total / 1000) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => [formatINR(v * 1000), title]}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Line type="monotone" dataKey="Amount"
                      stroke={isSale ? 'hsl(142, 76%, 36%)' : 'hsl(222, 83%, 54%)'}
                      strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function SaleReportPage() {
  return <SalePurchaseReportPage voucherType="SALE" title="Sale Report" />
}

export function PurchaseReportPage() {
  return <SalePurchaseReportPage voucherType="PURCHASE" title="Purchase Report" />
}
