import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { authenticate, withCompany, requireRole } from '../../middleware/auth'
import { sendSuccess, NotFoundError, BadRequestError } from '../../utils/response'
import { UserRole, GSTType } from '@prisma/client'
import multer from 'multer'
import path from 'path'
import fs from 'fs'

export const companyRouter = Router()
companyRouter.use(authenticate)

// ─── File Upload ──────────────────────────────────────────────────────────────

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'company')
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `${req.params.id}-${file.fieldname}-${Date.now()}${ext}`)
  },
})
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp']
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true)
    else cb(new Error('Only image files allowed'))
  },
})

// Serve uploaded files
companyRouter.get('/files/:filename', (req: Request, res: Response) => {
  const filePath = path.join(UPLOAD_DIR, req.params.filename)
  if (fs.existsSync(filePath)) res.sendFile(filePath)
  else res.status(404).json({ success: false, message: 'File not found' })
})

// ─── Schemas ──────────────────────────────────────────────────────────────────

const companySchema = z.object({
  name: z.string().min(2),
  legalName: z.string().min(2),
  gstin: z.string().optional().or(z.literal('')),
  pan: z.string().optional().or(z.literal('')),
  tan: z.string().optional().or(z.literal('')),
  cin: z.string().optional().or(z.literal('')),
  gstRegType: z.nativeEnum(GSTType).default(GSTType.REGULAR),
  compositionRate: z.coerce.number().optional(),
  bookBeginningDate: z.string().optional(),
  addressLine1: z.string().min(2),
  addressLine2: z.string().optional(),
  city: z.string().min(2),
  state: z.string().min(2),
  stateCode: z.string().min(2),
  pincode: z.string().min(4),
  phone: z.string().optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  website: z.string().optional().or(z.literal('')),
  financialYearStart: z.coerce.number().int().min(1).max(12).default(4),
  currencySymbol: z.string().default('₹'),
  dateFormat: z.string().default('DD-MM-YYYY'),
  decimalPlaces: z.coerce.number().default(2),
  roundOffSales: z.boolean().default(true),
  printLogoOnInvoice: z.boolean().default(true),
  printSignatureOnInvoice: z.boolean().default(true),
  printConfig: z.string().optional(),
  txnSettings: z.string().optional(),
  ledgerMappings: z.string().optional(),
})

const addressSchema = z.object({
  label: z.string().min(1),
  addressLine1: z.string().min(2),
  addressLine2: z.string().optional(),
  city: z.string().min(2),
  state: z.string().min(2),
  stateCode: z.string().min(2),
  pincode: z.string().min(4),
  phone: z.string().optional(),
  email: z.string().optional(),
  gstin: z.string().optional(),
  isDefault: z.boolean().default(false),
})

const branchSchema = z.object({
  name: z.string().min(2),
  gstin: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  stateCode: z.string().optional(),
  pincode: z.string().optional(),
  phone: z.string().optional(),
  isHO: z.boolean().default(false),
})

const fySchema = z.object({
  name: z.string(),
  startDate: z.string(),
  endDate: z.string(),
})

// ─── GET /companies ───────────────────────────────────────────────────────────

companyRouter.get('/', async (req: Request, res: Response) => {
  const cus = await prisma.companyUser.findMany({
    where: { userId: req.user.userId, isActive: true },
    include: {
      company: {
        include: {
          _count: { select: { branches: true, companyUsers: true } },
          financialYears: { where: { isActive: true }, take: 1 },
          addresses: { where: { isDefault: true }, take: 1 },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  sendSuccess(res, cus.map((cu) => ({
    companyId: cu.company.id,
    companyName: cu.company.name,
    name: cu.company.name,
    legalName: cu.company.legalName,
    gstin: cu.company.gstin,
    gstRegType: cu.company.gstRegType,
    city: cu.company.city,
    state: cu.company.state,
    logo: cu.company.logo,
    role: cu.role,
    isActive: cu.company.isActive,
    activeFY: cu.company.financialYears[0]?.name,
    branchCount: cu.company._count.branches,
    userCount: cu.company._count.companyUsers,
  })))
})

// ─── POST /companies ──────────────────────────────────────────────────────────

companyRouter.post('/', async (req: Request, res: Response) => {
  const body = companySchema.safeParse(req.body)
  if (!body.success) throw new BadRequestError(body.error.errors.map((e) => e.message).join(', '))

  const company = await prisma.$transaction(async (tx) => {
    const co = await tx.company.create({
      data: {
        ...body.data,
        gstin: body.data.gstin || null,
        pan: body.data.pan || null,
        tan: body.data.tan || null,
        cin: body.data.cin || null,
        email: body.data.email || null,
        phone: body.data.phone || null,
        website: body.data.website || null,
        bookBeginningDate: body.data.bookBeginningDate ? new Date(body.data.bookBeginningDate) : null,
      },
    })

    await tx.companyUser.create({
      data: { companyId: co.id, userId: req.user.userId, role: UserRole.COMPANY_ADMIN },
    })

    await tx.branch.create({
      data: {
        companyId: co.id, name: 'Head Office', gstin: body.data.gstin || null,
        addressLine1: body.data.addressLine1, addressLine2: body.data.addressLine2,
        city: body.data.city, state: body.data.state,
        stateCode: body.data.stateCode, pincode: body.data.pincode,
        phone: body.data.phone || null, isHO: true,
      },
    })

    await tx.companyAddress.create({
      data: {
        companyId: co.id, label: 'Registered Office',
        addressLine1: body.data.addressLine1, addressLine2: body.data.addressLine2,
        city: body.data.city, state: body.data.state,
        stateCode: body.data.stateCode, pincode: body.data.pincode,
        phone: body.data.phone || null, email: body.data.email || null,
        gstin: body.data.gstin || null, isDefault: true,
      },
    })

    // Create active financial year
    const fyMonth = body.data.financialYearStart || 4
    const now = new Date()
    let fyStartYear = now.getFullYear()
    if (now.getMonth() + 1 < fyMonth) fyStartYear--
    const fyStart = new Date(fyStartYear, fyMonth - 1, 1)
    const fyEnd = new Date(fyStartYear + 1, fyMonth - 1, 0)
    const fyName = `${String(fyStartYear).slice(2)}-${String(fyStartYear + 1).slice(2)}`

    await tx.financialYear.create({
      data: { companyId: co.id, name: fyName, startDate: fyStart, endDate: fyEnd, isActive: true },
    })

    await seedDefaultLedgerGroups(tx, co.id)
    await seedDefaultTaxMasters(tx, co.id)
    await tx.godown.create({ data: { companyId: co.id, name: 'Main Godown' } })
    await seedNumberSeries(tx, co.id, fyName)

    return co
  })

  sendSuccess(res, { ...company, companyName: company.name }, 'Company created', 201)
})

// ─── GET /companies/:id ───────────────────────────────────────────────────────

companyRouter.get('/:id', withCompany, async (req: Request, res: Response) => {
  const company = await prisma.company.findFirst({
    where: { id: req.params.id },
    include: {
      branches: { where: { isActive: true }, orderBy: [{ isHO: 'desc' }, { name: 'asc' }] },
      financialYears: { orderBy: { startDate: 'desc' } },
      addresses: { where: { isActive: true }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] },
      _count: { select: { companyUsers: true, vouchers: true } },
    },
  })
  if (!company) throw new NotFoundError('Company')
  sendSuccess(res, company)
})

// ─── PUT /companies/:id ───────────────────────────────────────────────────────

companyRouter.put('/:id', withCompany, requireRole(UserRole.COMPANY_ADMIN), async (req: Request, res: Response) => {
  const body = companySchema.partial().safeParse(req.body)
  if (!body.success) throw new BadRequestError(body.error.errors[0].message)
  const data: any = { ...body.data }
  if (data.bookBeginningDate) data.bookBeginningDate = new Date(data.bookBeginningDate)
  if (data.gstin === '') data.gstin = null
  if (data.email === '') data.email = null
  if (data.phone === '') data.phone = null
  const company = await prisma.company.update({ where: { id: req.params.id }, data })
  sendSuccess(res, company, 'Company updated')
})

// ─── Logo upload ──────────────────────────────────────────────────────────────

companyRouter.post('/:id/logo', withCompany, requireRole(UserRole.COMPANY_ADMIN),
  upload.single('logo'), async (req: Request, res: Response) => {
    if (!req.file) throw new BadRequestError('No file uploaded')
    const url = `/api/companies/files/${req.file.filename}`
    await prisma.company.update({ where: { id: req.params.id }, data: { logo: url } })
    sendSuccess(res, { logo: url }, 'Logo uploaded')
  }
)

// ─── Signature upload ─────────────────────────────────────────────────────────

companyRouter.post('/:id/signature', withCompany, requireRole(UserRole.COMPANY_ADMIN),
  upload.single('signature'), async (req: Request, res: Response) => {
    if (!req.file) throw new BadRequestError('No file uploaded')
    const url = `/api/companies/files/${req.file.filename}`
    await prisma.company.update({ where: { id: req.params.id }, data: { signature: url } })
    sendSuccess(res, { signature: url }, 'Signature uploaded')
  }
)

// ─── Addresses ────────────────────────────────────────────────────────────────

companyRouter.get('/:id/addresses', withCompany, async (req: Request, res: Response) => {
  const addresses = await prisma.companyAddress.findMany({
    where: { companyId: req.params.id, isActive: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  })
  sendSuccess(res, addresses)
})

companyRouter.post('/:id/addresses', withCompany, requireRole(UserRole.COMPANY_ADMIN, UserRole.MANAGER),
  async (req: Request, res: Response) => {
    const body = addressSchema.safeParse(req.body)
    if (!body.success) throw new BadRequestError(body.error.errors[0].message)
    await prisma.$transaction(async (tx) => {
      if (body.data.isDefault) {
        await tx.companyAddress.updateMany({ where: { companyId: req.params.id }, data: { isDefault: false } })
      }
      const addr = await tx.companyAddress.create({ data: { ...body.data, companyId: req.params.id } })
      sendSuccess(res, addr, 'Address added', 201)
    })
  }
)

companyRouter.put('/:id/addresses/:addrId', withCompany, requireRole(UserRole.COMPANY_ADMIN, UserRole.MANAGER),
  async (req: Request, res: Response) => {
    const body = addressSchema.partial().safeParse(req.body)
    if (!body.success) throw new BadRequestError(body.error.errors[0].message)
    await prisma.$transaction(async (tx) => {
      if (body.data.isDefault) {
        await tx.companyAddress.updateMany({ where: { companyId: req.params.id }, data: { isDefault: false } })
      }
      const addr = await tx.companyAddress.update({ where: { id: req.params.addrId }, data: body.data })
      sendSuccess(res, addr, 'Address updated')
    })
  }
)

companyRouter.delete('/:id/addresses/:addrId', withCompany, requireRole(UserRole.COMPANY_ADMIN),
  async (req: Request, res: Response) => {
    await prisma.companyAddress.update({ where: { id: req.params.addrId }, data: { isActive: false } })
    sendSuccess(res, null, 'Address removed')
  }
)

// ─── Financial Years ──────────────────────────────────────────────────────────

companyRouter.get('/:id/financial-years', withCompany, async (req: Request, res: Response) => {
  const fys = await prisma.financialYear.findMany({
    where: { companyId: req.params.id },
    orderBy: { startDate: 'desc' },
  })
  sendSuccess(res, fys)
})

companyRouter.post('/:id/financial-years', withCompany, requireRole(UserRole.COMPANY_ADMIN),
  async (req: Request, res: Response) => {
    const body = fySchema.safeParse(req.body)
    if (!body.success) throw new BadRequestError('Invalid FY data')
    const fy = await prisma.financialYear.create({
      data: { companyId: req.params.id, name: body.data.name, startDate: new Date(body.data.startDate), endDate: new Date(body.data.endDate) },
    })
    await seedNumberSeries(prisma as any, req.params.id, body.data.name)
    sendSuccess(res, fy, 'Financial year created', 201)
  }
)

companyRouter.put('/:id/financial-years/:fyId/activate', withCompany, requireRole(UserRole.COMPANY_ADMIN),
  async (req: Request, res: Response) => {
    await prisma.$transaction([
      prisma.financialYear.updateMany({ where: { companyId: req.params.id }, data: { isActive: false } }),
      prisma.financialYear.update({ where: { id: req.params.fyId }, data: { isActive: true } }),
    ])
    const fy = await prisma.financialYear.findUnique({ where: { id: req.params.fyId } })
    sendSuccess(res, { activeFY: fy?.name }, 'Financial year switched')
  }
)

companyRouter.put('/:id/financial-years/:fyId/close', withCompany, requireRole(UserRole.COMPANY_ADMIN),
  async (req: Request, res: Response) => {
    await prisma.financialYear.update({ where: { id: req.params.fyId }, data: { isClosed: true, isActive: false } })
    sendSuccess(res, null, 'Financial year closed')
  }
)

// ─── Branches ─────────────────────────────────────────────────────────────────

companyRouter.get('/:id/branches', withCompany, async (req: Request, res: Response) => {
  const branches = await prisma.branch.findMany({
    where: { companyId: req.params.id, isActive: true },
    orderBy: [{ isHO: 'desc' }, { name: 'asc' }],
  })
  sendSuccess(res, branches)
})

companyRouter.post('/:id/branches', withCompany, requireRole(UserRole.COMPANY_ADMIN, UserRole.MANAGER),
  async (req: Request, res: Response) => {
    const body = branchSchema.safeParse(req.body)
    if (!body.success) throw new BadRequestError(body.error.errors[0].message)
    const branch = await prisma.branch.create({ data: { ...body.data, companyId: req.params.id } })
    sendSuccess(res, branch, 'Branch created', 201)
  }
)

companyRouter.put('/:id/branches/:branchId', withCompany, requireRole(UserRole.COMPANY_ADMIN),
  async (req: Request, res: Response) => {
    const body = branchSchema.partial().safeParse(req.body)
    if (!body.success) throw new BadRequestError(body.error.errors[0].message)
    const branch = await prisma.branch.update({ where: { id: req.params.branchId }, data: body.data })
    sendSuccess(res, branch, 'Branch updated')
  }
)

// ─── Company Users ────────────────────────────────────────────────────────────

companyRouter.get('/:id/users', withCompany, requireRole(UserRole.COMPANY_ADMIN),
  async (req: Request, res: Response) => {
    const users = await prisma.companyUser.findMany({
      where: { companyId: req.params.id },
      include: { user: { select: { id: true, name: true, email: true, phone: true, isActive: true } } },
    })
    sendSuccess(res, users)
  }
)

companyRouter.post('/:id/users', withCompany, requireRole(UserRole.COMPANY_ADMIN),
  async (req: Request, res: Response) => {
    const body = z.object({ userId: z.string().uuid(), role: z.nativeEnum(UserRole), permissions: z.record(z.boolean()).default({}) }).safeParse(req.body)
    if (!body.success) throw new BadRequestError(body.error.errors[0].message)
    const cu = await prisma.companyUser.upsert({
      where: { companyId_userId: { companyId: req.params.id, userId: body.data.userId } },
      create: { companyId: req.params.id, ...body.data },
      update: { role: body.data.role, isActive: true },
    })
    sendSuccess(res, cu, 'User added', 201)
  }
)

companyRouter.delete('/:id/users/:userId', withCompany, requireRole(UserRole.COMPANY_ADMIN),
  async (req: Request, res: Response) => {
    await prisma.companyUser.update({
      where: { companyId_userId: { companyId: req.params.id, userId: req.params.userId } },
      data: { isActive: false },
    })
    sendSuccess(res, null, 'User removed')
  }
)

// ─── Seed Functions ───────────────────────────────────────────────────────────

async function seedDefaultLedgerGroups(tx: any, companyId: string) {
  const groups = [
    { name: 'Capital Account', nature: 'EQUITY', parent: null },
    { name: 'Reserves & Surplus', nature: 'EQUITY', parent: 'Capital Account' },
    { name: 'Current Liabilities', nature: 'LIABILITY', parent: null },
    { name: 'Duties & Taxes', nature: 'LIABILITY', parent: 'Current Liabilities' },
    { name: 'Sundry Creditors', nature: 'LIABILITY', parent: 'Current Liabilities' },
    { name: 'Loans (Liability)', nature: 'LIABILITY', parent: null },
    { name: 'Provisions', nature: 'LIABILITY', parent: 'Current Liabilities' },
    { name: 'Fixed Assets', nature: 'ASSET', parent: null },
    { name: 'Current Assets', nature: 'ASSET', parent: null },
    { name: 'Cash-in-Hand', nature: 'ASSET', parent: 'Current Assets' },
    { name: 'Bank Accounts', nature: 'ASSET', parent: 'Current Assets' },
    { name: 'Sundry Debtors', nature: 'ASSET', parent: 'Current Assets' },
    { name: 'Stock-in-Hand', nature: 'ASSET', parent: 'Current Assets' },
    { name: 'Loans & Advances (Asset)', nature: 'ASSET', parent: 'Current Assets' },
    { name: 'Deposits (Asset)', nature: 'ASSET', parent: 'Current Assets' },
    { name: 'Income', nature: 'INCOME', parent: null },
    { name: 'Sales Accounts', nature: 'INCOME', parent: 'Income' },
    { name: 'Other Income', nature: 'INCOME', parent: 'Income' },
    { name: 'Expenses', nature: 'EXPENSE', parent: null },
    { name: 'Purchase Accounts', nature: 'EXPENSE', parent: 'Expenses' },
    { name: 'Direct Expenses', nature: 'EXPENSE', parent: 'Expenses' },
    { name: 'Indirect Expenses', nature: 'EXPENSE', parent: 'Expenses' },
    { name: 'Manufacturing Expenses', nature: 'EXPENSE', parent: 'Direct Expenses' },
  ]
  const groupMap: Record<string, string> = {}
  for (const g of groups) {
    const parentId = g.parent ? groupMap[g.parent] : null
    const group = await tx.ledgerGroup.create({ data: { companyId, name: g.name, nature: g.nature as any, parentId, isSystem: true } })
    groupMap[g.name] = group.id
  }
  const defaultLedgers = [
    { name: 'Cash', g: 'Cash-in-Hand' }, { name: 'Capital', g: 'Capital Account' },
    { name: 'Sales', g: 'Sales Accounts' }, { name: 'Sales Return', g: 'Sales Accounts' },
    { name: 'Purchase', g: 'Purchase Accounts' }, { name: 'Purchase Return', g: 'Purchase Accounts' },
    { name: 'CGST Payable', g: 'Duties & Taxes' }, { name: 'SGST Payable', g: 'Duties & Taxes' },
    { name: 'IGST Payable', g: 'Duties & Taxes' }, { name: 'CGST Input Credit', g: 'Current Assets' },
    { name: 'SGST Input Credit', g: 'Current Assets' }, { name: 'IGST Input Credit', g: 'Current Assets' },
    { name: 'TDS Payable', g: 'Duties & Taxes' }, { name: 'TCS Payable', g: 'Duties & Taxes' },
    { name: 'Professional Tax Payable', g: 'Duties & Taxes' },
    { name: 'PF Payable', g: 'Duties & Taxes' }, { name: 'ESIC Payable', g: 'Duties & Taxes' },
    { name: 'Salary & Wages', g: 'Direct Expenses' },
    { name: 'PF Employer Contribution', g: 'Indirect Expenses' },
    { name: 'ESIC Employer Contribution', g: 'Indirect Expenses' },
    { name: 'Discount Allowed', g: 'Indirect Expenses' },
    { name: 'Discount Received', g: 'Other Income' },
    { name: 'Interest Paid', g: 'Indirect Expenses' },
    { name: 'Interest Received', g: 'Other Income' },
    { name: 'Round Off', g: 'Indirect Expenses' },
    { name: 'Freight & Forwarding', g: 'Direct Expenses' },
    { name: 'Stock-in-Hand', g: 'Stock-in-Hand' },
    { name: 'Opening Stock', g: 'Stock-in-Hand' },
    { name: 'Closing Stock', g: 'Stock-in-Hand' },
  ]
  for (const l of defaultLedgers) {
    if (!groupMap[l.g]) continue
    await tx.ledger.create({ data: { companyId, name: l.name, groupId: groupMap[l.g], isSystem: true } })
  }
  return groupMap
}

async function seedDefaultTaxMasters(tx: any, companyId: string) {
  const taxes = [
    { name: 'Exempt', gstRate: 0, cgstRate: 0, sgstRate: 0, igstRate: 0, cessRate: 0 },
    { name: 'GST 0%', gstRate: 0, cgstRate: 0, sgstRate: 0, igstRate: 0, cessRate: 0 },
    { name: 'GST 0.1%', gstRate: 0.1, cgstRate: 0.05, sgstRate: 0.05, igstRate: 0.1, cessRate: 0 },
    { name: 'GST 0.25%', gstRate: 0.25, cgstRate: 0.125, sgstRate: 0.125, igstRate: 0.25, cessRate: 0 },
    { name: 'GST 1%', gstRate: 1, cgstRate: 0.5, sgstRate: 0.5, igstRate: 1, cessRate: 0 },
    { name: 'GST 3%', gstRate: 3, cgstRate: 1.5, sgstRate: 1.5, igstRate: 3, cessRate: 0 },
    { name: 'GST 5%', gstRate: 5, cgstRate: 2.5, sgstRate: 2.5, igstRate: 5, cessRate: 0 },
    { name: 'GST 12%', gstRate: 12, cgstRate: 6, sgstRate: 6, igstRate: 12, cessRate: 0 },
    { name: 'GST 18%', gstRate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18, cessRate: 0 },
    { name: 'GST 28%', gstRate: 28, cgstRate: 14, sgstRate: 14, igstRate: 28, cessRate: 0 },
    { name: 'GST 28% + Cess 12%', gstRate: 28, cgstRate: 14, sgstRate: 14, igstRate: 28, cessRate: 12 },
    { name: 'GST 28% + Cess 60%', gstRate: 28, cgstRate: 14, sgstRate: 14, igstRate: 28, cessRate: 60 },
  ]
  for (const t of taxes) {
    await tx.taxMaster.create({ data: { companyId, ...t } })
  }
}

async function seedNumberSeries(tx: any, companyId: string, fyName: string) {
  const series = [
    { voucherType: 'SALE', prefix: 'INV', separator: '-', padLength: 4 },
    { voucherType: 'PURCHASE', prefix: 'PUR', separator: '-', padLength: 4 },
    { voucherType: 'CREDIT_NOTE', prefix: 'CN', separator: '-', padLength: 4 },
    { voucherType: 'DEBIT_NOTE', prefix: 'DN', separator: '-', padLength: 4 },
    { voucherType: 'SALE_CHALLAN', prefix: 'DC', separator: '-', padLength: 4 },
    { voucherType: 'PURCHASE_ORDER', prefix: 'PO', separator: '-', padLength: 4 },
    { voucherType: 'PURCHASE_CHALLAN', prefix: 'GRN', separator: '-', padLength: 4 },
    { voucherType: 'PRODUCTION', prefix: 'PRD', separator: '-', padLength: 4 },
    { voucherType: 'RECEIPT', prefix: 'RCP', separator: '-', padLength: 4 },
    { voucherType: 'PAYMENT', prefix: 'PAY', separator: '-', padLength: 4 },
    { voucherType: 'CONTRA', prefix: 'CON', separator: '-', padLength: 4 },
    { voucherType: 'JOURNAL', prefix: 'JV', separator: '-', padLength: 4 },
  ]
  for (const s of series) {
    try {
      await tx.numberSeries.upsert({
        where: { companyId_branchId_voucherType_financialYear: { companyId, branchId: null, voucherType: s.voucherType as any, financialYear: fyName } },
        create: { companyId, voucherType: s.voucherType as any, prefix: s.prefix, separator: s.separator, padLength: s.padLength, financialYear: fyName, fyDependent: true },
        update: {},
      })
    } catch { /* skip if already exists */ }
  }
}
