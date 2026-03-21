import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatINR, formatDate, amountInWords } from '../../lib/india'
import { Button, Badge, PageHeader, Spinner, Select, EmptyState } from '../../components/ui'
import { Printer, Download } from 'lucide-react'
import dayjs from 'dayjs'
import { useAuthStore } from '../../stores/auth.store'

export default function PayslipsPage() {
  const today = dayjs()
  const [empId, setEmpId] = useState('')
  const [month, setMonth] = useState(today.subtract(1, 'month').month() + 1)
  const [year, setYear] = useState(today.subtract(1, 'month').year())

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-list'],
    queryFn: async () => { const { data } = await api.get('/payroll/employees', { params: { limit: 200 } }); return data.data },
  })

  const { data, isLoading } = useQuery({
    queryKey: ['payslip', empId, month, year],
    queryFn: async () => {
      const { data } = await api.get(`/payroll/payslip/${empId}/${month}/${year}`)
      return data.data
    },
    enabled: !!empId,
  })

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const empOptions = [{ value: '', label: 'Select employee...' }, ...(employees as any[]).map((e: any) => ({ value: e.id, label: `${e.empCode} — ${e.name}` }))]

  return (
    <div>
      <PageHeader title="Payslips"
        breadcrumbs={[{ label: 'Payroll' }, { label: 'Payslips' }]}
        actions={data && (
          <Button variant="outline" onClick={() => window.print()}><Printer size={14} /> Print Payslip</Button>
        )}
      />

      <div className="flex gap-3 mb-6 items-end flex-wrap no-print">
        <Select options={empOptions} value={empId} onChange={e => setEmpId(e.target.value)} className="w-72" />
        <select value={month} onChange={e => setMonth(Number(e.target.value))}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <input type="number" value={year} onChange={e => setYear(Number(e.target.value))}
          className="h-9 w-24 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>

      {!empId ? (
        <EmptyState title="Select employee" description="Choose an employee to view their payslip" />
      ) : isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : !data ? (
        <EmptyState title="No payslip found" description="Payroll not processed for this month. Run payroll first." />
      ) : (
        <PayslipDocumentWrapped salary={data.salary} employee={data.employee} month={month} year={year} />
      )}
    </div>
  )
}

function PayslipDocumentWrapped({ salary, employee, month, year }: { salary: any; employee: any; month: number; year: number }) {
  const { activeCompany } = useAuthStore()
  return <PayslipDocument salary={salary} employee={employee} month={month} year={year} companyName={activeCompany?.companyName || ''} />
}

function PayslipDocument({ salary, employee, month, year, companyName }: { salary: any; employee: any; month: number; year: number; companyName?: string }) {
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const earnings = salary.earnings as { name: string; amount: number }[]
  const deductions = salary.deductions as { name: string; amount: number }[]

  return (
    <div className="bg-white border border-border rounded-lg overflow-hidden max-w-3xl print-full" id="payslip">
      {/* Header */}
      <div className="bg-primary px-6 py-4 text-white">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="font-display text-lg font-semibold">Salary Slip</h2>
            <p className="text-primary-foreground/70 text-sm">{MONTHS[month - 1]} {year}</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold">{companyName || "Your Company"}</p>
            
          </div>
        </div>
      </div>

      {/* Employee details */}
      <div className="px-6 py-4 border-b border-border bg-muted/20">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          {[
            { label: 'Employee Code', value: employee.empCode },
            { label: 'Employee Name', value: employee.name },
            { label: 'Department', value: employee.department?.name || '—' },
            { label: 'Designation', value: employee.designation?.name || '—' },
            { label: 'Date of Joining', value: formatDate(employee.doj) },
            { label: 'PAN', value: employee.pan || '—' },
            { label: 'UAN (PF)', value: employee.uan || '—' },
            { label: 'Bank Account', value: employee.accountNumber ? `${employee.bankName} - ${employee.accountNumber}` : '—' },
          ].map(f => (
            <div key={f.label}>
              <p className="text-xs text-muted-foreground">{f.label}</p>
              <p className="font-medium">{f.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Attendance summary */}
      <div className="px-6 py-3 border-b border-border flex gap-8 text-sm">
        {[
          { label: 'Working Days', value: salary.workingDays },
          { label: 'Present Days', value: Number(salary.presentDays) },
          { label: 'LOP Days', value: Number(salary.lopDays) },
        ].map(a => (
          <div key={a.label} className="flex items-center gap-2">
            <span className="text-muted-foreground">{a.label}:</span>
            <span className={`font-medium ${a.label === 'LOP Days' && a.value > 0 ? 'text-destructive' : ''}`}>{a.value}</span>
          </div>
        ))}
      </div>

      {/* Earnings & Deductions */}
      <div className="grid grid-cols-2 divide-x divide-border">
        {/* Earnings */}
        <div className="p-5">
          <h4 className="font-semibold text-sm mb-3 text-success">Earnings</h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-1.5 text-xs text-muted-foreground font-medium">Component</th>
                <th className="text-right py-1.5 text-xs text-muted-foreground font-medium">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {earnings.map((e, i) => (
                <tr key={i} className="border-b border-border/30">
                  <td className="py-1.5">{e.name}</td>
                  <td className="py-1.5 text-right font-mono">{formatINR(e.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold">
                <td className="py-2">Gross Earnings</td>
                <td className="py-2 text-right font-mono text-success">{formatINR(salary.grossPay)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Deductions */}
        <div className="p-5">
          <h4 className="font-semibold text-sm mb-3 text-destructive">Deductions</h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-1.5 text-xs text-muted-foreground font-medium">Component</th>
                <th className="text-right py-1.5 text-xs text-muted-foreground font-medium">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {deductions.map((d, i) => (
                <tr key={i} className="border-b border-border/30">
                  <td className="py-1.5">{d.name}</td>
                  <td className="py-1.5 text-right font-mono">{formatINR(d.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold">
                <td className="py-2">Total Deductions</td>
                <td className="py-2 text-right font-mono text-destructive">{formatINR(salary.totalDeductions)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Net Pay */}
      <div className="px-6 py-4 bg-primary/5 border-t-2 border-primary/20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Net Pay</p>
            <p className="text-2xl font-display font-bold text-primary">{formatINR(salary.netPay)}</p>
            <p className="text-xs text-muted-foreground italic mt-1">{amountInWords(Number(salary.netPay))}</p>
          </div>
          <div className="text-right text-sm space-y-1">
            <div className="flex items-center gap-2 justify-end">
              <span className="text-muted-foreground">PF (Employer):</span>
              <span className="font-mono">{formatINR(salary.pfEmployer)}</span>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <span className="text-muted-foreground">ESIC (Employer):</span>
              <span className="font-mono">{formatINR(salary.esicEmployer)}</span>
            </div>
            <div className="flex items-center gap-2 justify-end font-medium">
              <span className="text-muted-foreground">Total CTC:</span>
              <span className="font-mono">{formatINR(salary.totalCtc)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-border text-xs text-muted-foreground flex justify-between">
        <span>Generated on {formatDate(new Date())}</span>
        <span>This is a computer-generated payslip and does not require signature.</span>
      </div>
    </div>
  )
}
