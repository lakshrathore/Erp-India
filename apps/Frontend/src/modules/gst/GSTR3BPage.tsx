import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatINR, getGSTRPeriodLabel } from '../../lib/india'
import { Button, Badge, PageHeader, Spinner, EmptyState } from '../../components/ui'
import { Download, CheckCircle2, FileText } from 'lucide-react'
import dayjs from 'dayjs'

export default function GSTR3BPage() {
  const defaultPeriod = dayjs().subtract(1, 'month').format('MMYYYY')
  const [period, setPeriod] = useState(defaultPeriod)

  const { data, isLoading } = useQuery({
    queryKey: ['gstr3b', period],
    queryFn: async () => {
      const { data } = await api.get('/gst/gstr3b', { params: { period } })
      return data.data
    },
    enabled: period.length === 6,
  })

  const handleExport = () => {
    if (!data) return
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `GSTR3B_${period}.json`
    a.click()
  }

  return (
    <div>
      <PageHeader
        title="GSTR-3B"
        subtitle="Monthly self-assessed return"
        breadcrumbs={[{ label: 'GST' }, { label: 'GSTR-3B' }]}
        actions={
          <div className="flex gap-2 items-center">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Period (MMYYYY)</label>
              <input value={period} onChange={e => setPeriod(e.target.value)}
                maxLength={6} placeholder="032025"
                className="h-9 w-28 rounded-md border border-input bg-background px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            {data && (
              <Button variant="outline" onClick={handleExport} className="mt-5">
                <Download size={14} /> Export
              </Button>
            )}
          </div>
        }
      />

      {period.length === 6 && (
        <div className="mb-4">
          <Badge variant="info">{getGSTRPeriodLabel(period)}</Badge>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !data ? (
        <EmptyState icon={<FileText size={40} />} title="Enter period" description="Enter a 6-digit period in MMYYYY format" />
      ) : (
        <div className="space-y-4">

          {/* Table 3.1 — Outward supplies */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="bg-primary/5 px-4 py-3 border-b border-border">
              <h3 className="font-semibold text-sm">3.1 — Outward Taxable Supplies</h3>
            </div>
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Nature</th>
                  <th className="text-right">Taxable Value</th>
                  <th className="text-right">IGST</th>
                  <th className="text-right">CGST</th>
                  <th className="text-right">SGST/UTGST</th>
                  <th className="text-right">Cess</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: '(a) Outward taxable supplies (other than zero-rated, nil-rated & exempted)', data: data.table31?.taxable },
                  { label: '(b) Outward taxable supplies (zero-rated)', data: data.table31?.zeroRated },
                  { label: '(c) Other outward supplies (nil-rated, exempted)', data: data.table31?.nil },
                  { label: '(d) Inward supplies (liable to RCM)', data: { taxableValue: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 } },
                  { label: '(e) Non-GST outward supplies', data: data.table31?.nonGST },
                ].map((row, i) => (
                  <tr key={i}>
                    <td className="text-xs max-w-[300px]">{row.label}</td>
                    <td className="amount-col text-sm">{formatINR(row.data?.taxableValue || 0)}</td>
                    <td className="amount-col text-sm">{row.data?.igst > 0 ? formatINR(row.data.igst) : '—'}</td>
                    <td className="amount-col text-sm">{row.data?.cgst > 0 ? formatINR(row.data.cgst) : '—'}</td>
                    <td className="amount-col text-sm">{row.data?.sgst > 0 ? formatINR(row.data.sgst) : '—'}</td>
                    <td className="amount-col text-sm">{row.data?.cess > 0 ? formatINR(row.data.cess) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table 4 — ITC */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="bg-primary/5 px-4 py-3 border-b border-border">
              <h3 className="font-semibold text-sm">4 — Eligible ITC</h3>
            </div>
            <table className="erp-table">
              <thead>
                <tr>
                  <th>ITC Type</th>
                  <th className="text-right">IGST</th>
                  <th className="text-right">CGST</th>
                  <th className="text-right">SGST/UTGST</th>
                  <th className="text-right">Cess</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: '(A)(1) Import of goods', data: data.table4?.itcAvailable?.importOfGoods },
                  { label: '(A)(2) Import of services', data: data.table4?.itcAvailable?.importOfServices },
                  { label: '(A)(3) Inward supplies liable to RCM', data: data.table4?.itcAvailable?.inwardRCM },
                  { label: '(A)(5) All other ITC', data: data.table4?.itcAvailable?.allOtherITC },
                ].map((row, i) => (
                  <tr key={i}>
                    <td className="text-xs">{row.label}</td>
                    <td className="amount-col text-sm amount-credit">{row.data?.igst > 0 ? formatINR(row.data.igst) : '—'}</td>
                    <td className="amount-col text-sm amount-credit">{row.data?.cgst > 0 ? formatINR(row.data.cgst) : '—'}</td>
                    <td className="amount-col text-sm amount-credit">{row.data?.sgst > 0 ? formatINR(row.data.sgst) : '—'}</td>
                    <td className="amount-col text-sm amount-credit">{row.data?.cess > 0 ? formatINR(row.data.cess) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Net Tax Payable */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="font-semibold text-sm mb-4">6.1 — Net Tax Payable</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Output Tax', value: data.totalOutwardTax, color: 'amount-debit' },
                { label: 'Total ITC Claimed', value: data.totalITC, color: 'amount-credit' },
                { label: 'Net Payable', value: data.totalPayable, color: 'text-foreground font-bold' },
                { label: 'Cess Payable', value: data.netTaxPayable?.cess || 0, color: 'text-warning' },
              ].map(s => (
                <div key={s.label} className="stat-card">
                  <span className="stat-label">{s.label}</span>
                  <span className={`stat-value text-lg ${s.color}`}>{formatINR(s.value)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                { label: 'IGST Payable', value: data.netTaxPayable?.igst },
                { label: 'CGST Payable', value: data.netTaxPayable?.cgst },
                { label: 'SGST Payable', value: data.netTaxPayable?.sgst },
              ].map(s => (
                <div key={s.label} className="bg-muted rounded-lg px-4 py-3 flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">{s.label}</span>
                  <span className={`font-mono font-semibold ${s.value > 0 ? 'amount-debit' : 'text-success'}`}>
                    {s.value > 0 ? formatINR(s.value) : 'NIL'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
