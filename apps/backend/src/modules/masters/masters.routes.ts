import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { authenticate, withCompany } from '../../middleware/auth'
import { sendSuccess, sendPaginated, NotFoundError, BadRequestError } from '../../utils/response'
import { getPagination, validateGSTIN, validatePAN } from '../../utils/india'
import { PartyType, GSTType, TaxType } from '@prisma/client'

export const mastersRouter = Router()
mastersRouter.use(authenticate, withCompany)

// ═══════════════════════════════════════════════════════════════
// PARTY MASTER
// ═══════════════════════════════════════════════════════════════

const partySchema = z.object({
  name: z.string().min(2),
  code: z.string().optional(),
  type: z.nativeEnum(PartyType).default('CUSTOMER'),
  gstin: z.string().optional().refine((v) => !v || validateGSTIN(v), 'Invalid GSTIN'),
  gstType: z.nativeEnum(GSTType).default('REGULAR'),
  pan: z.string().optional().refine((v) => !v || validatePAN(v), 'Invalid PAN'),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  website: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  stateCode: z.string().optional(),
  pincode: z.string().optional(),
  creditLimit: z.number().default(0),
  creditDays: z.number().int().default(0),
  openingBalance: z.number().default(0),
  openingType: z.enum(['Dr', 'Cr']).default('Dr'),
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  ifscCode: z.string().optional(),
  upiId: z.string().optional(),
})

mastersRouter.get('/parties', async (req: Request, res: Response) => {
  const { page, limit, skip } = getPagination(req.query)
  const { search, type, isActive = 'true' } = req.query

  const where: any = { companyId: req.companyId }
  if (isActive === 'true') where.isActive = true

  // Smart type filtering:
  // - BOTH parties always appear in both CUSTOMER and VENDOR lists
  // - If company has allowCustomerAsVendor/allowVendorAsCustomer enabled,
  //   expand the type filter accordingly
  if (type) {
    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
      select: { txnSettings: true },
    })
    let txnSettings: Record<string, any> = {}
    try { txnSettings = company?.txnSettings ? JSON.parse(company.txnSettings) : {} } catch {}

    if (type === 'CUSTOMER') {
      const types = ['CUSTOMER', 'BOTH']
      if (txnSettings.allowVendorAsCustomer) types.push('VENDOR')
      where.type = { in: types }
    } else if (type === 'VENDOR') {
      const types = ['VENDOR', 'BOTH']
      if (txnSettings.allowCustomerAsVendor) types.push('CUSTOMER')
      where.type = { in: types }
    } else {
      where.type = type
    }
  }

  if (search) {
    where.OR = [
      { name: { contains: String(search), mode: 'insensitive' } },
      { gstin: { contains: String(search), mode: 'insensitive' } },
      { phone: { contains: String(search) } },
      { code: { contains: String(search), mode: 'insensitive' } },
    ]
  }

  const [parties, total] = await Promise.all([
    prisma.party.findMany({ where, skip, take: limit, orderBy: { name: 'asc' } }),
    prisma.party.count({ where }),
  ])
  sendPaginated(res, parties, total, page, limit)
})

mastersRouter.post('/parties', async (req: Request, res: Response) => {
  const body = partySchema.safeParse(req.body)
  if (!body.success) throw new BadRequestError(body.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '))

  const party = await prisma.$transaction(async (tx) => {
    // Auto-create ledger for party
    const groupName = ['CUSTOMER', 'BOTH'].includes(body.data.type) ? 'Sundry Debtors' : 'Sundry Creditors'
    const group = await tx.ledgerGroup.findFirst({ where: { companyId: req.companyId, name: groupName } })

    const ledger = await tx.ledger.create({
      data: {
        companyId: req.companyId,
        name: body.data.name,
        groupId: group!.id,
        gstin: body.data.gstin,
        panNumber: body.data.pan,
        openingBalance: body.data.openingBalance,
        openingType: body.data.openingType,
      },
    })

    return tx.party.create({
      data: {
        ...body.data,
        companyId: req.companyId,
        creditLimit: body.data.creditLimit,
        creditDays: body.data.creditDays,
        openingBalance: body.data.openingBalance,
        ledgerId: ledger.id,
      },
    })
  })

  sendSuccess(res, party, 'Party created', 201)
})

mastersRouter.get('/parties/:id', async (req: Request, res: Response) => {
  const party = await prisma.party.findFirst({
    where: { id: req.params.id, companyId: req.companyId },
    include: { addresses: true, ledger: true },
  })
  if (!party) throw new NotFoundError('Party')
  sendSuccess(res, party)
})

mastersRouter.put('/parties/:id', async (req: Request, res: Response) => {
  const body = partySchema.partial().safeParse(req.body)
  if (!body.success) throw new BadRequestError(body.error.errors[0].message)

  const party = await prisma.party.update({
    where: { id: req.params.id },
    data: body.data as any,
  })
  sendSuccess(res, party, 'Party updated')
})

mastersRouter.delete('/parties/:id', async (req: Request, res: Response) => {
  await prisma.party.update({ where: { id: req.params.id }, data: { isActive: false } })
  sendSuccess(res, null, 'Party deactivated')
})

// ═══════════════════════════════════════════════════════════════
// ITEM CATEGORY (Dynamic attributes)
// ═══════════════════════════════════════════════════════════════

const categoryAttributeSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z.enum(['text', 'number', 'date', 'select', 'boolean']),
  options: z.array(z.string()).optional(),
  required: z.boolean().default(false),
  showInReport: z.boolean().default(true),
})

const itemCategorySchema = z.object({
  name: z.string().min(2),
  parentId: z.string().uuid().optional().nullable(),
  description: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  sortOrder: z.coerce.number().default(0),
  attributes: z.array(categoryAttributeSchema).default([]),
  trackBatch: z.boolean().default(false),
  trackExpiry: z.boolean().default(false),
})

// ─── GET /item-categories — returns full tree (all levels) ───────────────────
mastersRouter.get('/item-categories', async (req: Request, res: Response) => {
  const { flat } = req.query  // ?flat=1 for dropdown lists
  const cats = await prisma.itemCategory.findMany({
    where: { companyId: req.companyId, isActive: true },
    include: {
      _count: { select: { items: true, children: true } },
    },
    orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  })

  if (flat === '1') {
    // Flat list for dropdowns — include breadcrumb path
    const catMap = new Map(cats.map(c => [c.id, c]))
    const withPath = cats.map(c => {
      const parts: string[] = []
      let cur: typeof c | undefined = c
      while (cur) {
        parts.unshift(cur.name)
        cur = cur.parentId ? catMap.get(cur.parentId) : undefined
      }
      return { ...c, path: parts.join(' > ') }
    })
    return sendSuccess(res, withPath)
  }

  // Build tree structure
  const catMap = new Map(cats.map(c => [c.id, { ...c, children: [] as any[] }]))
  const roots: any[] = []
  for (const c of catMap.values()) {
    if (c.parentId && catMap.has(c.parentId)) {
      catMap.get(c.parentId)!.children.push(c)
    } else {
      roots.push(c)
    }
  }
  sendSuccess(res, roots)
})

mastersRouter.post('/item-categories', async (req: Request, res: Response) => {
  const body = itemCategorySchema.safeParse(req.body)
  if (!body.success) throw new BadRequestError(body.error.errors[0].message)

  // Calculate level from parent
  let level = 1
  if (body.data.parentId) {
    const parent = await prisma.itemCategory.findFirst({
      where: { id: body.data.parentId, companyId: req.companyId, isActive: true },
    })
    if (!parent) throw new BadRequestError('Parent category not found')
    level = parent.level + 1
    if (level > 3) throw new BadRequestError('Maximum 3 levels of category hierarchy allowed')
  }

  const cat = await prisma.itemCategory.create({
    data: { ...body.data, companyId: req.companyId, level },
  })
  sendSuccess(res, cat, 'Category created', 201)
})

mastersRouter.put('/item-categories/:id', async (req: Request, res: Response) => {
  const existing = await prisma.itemCategory.findFirst({ where: { id: req.params.id, companyId: req.companyId } })
  if (!existing) throw new NotFoundError('Category')
  const body = itemCategorySchema.partial().safeParse(req.body)
  if (!body.success) throw new BadRequestError(body.error.errors[0].message)

  // Check for duplicate name
  if (body.data.name && body.data.name !== existing.name) {
    const dup = await prisma.itemCategory.findFirst({ where: { companyId: req.companyId, name: body.data.name, id: { not: req.params.id } } })
    if (dup) throw new BadRequestError(`Category "${body.data.name}" already exists`)
  }

  // Recalculate level if parentId changed
  let level = existing.level
  if (body.data.parentId !== undefined) {
    if (!body.data.parentId) {
      level = 1
    } else {
      const parent = await prisma.itemCategory.findFirst({
        where: { id: body.data.parentId, companyId: req.companyId, isActive: true },
      })
      if (!parent) throw new BadRequestError('Parent category not found')
      level = parent.level + 1
      if (level > 3) throw new BadRequestError('Maximum 3 levels of category hierarchy allowed')
      // Prevent circular reference
      if (body.data.parentId === req.params.id) throw new BadRequestError('Category cannot be its own parent')
    }
  }

  const cat = await prisma.itemCategory.update({ where: { id: req.params.id }, data: { ...body.data, level } as any })
  sendSuccess(res, cat, 'Category updated')
})

mastersRouter.get('/item-categories/:id/usage', async (req: Request, res: Response) => {
  const itemCount = await prisma.item.count({ where: { categoryId: req.params.id, companyId: req.companyId } })
  const childCount = await prisma.itemCategory.count({ where: { parentId: req.params.id, isActive: true } })
  sendSuccess(res, {
    itemCount,
    childCount,
    canDelete: itemCount === 0 && childCount === 0,
    message: itemCount > 0 ? `${itemCount} items use this category` : childCount > 0 ? `${childCount} sub-categories exist` : null,
  })
})

// ═══════════════════════════════════════════════════════════════
// ITEM MASTER
// ═══════════════════════════════════════════════════════════════

const itemSchema = z.object({
  name: z.string().min(2),
  code: z.string().optional(),
  isService: z.boolean().default(false),
  categoryId: z.string().uuid().optional().nullable(),
  description: z.string().optional(),
  unit: z.string().default('PCS'),
  alternateUnit: z.string().optional(),
  conversionFactor: z.coerce.number().optional(),
  hsnCode: z.string().optional(),
  sacCode: z.string().optional(),
  taxMasterId: z.string().uuid().optional().nullable(),
  gstRate: z.coerce.number().min(0).max(100).default(0),
  cessRate: z.coerce.number().default(0),
  taxType: z.nativeEnum(TaxType).default('CGST_SGST'),
  // Service ledger overrides (optional — falls back to company LedgerMapping defaults)
  incomeLedgerId: z.string().uuid().optional().nullable(),
  expenseLedgerId: z.string().uuid().optional().nullable(),
  // TDS on service purchase
  tdsApplicable: z.boolean().default(false),
  tdsSection: z.string().optional().nullable(),
  tdsRate: z.coerce.number().optional().nullable(),
  purchaseRate: z.coerce.number().default(0),
  saleRate: z.coerce.number().default(0),
  mrp: z.coerce.number().default(0),
  ptr: z.coerce.number().default(0),
  pts: z.coerce.number().default(0),
  wholesaleRate: z.coerce.number().default(0),
  tradeDiscount: z.coerce.number().min(0).max(100).default(0),
  cashDiscount: z.coerce.number().min(0).max(100).default(0),
  schemeDiscount: z.coerce.number().min(0).max(100).default(0),
  maintainStock: z.boolean().default(true),
  reorderLevel: z.coerce.number().default(0),
  reorderQty: z.coerce.number().default(0),
  minSaleQty: z.coerce.number().default(1),
})

const variantSchema = z.object({
  code: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  attributeValues: z.record(z.any()).default({}),
  purchaseRate: z.coerce.number().default(0),
  saleRate: z.coerce.number().default(0),
  isActive: z.boolean().default(true),
})

mastersRouter.get('/items', async (req: Request, res: Response) => {
  const { page, limit, skip } = getPagination(req.query)
  const { search, categoryId, isActive = 'true' } = req.query

  const where: any = { companyId: req.companyId }
  if (isActive === 'true') where.isActive = true
  if (categoryId) where.categoryId = categoryId
  if (search) {
    where.OR = [
      { name: { contains: String(search), mode: 'insensitive' } },
      { code: { contains: String(search), mode: 'insensitive' } },
      { hsnCode: { contains: String(search) } },
    ]
  }

  const [items, total] = await Promise.all([
    prisma.item.findMany({
      where,
      skip,
      take: limit,
      include: {
        category: { select: { id: true, name: true, attributes: true } },
        variants: { where: { isActive: true } },
        _count: { select: { variants: true } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.item.count({ where }),
  ])
  sendPaginated(res, items, total, page, limit)
})

mastersRouter.post('/items', async (req: Request, res: Response) => {
  const body = itemSchema.safeParse(req.body)
  if (!body.success) throw new BadRequestError(body.error.errors.map((e) => e.message).join(', '))

  const item = await prisma.item.create({ data: { ...body.data, companyId: req.companyId } })
  sendSuccess(res, item, 'Item created', 201)
})

mastersRouter.get('/items/:id', async (req: Request, res: Response) => {
  const item = await prisma.item.findFirst({
    where: { id: req.params.id, companyId: req.companyId },
    include: {
      category: true,
      variants: { where: { isActive: true } },
    },
  })
  if (!item) throw new NotFoundError('Item')
  sendSuccess(res, item)
})

mastersRouter.put('/items/:id', async (req: Request, res: Response) => {
  const body = itemSchema.partial().safeParse(req.body)
  if (!body.success) throw new BadRequestError(body.error.errors[0].message)
  const item = await prisma.item.update({ where: { id: req.params.id }, data: body.data as any })
  sendSuccess(res, item, 'Item updated')
})

// Item Variants
mastersRouter.post('/items/:id/variants', async (req: Request, res: Response) => {
  const body = variantSchema.safeParse(req.body)
  if (!body.success) throw new BadRequestError(body.error.errors[0].message)
  const variant = await prisma.itemVariant.create({ data: { ...body.data, itemId: req.params.id } })
  sendSuccess(res, variant, 'Variant created', 201)
})

mastersRouter.put('/items/:id/variants/:variantId', async (req: Request, res: Response) => {
  const body = variantSchema.partial().safeParse(req.body)
  if (!body.success) throw new BadRequestError(body.error.errors[0].message)
  const variant = await prisma.itemVariant.update({ where: { id: req.params.variantId }, data: body.data as any })
  sendSuccess(res, variant, 'Variant updated')
})

// ═══════════════════════════════════════════════════════════════
// LEDGER MASTER
// ═══════════════════════════════════════════════════════════════

const ledgerSchema = z.object({
  name: z.string().min(2),
  groupId: z.string().uuid(),
  openingBalance: z.number().default(0),
  openingType: z.enum(['Dr', 'Cr']).default('Dr'),
  gstin: z.string().optional(),
  panNumber: z.string().optional(),
  tdsApplicable: z.boolean().default(false),
  tdsSection: z.string().optional(),
  tdsRate: z.number().optional(),
  tdsThreshold: z.number().optional(),
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  ifscCode: z.string().optional(),
  upiId: z.string().optional(),
  bankBranch: z.string().optional(),
})

mastersRouter.get('/ledger-groups', async (req: Request, res: Response) => {
  const groups = await prisma.ledgerGroup.findMany({
    where: { companyId: req.companyId },
    include: { children: true },
    orderBy: { name: 'asc' },
  })
  sendSuccess(res, groups)
})

mastersRouter.get('/ledgers', async (req: Request, res: Response) => {
  const { search, groupId } = req.query
  const where: any = { companyId: req.companyId, isActive: true }
  if (groupId) where.groupId = groupId
  if (search) {
    where.OR = [
      { name: { contains: String(search), mode: 'insensitive' } },
      { gstin: { contains: String(search) } },
    ]
  }

  const ledgers = await prisma.ledger.findMany({
    where,
    include: { group: { select: { id: true, name: true, nature: true } } },
    orderBy: { name: 'asc' },
  })
  sendSuccess(res, ledgers)
})

mastersRouter.post('/ledgers', async (req: Request, res: Response) => {
  const body = ledgerSchema.safeParse(req.body)
  if (!body.success) throw new BadRequestError(body.error.errors[0].message)
  const ledger = await prisma.ledger.create({ data: { ...body.data, companyId: req.companyId } })
  sendSuccess(res, ledger, 'Ledger created', 201)
})

mastersRouter.put('/ledgers/:id', async (req: Request, res: Response) => {
  const body = ledgerSchema.partial().safeParse(req.body)
  if (!body.success) throw new BadRequestError(body.error.errors[0].message)
  const ledger = await prisma.ledger.update({ where: { id: req.params.id }, data: body.data as any })
  sendSuccess(res, ledger, 'Ledger updated')
})

// ═══════════════════════════════════════════════════════════════
// TAX MASTER
// ═══════════════════════════════════════════════════════════════

const DEFAULT_TAX_MASTERS = [
  { name: 'GST 0%',    gstRate: 0,    cgstRate: 0,    sgstRate: 0,    igstRate: 0,    cessRate: 0 },
  { name: 'GST 0.25%', gstRate: 0.25, cgstRate: 0.125,sgstRate: 0.125,igstRate: 0.25, cessRate: 0 },
  { name: 'GST 1%',    gstRate: 1,    cgstRate: 0.5,  sgstRate: 0.5,  igstRate: 1,    cessRate: 0 },
  { name: 'GST 1.5%',  gstRate: 1.5,  cgstRate: 0.75, sgstRate: 0.75, igstRate: 1.5,  cessRate: 0 },
  { name: 'GST 3%',    gstRate: 3,    cgstRate: 1.5,  sgstRate: 1.5,  igstRate: 3,    cessRate: 0 },
  { name: 'GST 5%',    gstRate: 5,    cgstRate: 2.5,  sgstRate: 2.5,  igstRate: 5,    cessRate: 0 },
  { name: 'GST 6%',    gstRate: 6,    cgstRate: 3,    sgstRate: 3,    igstRate: 6,    cessRate: 0 },
  { name: 'GST 7.5%',  gstRate: 7.5,  cgstRate: 3.75, sgstRate: 3.75, igstRate: 7.5,  cessRate: 0 },
  { name: 'GST 9%',    gstRate: 9,    cgstRate: 4.5,  sgstRate: 4.5,  igstRate: 9,    cessRate: 0 },
  { name: 'GST 12%',   gstRate: 12,   cgstRate: 6,    sgstRate: 6,    igstRate: 12,   cessRate: 0 },
  { name: 'GST 14%',   gstRate: 14,   cgstRate: 7,    sgstRate: 7,    igstRate: 14,   cessRate: 0 },
  { name: 'GST 18%',   gstRate: 18,   cgstRate: 9,    sgstRate: 9,    igstRate: 18,   cessRate: 0 },
  { name: 'GST 28%',   gstRate: 28,   cgstRate: 14,   sgstRate: 14,   igstRate: 28,   cessRate: 0 },
  { name: 'GST 28% + Cess 12%', gstRate: 28, cgstRate: 14, sgstRate: 14, igstRate: 28, cessRate: 12 },
  { name: 'GST 28% + Cess 22%', gstRate: 28, cgstRate: 14, sgstRate: 14, igstRate: 28, cessRate: 22 },
]

const taxMasterSchema = z.object({
  name:      z.string().min(2),
  gstRate:   z.coerce.number().min(0).max(100),
  cgstRate:  z.coerce.number().min(0).max(100),
  sgstRate:  z.coerce.number().min(0).max(100),
  igstRate:  z.coerce.number().min(0).max(100),
  cessRate:  z.coerce.number().min(0).max(100).default(0),
})

mastersRouter.get('/tax-masters', async (req: Request, res: Response) => {
  // Auto-seed defaults on first access
  const count = await prisma.taxMaster.count({ where: { companyId: req.companyId } })
  if (count === 0) {
    await prisma.taxMaster.createMany({
      data: DEFAULT_TAX_MASTERS.map(t => ({ ...t, companyId: req.companyId })),
      skipDuplicates: true,
    })
  }
  const taxes = await prisma.taxMaster.findMany({
    where: { companyId: req.companyId, isActive: true },
    orderBy: { gstRate: 'asc' },
  })
  sendSuccess(res, taxes)
})

mastersRouter.post('/tax-masters', async (req: Request, res: Response) => {
  const body = taxMasterSchema.safeParse(req.body)
  if (!body.success) throw new BadRequestError(body.error.errors[0].message)
  const dup = await prisma.taxMaster.findFirst({ where: { companyId: req.companyId, name: body.data.name } })
  if (dup) throw new BadRequestError(`Tax master "${body.data.name}" already exists`)
  const tax = await prisma.taxMaster.create({ data: { ...body.data, companyId: req.companyId } })
  sendSuccess(res, tax, 'Tax master created', 201)
})

mastersRouter.put('/tax-masters/:id', async (req: Request, res: Response) => {
  const existing = await prisma.taxMaster.findFirst({ where: { id: req.params.id, companyId: req.companyId } })
  if (!existing) throw new NotFoundError('Tax Master')
  const body = taxMasterSchema.partial().safeParse(req.body)
  if (!body.success) throw new BadRequestError(body.error.errors[0].message)
  if (body.data.name && body.data.name !== existing.name) {
    const dup = await prisma.taxMaster.findFirst({ where: { companyId: req.companyId, name: body.data.name, id: { not: req.params.id } } })
    if (dup) throw new BadRequestError(`Tax master "${body.data.name}" already exists`)
  }
  const tax = await prisma.taxMaster.update({ where: { id: req.params.id }, data: body.data as any })
  sendSuccess(res, tax, 'Tax master updated')
})

// ═══════════════════════════════════════════════════════════════
// GODOWN
// ═══════════════════════════════════════════════════════════════

mastersRouter.get('/godowns', async (req: Request, res: Response) => {
  const godowns = await prisma.godown.findMany({
    where: { companyId: req.companyId, isActive: true },
    orderBy: { name: 'asc' },
  })
  sendSuccess(res, godowns)
})

mastersRouter.post('/godowns', async (req: Request, res: Response) => {
  const body = z.object({ name: z.string(), location: z.string().optional() }).safeParse(req.body)
  if (!body.success) throw new BadRequestError('Invalid godown data')
  const godown = await prisma.godown.create({ data: { ...body.data, companyId: req.companyId } })
  sendSuccess(res, godown, 'Godown created', 201)
})

// ═══════════════════════════════════════════════════════════════
// NUMBER SERIES
// ═══════════════════════════════════════════════════════════════

mastersRouter.get('/number-series', async (req: Request, res: Response) => {
  const series = await prisma.numberSeries.findMany({
    where: { companyId: req.companyId },
  })
  sendSuccess(res, series)
})

mastersRouter.put('/number-series/:id', async (req: Request, res: Response) => {
  const body = z.object({
    prefix: z.string().optional(),
    suffix: z.string().optional(),
    startNumber: z.number().int().optional(),
    padLength: z.number().int().optional(),
    separator: z.string().optional(),
  }).safeParse(req.body)

  if (!body.success) throw new BadRequestError(body.error.errors[0].message)
  const series = await prisma.numberSeries.update({ where: { id: req.params.id }, data: body.data })
  sendSuccess(res, series, 'Series updated')
})
mastersRouter.post('/number-series', async (req: Request, res: Response) => {
  const body = z.object({
    voucherType: z.string(),
    prefix: z.string().default(''),
    suffix: z.string().default(''),
    separator: z.string().default('-'),
    padLength: z.number().int().default(4),
    startNumber: z.number().int().default(1),
    fyDependent: z.boolean().default(true),
    financialYear: z.string().optional(),
    branchId: z.string().optional(),
  }).safeParse(req.body)
  if (!body.success) throw new BadRequestError(body.error.errors[0].message)
  const series = await prisma.numberSeries.upsert({
    where: {
      companyId_branchId_voucherType_financialYear: {
        companyId: req.companyId,
        branchId: body.data.branchId || null,
        voucherType: body.data.voucherType as any,
        financialYear: body.data.financialYear || null,
      },
    },
    create: { ...body.data, companyId: req.companyId, voucherType: body.data.voucherType as any },
    update: { prefix: body.data.prefix, suffix: body.data.suffix, separator: body.data.separator, padLength: body.data.padLength, fyDependent: body.data.fyDependent },
  })
  sendSuccess(res, series, 'Series saved', 201)
})



// ═══════════════════════════════════════════════════════════════
// SAFE DELETE ROUTES — Check usage before deleting
// ═══════════════════════════════════════════════════════════════

// ─── DELETE /item-categories/:id ────────────────────────────────────────────
mastersRouter.delete('/item-categories/:id', async (req: Request, res: Response) => {
  const id = req.params.id

  // Check if any items use this category
  const itemCount = await prisma.item.count({
    where: { categoryId: id, isActive: true, companyId: req.companyId },
  })
  if (itemCount > 0) {
    throw new BadRequestError(
      `Cannot delete: ${itemCount} item(s) are using this category. Remove or reassign items first.`
    )
  }

  // Check if any child categories exist
  const childCount = await prisma.itemCategory.count({
    where: { parentId: id, isActive: true },
  })
  if (childCount > 0) {
    throw new BadRequestError(
      `Cannot delete: ${childCount} sub-categor${childCount > 1 ? 'ies' : 'y'} exist. Delete sub-categories first.`
    )
  }

  await prisma.itemCategory.update({ where: { id }, data: { isActive: false } })
  sendSuccess(res, null, 'Category deleted')
})

// ─── DELETE /items/:id ──────────────────────────────────────────────────────
mastersRouter.delete('/items/:id', async (req: Request, res: Response) => {
  const id = req.params.id

  // Check voucher usage
  const voucherCount = await prisma.voucherItem.count({ where: { itemId: id } })
  if (voucherCount > 0) {
    throw new BadRequestError(
      `Cannot delete: This item appears in ${voucherCount} transaction(s). Deactivate it instead.`
    )
  }

  // Check stock
  const stockBatches = await prisma.inventoryBatch.count({
    where: { itemId: id, remainingQty: { gt: 0 } },
  })
  if (stockBatches > 0) {
    throw new BadRequestError(
      `Cannot delete: Item has stock remaining. Clear stock first.`
    )
  }

  await prisma.item.update({ where: { id }, data: { isActive: false } })
  sendSuccess(res, null, 'Item deactivated')
})

// ─── DELETE /ledgers/:id ────────────────────────────────────────────────────
mastersRouter.delete('/ledgers/:id', async (req: Request, res: Response) => {
  const id = req.params.id

  const ledger = await prisma.ledger.findUnique({ where: { id } })
  if (!ledger) throw new NotFoundError('Ledger')

  if (ledger.isSystem) {
    throw new BadRequestError('Cannot delete system ledger. These are required for accounting.')
  }

  // Check voucher usage
  const voucherCount = await prisma.voucherLedger.count({ where: { ledgerId: id } })
  if (voucherCount > 0) {
    throw new BadRequestError(
      `Cannot delete: This ledger has ${voucherCount} transaction entries. Deactivate it instead.`
    )
  }

  // Check if party ledger
  const partyCount = await prisma.party.count({ where: { ledgerId: id, isActive: true } })
  if (partyCount > 0) {
    throw new BadRequestError(`Cannot delete: Linked to ${partyCount} party/parties.`)
  }

  await prisma.ledger.update({ where: { id }, data: { isActive: false } })
  sendSuccess(res, null, 'Ledger deactivated')
})

// ─── DELETE /ledger-groups/:id ──────────────────────────────────────────────
mastersRouter.delete('/ledger-groups/:id', async (req: Request, res: Response) => {
  const id = req.params.id

  const group = await prisma.ledgerGroup.findUnique({ where: { id } })
  if (!group) throw new NotFoundError('Ledger Group')
  if (group.isSystem) {
    throw new BadRequestError('Cannot delete system ledger group.')
  }

  const ledgerCount = await prisma.ledger.count({ where: { groupId: id, isActive: true } })
  if (ledgerCount > 0) {
    throw new BadRequestError(`Cannot delete: ${ledgerCount} ledger(s) are in this group.`)
  }

  const childGroupCount = await prisma.ledgerGroup.count({ where: { parentId: id } })
  if (childGroupCount > 0) {
    throw new BadRequestError(`Cannot delete: ${childGroupCount} sub-group(s) exist under this group.`)
  }

  await prisma.ledgerGroup.delete({ where: { id } })
  sendSuccess(res, null, 'Ledger group deleted')
})

// ─── DELETE /godowns/:id ────────────────────────────────────────────────────
mastersRouter.delete('/godowns/:id', async (req: Request, res: Response) => {
  const id = req.params.id

  const stockCount = await prisma.inventoryBatch.count({
    where: { godownId: id, remainingQty: { gt: 0 } },
  })
  if (stockCount > 0) {
    throw new BadRequestError(`Cannot delete: Godown has stock. Transfer stock first.`)
  }

  const voucherCount = await prisma.voucherItem.count({ where: { godownId: id } })
  if (voucherCount > 0) {
    throw new BadRequestError(`Cannot delete: Godown used in ${voucherCount} transaction(s).`)
  }

  await prisma.godown.update({ where: { id }, data: { isActive: false } })
  sendSuccess(res, null, 'Godown deactivated')
})

// ─── DELETE /tax-masters/:id ─────────────────────────────────────────────────
mastersRouter.delete('/tax-masters/:id', async (req: Request, res: Response) => {
  const id = req.params.id

  const usageCount = await prisma.voucherItem.count({ where: { gstRate: (await prisma.taxMaster.findUnique({ where: { id } }))?.gstRate ?? -1 } })
  if (usageCount > 0) {
    throw new BadRequestError(`Cannot delete: This tax rate is used in ${usageCount} transaction line(s).`)
  }

  await prisma.taxMaster.delete({ where: { id } })
  sendSuccess(res, null, 'Tax master deleted')
})

// ─── DELETE /parties/:id (already exists, but upgrade it) ───────────────────
mastersRouter.delete('/parties/:id/hard', async (req: Request, res: Response) => {
  const id = req.params.id

  const voucherCount = await prisma.voucher.count({ where: { partyId: id } })
  if (voucherCount > 0) {
    throw new BadRequestError(
      `Cannot delete: ${voucherCount} voucher(s) exist for this party. Deactivate instead.`
    )
  }

  const ledger = await prisma.party.findUnique({ where: { id }, select: { ledgerId: true } })
  await prisma.$transaction([
    prisma.partyAddress.deleteMany({ where: { partyId: id } }),
    prisma.party.delete({ where: { id } }),
    ...(ledger?.ledgerId ? [prisma.ledger.update({ where: { id: ledger.ledgerId }, data: { isActive: false } })] : []),
  ])
  sendSuccess(res, null, 'Party permanently deleted')
})

// ─── GET /items/:id/usage — check usage before delete ────────────────────────
mastersRouter.get('/items/:id/usage', async (req: Request, res: Response) => {
  const id = req.params.id
  const [voucherCount, stockCount] = await Promise.all([
    prisma.voucherItem.count({ where: { itemId: id } }),
    prisma.inventoryBatch.aggregate({ where: { itemId: id }, _sum: { remainingQty: true } }),
  ])
  sendSuccess(res, {
    voucherCount,
    stockQty: Number(stockCount._sum.remainingQty || 0),
    canDelete: voucherCount === 0 && Number(stockCount._sum.remainingQty || 0) === 0,
  })
})

// ─── GET /parties/:id/usage ──────────────────────────────────────────────────
mastersRouter.get('/parties/:id/usage', async (req: Request, res: Response) => {
  const id = req.params.id
  const [voucherCount, outstandingAmt] = await Promise.all([
    prisma.voucher.count({ where: { partyId: id } }),
    prisma.voucher.aggregate({
      where: { partyId: id, status: 'POSTED' },
      _sum: { balanceDue: true },
    }),
  ])
  sendSuccess(res, {
    voucherCount,
    outstandingAmount: Number(outstandingAmt._sum.balanceDue || 0),
    canDelete: voucherCount === 0,
  })
})

// ─── GET /ledgers/:id/usage ──────────────────────────────────────────────────
mastersRouter.get('/ledgers/:id/usage', async (req: Request, res: Response) => {
  const id = req.params.id
  const [voucherCount, partyCount] = await Promise.all([
    prisma.voucherLedger.count({ where: { ledgerId: id } }),
    prisma.party.count({ where: { ledgerId: id, isActive: true } }),
  ])
  sendSuccess(res, {
    voucherCount,
    partyCount,
    canDelete: voucherCount === 0 && partyCount === 0,
  })
})

// ─── UNIT MASTERS ─────────────────────────────────────────────────────────────

const DEFAULT_UNITS = [
  { name: 'PCS', symbol: 'Pcs', isSystem: true },
  { name: 'KG', symbol: 'Kg', isSystem: true },
  { name: 'GMS', symbol: 'g', isSystem: true },
  { name: 'LTR', symbol: 'L', isSystem: true },
  { name: 'ML', symbol: 'ml', isSystem: true },
  { name: 'MTR', symbol: 'm', isSystem: true },
  { name: 'CM', symbol: 'cm', isSystem: true },
  { name: 'BOX', symbol: 'Box', isSystem: true },
  { name: 'PKT', symbol: 'Pkt', isSystem: true },
  { name: 'DOZ', symbol: 'Doz', isSystem: true },
  { name: 'BAG', symbol: 'Bag', isSystem: true },
  { name: 'SET', symbol: 'Set', isSystem: true },
  { name: 'PAIR', symbol: 'Pr', isSystem: true },
  { name: 'NOS', symbol: 'Nos', isSystem: true },
  { name: 'ROLL', symbol: 'Roll', isSystem: true },
  { name: 'SQM', symbol: 'Sq.m', isSystem: true },
  { name: 'SQF', symbol: 'Sq.ft', isSystem: true },
  { name: 'TON', symbol: 'Ton', isSystem: true },
  { name: 'QTL', symbol: 'Qtl', isSystem: true },
]

mastersRouter.get('/units', async (req: Request, res: Response) => {
  // Seed defaults if none exist
  const count = await prisma.unitMaster.count({ where: { companyId: req.companyId } })
  if (count === 0) {
    await prisma.unitMaster.createMany({
      data: DEFAULT_UNITS.map(u => ({ ...u, companyId: req.companyId })),
      skipDuplicates: true,
    })
  }
  const units = await prisma.unitMaster.findMany({
    where: { companyId: req.companyId, isActive: true },
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
  })
  sendSuccess(res, units)
})

mastersRouter.post('/units', async (req: Request, res: Response) => {
  const { name, symbol } = z.object({
    name: z.string().min(1).max(20).toUpperCase(),
    symbol: z.string().min(1).max(10),
  }).parse(req.body)

  const unit = await prisma.unitMaster.create({
    data: { companyId: req.companyId, name: name.toUpperCase(), symbol, isSystem: false },
  })
  sendSuccess(res, unit, 'Unit created', 201)
})

mastersRouter.delete('/units/:id', async (req: Request, res: Response) => {
  const unit = await prisma.unitMaster.findFirst({ where: { id: req.params.id, companyId: req.companyId } })
  if (!unit) throw new NotFoundError('Unit')
  if (unit.isSystem) throw new BadRequestError('System units cannot be deleted')
  await prisma.unitMaster.delete({ where: { id: req.params.id } })
  sendSuccess(res, null, 'Unit deleted')
})

// ─── BANK ACCOUNTS (Bank Ledgers with account details) ───────────────────────

mastersRouter.get('/bank-accounts', async (req: Request, res: Response) => {
  // Get all ledgers in Bank group
  const banks = await prisma.ledger.findMany({
    where: {
      companyId: req.companyId,
      isActive: true,
      group: { name: { in: ['Bank Accounts', 'Bank Account', 'Cash-in-Hand', 'Cash'] } },
    },
    include: { group: { select: { name: true } } },
    orderBy: { name: 'asc' },
  })
  sendSuccess(res, banks)
})

// ═══════════════════════════════════════════════════════════════
// HSN / SAC CODE SEARCH
// ═══════════════════════════════════════════════════════════════

mastersRouter.get('/hsn-sac/search', async (req: Request, res: Response) => {
  const { q = '', type, limit = '20' } = req.query as Record<string, string>
  const take = Math.min(parseInt(limit) || 20, 100)

  if (!q || q.length < 2) {
    return sendSuccess(res, [])
  }

  const isNumeric = /^\d+$/.test(q.trim())

  const results = await prisma.hsnSacCode.findMany({
    where: {
      isActive: true,
      ...(type ? { codeType: type.toUpperCase() } : {}),
      OR: isNumeric
        ? [{ code: { startsWith: q.trim() } }]
        : [
            { code: { contains: q.trim() } },
            { description: { contains: q.trim(), mode: 'insensitive' } },
          ],
    },
    orderBy: [{ codeType: 'asc' }, { code: 'asc' }],
    take,
    select: { id: true, code: true, description: true, codeType: true },
  })

  sendSuccess(res, results)
})

// Seed HSN/SAC codes — call once via POST /api/masters/hsn-sac/seed (super admin only)
mastersRouter.post('/hsn-sac/seed', async (req: Request, res: Response) => {
  if (!req.user.isSuperAdmin) throw new ForbiddenError('Super admin only')

  const existing = await prisma.hsnSacCode.count()
  if (existing > 0) {
    return sendSuccess(res, { message: `Already seeded: ${existing} records exist`, count: existing })
  }

  const data: Array<{ code: string; description: string; codeType: string }> = req.body.data
  if (!Array.isArray(data) || data.length === 0) {
    throw new BadRequestError('No data provided')
  }

  // Batch insert in chunks of 1000
  const CHUNK = 1000
  let inserted = 0
  for (let i = 0; i < data.length; i += CHUNK) {
    const chunk = data.slice(i, i + CHUNK)
    await prisma.hsnSacCode.createMany({
      data: chunk.map(r => ({ code: r.code, description: r.description, codeType: r.codeType })),
      skipDuplicates: true,
    })
    inserted += chunk.length
  }

  sendSuccess(res, { message: `Seeded ${inserted} HSN/SAC codes`, count: inserted }, 'Seeded', 201)
})

// ═══════════════════════════════════════════════════════════════
// ITEM TAX HISTORY — date-wise GST rate applicability
// ═══════════════════════════════════════════════════════════════

// GET /masters/items/:itemId/tax-history
mastersRouter.get('/items/:itemId/tax-history', async (req: Request, res: Response) => {
  const history = await prisma.itemTaxHistory.findMany({
    where: { itemId: req.params.itemId },
    include: { taxMaster: { select: { id: true, name: true, gstRate: true, cgstRate: true, sgstRate: true, igstRate: true, cessRate: true } } },
    orderBy: { effectiveFrom: 'desc' },
  })
  sendSuccess(res, history)
})

// POST /masters/items/:itemId/tax-history — add a new date-wise rate change
mastersRouter.post('/items/:itemId/tax-history', async (req: Request, res: Response) => {
  const body = z.object({
    taxMasterId: z.string().uuid(),
    effectiveFrom: z.string().min(1),
    notificationNo: z.string().optional(),
    remarks: z.string().optional(),
  }).parse(req.body)

  const item = await prisma.item.findFirst({ where: { id: req.params.itemId, companyId: req.companyId } })
  if (!item) throw new NotFoundError('Item')

  const taxMaster = await prisma.taxMaster.findFirst({ where: { id: body.taxMasterId, companyId: req.companyId } })
  if (!taxMaster) throw new NotFoundError('Tax Master')

  const effectiveFrom = new Date(body.effectiveFrom)

  // Close previous active history record (set effectiveTo = effectiveFrom - 1 day)
  const prevActive = await prisma.itemTaxHistory.findFirst({
    where: { itemId: req.params.itemId, effectiveTo: null },
    orderBy: { effectiveFrom: 'desc' },
  })
  if (prevActive) {
    const closingDate = new Date(effectiveFrom)
    closingDate.setDate(closingDate.getDate() - 1)
    await prisma.itemTaxHistory.update({
      where: { id: prevActive.id },
      data: { effectiveTo: closingDate },
    })
  }

  // Create new history entry
  const entry = await prisma.itemTaxHistory.create({
    data: {
      companyId: req.companyId,
      itemId: req.params.itemId,
      taxMasterId: body.taxMasterId,
      effectiveFrom,
      effectiveTo: null,
      gstRate: taxMaster.gstRate,
      cessRate: taxMaster.cessRate,
      notificationNo: body.notificationNo,
      remarks: body.remarks,
      createdBy: req.user.userId,
    },
  })

  // Update item's current gstRate + taxMasterId to the new rate
  await prisma.item.update({
    where: { id: req.params.itemId },
    data: {
      taxMasterId: body.taxMasterId,
      gstRate: taxMaster.gstRate,
      cessRate: taxMaster.cessRate,
    },
  })

  sendSuccess(res, entry, 'Tax rate history added', 201)
})

// DELETE /masters/items/:itemId/tax-history/:historyId
mastersRouter.delete('/items/:itemId/tax-history/:historyId', async (req: Request, res: Response) => {
  const entry = await prisma.itemTaxHistory.findFirst({
    where: { id: req.params.historyId, itemId: req.params.itemId },
  })
  if (!entry) throw new NotFoundError('Tax history entry')
  await prisma.itemTaxHistory.delete({ where: { id: req.params.historyId } })
  sendSuccess(res, null, 'Tax history entry deleted')
})

// ─── Utility: Get effective tax rate for an item on a specific date ──────────
// GET /masters/items/:itemId/tax-rate?date=2025-06-01
mastersRouter.get('/items/:itemId/tax-rate', async (req: Request, res: Response) => {
  const dateStr = req.query.date as string
  const date = dateStr ? new Date(dateStr) : new Date()

  const history = await prisma.itemTaxHistory.findFirst({
    where: {
      itemId: req.params.itemId,
      effectiveFrom: { lte: date },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
    },
    include: { taxMaster: true },
    orderBy: { effectiveFrom: 'desc' },
  })

  if (history) {
    return sendSuccess(res, {
      gstRate: Number(history.gstRate),
      cessRate: Number(history.cessRate),
      taxMaster: history.taxMaster,
      source: 'history',
    })
  }

  // Fallback to item's current rate
  const item = await prisma.item.findFirst({
    where: { id: req.params.itemId, companyId: req.companyId },
    include: { taxMaster: true },
  })
  if (!item) throw new NotFoundError('Item')

  sendSuccess(res, {
    gstRate: Number(item.gstRate),
    cessRate: Number(item.cessRate),
    taxMaster: item.taxMaster,
    source: 'current',
  })
})

