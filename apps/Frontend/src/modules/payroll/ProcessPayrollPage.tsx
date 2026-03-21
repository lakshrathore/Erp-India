import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, extractError } from '../../lib/api'
import { formatINR } from '../../lib/india'
import { Button, Badge, PageHeader, Spinner, EmptyState } from '../../components/ui'
import { Play, Download, CheckCircle2, AlertCircle, Printer, ChevronDown, ChevronRight, Eye } from 'lucide-react'
import dayjs from 'dayjs'
import { cn } from '../../components/ui/utils'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function ProcessPayrollPage() {
  const qc = useQueryClient()
  const today = dayjs()
  const [month, setMonth] = useState(today.subtract(1, 'month').month() + 1)
  const [year, setYear] = useState(today.subtract(1, 'month').year())
  const [processError, setProcessError] = useState('')
  const [processResult, setProcessResult] = useState<any>(null)
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null)

  const { data: paysheet, isLoading: paysheetLoading, refetch } = useQuery({
    queryKey: ['paysheet', month, year],
    queryFn: async () => {
      const { data } = await api.get(`/payroll/paysheet/${month}/${year}`)
      return data.data
    },
  })

  const processMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/payroll/process', { month, year })
      return data.data
    },
    onSuccess: (result) => {
      setProcessResult(result)
      setProcessError('')
      qc.invalidateQueries({ queryKey: ['paysheet', month, year] })
      refetch()
    },
    onError: (e) => setProcessError(extractError(e)),
  })

  const exportCSV = () => {
    if (!paysheet?.salaries?.length) return
    const headers = ['Emp Code', 'Name', 'Department', 'Basic', 'HRA', 'Allowances', 'Gross Pay', 'PF (Emp)', 'PF (Employer)', 'ESIC (Emp)', 'ESIC (Employer)', 'Prof Tax', 'TDS', 'Loan EMI', 'Net Pay', 'Present Days', 'Working Days', 'LOP Days']
    const rows = paysheet.salaries.map((s: any) => [
      s.employee?.empCode, s.employee?.name,
      s.employee?.department?.name || '',
      s.basic, s.hra, s.specialAllowance,
      s.grossPay, s.pfEmployee, s.pfEmployer,
      s.esicEmployee, s.esicEmployer,
      s.professionalTax, s.tds, s.loanDeduction,
      s.netPay, s.presentDays, s.workingDays, s.lopDays,
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `Payroll_${MONTH_NAMES[month - 1]}_${year}.csv`; a.click()
  }

  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`

  return (
    <div>
      <PageHeader
        title="Process Payroll"
        subtitle={`Generate salary for ${monthLabel}`}
        breadcrumbs={[{ label: 'Payroll' }, { label: 'Process Payroll' }]}
        actions={
          <div className="flex gap-2 items-end">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Month</label>
              <select value={month} onChange={e => setMonth(Number(e.target.value))}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Year</label>
              <input type="number" value={year} onChange={e => setYear(Number(e.target.value))}
                className="h-9 w-24 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <Button onClick={() => processMutation.mutate()} loading={processMutation.isPending}>
              <Play size={15} /> Run Payroll
            </Button>
          </div>
        }
      />

      {processError && (
        <div className="mb-4 flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 text-sm text-destructive">
          <AlertCircle size={15} /> {processError}
        </div>
      )}

      {processResult && (
        <div className="mb-4 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
          <CheckCircle2 size={15} className="text-green-600" />
          Payroll processed for <strong>{processResult.processed}</strong> employees for {monthLabel}
          &nbsp;· Net Pay: <strong>{formatINR(processResult.summary?.totalNetPay || 0)}</strong>
        </div>
      )}

      {/* Summary */}
      {paysheet?.totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-4">
          {[
            { label: 'Employees', value: paysheet.count, mono: false },
            { label: 'Gross Pay', value: formatINR(paysheet.totals.grossPay), color: '' },
            { label: 'PF (Emp)', value: formatINR(paysheet.totals.pfEmployee) },
            { label: 'PF (Employer)', value: formatINR(paysheet.totals.pfEmployer) },
            { label: 'ESIC (Emp)', value: formatINR(paysheet.totals.esicEmployee) },
            { label: 'ESIC (Employer)', value: formatINR(paysheet.totals.esicEmployer) },
            { label: 'TDS', value: formatINR(paysheet.totals.tds) },
            { label: 'Net Pay', value: formatINR(paysheet.totals.netPay), highlight: true },
          ].map(s => (
            <div key={s.label} className={cn('stat-card', s.highlight && 'border-primary/30 bg-primary/5')}>
              <span className="stat-label">{s.label}</span>
              <span className={cn('stat-value text-sm font-mono', s.highlight && 'text-primary')}>{s.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* CTC breakdown */}
      {paysheet?.totals && (
        <div className="grid grid-cols-3 gap-3 mb-4 text-sm">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-green-800 uppercase tracking-wide mb-2">Total Earnings</p>
            <p className="font-mono font-bold text-green-800 text-lg">{formatINR(paysheet.totals.grossPay)}</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-red-800 uppercase tracking-wide mb-2">Total Deductions</p>
            <p className="font-mono font-bold text-red-800 text-lg">
              {formatINR(
                paysheet.totals.pfEmployee + paysheet.totals.esicEmployee +
                paysheet.totals.professionalTax + paysheet.totals.tds
              )}
            </p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide mb-2">Total CTC (with Employer)</p>
            <p className="font-mono font-bold text-blue-800 text-lg">{formatINR(paysheet.totals.totalCtc)}</p>
          </div>
        </div>
      )}

      {/* Paysheet table */}
      {paysheetLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : !paysheet?.salaries?.length ? (
        <EmptyState
          title="No payroll data"
          description={`No salary records for ${monthLabel}. Click "Run Payroll" to process.`}
          action={
            <Button onClick={() => processMutation.mutate()} loading={processMutation.isPending}>
              <Play size={15} /> Run Payroll for {monthLabel}
            </Button>
          }
        />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold">Paysheet — {monthLabel} ({paysheet.count} employees)</h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => window.print()}><Printer size={13} /> Print</Button>
              <Button variant="outline" size="sm" onClick={exportCSV}><Download size={13} /> CSV</Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th className="w-8"></th>
                  <th>Emp Code</th>
                  <th>Name</th>
                  <th>Dept</th>
                  <th className="text-right">Basic</th>
                  <th className="text-right">HRA</th>
                  <th className="text-right">Gross</th>
                  <th className="text-right">PF(E)</th>
                  <th className="text-right">ESIC(E)</th>
                  <th className="text-right">PT</th>
                  <th className="text-right">TDS</th>
                  <th className="text-right text-primary">Net Pay</th>
                  <th>Days</th>
                </tr>
              </thead>
              <tbody>
                {paysheet.salaries.map((s: any) => (
                  <>
                    <tr key={s.id}
                      className="cursor-pointer hover:bg-muted/20"
                      onClick={() => setExpandedEmp(expandedEmp === s.id ? null : s.id)}>
                      <td className="px-2">
                        {expandedEmp === s.id
                          ? <ChevronDown size={13} className="text-primary" />
                          : <ChevronRight size={13} className="text-muted-foreground" />}
                      </td>
                      <td className="font-mono text-xs">{s.employee?.empCode}</td>
                      <td className="text-sm font-medium">{s.employee?.name}</td>
                      <td className="text-xs text-muted-foreground">{s.employee?.department?.name || '—'}</td>
                      <td className="amount-col text-sm">{formatINR(s.basic)}</td>
                      <td className="amount-col text-sm">{formatINR(s.hra)}</td>
                      <td className="amount-col text-sm font-medium">{formatINR(s.grossPay)}</td>
                      <td className="amount-col text-sm text-muted-foreground">{Number(s.pfEmployee) > 0 ? formatINR(s.pfEmployee) : '—'}</td>
                      <td className="amount-col text-sm text-muted-foreground">{Number(s.esicEmployee) > 0 ? formatINR(s.esicEmployee) : '—'}</td>
                      <td className="amount-col text-sm text-muted-foreground">{Number(s.professionalTax) > 0 ? formatINR(s.professionalTax) : '—'}</td>
                      <td className="amount-col text-sm text-muted-foreground">{Number(s.tds) > 0 ? formatINR(s.tds) : '—'}</td>
                      <td className="amount-col text-sm font-bold text-primary">{formatINR(s.netPay)}</td>
                      <td className="text-center text-xs">
                        <span className={cn('font-medium', s.lopDays > 0 ? 'text-destructive' : '')}>
                          {Number(s.presentDays)}/{s.workingDays}
                        </span>
                        {s.lopDays > 0 && <div className="text-[10px] text-destructive">LOP: {s.lopDays}d</div>}
                      </td>
                    </tr>
                    {/* Expanded detail */}
                    {expandedEmp === s.id && (
                      <tr key={`${s.id}-detail`}>
                        <td colSpan={13} className="px-4 py-0 bg-muted/20">
                          <div className="py-3 grid grid-cols-2 gap-4">
                            {/* Earnings */}
                            <div>
                              <p className="text-xs font-semibold text-green-800 uppercase tracking-wide mb-2">Earnings</p>
                              <div className="space-y-1">
                                {(s.earnings || []).map((e: any) => (
                                  <div key={e.name} className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">{e.name}</span>
                                    <span className="font-mono">{formatINR(e.amount)}</span>
                                  </div>
                                ))}
                                <div className="flex justify-between text-sm font-bold border-t border-border pt-1 mt-1">
                                  <span className="text-green-800">Gross Pay</span>
                                  <span className="font-mono text-green-800">{formatINR(s.grossPay)}</span>
                                </div>
                              </div>
                            </div>
                            {/* Deductions */}
                            <div>
                              <p className="text-xs font-semibold text-red-800 uppercase tracking-wide mb-2">Deductions</p>
                              <div className="space-y-1">
                                {(s.deductions || []).map((d: any) => (
                                  <div key={d.name} className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">{d.name}</span>
                                    <span className="font-mono text-destructive">{formatINR(d.amount)}</span>
                                  </div>
                                ))}
                                {Number(s.pfEmployee) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">PF (Employee 12%)</span>
                                    <span className="font-mono text-destructive">{formatINR(s.pfEmployee)}</span>
                                  </div>
                                )}
                                {Number(s.esicEmployee) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">ESIC (Employee 0.75%)</span>
                                    <span className="font-mono text-destructive">{formatINR(s.esicEmployee)}</span>
                                  </div>
                                )}
                                {Number(s.professionalTax) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Professional Tax</span>
                                    <span className="font-mono text-destructive">{formatINR(s.professionalTax)}</span>
                                  </div>
                                )}
                                {Number(s.tds) > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">TDS (Income Tax)</span>
                                    <span className="font-mono text-destructive">{formatINR(s.tds)}</span>
                                  </div>
                                )}
                                <div className="flex justify-between text-sm font-bold border-t border-border pt-1 mt-1">
                                  <span className="text-primary">Net Pay</span>
                                  <span className="font-mono text-primary">{formatINR(s.netPay)}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted font-bold border-t-2 border-border">
                  <td colSpan={4} className="px-3 py-2.5 text-sm">Total ({paysheet.count} employees)</td>
                  <td className="amount-col px-3 py-2.5">{formatINR(paysheet.totals.grossPay * 0.4)}</td>
                  <td className="amount-col px-3 py-2.5">—</td>
                  <td className="amount-col px-3 py-2.5">{formatINR(paysheet.totals.grossPay)}</td>
                  <td className="amount-col px-3 py-2.5">{formatINR(paysheet.totals.pfEmployee)}</td>
                  <td className="amount-col px-3 py-2.5">{formatINR(paysheet.totals.esicEmployee)}</td>
                  <td className="amount-col px-3 py-2.5">{formatINR(paysheet.totals.professionalTax)}</td>
                  <td className="amount-col px-3 py-2.5">{formatINR(paysheet.totals.tds)}</td>
                  <td className="amount-col px-3 py-2.5 text-primary">{formatINR(paysheet.totals.netPay)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Employer cost footer */}
          <div className="px-4 py-3 border-t border-border bg-muted/20 flex flex-wrap gap-6 text-xs text-muted-foreground">
            <span>Employer PF: <strong className="text-foreground">{formatINR(paysheet.totals.pfEmployer)}</strong></span>
            <span>Employer ESIC: <strong className="text-foreground">{formatINR(paysheet.totals.esicEmployer)}</strong></span>
            <span>Total CTC: <strong className="text-foreground">{formatINR(paysheet.totals.totalCtc)}</strong></span>
          </div>
        </div>
      )}
    </div>
  )
}
