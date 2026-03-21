// ─── GSTR-1 Page ─────────────────────────────────────────────────────────────
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatINR, formatDate } from '../../lib/india'
import { Button, Badge, PageHeader, Spinner, EmptyState } from '../../components/ui'
import { Download, FileText, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react'
import dayjs from 'dayjs'
import { cn } from '../../components/ui/utils'
import { useAuthStore } from '../../stores/auth.store'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function periodToLabel(period: string): string {
  if (period.length !== 6) return period
  const mm = period.substring(0, 2)
  const yyyy = period.substring(2)
  const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[parseInt(mm)]} ${yyyy}`
}

function PeriodSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Generate last 12 months
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = dayjs().subtract(i, 'month')
    return { label: d.format('MMM YYYY'), value: d.format('MMYYYY') }
  })

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
    >
      {months.map(m => (
        <option key={m.value} value={m.value}>{m.label}</option>
      ))}
    </select>
  )
}

type GSTR1Tab = 'b2b' | 'b2cs' | 'b2cl' | 'cdnr' | 'hsn' | 'summary'

export default function GSTR1Page() {
  const [period, setPeriod] = useState(dayjs().subtract(1, 'month').format('MMYYYY'))
  const [activeTab, setActiveTab] = useState<GSTR1Tab>('b2b')

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['gstr1', period],
    queryFn: async () => {
      const { data } = await api.get('/gst/gstr1', { params: { period } })
      return data.data
    },
    enabled: period.length === 6,
  })

  const handleExportJSON = () => {
    if (!data) return
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `GSTR1_${period}.json`; a.click()
  }

  const TABS: { key: GSTR1Tab; label: string; count?: number }[] = [
    { key: 'b2b', label: 'B2B', count: data?.b2b?.length },
    { key: 'b2cs', label: 'B2CS', count: data?.b2cs?.length },
    { key: 'b2cl', label: 'B2CL', count: data?.b2cl?.length },
    { key: 'cdnr', label: 'CDNR', count: data?.cdnr?.length },
    { key: 'hsn', label: 'HSN', count: data?.hsnSummary?.length },
    { key: 'summary', label: 'Summary' },
  ]

  const summary = data?.summary

  return (
    <div>
      <PageHeader title="GSTR-1" subtitle="Outward supplies — Monthly return"
        breadcrumbs={[{ label: 'GST' }, { label: 'GSTR-1' }]}
        actions={
          <div className="flex gap-2 items-center">
            <PeriodSelector value={period} onChange={setPeriod} />
            <Button variant="ghost" size="sm" onClick={() => refetch()} loading={isFetching}>
              <RefreshCw size={14} />
            </Button>
            {data && (
              <Button variant="outline" size="sm" onClick={handleExportJSON}>
                <Download size={14} /> JSON
              </Button>
            )}
          </div>
        }
      />

      {/* Summary strip */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          {[
            { label: 'Period', value: periodToLabel(period) },
            { label: 'Taxable Value', value: formatINR(summary.totalTaxableValue) },
            { label: 'Total IGST', value: formatINR(summary.totalIGST), color: 'text-blue-700' },
            { label: 'Total CGST', value: formatINR(summary.totalCGST) },
            { label: 'Total SGST', value: formatINR(summary.totalSGST) },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <span className="stat-label">{s.label}</span>
              <span className={cn('stat-value text-sm', s.color)}>{s.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-border">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5',
              activeTab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}>
            {t.label}
            {t.count !== undefined && (
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                activeTab === t.key ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? <div className="flex justify-center py-12"><Spinner /></div> :
        !data ? <EmptyState title="No data" description={`No GST entries for ${periodToLabel(period)}`} /> :

        activeTab === 'b2b' ? (
          <GSTR1Table
            title="B2B — Registered Customer Invoices"
            columns={['GSTIN', 'Party', 'Invoice No', 'Date', 'Place', 'Taxable', 'IGST', 'CGST', 'SGST', 'Cess', 'Total GST']}
            rows={(data.b2b || []).map((e: any) => [
              e.partyGstin, e.partyName, e.invoiceNumber, formatDate(e.invoiceDate),
              e.placeOfSupply,
              formatINR(e.taxableValue), formatINR(e.igstAmount), formatINR(e.cgstAmount),
              formatINR(e.sgstAmount), formatINR(e.cessAmount),
              formatINR(Number(e.igstAmount) + Number(e.cgstAmount) + Number(e.sgstAmount) + Number(e.cessAmount)),
            ])}
          />
        ) : activeTab === 'b2cs' ? (
          <GSTR1Table
            title="B2CS — Unregistered Customers (Invoice < ₹2.5L)"
            columns={['Type', 'Place of Supply', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Cess']}
            rows={(data.b2cs || []).map((e: any) => [
              e.entryType, e.placeOfSupply,
              formatINR(e.taxableValue), formatINR(e.igstAmount),
              formatINR(e.cgstAmount), formatINR(e.sgstAmount), formatINR(e.cessAmount),
            ])}
          />
        ) : activeTab === 'b2cl' ? (
          <GSTR1Table
            title="B2CL — Unregistered Customers (Invoice > ₹2.5L)"
            columns={['Invoice No', 'Date', 'Place', 'Taxable', 'IGST', 'Cess']}
            rows={(data.b2cl || []).map((e: any) => [
              e.invoiceNumber, formatDate(e.invoiceDate), e.placeOfSupply,
              formatINR(e.taxableValue), formatINR(e.igstAmount), formatINR(e.cessAmount),
            ])}
          />
        ) : activeTab === 'cdnr' ? (
          <GSTR1Table
            title="CDNR — Credit/Debit Notes (Registered)"
            columns={['GSTIN', 'Party', 'Note No', 'Date', 'Type', 'Taxable', 'IGST', 'CGST', 'SGST']}
            rows={(data.cdnr || []).map((e: any) => [
              e.partyGstin, e.partyName, e.invoiceNumber, formatDate(e.invoiceDate),
              e.entryType,
              formatINR(e.taxableValue), formatINR(e.igstAmount),
              formatINR(e.cgstAmount), formatINR(e.sgstAmount),
            ])}
          />
        ) : activeTab === 'hsn' ? (
          <GSTR1Table
            title="HSN Summary"
            columns={['HSN/SAC', 'Description', 'UQC', 'Qty', 'Taxable', 'IGST', 'CGST', 'SGST', 'Cess']}
            rows={(data.hsnSummary || []).map((e: any) => [
              e.hsnCode, e.description, e.uqc, e.qty,
              formatINR(e.taxableValue), formatINR(e.igstAmount),
              formatINR(e.cgstAmount), formatINR(e.sgstAmount), formatINR(e.cessAmount),
            ])}
          />
        ) : (
          /* Summary tab */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/30 font-semibold text-sm">GSTR-1 Summary</div>
              <table className="w-full text-sm">
                <tbody>
                  {[
                    ['B2B Invoices', data.b2b?.length || 0, formatINR(summary?.totalTaxableValue || 0)],
                    ['B2CS', data.b2cs?.length || 0, ''],
                    ['B2CL', data.b2cl?.length || 0, ''],
                    ['CDNR', data.cdnr?.length || 0, ''],
                  ].map(([label, count, value]) => (
                    <tr key={label as string} className="border-t border-border/30">
                      <td className="px-4 py-2.5">{label}</td>
                      <td className="px-4 py-2.5 text-center text-muted-foreground">{count} records</td>
                      <td className="px-4 py-2.5 text-right font-mono">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/30 font-semibold text-sm">Tax Summary</div>
              <table className="w-full text-sm">
                <tbody>
                  {[
                    ['Taxable Value', summary?.totalTaxableValue],
                    ['IGST', summary?.totalIGST],
                    ['CGST', summary?.totalCGST],
                    ['SGST', summary?.totalSGST],
                    ['Cess', summary?.totalCess],
                  ].map(([label, value]) => (
                    <tr key={label as string} className="border-t border-border/30">
                      <td className="px-4 py-2.5 text-muted-foreground">{label}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-medium">{formatINR(Number(value || 0))}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border bg-muted font-bold">
                    <td className="px-4 py-2.5">Total Tax</td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      {formatINR((summary?.totalIGST || 0) + (summary?.totalCGST || 0) + (summary?.totalSGST || 0) + (summary?.totalCess || 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )
      }
    </div>
  )
}

function GSTR1Table({ title, columns, rows }: { title: string; columns: string[]; rows: any[][] }) {
  if (rows.length === 0) return <EmptyState title="No entries" description={`No ${title} entries`} />
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-2">{title} — {rows.length} records</p>
      <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              {columns.map(c => <th key={c} className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-border/30 hover:bg-muted/10">
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-2 whitespace-nowrap">{cell || '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
