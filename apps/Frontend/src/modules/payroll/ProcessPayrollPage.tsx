import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, extractError } from '../../lib/api'
import { formatINR, formatDate } from '../../lib/india'
import { Button, Badge, PageHeader, Spinner, EmptyState } from '../../components/ui'
import { Play, Download, CheckCircle2, AlertCircle, Printer } from 'lucide-react'
import dayjs from 'dayjs'

export default function ProcessPayrollPage() {
  const qc = useQueryClient()
  const today = dayjs()
  const [month, setMonth] = useState(today.subtract(1, 'month').month() + 1)
  const [year, setYear] = useState(today.subtract(1, 'month').year())
  const [processing, setProcessing] = useState(false)
  const [processError, setProcessError] = useState('')
  const [processResult, setProcessResult] = useState<any>(null)

  const { data: paysheet, isLoading: paysheetLoading } = useQuery({
    queryKey: ['paysheet', month, year],
    queryFn: async () => {
      const { data } = await api.get(`/payroll/paysheet/${month}/${year}`)
      return data.data
    },
  })

  const handleProcess = async () => {
    setProcessError('')
    setProcessing(true)
    try {
      const { data } = await api.post('/payroll/process', { month, year })
      setProcessResult(data.data)
      qc.invalidateQueries({ queryKey: ['paysheet', month, year] })
    } catch (e) {
      setProcessError(extractError(e))
    } finally {
      setProcessing(false)
    }
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  return (
    <div>
      <PageHeader title="Process Payroll"
        subtitle="Generate monthly salary for all active employees"
        breadcrumbs={[{ label: 'Payroll' }, { label: 'Process Payroll' }]}
        actions={
          <div className="flex gap-2 items-end">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Month</label>
              <select value={month} onChange={e => setMonth(Number(e.target.value))}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                {monthNames.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Year</label>
              <input type="number" value={year} onChange={e => setYear(Number(e.target.value))}
                className="h-9 w-24 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <Button onClick={handleProcess} loading={processing} className="mb-0">
              <Play size={15} /> Run Payroll
            </Button>
          </div>
        }
      />

      {processError && (
        <div className="mb-4 flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-md px-4 py-3 text-sm text-destructive">
          <AlertCircle size={15} /> {processError}
        </div>
      )}

      {processResult && (
        <div className="mb-4 flex items-center gap-2 bg-success-muted border border-success/20 rounded-md px-4 py-3 text-sm text-success">
          <CheckCircle2 size={15} /> Payroll processed for {processResult.processed} employees — {monthNames[month - 1]} {year}
        </div>
      )}

      {/* Summary */}
      {paysheet?.totals && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
          {[
            { label: 'Employees', value: paysheet.count },
            { label: 'Gross Pay', value: formatINR(paysheet.totals.grossPay) },
            { label: 'PF (Employer)', value: formatINR(paysheet.totals.pfEmployer) },
            { label: 'ESIC (Employer)', value: formatINR(paysheet.totals.esicEmployer) },
            { label: 'TDS', value: formatINR(paysheet.totals.tds) },
            { label: 'Net Pay', value: formatINR(paysheet.totals.netPay), highlight: true },
          ].map(s => (
            <div key={s.label} className={`stat-card ${s.highlight ? 'border-primary/30' : ''}`}>
              <span className="stat-label">{s.label}</span>
              <span className={`stat-value text-base ${s.highlight ? 'text-primary' : ''}`}>{s.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Paysheet table */}
      {paysheetLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : !paysheet?.salaries?.length ? (
        <EmptyState title="No payroll data" description="Run payroll for this month to generate salary records" />
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold">Paysheet — {monthNames[month - 1]} {year}</h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => window.print()}><Printer size={13} /> Print</Button>
              <Button variant="outline" size="sm"><Download size={13} /> Export Excel</Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Emp Code</th><th>Employee Name</th><th>Department</th>
                  <th className="text-right">Basic</th>
                  <th className="text-right">Gross Pay</th>
                  <th className="text-right">PF Emp</th>
                  <th className="text-right">ESIC Emp</th>
                  <th className="text-right">PT</th>
                  <th className="text-right">TDS</th>
                  <th className="text-right">Net Pay</th>
                  <th>Days</th>
                </tr>
              </thead>
              <tbody>
                {paysheet.salaries.map((s: any) => (
                  <tr key={s.id}>
                    <td className="font-mono text-xs">{s.employee?.empCode}</td>
                    <td className="text-sm font-medium">{s.employee?.name}</td>
                    <td className="text-xs text-muted-foreground">{s.employee?.department?.name || '—'}</td>
                    <td className="amount-col text-sm">{formatINR(s.basic)}</td>
                    <td className="amount-col text-sm font-medium">{formatINR(s.grossPay)}</td>
                    <td className="amount-col text-sm text-muted-foreground">{Number(s.pfEmployee) > 0 ? formatINR(s.pfEmployee) : '—'}</td>
                    <td className="amount-col text-sm text-muted-foreground">{Number(s.esicEmployee) > 0 ? formatINR(s.esicEmployee) : '—'}</td>
                    <td className="amount-col text-sm text-muted-foreground">{Number(s.professionalTax) > 0 ? formatINR(s.professionalTax) : '—'}</td>
                    <td className="amount-col text-sm text-muted-foreground">{Number(s.tds) > 0 ? formatINR(s.tds) : '—'}</td>
                    <td className="amount-col text-sm font-bold text-primary">{formatINR(s.netPay)}</td>
                    <td className="text-center text-xs">{Number(s.presentDays)}/{s.workingDays}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted font-bold">
                  <td colSpan={4} className="px-3 py-2">Total ({paysheet.count} employees)</td>
                  <td className="amount-col px-3 py-2">{formatINR(paysheet.totals.grossPay)}</td>
                  <td className="amount-col px-3 py-2">{formatINR(paysheet.totals.pfEmployee)}</td>
                  <td className="amount-col px-3 py-2">{formatINR(paysheet.totals.esicEmployee)}</td>
                  <td className="amount-col px-3 py-2">{formatINR(paysheet.totals.professionalTax)}</td>
                  <td className="amount-col px-3 py-2">{formatINR(paysheet.totals.tds)}</td>
                  <td className="amount-col px-3 py-2 text-primary">{formatINR(paysheet.totals.netPay)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
