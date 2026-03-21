import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { authenticate, withCompany } from '../../middleware/auth'
import { sendSuccess, sendPaginated, NotFoundError, BadRequestError } from '../../utils/response'
import { getPagination, calculatePT } from '../../utils/india'

export const payrollRouter = Router()
payrollRouter.use(authenticate, withCompany)

// ─── Salary Computer ──────────────────────────────────────────────────────────
interface SalaryComponent {
  name: string; type: 'EARNING' | 'DEDUCTION'
  calcType: 'FIXED' | 'PERCENTAGE'; value: number
  onComponent?: string; taxExempt?: boolean; statutory?: boolean
}

function computeSalary(components: SalaryComponent[], ctc: number, lopDays: number, workingDays: number, state = 'RJ') {
  const earnings: Record<string, number> = {}
  const deductions: Record<string, number> = {}
  const lopFactor = workingDays > 0 ? Math.max(0, (workingDays - lopDays) / workingDays) : 1
  for (const c of components.filter(c => c.type === 'EARNING')) {
    if (c.calcType === 'FIXED') earnings[c.name] = c.value * lopFactor
    else if (c.calcType === 'PERCENTAGE' && !c.onComponent) earnings[c.name] = ((ctc / 12) * c.value) / 100 * lopFactor
  }
  for (const c of components.filter(c => c.type === 'EARNING' && c.calcType === 'PERCENTAGE' && c.onComponent))
    earnings[c.name] = ((earnings[c.onComponent!] || 0) * c.value) / 100
  const grossPay = Object.values(earnings).reduce((s, v) => s + v, 0)
  const basic = earnings['Basic'] || earnings['basic'] || 0
  const pfBasic = Math.min(basic, 15000)
  const pfEmployee = Math.round(pfBasic * 0.12), pfEmployer = Math.round(pfBasic * 0.12)
  const esicApplicable = grossPay <= 21000
  const esicEmployee = esicApplicable ? Math.round(grossPay * 0.0075) : 0
  const esicEmployer = esicApplicable ? Math.round(grossPay * 0.0325) : 0
  const professionalTax = calculatePT(grossPay, state)
  const annualTaxable = grossPay * 12
  let annualTDS = 0
  if (annualTaxable > 1500000) annualTDS = (annualTaxable - 1500000) * 0.30 + 187500
  else if (annualTaxable > 1200000) annualTDS = (annualTaxable - 1200000) * 0.20 + 127500
  else if (annualTaxable > 900000) annualTDS = (annualTaxable - 900000) * 0.15 + 82500
  else if (annualTaxable > 600000) annualTDS = (annualTaxable - 600000) * 0.10 + 52500
  else if (annualTaxable > 300000) annualTDS = (annualTaxable - 300000) * 0.05
  if (annualTaxable <= 700000) annualTDS = 0
  const monthlyTDS = Math.round(annualTDS / 12)
  for (const c of components.filter(c => c.type === 'DEDUCTION' && !c.statutory)) {
    deductions[c.name] = c.calcType === 'FIXED' ? c.value : (grossPay * c.value) / 100
  }
  deductions['PF Employee'] = pfEmployee
  deductions['ESIC Employee'] = esicEmployee
  deductions['Professional Tax'] = professionalTax
  deductions['TDS'] = monthlyTDS
  const totalDeductions = Object.values(deductions).reduce((s, v) => s + v, 0)
  return {
    earnings, deductions,
    grossPay: Math.round(grossPay), basic: Math.round(basic),
    hra: Math.round(earnings['HRA'] || earnings['hra'] || 0),
    pfEmployee, pfEmployer, esicEmployee, esicEmployer,
    professionalTax, tds: monthlyTDS,
    totalDeductions: Math.round(totalDeductions),
    netPay: Math.round(grossPay - totalDeductions),
    totalCtc: Math.round(grossPay + pfEmployer + esicEmployer),
  }
}

// ─── EMPLOYEES ────────────────────────────────────────────────────────────────
const empSchema = z.object({
  empCode: z.string().optional(), name: z.string().min(2),
  fatherName: z.string().optional(), dob: z.string().optional(),
  gender: z.enum(['M','F','O']).optional(),
  doj: z.string(), dol: z.string().optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(),
  designationId: z.string().uuid().optional().nullable(),
  salaryStructureId: z.string().uuid().optional().nullable(),
  employmentType: z.string().default('FULL_TIME'),
  status: z.string().optional(),
  taxRegime: z.enum(['OLD','NEW']).default('NEW'),
  phone: z.string().optional(), email: z.string().optional(),
  pan: z.string().optional(), aadhaar: z.string().optional(),
  uan: z.string().optional(), esicNo: z.string().optional(), ptState: z.string().optional(),
  bankName: z.string().optional(), accountNumber: z.string().optional(),
  ifscCode: z.string().optional(), bankBranch: z.string().optional(),
  presentAddress: z.string().optional(), permanentAddress: z.string().optional(),
  ctc: z.coerce.number().optional(), basicSalary: z.coerce.number().optional(),
})

payrollRouter.get('/employees', async (req: Request, res: Response) => {
  const { page, limit, skip } = getPagination(req.query)
  const { search, status = 'ACTIVE', departmentId } = req.query
  const where: any = { companyId: req.companyId }
  if (status) where.status = status
  if (departmentId) where.departmentId = departmentId
  if (search) where.OR = [{ name: { contains: String(search), mode: 'insensitive' } }, { empCode: { contains: String(search), mode: 'insensitive' } }, { pan: { contains: String(search), mode: 'insensitive' } }]
  const [employees, total] = await Promise.all([
    prisma.employee.findMany({ where, skip, take: limit, include: { department: { select: { name: true } }, designation: { select: { name: true } }, salaryStructure: { select: { name: true } } }, orderBy: { name: 'asc' } }),
    prisma.employee.count({ where }),
  ])
  sendPaginated(res, employees, total, page, limit)
})

payrollRouter.post('/employees', async (req: Request, res: Response) => {
  const body = empSchema.safeParse(req.body)
  if (!body.success) throw new BadRequestError(body.error.errors.map(e => e.message).join(', '))
  let empCode = body.data.empCode
  if (!empCode) { const count = await prisma.employee.count({ where: { companyId: req.companyId } }); empCode = `EMP${String(count + 1).padStart(4, '0')}` }
  const employee = await prisma.employee.create({ data: { ...body.data, empCode, companyId: req.companyId, doj: new Date(body.data.doj), dol: body.data.dol ? new Date(body.data.dol) : null, dob: body.data.dob ? new Date(body.data.dob) : null } })
  sendSuccess(res, employee, 'Employee created', 201)
})

payrollRouter.get('/employees/:id', async (req: Request, res: Response) => {
  const emp = await prisma.employee.findFirst({ where: { id: req.params.id, companyId: req.companyId }, include: { department: true, designation: true, salaryStructure: true, leaveBalances: true, loans: { where: { isActive: true } } } })
  if (!emp) throw new NotFoundError('Employee')
  sendSuccess(res, emp)
})

payrollRouter.put('/employees/:id', async (req: Request, res: Response) => {
  const body = empSchema.partial().safeParse(req.body)
  if (!body.success) throw new BadRequestError(body.error.errors[0].message)
  const data: any = { ...body.data }
  if (data.doj) data.doj = new Date(data.doj)
  if (data.dol) data.dol = new Date(data.dol)
  if (data.dob) data.dob = new Date(data.dob)
  const emp = await prisma.employee.update({ where: { id: req.params.id }, data })
  sendSuccess(res, emp, 'Employee updated')
})

payrollRouter.delete('/employees/:id', async (req: Request, res: Response) => {
  const emp = await prisma.employee.findFirst({ where: { id: req.params.id, companyId: req.companyId } })
  if (!emp) throw new NotFoundError('Employee')
  // Soft delete — mark as INACTIVE with date of leaving
  await prisma.employee.update({
    where: { id: req.params.id },
    data: { status: 'INACTIVE', dol: new Date() }
  })
  sendSuccess(res, null, 'Employee deactivated')
})

// ─── SALARY STRUCTURES ────────────────────────────────────────────────────────
payrollRouter.get('/salary-structures', async (req: Request, res: Response) => {
  const s = await prisma.salaryStructure.findMany({ where: { companyId: req.companyId, isActive: true }, include: { _count: { select: { employees: true } } } })
  sendSuccess(res, s)
})

payrollRouter.post('/salary-structures', async (req: Request, res: Response) => {
  const body = z.object({ name: z.string().min(2), components: z.array(z.any()) }).safeParse(req.body)
  if (!body.success) throw new BadRequestError(body.error.errors[0].message)
  const structure = await prisma.salaryStructure.create({ data: { ...body.data, companyId: req.companyId } })
  sendSuccess(res, structure, 'Salary structure created', 201)
})

payrollRouter.put('/salary-structures/:id', async (req: Request, res: Response) => {
  const body = z.object({ name: z.string().min(2).optional(), components: z.array(z.any()).optional(), isActive: z.boolean().optional() }).safeParse(req.body)
  if (!body.success) throw new BadRequestError(body.error.errors[0].message)
  const updated = await prisma.salaryStructure.update({ where: { id: req.params.id }, data: body.data })
  sendSuccess(res, updated, 'Salary structure updated')
})

payrollRouter.delete('/salary-structures/:id', async (req: Request, res: Response) => {
  // Soft delete — mark inactive
  const inUse = await prisma.employee.count({ where: { salaryStructureId: req.params.id } })
  if (inUse > 0) throw new BadRequestError(`Cannot delete — ${inUse} employee(s) use this structure. Change their structure first.`)
  await prisma.salaryStructure.update({ where: { id: req.params.id }, data: { isActive: false } })
  sendSuccess(res, null, 'Salary structure deleted')
})

// ─── DEPARTMENTS & DESIGNATIONS ───────────────────────────────────────────────
payrollRouter.get('/departments', async (req: Request, res: Response) => {
  const depts = await prisma.department.findMany({ where: { companyId: req.companyId, isActive: true }, include: { _count: { select: { employees: true } } } })
  sendSuccess(res, depts)
})

payrollRouter.post('/departments', async (req: Request, res: Response) => {
  const body = z.object({ name: z.string().min(2), costCenter: z.string().optional() }).safeParse(req.body)
  if (!body.success) throw new BadRequestError(body.error.errors[0].message)
  const dept = await prisma.department.create({ data: { ...body.data, companyId: req.companyId } })
  sendSuccess(res, dept, 'Department created', 201)
})

payrollRouter.get('/designations', async (req: Request, res: Response) => {
  const desigs = await prisma.designation.findMany({ where: { companyId: req.companyId, isActive: true } })
  sendSuccess(res, desigs)
})

payrollRouter.post('/designations', async (req: Request, res: Response) => {
  const body = z.object({ name: z.string().min(2), grade: z.string().optional() }).safeParse(req.body)
  if (!body.success) throw new BadRequestError(body.error.errors[0].message)
  const desig = await prisma.designation.create({ data: { ...body.data, companyId: req.companyId } })
  sendSuccess(res, desig, 'Designation created', 201)
})

// ─── ATTENDANCE ───────────────────────────────────────────────────────────────
payrollRouter.post('/attendance/bulk', async (req: Request, res: Response) => {
  const { records } = req.body
  if (!Array.isArray(records)) throw new BadRequestError('records[] required')
  for (const r of records) {
    await prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: r.employeeId, date: new Date(r.date) } },
      create: { employeeId: r.employeeId, date: new Date(r.date), status: r.status, inTime: r.inTime, outTime: r.outTime },
      update: { status: r.status, inTime: r.inTime, outTime: r.outTime },
    })
  }
  sendSuccess(res, { created: records.length }, 'Attendance updated')
})

payrollRouter.get('/attendance', async (req: Request, res: Response) => {
  const { employeeId, month, year } = req.query
  if (!month || !year) throw new BadRequestError('month and year required')
  const startDate = new Date(Number(year), Number(month) - 1, 1)
  const endDate = new Date(Number(year), Number(month), 0)
  const where: any = { date: { gte: startDate, lte: endDate } }
  if (employeeId) where.employeeId = String(employeeId)
  else { const ids = await prisma.employee.findMany({ where: { companyId: req.companyId }, select: { id: true } }); where.employeeId = { in: ids.map(e => e.id) } }
  const records = await prisma.attendance.findMany({ where, orderBy: { date: 'asc' } })
  sendSuccess(res, records)
})

// ─── LEAVE APPLICATIONS ───────────────────────────────────────────────────────
payrollRouter.get('/leave-applications', async (req: Request, res: Response) => {
  const { employeeId, status, limit = 100 } = req.query
  const empIds = (await prisma.employee.findMany({ where: { companyId: req.companyId }, select: { id: true } })).map(e => e.id)
  const where: any = { employeeId: { in: empIds } }
  if (employeeId) where.employeeId = String(employeeId)
  if (status) where.status = String(status)
  const apps = await prisma.leaveApplication.findMany({ where, take: Number(limit), orderBy: { createdAt: 'desc' }, include: { employee: { select: { name: true, empCode: true } } } })
  sendSuccess(res, apps)
})

payrollRouter.post('/leave-applications', async (req: Request, res: Response) => {
  const { employeeId, leaveType, fromDate, toDate, days, reason } = req.body
  if (!employeeId || !leaveType || !fromDate || !toDate) throw new BadRequestError('Missing required fields')
  const app = await prisma.leaveApplication.create({ data: { employeeId, leaveType, fromDate: new Date(fromDate), toDate: new Date(toDate), days: Number(days) || 1, reason, status: 'PENDING' } })
  sendSuccess(res, app, 'Leave application submitted', 201)
})

payrollRouter.put('/leave-applications/:id', async (req: Request, res: Response) => {
  const { status, remarks } = req.body
  const app = await prisma.leaveApplication.update({ where: { id: req.params.id }, data: { status, approvedBy: req.user.userId, approvedAt: new Date(), remarks } })
  sendSuccess(res, app, 'Leave updated')
})

payrollRouter.get('/leave-balance/:employeeId', async (req: Request, res: Response) => {
  const { employeeId } = req.params
  const balances = await prisma.leaveBalance.findMany({
    where: { employeeId },
  })
  const leaveApps = await prisma.leaveApplication.findMany({
    where: { employeeId, status: 'APPROVED' },
    select: { leaveType: true, days: true },
  })
  // Aggregate consumed per type
  const consumed: Record<string, number> = {}
  for (const app of leaveApps) {
    consumed[app.leaveType] = (consumed[app.leaveType] || 0) + Number(app.days)
  }
  sendSuccess(res, { balances, consumed })
})

payrollRouter.put('/leave-balance', async (req: Request, res: Response) => {
  const { employeeId, leaveType, allocated } = req.body
  if (!employeeId || !leaveType) throw new BadRequestError('employeeId and leaveType required')
  const balance = await prisma.leaveBalance.upsert({
    where: { employeeId_leaveType: { employeeId, leaveType } },
    create: { employeeId, leaveType, allocated: Number(allocated), used: 0 },
    update: { allocated: Number(allocated) },
  })
  sendSuccess(res, balance, 'Leave balance updated')
})

// ─── PAYROLL PROCESSING ───────────────────────────────────────────────────────
payrollRouter.post('/process', async (req: Request, res: Response) => {
  const { month, year, employeeIds } = req.body
  if (!month || !year) throw new BadRequestError('month and year required')
  const startDate = new Date(Number(year), Number(month) - 1, 1)
  const endDate = new Date(Number(year), Number(month), 0)
  const workingDays = endDate.getDate()
  const where: any = { companyId: req.companyId, status: 'ACTIVE', salaryStructureId: { not: null } }
  if (employeeIds?.length) where.id = { in: employeeIds }
  const employees = await prisma.employee.findMany({ where, include: { salaryStructure: true, loans: { where: { isActive: true } } } })
  const results = []
  for (const emp of employees) {
    const attendance = await prisma.attendance.findMany({ where: { employeeId: emp.id, date: { gte: startDate, lte: endDate } } })
    const presentDays = attendance.filter(a => ['PRESENT','HALF_DAY'].includes(a.status)).reduce((s, a) => s + (a.status === 'HALF_DAY' ? 0.5 : 1), 0)
    const leaveDays = attendance.filter(a => ['LEAVE','COMPENSATORY'].includes(a.status)).length
    const lopDays = Math.max(0, workingDays - presentDays - leaveDays)
    const components = emp.salaryStructure!.components as SalaryComponent[]
    for (const loan of emp.loans) components.push({ name: `Loan EMI - ${loan.loanType}`, type: 'DEDUCTION', calcType: 'FIXED', value: Number(loan.monthlyEmi) })
    const computed = computeSalary(components, Number(emp.ctc || 0), lopDays, workingDays, emp.ptState || 'RJ')
    await prisma.salaryProcessed.upsert({
      where: { employeeId_month_year: { employeeId: emp.id, month: Number(month), year: Number(year) } },
      create: { companyId: req.companyId, employeeId: emp.id, month: Number(month), year: Number(year), workingDays, presentDays, lopDays, ...computed, earnings: Object.entries(computed.earnings).map(([name, amount]) => ({ name, amount })), deductions: Object.entries(computed.deductions).map(([name, amount]) => ({ name, amount })) },
      update: { workingDays, presentDays, lopDays, ...computed, earnings: Object.entries(computed.earnings).map(([name, amount]) => ({ name, amount })), deductions: Object.entries(computed.deductions).map(([name, amount]) => ({ name, amount })) },
    })
    results.push({ employeeId: emp.id, empCode: emp.empCode, name: emp.name, ...computed })
  }
  const summary = { totalGross: results.reduce((s, r) => s + r.grossPay, 0), totalNetPay: results.reduce((s, r) => s + r.netPay, 0), totalPFEmployee: results.reduce((s, r) => s + r.pfEmployee, 0), totalPFEmployer: results.reduce((s, r) => s + r.pfEmployer, 0), totalESICEmployee: results.reduce((s, r) => s + r.esicEmployee, 0), totalESICEmployer: results.reduce((s, r) => s + r.esicEmployer, 0), totalTDS: results.reduce((s, r) => s + r.tds, 0), totalCtc: results.reduce((s, r) => s + r.totalCtc, 0) }
  sendSuccess(res, { processed: results.length, month, year, results, summary })
})

payrollRouter.get('/payslip/:employeeId/:month/:year', async (req: Request, res: Response) => {
  const { employeeId, month, year } = req.params
  const [salary, employee] = await Promise.all([
    prisma.salaryProcessed.findUnique({ where: { employeeId_month_year: { employeeId, month: Number(month), year: Number(year) } } }),
    prisma.employee.findFirst({ where: { id: employeeId, companyId: req.companyId }, include: { department: true, designation: true } }),
  ])
  if (!salary || !employee) throw new NotFoundError('Payslip')
  sendSuccess(res, { employee, salary })
})

payrollRouter.get('/paysheet/:month/:year', async (req: Request, res: Response) => {
  const { month, year } = req.params
  const salaries = await prisma.salaryProcessed.findMany({ where: { companyId: req.companyId, month: Number(month), year: Number(year) }, include: { employee: { select: { empCode: true, name: true, pan: true, uan: true, bankName: true, accountNumber: true, ifscCode: true, department: { select: { name: true } }, designation: { select: { name: true } } } } }, orderBy: { employee: { empCode: 'asc' } } })
  const totals = salaries.reduce((s, sal) => ({ grossPay: s.grossPay + Number(sal.grossPay), pfEmployee: s.pfEmployee + Number(sal.pfEmployee), pfEmployer: s.pfEmployer + Number(sal.pfEmployer), esicEmployee: s.esicEmployee + Number(sal.esicEmployee), esicEmployer: s.esicEmployer + Number(sal.esicEmployer), professionalTax: s.professionalTax + Number(sal.professionalTax), tds: s.tds + Number(sal.tds), netPay: s.netPay + Number(sal.netPay), totalCtc: s.totalCtc + Number(sal.totalCtc) }), { grossPay: 0, pfEmployee: 0, pfEmployer: 0, esicEmployee: 0, esicEmployer: 0, professionalTax: 0, tds: 0, netPay: 0, totalCtc: 0 })
  sendSuccess(res, { month: Number(month), year: Number(year), salaries, totals, count: salaries.length })
})

payrollRouter.get('/pf-ecr/:month/:year', async (req: Request, res: Response) => {
  const { month, year } = req.params
  const salaries = await prisma.salaryProcessed.findMany({ where: { companyId: req.companyId, month: Number(month), year: Number(year) }, include: { employee: { select: { uan: true, name: true, pan: true } } } })
  const ecrData = salaries.filter(s => s.employee.uan).map(s => ({ uan: s.employee.uan, name: s.employee.name, grossWage: Number(s.grossPay), epfWage: Math.min(Number(s.basic), 15000), epfContrib: Number(s.pfEmployee), epsContrib: Math.round(Math.min(Number(s.basic), 15000) * 0.0833), edliContrib: Math.round(Math.min(Number(s.basic), 15000) * 0.005), epfAdmin: Math.round(Math.min(Number(s.basic), 15000) * 0.01) }))
  sendSuccess(res, { ecrData, month: Number(month), year: Number(year) })
})
