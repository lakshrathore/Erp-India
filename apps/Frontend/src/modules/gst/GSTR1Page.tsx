import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatINR, formatDate, getGSTRPeriodLabel } from '../../lib/india'
import { Button, Badge, PageHeader, Spinner, EmptyState } from '../../components/ui'
import { Download, FileText, CheckCircle2, AlertCircle } from 'lucide-react'
import dayjs from 'dayjs'

type Tab = 'b2b' | 'b2cs' | 'b2cl' | 'cdnr' | 'hsn' | 'summary'

export default function GSTR1Page() {
  const today = dayjs()
  const defaultPeriod = today.subtract(1, 'month').format('MMYYYY')
  const [period, setPeriod] = useState(defaultPeriod)
  const [activeTab, setActiveTab] = useState<Tab>('b2b')

  const { data, isLoading, refetch } = useQuery({
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
    a.href = url
    a.download = `GSTR1_${period}.json`
    a.click()
  }

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'b2b', label: 'B2B Invoices', count: data?.b2b?.length },
    { key: 'b2cs', label: 'B2CS', count: data?.b2cs?.length },
    { key: 'b2cl', label: 'B2CL', count: data?.b2cl?.length },
    { key: 'cdnr', label: 'CDNR / CDNUR', count: data?.cdnr?.length },
    { key: 'hsn', label: 'HSN Summary', count: data?.hsnSummary?.length },
    { key: 'summary', label: 'Summary' },
  ]

  return (
    <div>
      <PageHeader
        title="GSTR-1"
        subtitle="Outward supplies return"
        breadcrumbs={[{ label: 'GST' }, { label: 'GSTR-1' }]}
        actions={
          <div className="flex gap-2 items-center">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Period (MMYYYY)</label>
              <input
                value={period}
                onChange={e => setPeriod(e.target.value)}
                placeholder="032025"
                maxLength={6}
                className="h-9 w-28 rounded-md border border-input bg-background px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {data && (
              <Button variant="outline" onClick={handleExportJSON} className="mt-5">
                <Download size={14} /> Export JSON
              </Button>
            )}
          </div>
        }
      />

      {/* Period label */}
      {period.length === 6 && (
        <div className="mb-4 flex items-center gap-2">
          <Badge variant="info">{getGSTRPeriodLabel(period)}</Badge>
          {data?.summary && (
            <span className="text-sm text-muted-foreground">
              Total taxable: <strong>{formatINR(data.summary.totalTaxableValue)}</strong>
              &nbsp;· GST: <strong>{formatINR(data.summary.totalCGST + data.summary.totalSGST + data.summary.totalIGST)}</strong>
            </span>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !data ? (
        <EmptyState icon={<FileText size={40} />} title="Enter period" description="Enter period in MMYYYY format (e.g. 032025 for March 2025)" />
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-1 border-b border-border mb-4">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                  activeTab === t.key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label}
                {t.count !== undefined && (
                  <Badge variant={t.count > 0 ? 'info' : 'outline'} className="text-[10px] px-1.5">{t.count}</Badge>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'b2b' && <B2BTable entries={data.b2b || []} />}
          {activeTab === 'b2cs' && <B2CSTable entries={data.b2cs || []} />}
          {activeTab === 'b2cl' && <B2CLTable entries={data.b2cl || []} />}
          {activeTab === 'cdnr' && <B2BTable entries={data.cdnr || []} isCDNR />}
          {activeTab === 'hsn' && <HSNTable entries={data.hsnSummary || []} />}
          {activeTab === 'summary' && <GSTRSummary summary={data.summary} />}
        </>
      )}
    </div>
  )
}

// ─── B2B Table ─────────────────────────────────────────────────────────────────

function B2BTable({ entries, isCDNR = false }: { entries: any[]; isCDNR?: boolean }) {
  if (entries.length === 0) return <EmptyState title="No entries" description={`No ${isCDNR ? 'credit/debit notes' : 'B2B invoices'} for this period`} />
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <table className="erp-table">
        <thead>
          <tr>
            <th>Invoice No</th>
            <th>Date</th>
            <th>Party GSTIN</th>
            <th>Party Name</th>
            <th>POS</th>
            <th>RC</th>
            <th className="text-right">Taxable Value</th>
            <th className="text-right">IGST</th>
            <th className="text-right">CGST</th>
            <th className="text-right">SGST</th>
            <th className="text-right">Cess</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e: any, i: number) => (
            <tr key={i}>
              <td className="font-mono text-xs">{e.invoiceNumber}</td>
              <td className="text-sm whitespace-nowrap">{formatDate(e.invoiceDate)}</td>
              <td className="font-mono text-xs">{e.partyGstin || 'URP'}</td>
              <td className="text-sm truncate max-w-[160px]">{e.partyName || '—'}</td>
              <td className="text-xs text-center">{e.placeOfSupply}</td>
              <td className="text-center">
                {e.reverseCharge ? <CheckCircle2 size={13} className="text-warning mx-auto" /> : '—'}
              </td>
              <td className="amount-col text-sm">{formatINR(e.taxableValue)}</td>
              <td className="amount-col text-sm">{Number(e.igstAmount) > 0 ? formatINR(e.igstAmount) : '—'}</td>
              <td className="amount-col text-sm">{Number(e.cgstAmount) > 0 ? formatINR(e.cgstAmount) : '—'}</td>
              <td className="amount-col text-sm">{Number(e.sgstAmount) > 0 ? formatINR(e.sgstAmount) : '—'}</td>
              <td className="amount-col text-sm">{Number(e.cessAmount) > 0 ? formatINR(e.cessAmount) : '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-muted font-semibold">
            <td colSpan={6} className="px-3 py-2 text-sm">Total ({entries.length})</td>
            <td className="amount-col px-3 py-2">{formatINR(entries.reduce((s: number, e: any) => s + Number(e.taxableValue), 0))}</td>
            <td className="amount-col px-3 py-2">{formatINR(entries.reduce((s: number, e: any) => s + Number(e.igstAmount), 0))}</td>
            <td className="amount-col px-3 py-2">{formatINR(entries.reduce((s: number, e: any) => s + Number(e.cgstAmount), 0))}</td>
            <td className="amount-col px-3 py-2">{formatINR(entries.reduce((s: number, e: any) => s + Number(e.sgstAmount), 0))}</td>
            <td className="amount-col px-3 py-2">{formatINR(entries.reduce((s: number, e: any) => s + Number(e.cessAmount), 0))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function B2CSTable({ entries }: { entries: any[] }) {
  if (entries.length === 0) return <EmptyState title="No B2CS entries" description="No unregistered small value supplies for this period" />
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <table className="erp-table">
        <thead>
          <tr>
            <th>Type</th><th>POS</th><th>GST Rate</th>
            <th className="text-right">Taxable Value</th>
            <th className="text-right">IGST</th><th className="text-right">CGST</th><th className="text-right">SGST</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e: any, i: number) => (
            <tr key={i}>
              <td className="text-sm">B2CS</td>
              <td className="text-sm">{e.placeOfSupply}</td>
              <td className="text-sm">{e.gstRate}%</td>
              <td className="amount-col text-sm">{formatINR(e.taxableValue)}</td>
              <td className="amount-col text-sm">{formatINR(e.igstAmount)}</td>
              <td className="amount-col text-sm">{formatINR(e.cgstAmount)}</td>
              <td className="amount-col text-sm">{formatINR(e.sgstAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function B2CLTable({ entries }: { entries: any[] }) {
  if (entries.length === 0) return <EmptyState title="No B2CL entries" description="No inter-state unregistered invoices above ₹2.5L" />
  return <B2BTable entries={entries} />
}

// ─── HSN Summary ──────────────────────────────────────────────────────────────

function HSNTable({ entries }: { entries: any[] }) {
  if (entries.length === 0) return <EmptyState title="No HSN data" description="No item transactions for this period" />
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <table className="erp-table">
        <thead>
          <tr>
            <th>HSN / SAC</th><th>Description</th><th>UOM</th>
            <th className="text-right">Qty</th>
            <th className="text-right">Taxable Value</th>
            <th className="text-right">IGST</th><th className="text-right">CGST</th><th className="text-right">SGST</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e: any, i: number) => (
            <tr key={i}>
              <td className="font-mono text-sm">{e.hsn || '—'}</td>
              <td className="text-sm truncate max-w-[200px]">{e.description}</td>
              <td className="text-sm">{e.uom}</td>
              <td className="amount-col text-sm">{Number(e.qty).toFixed(3)}</td>
              <td className="amount-col text-sm">{formatINR(e.taxableValue)}</td>
              <td className="amount-col text-sm">{formatINR(e.igst)}</td>
              <td className="amount-col text-sm">{formatINR(e.cgst)}</td>
              <td className="amount-col text-sm">{formatINR(e.sgst)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Summary ──────────────────────────────────────────────────────────────────

function GSTRSummary({ summary }: { summary: any }) {
  if (!summary) return null
  const totalGST = summary.totalIGST + summary.totalCGST + summary.totalSGST + summary.totalCess
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {[
        { label: 'Total Taxable Value', value: formatINR(summary.totalTaxableValue), color: '' },
        { label: 'IGST', value: formatINR(summary.totalIGST), color: 'text-info' },
        { label: 'CGST', value: formatINR(summary.totalCGST), color: 'text-primary' },
        { label: 'SGST', value: formatINR(summary.totalSGST), color: 'text-primary' },
        { label: 'Cess', value: formatINR(summary.totalCess), color: 'text-warning' },
        { label: 'Total Tax', value: formatINR(totalGST), color: 'amount-debit' },
      ].map(s => (
        <div key={s.label} className="stat-card">
          <span className="stat-label">{s.label}</span>
          <span className={`stat-value text-xl ${s.color}`}>{s.value}</span>
        </div>
      ))}
    </div>
  )
}
