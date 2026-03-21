import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatINR } from '../../lib/india'
import { Button, Badge, PageHeader, Spinner, EmptyState } from '../../components/ui'
import { Download, FileText, CheckCircle2 } from 'lucide-react'
import dayjs from 'dayjs'

export default function PayrollCompliancePage() {
  const today = dayjs()
  const [month, setMonth] = useState(today.subtract(1, 'month').month() + 1)
  const [year, setYear] = useState(today.subtract(1, 'month').year())
  const [activeTab, setActiveTab] = useState<'pf' | 'esic' | 'pt'>('pf')

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  const { data: pfData, isLoading: pfLoading } = useQuery({
    queryKey: ['pf-ecr', month, year],
    queryFn: async () => { const { data } = await api.get(`/payroll/pf-ecr/${month}/${year}`); return data.data },
    staleTime: 30_000,
  })

  const { data: paysheet } = useQuery({
    queryKey: ['paysheet-compliance', month, year],
    queryFn: async () => { const { data } = await api.get(`/payroll/paysheet/${month}/${year}`); return data.data },
    staleTime: 30_000,
  })

  const handleDownloadECR = () => {
    if (!pfData?.ecrData?.length) return
    const header = 'UAN,NAME,GROSS WAGE,EPF WAGE,EPF CONTRIB,EPS CONTRIB,EDLI CONTRIB,EPF ADMIN'
    const rows = pfData.ecrData.map((r: any) =>
      `${r.uan},${r.name},${r.grossWage},${r.epfWage},${r.epfContrib},${r.epsContrib},${r.edliContrib},${r.epfAdmin}`
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `PF_ECR_${month}_${year}.csv`
    a.click()
  }

  const pfTotals = pfData?.ecrData?.reduce((s: any, r: any) => ({
    grossWage: s.grossWage + r.grossWage,
    epfWage: s.epfWage + r.epfWage,
    epfContrib: s.epfContrib + r.epfContrib,
    epsContrib: s.epsContrib + r.epsContrib,
  }), { grossWage: 0, epfWage: 0, epfContrib: 0, epsContrib: 0 })

  const esicEmployees = paysheet?.salaries?.filter((s: any) => Number(s.esicEmployee) > 0) || []
  const totalESICEmployee = esicEmployees.reduce((s: number, sal: any) => s + Number(sal.esicEmployee), 0)
  const totalESICEmployer = esicEmployees.reduce((s: number, sal: any) => s + Number(sal.esicEmployer), 0)

  return (
    <div>
      <PageHeader title="PF / ESI Compliance"
        subtitle="Provident Fund and ESIC contribution reports"
        breadcrumbs={[{ label: 'Payroll' }, { label: 'Compliance' }]}
        actions={
          <div className="flex gap-2 items-end">
            <select value={month} onChange={e => setMonth(Number(e.target.value))}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <input type="number" value={year} onChange={e => setYear(Number(e.target.value))}
              className="h-9 w-24 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-4">
        {[
          { key: 'pf', label: 'PF / EPF' },
          { key: 'esic', label: 'ESIC' },
          { key: 'pt', label: 'Professional Tax' },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* PF Tab */}
      {activeTab === 'pf' && (
        <div className="space-y-4">
          {pfTotals && (
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'EPF Wage', value: formatINR(pfTotals.epfWage) },
                { label: 'Employee Contribution', value: formatINR(pfTotals.epfContrib) },
                { label: 'EPS Contribution', value: formatINR(pfTotals.epsContrib) },
                { label: 'Total Challan', value: formatINR(pfTotals.epfContrib * 2), highlight: true },
              ].map(s => (
                <div key={s.label} className={`stat-card ${s.highlight ? 'border-primary/30' : ''}`}>
                  <span className="stat-label">{s.label}</span>
                  <span className={`stat-value text-base ${s.highlight ? 'text-primary' : ''}`}>{s.value}</span>
                </div>
              ))}
            </div>
          )}

          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-semibold">PF ECR File — {MONTHS[month - 1]} {year}</h3>
              <Button size="sm" variant="outline" onClick={handleDownloadECR} disabled={!pfData?.ecrData?.length}>
                <Download size={13} /> Download ECR CSV
              </Button>
            </div>

            {pfLoading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : !pfData?.ecrData?.length ? (
              <EmptyState title="No PF data" description="Process payroll first to generate ECR file" />
            ) : (
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>UAN</th><th>Employee Name</th>
                    <th className="text-right">Gross Wage</th>
                    <th className="text-right">EPF Wage</th>
                    <th className="text-right">EPF (Emp)</th>
                    <th className="text-right">EPS</th>
                    <th className="text-right">EDLI</th>
                    <th className="text-right">Admin</th>
                  </tr>
                </thead>
                <tbody>
                  {pfData.ecrData.map((r: any, i: number) => (
                    <tr key={i}>
                      <td className="font-mono text-xs">{r.uan || '—'}</td>
                      <td className="text-sm">{r.name}</td>
                      <td className="amount-col text-sm">{formatINR(r.grossWage)}</td>
                      <td className="amount-col text-sm">{formatINR(r.epfWage)}</td>
                      <td className="amount-col text-sm">{formatINR(r.epfContrib)}</td>
                      <td className="amount-col text-sm">{formatINR(r.epsContrib)}</td>
                      <td className="amount-col text-sm">{formatINR(r.edliContrib)}</td>
                      <td className="amount-col text-sm">{formatINR(r.epfAdmin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ESIC Tab */}
      {activeTab === 'esic' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="stat-card"><span className="stat-label">ESIC Employees</span><span className="stat-value">{esicEmployees.length}</span></div>
            <div className="stat-card"><span className="stat-label">Employee Share (0.75%)</span><span className="stat-value text-base">{formatINR(totalESICEmployee)}</span></div>
            <div className="stat-card border-primary/30"><span className="stat-label">Employer Share (3.25%)</span><span className="stat-value text-base text-primary">{formatINR(totalESICEmployer)}</span></div>
          </div>

          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-semibold">ESIC Contribution — {MONTHS[month - 1]} {year}</h3>
              <div className="text-sm text-muted-foreground">Total Challan: <strong className="text-foreground">{formatINR(totalESICEmployee + totalESICEmployer)}</strong></div>
            </div>
            {esicEmployees.length === 0 ? (
              <EmptyState title="No ESIC deductions" description="No employees with gross ≤ ₹21,000 this month" />
            ) : (
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>ESIC No</th><th>Employee</th>
                    <th className="text-right">Gross</th>
                    <th className="text-right">Employee (0.75%)</th>
                    <th className="text-right">Employer (3.25%)</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {esicEmployees.map((s: any) => (
                    <tr key={s.id}>
                      <td className="font-mono text-xs">{s.employee?.esicNo || '—'}</td>
                      <td className="text-sm">{s.employee?.name}</td>
                      <td className="amount-col text-sm">{formatINR(s.grossPay)}</td>
                      <td className="amount-col text-sm">{formatINR(s.esicEmployee)}</td>
                      <td className="amount-col text-sm">{formatINR(s.esicEmployer)}</td>
                      <td className="amount-col text-sm font-medium">{formatINR(Number(s.esicEmployee) + Number(s.esicEmployer))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* PT Tab */}
      {activeTab === 'pt' && (
        <div className="bg-card border border-border rounded-lg p-5">
          <p className="text-sm text-muted-foreground mb-4">Professional Tax is state-specific. Deductions are based on gross salary slabs configured per employee's PT state.</p>
          {paysheet?.salaries?.filter((s: any) => Number(s.professionalTax) > 0).length === 0 ? (
            <EmptyState title="No PT deductions" description="No PT configured for employees or Rajasthan state (no PT)" />
          ) : (
            <table className="erp-table">
              <thead>
                <tr><th>Employee</th><th>PT State</th><th className="text-right">Gross</th><th className="text-right">PT Deducted</th></tr>
              </thead>
              <tbody>
                {paysheet?.salaries?.filter((s: any) => Number(s.professionalTax) > 0).map((s: any) => (
                  <tr key={s.id}>
                    <td className="text-sm">{s.employee?.name}</td>
                    <td className="text-sm">{s.employee?.ptState || '—'}</td>
                    <td className="amount-col text-sm">{formatINR(s.grossPay)}</td>
                    <td className="amount-col text-sm font-medium">{formatINR(s.professionalTax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
