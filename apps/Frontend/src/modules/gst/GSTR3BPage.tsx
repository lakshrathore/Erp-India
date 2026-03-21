import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatINR } from '../../lib/india'
import { Button, PageHeader, Spinner, EmptyState } from '../../components/ui'
import { Download, RefreshCw, Printer } from 'lucide-react'
import dayjs from 'dayjs'

function PeriodSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = dayjs().subtract(i, 'month')
    return { label: d.format('MMM YYYY'), value: d.format('MMYYYY') }
  })
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
      {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
    </select>
  )
}

function periodLabel(p: string) {
  if (p.length !== 6) return p
  const months = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  return `${months[parseInt(p.substring(0, 2))]} ${p.substring(2)}`
}

// ─── Section component ────────────────────────────────────────────────────────

function GSTR3BSection({ title, sectionNo, rows }: {
  title: string; sectionNo: string; rows: { label: string; igst?: number; cgst?: number; sgst?: number; cess?: number; amount?: number }[]
}) {
  const totalIGST = rows.reduce((s, r) => s + (r.igst || 0), 0)
  const totalCGST = rows.reduce((s, r) => s + (r.cgst || 0), 0)
  const totalSGST = rows.reduce((s, r) => s + (r.sgst || 0), 0)
  const hasTaxColumns = rows.some(r => r.igst !== undefined || r.cgst !== undefined)

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-muted/30 border-b border-border">
        <span className="text-xs font-bold text-muted-foreground uppercase">{sectionNo}</span>
        <span className="text-sm font-semibold ml-2">{title}</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/20 border-b border-border">
            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Particulars</th>
            {hasTaxColumns ? (
              <>
                <th className="px-4 py-2 text-right text-xs font-medium text-blue-700 w-32">IGST (₹)</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-green-700 w-32">CGST (₹)</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-green-700 w-32">SGST (₹)</th>
              </>
            ) : (
              <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground w-36">Amount (₹)</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border/30 hover:bg-muted/10">
              <td className="px-4 py-2.5 text-muted-foreground">{row.label}</td>
              {hasTaxColumns ? (
                <>
                  <td className="px-4 py-2.5 text-right font-mono">{formatINR(row.igst || 0)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{formatINR(row.cgst || 0)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{formatINR(row.sgst || 0)}</td>
                </>
              ) : (
                <td className="px-4 py-2.5 text-right font-mono">{formatINR(row.amount || 0)}</td>
              )}
            </tr>
          ))}
        </tbody>
        {hasTaxColumns && (totalIGST > 0 || totalCGST > 0 || totalSGST > 0) && (
          <tfoot>
            <tr className="border-t-2 border-border bg-muted font-semibold">
              <td className="px-4 py-2.5 text-sm">Total</td>
              <td className="px-4 py-2.5 text-right font-mono text-blue-700">{formatINR(totalIGST)}</td>
              <td className="px-4 py-2.5 text-right font-mono text-green-700">{formatINR(totalCGST)}</td>
              <td className="px-4 py-2.5 text-right font-mono text-green-700">{formatINR(totalSGST)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

export default function GSTR3BPage() {
  const [period, setPeriod] = useState(dayjs().subtract(1, 'month').format('MMYYYY'))

  const { data, isLoading, refetch, isFetching } = useQuery({
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
    a.href = url; a.download = `GSTR3B_${period}.json`; a.click()
  }

  const d = data

  return (
    <div>
      <PageHeader title="GSTR-3B" subtitle="Monthly self-assessed return — Summary"
        breadcrumbs={[{ label: 'GST' }, { label: 'GSTR-3B' }]}
        actions={
          <div className="flex gap-2 items-center">
            <PeriodSelector value={period} onChange={setPeriod} />
            <Button variant="ghost" size="sm" onClick={() => refetch()} loading={isFetching}><RefreshCw size={14} /></Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer size={14} /></Button>
            {data && <Button variant="outline" size="sm" onClick={handleExport}><Download size={14} /> JSON</Button>}
          </div>
        }
      />

      {isLoading ? <div className="flex justify-center py-20"><Spinner /></div> :
        !data ? <EmptyState title="No data" description={`No GST data for ${periodLabel(period)}`} /> :
        (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800 font-medium">
              GSTR-3B for {periodLabel(period)} — Auto-populated from your sales and purchase data
            </div>

            {/* 3.1 Outward */}
            <GSTR3BSection
              sectionNo="3.1"
              title="Details of Outward Supplies and Inward Supplies Liable to Reverse Charge"
              rows={[
                { label: '(a) Outward taxable supplies (other than zero rated, nil rated and exempted)', igst: d?.outward?.taxable?.igst, cgst: d?.outward?.taxable?.cgst, sgst: d?.outward?.taxable?.sgst },
                { label: '(b) Outward taxable supplies (zero rated)', igst: d?.outward?.zeroRated?.igst || 0, cgst: 0, sgst: 0 },
                { label: '(c) Other outward supplies (Nil rated, exempted)', igst: 0, cgst: 0, sgst: 0 },
                { label: '(d) Inward supplies (liable to reverse charge)', igst: d?.rcm?.igst || 0, cgst: d?.rcm?.cgst || 0, sgst: d?.rcm?.sgst || 0 },
                { label: '(e) Non-GST outward supplies', igst: 0, cgst: 0, sgst: 0 },
              ]}
            />

            {/* 4. ITC */}
            <GSTR3BSection
              sectionNo="4"
              title="Eligible ITC (Input Tax Credit)"
              rows={[
                { label: '(A) ITC Available: (1) Import of goods', igst: 0, cgst: 0, sgst: 0 },
                { label: '(A) ITC Available: (2) Import of services', igst: 0, cgst: 0, sgst: 0 },
                { label: '(A) ITC Available: (3) Inward supplies liable to RCM', igst: d?.rcm?.igst || 0, cgst: d?.rcm?.cgst || 0, sgst: d?.rcm?.sgst || 0 },
                { label: '(A) ITC Available: (5) All other ITC', igst: d?.itc?.igst, cgst: d?.itc?.cgst, sgst: d?.itc?.sgst },
                { label: '(D) Ineligible ITC: (1) As per section 17(5)', igst: 0, cgst: 0, sgst: 0 },
                { label: '(D) Ineligible ITC: (2) Others', igst: 0, cgst: 0, sgst: 0 },
              ]}
            />

            {/* 5. Exempt */}
            <GSTR3BSection
              sectionNo="5"
              title="Values of Exempt, Nil-Rated and Non-GST Inward Supplies"
              rows={[
                { label: 'From a supplier under composition scheme, exempt, nil-rated supply', amount: 0 },
                { label: 'Non-GST supply', amount: 0 },
              ]}
            />

            {/* 5.1 Interest & Late Fee */}
            <GSTR3BSection
              sectionNo="5.1"
              title="Interest and Late Fee Payable"
              rows={[
                { label: 'Interest payable', igst: 0, cgst: 0, sgst: 0 },
                { label: 'Late fee payable', igst: 0, cgst: 0, sgst: 0 },
              ]}
            />

            {/* Tax payable summary */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-orange-50 border-b border-orange-200">
                <span className="text-sm font-bold text-orange-900">6. Payment of Tax</span>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  {[
                    { label: 'IGST', output: d?.outward?.taxable?.igst || 0, itc: d?.itc?.igst || 0 },
                    { label: 'CGST', output: d?.outward?.taxable?.cgst || 0, itc: d?.itc?.cgst || 0 },
                    { label: 'SGST/UTGST', output: d?.outward?.taxable?.sgst || 0, itc: d?.itc?.sgst || 0 },
                  ].map(tax => {
                    const payable = Math.max(0, tax.output - tax.itc)
                    return (
                      <div key={tax.label} className="bg-muted/30 rounded-lg p-3 border border-border">
                        <p className="font-bold text-sm mb-3 text-center">{tax.label}</p>
                        <div className="space-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Output Tax</span>
                            <span className="font-mono">{formatINR(tax.output)}</span>
                          </div>
                          <div className="flex justify-between text-green-700">
                            <span>ITC Credit</span>
                            <span className="font-mono">({formatINR(tax.itc)})</span>
                          </div>
                          <div className={`flex justify-between font-bold border-t border-border pt-1.5 ${payable > 0 ? 'text-destructive' : 'text-green-700'}`}>
                            <span>{payable > 0 ? 'Tax Payable' : 'Credit'}</span>
                            <span className="font-mono">{formatINR(payable > 0 ? payable : tax.itc - tax.output)}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-4 bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 flex justify-between items-center">
                  <span className="font-semibold text-sm">Total Tax Payable in Cash</span>
                  <span className="font-mono font-bold text-primary text-lg">
                    {formatINR(
                      Math.max(0, (d?.outward?.taxable?.igst || 0) - (d?.itc?.igst || 0)) +
                      Math.max(0, (d?.outward?.taxable?.cgst || 0) - (d?.itc?.cgst || 0)) +
                      Math.max(0, (d?.outward?.taxable?.sgst || 0) - (d?.itc?.sgst || 0))
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )
      }
    </div>
  )
}
