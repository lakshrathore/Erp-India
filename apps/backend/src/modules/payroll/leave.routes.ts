// Append these routes to payroll.routes.ts
// Add at the bottom of the file before module.exports or export

import { Router } from 'express'

// These are additional routes to add to the existing payrollRouter

// ─── LEAVE APPLICATIONS ───────────────────────────────────────────────────────

// GET /payroll/leave-applications
export function addLeaveRoutes(payrollRouter: Router) {
  payrollRouter.get('/leave-applications', async (req: any, res: any) => {
    const { employeeId, status, limit = 100 } = req.query
    const { prisma } = require('../../lib/prisma')
    const { sendSuccess } = require('../../utils/response')

    const where: any = {}
    if (employeeId) where.employeeId = String(employeeId)
    if (status) where.status = String(status)

    // Scope to company employees
    const companyEmps = await prisma.employee.findMany({
      where: { companyId: req.companyId },
      select: { id: true },
    })
    where.employeeId = { in: companyEmps.map((e: any) => e.id) }
    if (employeeId) where.employeeId = String(employeeId)

    const apps = await prisma.leaveApplication.findMany({
      where,
      take: Number(limit),
      orderBy: { createdAt: 'desc' },
      include: {
        employee: { select: { name: true, empCode: true } },
      },
    })
    sendSuccess(res, apps)
  })

  payrollRouter.post('/leave-applications', async (req: any, res: any) => {
    const { prisma } = require('../../lib/prisma')
    const { sendSuccess, BadRequestError } = require('../../utils/response')
    const { employeeId, leaveType, fromDate, toDate, days, reason } = req.body

    if (!employeeId || !leaveType || !fromDate || !toDate) {
      throw new BadRequestError('employeeId, leaveType, fromDate, toDate required')
    }

    const app = await prisma.leaveApplication.create({
      data: {
        employeeId,
        leaveType,
        fromDate: new Date(fromDate),
        toDate: new Date(toDate),
        days: Number(days) || 1,
        reason,
        status: 'PENDING',
      },
    })
    sendSuccess(res, app, 'Leave application submitted', 201)
  })

  payrollRouter.put('/leave-applications/:id', async (req: any, res: any) => {
    const { prisma } = require('../../lib/prisma')
    const { sendSuccess } = require('../../utils/response')
    const { status, remarks } = req.body

    const app = await prisma.leaveApplication.update({
      where: { id: req.params.id },
      data: {
        status,
        approvedBy: req.user.userId,
        approvedAt: new Date(),
        remarks,
      },
    })
    sendSuccess(res, app, 'Leave application updated')
  })
}
