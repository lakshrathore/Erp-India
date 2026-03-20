import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatINR, formatDate, amountInWords } from '../../lib/india'
import { Button, Select, PageHeader, Spinner, EmptyState, Badge } from '../../components/ui'
import { Printer, Download, FileText } from 'lucide-react'
import dayjs from 'dayjs'

export default function Form16Page() {
  const [empId, setEmpId] = useState('')
  const [fy, setFY] = useState('2025-26')

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-form16'],
    queryFn: async () => {
      const { data } = await api.get('/payroll/employees', { params: { status: 'ACTIVE', limit: 200 } })
      return data.data
    },
    enabled: !!JSON.parse(localStorage.getItem('erp-auth') || '{}')?.state?.activeCompany?.companyId,
  })

  // Get all 12 months salary for this employee + FY
  const startYear = 2000 + parseInt(fy.split('-')[0])
  const months = [
    { month: 4, year: startYear }, { month: 5, year: startYear },
    { month: 6, year: startYear }, { month: 7, year: startYear },
    { month: 8, year: startYear }, { month: 9, year: startYear },
    { month: 10, year: startYear }, { month: 11, year: startYear },
    { month: 12, year: startYear },
    { month: 1, year: startYear + 1 }, { month: 2, year: startYear + 1 },
    { month: 3, year: startYear + 1 },
  ]
  const MONTHS_LABEL = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  const { data: salaryData, isLoading } = useQuery({
    queryKey: ['form16-salary', empId, fy],
    queryFn: async () => {
      const results = await Promise.all(
        months.map(async ({ month, year }) => {
          try {
            const { data } = await api.get(`/payroll/payslip/${empId}/${month}/${year}`)
            return data.data
          } catch { return null }
        })
      )
      return results.filter(Boolean)
    },
    enabled: !!empId,
  })

  const empOptions = [
    { value: '', label: 'Select employee...' },
    ...(employees as any[]).map((e: any) => ({ value: e.id, label: `${e.empCode} — ${e.name}` })),
  ]

  const selectedEmp = (employees as any[]).find((e: any) => e.id === empId)
  const salaries: any[] = salaryData || []

  // Aggregate annual figures
  const annual = salaries.reduce((s, sal) => ({
    grossPay: s.grossPay + Number(sal.salary.grossPay),
    basic: s.basic + Number(sal.salary.basic),
    hra: s.hra + Number(sal.salary.hra),
    pfEmployee: s.pfEmployee + Number(sal.salary.pfEmployee),
    professionalTax: s.professionalTax + Number(sal.salary.professionalTax),
    tds: s.tds + Number(sal.salary.tds),
    netPay: s.netPay + Number(sal.salary.netPay),
  }), { grossPay: 0, basic: 0, hra: 0, pfEmployee: 0, professionalTax: 0, tds: 0, netPay: 0 })

  // Standard deductions (new regime FY 2025-26)
  const standardDeduction = 75000
  const pfDeduction = annual.pfEmployee
  const totalDeductions = standardDeduction + pfDeduction + annual.professionalTax
  const taxableIncome = Math.max(0, annual.grossPay - totalDeductions)

  // Tax computation (New Regime FY 2025-26)
  let taxBeforeRebate = 0
  if (taxableIncome > 1500000) taxBeforeRebate = (taxableIncome - 1500000) * 0.30 + 187500
  else if (taxableIncome > 1200000) taxBeforeRebate = (taxableIncome - 1200000) * 0.20 + 127500
  else if (taxableIncome > 900000) taxBeforeRebate = (taxableIncome - 900000) * 0.15 + 82500
  else if (taxableIncome > 600000) taxBeforeRebate = (taxableIncome - 600000) * 0.10 + 52500
  else if (taxableIncome > 300000) taxBeforeRebate = (taxableIncome - 300000) * 0.05
  const rebate87A = taxableIncome <= 700000 ? taxBeforeRebate : 0
  const taxAfterRebate = Math.max(0, taxBeforeRebate - rebate87A)
  const surcharge = taxableIncome > 5000000 ? taxAfterRebate * 0.10 : 0
  const healthEduCess = (taxAfterRebate + surcharge) * 0.04
  const totalTax = Math.round(taxAfterRebate + surcharge + healthEduCess)

  return (
    <div>
      <PageHeader title="Form 16"
        subtitle="Annual TDS certificate — Part A & Part B"
        breadcrumbs={[{ label: 'Payroll' }, { label: 'Form 16' }]}
        actions={
          <div className="flex gap-2 items-end">
            <Select options={empOptions} value={empId} onChange={e => setEmpId(e.target.value)} className="w-72" />
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Financial Year</label>
              <input value={fy} onChange={e => setFY(e.target.value)} placeholder="2025-26"
                className="h-9 w-24 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            {empId && salaries.length > 0 && (
              <Button variant="outline" onClick={() => window.print()} className="mb-0">
                <Printer size={14} /> Print Form 16
              </Button>
            )}
          </div>
        }
      />

      {!empId ? (
        <EmptyState icon={<FileText size={40} />} title="Select employee"
          description="Choose an employee to generate Form 16 for the selected financial year" />
      ) : isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : salaries.length === 0 ? (
        <EmptyState title="No salary data" description={`No processed payroll found for FY ${fy}. Run payroll for all months first.`} />
      ) : (
        <div id="form16-doc" className="space-y-4 max-w-4xl">

          {/* PART A */}
          <div className="bg-white border-2 border-gray-800 rounded-lg overflow-hidden print-full">
            <div className="bg-gray-800 text-white px-6 py-3">
              <h2 className="text-base font-bold text-center">FORM NO. 16</h2>
              <p className="text-xs text-center text-gray-300">[See rule 31(1)(a)]</p>
              <p className="text-sm text-center mt-1">PART A — Certificate under section 203 of the Income-tax Act, 1961</p>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-2 gap-6 mb-4">
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Employer Details</h3>
                  <table className="w-full text-sm">
                    <tbody>
                      {[
                        ['Name of Employer', '[COMPANY NAME]'],
                        ['Address', '[COMPANY ADDRESS]'],
                        ['TAN', '[TAN NUMBER]'],
                        ['PAN of Employer', '[PAN NUMBER]'],
                      ].map(([k, v]) => (
                        <tr key={k} className="border-b border-gray-100">
                          <td className="py-1.5 text-gray-500 pr-4 text-xs">{k}</td>
                          <td className="py-1.5 font-medium">{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Employee Details</h3>
                  <table className="w-full text-sm">
                    <tbody>
                      {[
                        ['Name of Employee', selectedEmp?.name || '—'],
                        ['PAN of Employee', selectedEmp?.pan || 'Not furnished'],
                        ['Assessment Year', `${parseInt(fy.split('-')[0]) + 2001}-${parseInt(fy.split('-')[1]) + 2001}`],
                        ['Period of Employment', `01-04-${startYear} to 31-03-${startYear + 1}`],
                      ].map(([k, v]) => (
                        <tr key={k} className="border-b border-gray-100">
                          <td className="py-1.5 text-gray-500 pr-4 text-xs">{k}</td>
                          <td className="py-1.5 font-medium">{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* TDS Summary Table */}
              <h3 className="text-xs font-bold text-gray-500 uppercase mb-2 border-t pt-4">Details of Tax Deducted and Deposited</h3>
              <table className="w-full text-xs border border-gray-300">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-3 py-2 text-left">Quarter</th>
                    <th className="border border-gray-300 px-3 py-2 text-right">Tax Deducted</th>
                    <th className="border border-gray-300 px-3 py-2 text-right">Tax Deposited</th>
                    <th className="border border-gray-300 px-3 py-2 text-center">Challan No</th>
                  </tr>
                </thead>
                <tbody>
                  {['Q1 (Apr-Jun)', 'Q2 (Jul-Sep)', 'Q3 (Oct-Dec)', 'Q4 (Jan-Mar)'].map((q, qi) => {
                    const qMonths = [[4,5,6],[7,8,9],[10,11,12],[1,2,3]][qi]
                    const qTDS = salaries
                      .filter(s => qMonths.includes(s.salary.month))
                      .reduce((sum, s) => sum + Number(s.salary.tds), 0)
                    return (
                      <tr key={q}>
                        <td className="border border-gray-300 px-3 py-2">{q}</td>
                        <td className="border border-gray-300 px-3 py-2 text-right font-mono">{formatINR(qTDS)}</td>
                        <td className="border border-gray-300 px-3 py-2 text-right font-mono">{formatINR(qTDS)}</td>
                        <td className="border border-gray-300 px-3 py-2 text-center text-gray-400">—</td>
                      </tr>
                    )
                  })}
                  <tr className="bg-gray-50 font-bold">
                    <td className="border border-gray-300 px-3 py-2">Total</td>
                    <td className="border border-gray-300 px-3 py-2 text-right font-mono">{formatINR(annual.tds)}</td>
                    <td className="border border-gray-300 px-3 py-2 text-right font-mono">{formatINR(annual.tds)}</td>
                    <td className="border border-gray-300 px-3 py-2" />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* PART B */}
          <div className="bg-white border-2 border-gray-800 rounded-lg overflow-hidden print-full">
            <div className="bg-gray-800 text-white px-6 py-3">
              <p className="text-sm text-center font-bold">PART B — Details of Salary Paid and Tax Deducted</p>
              <p className="text-xs text-center text-gray-300">Financial Year {fy} | Assessment Year {startYear + 1}-{startYear + 2}</p>
            </div>

            <div className="p-6 space-y-4">
              {/* Monthly breakdown */}
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Month-wise Salary Summary</h3>
                <table className="w-full text-xs border border-gray-300">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-300 px-2 py-2">Month</th>
                      <th className="border border-gray-300 px-2 py-2 text-right">Gross</th>
                      <th className="border border-gray-300 px-2 py-2 text-right">PF</th>
                      <th className="border border-gray-300 px-2 py-2 text-right">PT</th>
                      <th className="border border-gray-300 px-2 py-2 text-right">TDS</th>
                      <th className="border border-gray-300 px-2 py-2 text-right">Net Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salaries.map((sal, i) => (
                      <tr key={i}>
                        <td className="border border-gray-300 px-2 py-1.5">{MONTHS_LABEL[sal.salary.month]} {sal.salary.year}</td>
                        <td className="border border-gray-300 px-2 py-1.5 text-right font-mono">{formatINR(sal.salary.grossPay)}</td>
                        <td className="border border-gray-300 px-2 py-1.5 text-right font-mono">{formatINR(sal.salary.pfEmployee)}</td>
                        <td className="border border-gray-300 px-2 py-1.5 text-right font-mono">{formatINR(sal.salary.professionalTax)}</td>
                        <td className="border border-gray-300 px-2 py-1.5 text-right font-mono">{formatINR(sal.salary.tds)}</td>
                        <td className="border border-gray-300 px-2 py-1.5 text-right font-mono">{formatINR(sal.salary.netPay)}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-bold">
                      <td className="border border-gray-300 px-2 py-2">Total</td>
                      <td className="border border-gray-300 px-2 py-2 text-right font-mono">{formatINR(annual.grossPay)}</td>
                      <td className="border border-gray-300 px-2 py-2 text-right font-mono">{formatINR(annual.pfEmployee)}</td>
                      <td className="border border-gray-300 px-2 py-2 text-right font-mono">{formatINR(annual.professionalTax)}</td>
                      <td className="border border-gray-300 px-2 py-2 text-right font-mono">{formatINR(annual.tds)}</td>
                      <td className="border border-gray-300 px-2 py-2 text-right font-mono">{formatINR(annual.netPay)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Tax computation */}
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Computation of Income Tax (New Regime)</h3>
                <table className="w-full text-sm">
                  <tbody>
                    {[
                      ['Gross Salary', formatINR(annual.grossPay), false],
                      ['Less: Standard Deduction u/s 16(ia)', `(${formatINR(standardDeduction)})`, false],
                      ['Less: Professional Tax u/s 16(iii)', `(${formatINR(annual.professionalTax)})`, false],
                      ['Less: PF Employee Contribution u/s 80C', `(${formatINR(pfDeduction)})`, false],
                      ['Net Taxable Income', formatINR(taxableIncome), true],
                      ['Tax on Total Income (New Regime)', formatINR(taxBeforeRebate), false],
                      ['Less: Rebate u/s 87A', rebate87A > 0 ? `(${formatINR(rebate87A)})` : '—', false],
                      ['Health & Education Cess @ 4%', formatINR(healthEduCess), false],
                      ['Total Tax Payable', formatINR(totalTax), true],
                      ['Tax Deducted at Source', formatINR(annual.tds), false],
                      ['Balance Tax Payable / (Refund)', formatINR(totalTax - annual.tds), true],
                    ].map(([label, value, bold]) => (
                      <tr key={String(label)} className={`border-b border-gray-100 ${bold ? 'bg-gray-50' : ''}`}>
                        <td className={`py-2 pr-4 text-sm ${bold ? 'font-bold' : 'text-gray-600'}`}>{label}</td>
                        <td className={`py-2 text-right font-mono text-sm ${bold ? 'font-bold' : ''}`}>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Amount in words */}
              <div className="bg-gray-50 rounded px-4 py-3 text-sm">
                <span className="text-gray-500">Total TDS Deducted (in words): </span>
                <span className="font-medium italic">{amountInWords(annual.tds)}</span>
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-2 gap-8 pt-6 border-t border-gray-200">
                <div className="text-center">
                  <div className="border-t border-gray-400 pt-2 mt-12">
                    <p className="text-sm font-medium">[Employer Signature]</p>
                    <p className="text-xs text-gray-500">Authorised Signatory</p>
                    <p className="text-xs text-gray-500">Date: {formatDate(new Date())}</p>
                  </div>
                </div>
                <div className="text-center">
                  <div className="border-t border-gray-400 pt-2 mt-12">
                    <p className="text-sm font-medium">[Stamp & Seal]</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          #form16-doc { max-width: 100% !important; }
          body { background: white !important; padding: 0 !important; }
        }
      `}</style>
    </div>
  )
}
