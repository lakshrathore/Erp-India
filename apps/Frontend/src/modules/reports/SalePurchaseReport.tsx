import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatINR, formatDate , parseFYDates } from '../../lib/india'
import { Button, Badge, PageHeader, Spinner, Select, EmptyState } from '../../components/ui'
import { useParties } from '../../hooks/api.hooks'
import { useAuthStore } from '../../stores/auth.store'
import { Printer, Download, TrendingUp, ShoppingCart } from 'lucide-react'
import dayjs from 'dayjs'

interface ReportPageProps {
  voucherType: 'SALE' | 'PURCHASE'
  title: string
  icon: React.ReactNode
}

function SalePurchaseReport({ voucherType, title, icon }: ReportPageProps) {
  const { activeFY } = useAuthStore()
  const [from, setFrom] = useState(activeFY ? parseFYDates(activeFY).from : dayjs().subtract(1, 'year').format('YYYY-MM-DD'))
  const [to, setTo] = useState(dayjs().format('YYYY-MM-DD'))
  const [partyId, setPartyId] = useState('')
  const [groupBy, setGroupBy] = useState<'invoice' | 'party' | 'month'>('invoice')

  const partyType = voucherType === 'SALE' ? 'CUSTOMER' : 'VENDOR'
  const { data: partiesData } = useParties({ type: partyType, limit: 500 })
  const parties = partiesData?.data || []
  const partyOptions = [
    { value: '', label: `All ${partyType === 'CUSTOMER' ? 'Customers' : 'Vendors'}` },
    ...(parties as any[]).map((p: any) => ({ value: p.id, label: p.name })),
  ]

  const { data, isLoading } = useQuery({
    queryKey: [voucherType + '-report', from, to, partyId],
    queryFn: async () => {
      const params: any = { voucherType, from, to, limit: 500, status: 'POSTED' }
      if (partyId) params.partyId = partyId
      const { data } = await api.get('/billing/vouchers', { params })
      return data
    },
    enabled: !!JSON.parse(localStorage.getItem('erp-auth') || '{}')?.state?.activeCompany?.companyId,
  })

  const vouchers: any[] = data?.data || []

  // Aggregations
  const totals = vouchers.reduce((s, v) => ({
    taxable: s.taxable + Number(v.taxableAmount || 0),
    cgst: s.cgst + Number(v.cgstAmount || 0),
    sgst: s.sgst + Number(v.sgstAmount || 0),
    igst: s.igst + Number(v.igstAmount || 0),
    total: s.total + Number(v.grandTotal || 0),
  }), { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 })

  // Group by party
  const byParty: Record<string, { name: string; count: number; total: number }> = {}
  for (const v of vouchers) {
    const key = v.party?.id || 'unknown'
    if (!byParty[key]) byParty[key] = { name: v.party?.name || 'Unknown', count: 0, total: 0 }
    byParty[key].count++
    byParty[key].total += Number(v.grandTotal || 0)
  }
  const topParties = Object.values(byParty).sort((a, b) => b.total - a.total).slice(0, 5)

  // Group by month
  const byMonth: Record<string, { month: string; count: number; total: number }> = {}
  for (const v of vouchers) {
    const key = dayjs(v.date).format('MMM YYYY')
    if (!byMonth[key]) byMonth[key] = { month: key, count: 0, total: 0 }
    byMonth[key].count++
    byMonth[key].total += Number(v.grandTotal || 0)
  }

  return (
    <div>
      <PageHeader title={title}
        breadcrumbs={[{ label: 'Reports' }, { label: title }]}
        actions={
          <div className="flex gap-2 items-end flex-wrap">
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <span className="text-muted-foreground text-sm">to</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <Select options={partyOptions} value={partyId} onChange={e => setPartyId(e.target.value)} className="w-52" />
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer size={14} /></Button>
          </div>
        }
      />

      {/* Summary cards */}
      {vouchers.length > 0 && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
          {[
            { label: 'Vouchers', value: vouchers.length },
            { label: 'Taxable', value: formatINR(totals.taxable) },
            { label: 'CGST', value: formatINR(totals.cgst) },
            { label: 'SGST', value: formatINR(totals.sgst) },
            { label: 'IGST', value: formatINR(totals.igst) },
            { label: 'Grand Total', value: formatINR(totals.total), highlight: true },
          ].map(s => (
            <div key={s.label} className={`stat-card ${s.highlight ? 'border-primary/30' : ''}`}>
              <span className="stat-label">{s.label}</span>
              <span className={`stat-value text-sm ${s.highlight ? 'text-primary' : ''}`}>{s.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Group By tabs */}
      <div className="flex gap-1 border-b border-border mb-4">
        {[
          { key: 'invoice', label: 'Invoice-wise' },
          { key: 'party', label: 'Party-wise' },
          { key: 'month', label: 'Month-wise' },
        ].map(t => (
          <button key={t.key} onClick={() => setGroupBy(t.key as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${groupBy === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : vouchers.length === 0 ? (
        <EmptyState icon={icon} title={`No ${title.toLowerCase()}`} description="No posted vouchers for selected period" />
      ) : groupBy === 'invoice' ? (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Voucher No</th><th>Date</th><th>Party</th>
                <th className="text-right">Taxable</th><th className="text-right">CGST</th>
                <th className="text-right">SGST</th><th className="text-right">IGST</th>
                <th className="text-right">Total</th><th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {vouchers.map((v: any) => (
                <tr key={v.id}>
                  <td className="font-mono text-xs">{v.voucherNumber}</td>
                  <td className="text-sm whitespace-nowrap">{formatDate(v.date)}</td>
                  <td className="text-sm truncate max-w-[160px]">{v.party?.name || '—'}</td>
                  <td className="amount-col text-sm">{formatINR(v.taxableAmount)}</td>
                  <td className="amount-col text-xs text-muted-foreground">{Number(v.cgstAmount) > 0 ? formatINR(v.cgstAmount) : '—'}</td>
                  <td className="amount-col text-xs text-muted-foreground">{Number(v.sgstAmount) > 0 ? formatINR(v.sgstAmount) : '—'}</td>
                  <td className="amount-col text-xs text-muted-foreground">{Number(v.igstAmount) > 0 ? formatINR(v.igstAmount) : '—'}</td>
                  <td className="amount-col text-sm font-medium">{formatINR(v.grandTotal)}</td>
                  <td>
                    {Number(v.balanceDue) > 0 ? (
                      <span className="text-xs amount-debit">{formatINR(v.balanceDue)}</span>
                    ) : (
                      <Badge variant="success" className="text-[10px]">Paid</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted font-semibold">
                <td colSpan={3} className="px-3 py-2">Total ({vouchers.length})</td>
                <td className="amount-col px-3 py-2">{formatINR(totals.taxable)}</td>
                <td className="amount-col px-3 py-2">{formatINR(totals.cgst)}</td>
                <td className="amount-col px-3 py-2">{formatINR(totals.sgst)}</td>
                <td className="amount-col px-3 py-2">{formatINR(totals.igst)}</td>
                <td className="amount-col px-3 py-2">{formatINR(totals.total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : groupBy === 'party' ? (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="erp-table">
            <thead><tr><th>Party Name</th><th className="text-center">Vouchers</th><th className="text-right">Total Amount</th><th className="text-right">% of Total</th></tr></thead>
            <tbody>
              {Object.values(byParty).sort((a, b) => b.total - a.total).map((p, i) => (
                <tr key={i}>
                  <td className="font-medium text-sm">{p.name}</td>
                  <td className="text-center text-sm">{p.count}</td>
                  <td className="amount-col text-sm font-medium">{formatINR(p.total)}</td>
                  <td className="amount-col text-sm text-muted-foreground">
                    {totals.total > 0 ? (p.total / totals.total * 100).toFixed(1) : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="erp-table">
            <thead><tr><th>Month</th><th className="text-center">Vouchers</th><th className="text-right">Total Amount</th></tr></thead>
            <tbody>
              {Object.values(byMonth).map((m, i) => (
                <tr key={i}>
                  <td className="font-medium text-sm">{m.month}</td>
                  <td className="text-center text-sm">{m.count}</td>
                  <td className="amount-col text-sm font-medium">{formatINR(m.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function SaleReportPage() {
  return <SalePurchaseReport voucherType="SALE" title="Sale Report" icon={<TrendingUp size={40} />} />
}

export function PurchaseReportPage() {
  return <SalePurchaseReport voucherType="PURCHASE" title="Purchase Report" icon={<ShoppingCart size={40} />} />
}
