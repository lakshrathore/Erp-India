import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatINR, formatDate } from '../../lib/india'
import { Button, Badge, PageHeader, Spinner, EmptyState } from '../../components/ui'
import { AlertTriangle, Printer } from 'lucide-react'
import { useParties } from '../../hooks/api.hooks'

const AGING_BUCKETS = [
  { label: '0–30 days', min: 0, max: 30, variant: 'success' as const },
  { label: '31–60 days', min: 31, max: 60, variant: 'warning' as const },
  { label: '61–90 days', min: 61, max: 90, variant: 'destructive' as const },
  { label: '90+ days', min: 91, max: Infinity, variant: 'destructive' as const },
]

export default function OverdueReportPage() {
  const [type, setType] = useState<'receivable' | 'payable'>('receivable')
  const [partyId, setPartyId] = useState('')

  const { data: partiesData } = useParties({ type: type === 'receivable' ? 'CUSTOMER' : 'VENDOR', limit: 500 })
  const parties = partiesData?.data || []

  const { data, isLoading } = useQuery({
    queryKey: ['overdue', type, partyId],
    queryFn: async () => {
      const { data } = await api.get('/billing/outstanding', {
        params: { type, partyId: partyId || undefined },
      })
      return data.data
    },
  })

  const vouchers: any[] = data?.vouchers || []
  const today = new Date()

  // Bucket assignment
  const withAging = vouchers.map(v => {
    const days = Math.floor((today.getTime() - new Date(v.date).getTime()) / 86400000)
    const bucket = AGING_BUCKETS.find(b => days >= b.min && days <= b.max) || AGING_BUCKETS[3]
    return { ...v, daysElapsed: days, bucket }
  })

  // Bucket summaries
  const bucketTotals = AGING_BUCKETS.map(b => ({
    ...b,
    count: withAging.filter(v => v.bucket.label === b.label).length,
    amount: withAging.filter(v => v.bucket.label === b.label).reduce((s, v) => s + Number(v.balanceDue), 0),
  }))

  const partyOptions = [
    { value: '', label: 'All parties' },
    ...(parties as any[]).map((p: any) => ({ value: p.id, label: p.name })),
  ]

  return (
    <div>
      <PageHeader
        title="Overdue Report"
        subtitle="Bill-wise aging analysis"
        breadcrumbs={[{ label: 'Reports' }, { label: 'Overdue' }]}
        actions={<Button variant="outline" size="sm" onClick={() => window.print()}><Printer size={14} /></Button>}
      />

      <div className="flex gap-3 mb-4 items-center flex-wrap">
        <div className="flex gap-2">
          <Button variant={type === 'receivable' ? 'default' : 'outline'} size="sm"
            onClick={() => { setType('receivable'); setPartyId('') }}>
            Receivable
          </Button>
          <Button variant={type === 'payable' ? 'default' : 'outline'} size="sm"
            onClick={() => { setType('payable'); setPartyId('') }}>
            Payable
          </Button>
        </div>
        <select value={partyId} onChange={e => setPartyId(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring w-56">
          {partyOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Aging buckets summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {bucketTotals.map(b => (
          <div key={b.label} className="stat-card">
            <span className="stat-label">{b.label}</span>
            <span className={`stat-value text-base ${b.variant === 'destructive' ? 'text-destructive' : b.variant === 'warning' ? 'text-warning' : 'text-success'}`}>
              {formatINR(b.amount)}
            </span>
            <span className="text-xs text-muted-foreground">{b.count} bills</span>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : withAging.length === 0 ? (
        <EmptyState icon={<AlertTriangle size={40} />} title="No overdue entries"
          description="No outstanding bills found" />
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Voucher No</th>
                <th>Date</th>
                <th>Party</th>
                <th className="text-right">Invoice Amt</th>
                <th className="text-right">Balance Due</th>
                <th className="text-center">Days</th>
                <th>Aging</th>
              </tr>
            </thead>
            <tbody>
              {withAging
                .sort((a, b) => b.daysElapsed - a.daysElapsed)
                .map((v: any) => (
                  <tr key={v.id} className={v.daysElapsed > 60 ? 'bg-destructive/5' : v.daysElapsed > 30 ? 'bg-warning-muted/30' : ''}>
                    <td className="font-mono text-xs">{v.voucherNumber}</td>
                    <td className="text-sm whitespace-nowrap">{formatDate(v.date)}</td>
                    <td className="text-sm truncate max-w-[160px]">{v.party?.name || '—'}</td>
                    <td className="amount-col text-sm">{formatINR(v.grandTotal)}</td>
                    <td className="amount-col text-sm font-medium">
                      <span className={type === 'receivable' ? 'amount-debit' : 'amount-credit'}>
                        {formatINR(v.balanceDue)}
                      </span>
                    </td>
                    <td className="text-center">
                      <span className={`text-sm font-bold ${v.daysElapsed > 60 ? 'text-destructive' : v.daysElapsed > 30 ? 'text-warning' : 'text-success'}`}>
                        {v.daysElapsed}
                      </span>
                    </td>
                    <td>
                      <Badge variant={v.bucket.variant} className="text-[10px]">
                        {v.bucket.label}
                      </Badge>
                    </td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted font-semibold">
                <td colSpan={4} className="px-3 py-2">Total Outstanding</td>
                <td className="amount-col px-3 py-2">
                  {formatINR(withAging.reduce((s, v) => s + Number(v.balanceDue), 0))}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
