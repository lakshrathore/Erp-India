import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatINR, formatDate , parseFYDates } from '../../lib/india'
import { Button, Badge, PageHeader, Spinner, EmptyState } from '../../components/ui'
import { FileText } from 'lucide-react'
import dayjs from 'dayjs'
import { useAuthStore } from '../../stores/auth.store'

const TDS_SECTIONS = [
  { section: '194C', description: 'Payment to Contractors', threshold: 30000, rate: 1 },
  { section: '194J', description: 'Professional / Technical Services', threshold: 30000, rate: 10 },
  { section: '194I', description: 'Rent', threshold: 240000, rate: 10 },
  { section: '194A', description: 'Interest (other than securities)', threshold: 40000, rate: 10 },
  { section: '194H', description: 'Commission / Brokerage', threshold: 15000, rate: 5 },
  { section: '194B', description: 'Winnings from Lottery', threshold: 10000, rate: 30 },
  { section: '194D', description: 'Insurance Commission', threshold: 15000, rate: 5 },
  { section: '194Q', description: 'Purchase of Goods', threshold: 5000000, rate: 0.1 },
  { section: '206C(1H)', description: 'TCS on sale of goods > ₹50L', threshold: 5000000, rate: 0.1 },
]

export default function TDSTCSPage() {
  const { activeFY } = useAuthStore()
  const [quarter, setQuarter] = useState('Q4')
  const [year, setYear] = useState('2025-26')

  // Use voucher-based TDS entries
  const { data, isLoading } = useQuery({
    queryKey: ['tds-entries', quarter, year],
    queryFn: async () => {
      const fyStart = parseFYDates(year).from.substring(0,4)
      const quarterMonths: Record<string, [number, number]> = {
        Q1: [4, 6], Q2: [7, 9], Q3: [10, 12], Q4: [1, 3],
      }
      const [startM, endM] = quarterMonths[quarter] || [1, 3]
      const startYear = quarter === 'Q4' ? parseInt(fyStart) + 1 : parseInt(fyStart)
      const from = `${startYear}-${String(startM).padStart(2, '0')}-01`
      const to = dayjs(`${startYear}-${String(endM).padStart(2, '0')}-01`).endOf('month').format('YYYY-MM-DD')
      const { data } = await api.get('/billing/vouchers', {
        params: { from, to, limit: 500, status: 'POSTED' },
      })
      return data
    },
  })

  return (
    <div>
      <PageHeader title="TDS / TCS"
        subtitle="Tax Deducted/Collected at Source"
        breadcrumbs={[{ label: 'GST' }, { label: 'TDS / TCS' }]}
      />

      <div className="flex gap-3 mb-4 items-end">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Quarter</label>
          <select value={quarter} onChange={e => setQuarter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            {['Q1 (Apr-Jun)', 'Q2 (Jul-Sep)', 'Q3 (Oct-Dec)', 'Q4 (Jan-Mar)'].map((q, i) => (
              <option key={q} value={`Q${i + 1}`}>{q}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Financial Year</label>
          <input value={year} onChange={e => setYear(e.target.value)} placeholder="2025-26"
            className="h-9 w-24 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>

      {/* TDS Sections Reference */}
      <div className="bg-card border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <h3 className="text-sm font-semibold">TDS Section Reference</h3>
        </div>
        <table className="erp-table">
          <thead>
            <tr>
              <th>Section</th><th>Nature of Payment</th>
              <th className="text-right">Threshold (₹)</th>
              <th className="text-right">Rate %</th>
              <th>Applicable On</th>
            </tr>
          </thead>
          <tbody>
            {TDS_SECTIONS.map(s => (
              <tr key={s.section}>
                <td><span className="font-mono text-sm font-medium">{s.section}</span></td>
                <td className="text-sm">{s.description}</td>
                <td className="amount-col text-sm">{formatINR(s.threshold, 0)}</td>
                <td className="amount-col text-sm">{s.rate}%</td>
                <td>
                  <Badge variant={s.section.startsWith('206') ? 'warning' : 'info'} className="text-[10px]">
                    {s.section.startsWith('206') ? 'TCS' : 'TDS'}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 26AS Matching Status */}
      <div className="bg-card border border-border rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-4">26AS Reconciliation Status — {quarter} {year}</h3>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'TDS Deducted', value: '₹0', status: 'pending' },
            { label: 'TDS Deposited (Challan)', value: '₹0', status: 'pending' },
            { label: '26AS Match', value: 'Not uploaded', status: 'pending' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <span className="stat-label">{s.label}</span>
              <span className="stat-value text-lg">{s.value}</span>
              <Badge variant="outline" className="text-[10px] w-fit mt-1">{s.status}</Badge>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          TDS entry creation from vouchers will be tracked here. Use the Purchase Invoice module
          to mark TDS-applicable vendors — deductions will auto-reflect in Form 24Q (Phase 4).
        </p>
      </div>
    </div>
  )
}
