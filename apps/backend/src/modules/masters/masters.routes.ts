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
})

mastersRouter.get('/parties', async (req: Request, res: Response) => {
  const { page, limit, skip } = getPagination(req.query)
  const { search, type, isActive = 'true' } = req.query

  const where: any = { companyId: req.companyId }
  if (isActive === 'true') where.isActive = true
  if (type) where.type = type
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
  attributes: z.array(categoryAttributeSchema).default([]),
  trackBatch: z.boolean().default(false),
  trackExpiry: z.boolean().default(false),
})

mastersRouter.get('/item-categories', async (req: Request, res: Response) => {
  const cats = await prisma.itemCategory.findMany({
    where: { companyId: req.companyId, isActive: true },
    include: { _count: { select: { items: true } } },
    orderBy: { name: 'asc' },
  })
  sendSuccess(res, cats)
})

mastersRouter.post('/item-categories', async (req: Request, res: Response) => {
  const body = itemCategorySchema.safeParse(req.body)
  if (!body.success) throw new BadRequestError(body.error.errors[0].message)
  const cat = await prisma.itemCategory.create({ data: { ...body.data, companyId: req.companyId } })
  sendSuccess(res, cat, 'Category created', 201)
})

mastersRouter.put('/item-categories/:id', async (req: Request, res: Response) => {
  const body = itemCategorySchema.partial().safeParse(req.body)
  if (!body.success) throw new BadRequestError(body.error.errors[0].message)
  const cat = await prisma.itemCategory.update({ where: { id: req.params.id }, data: body.data as any })
  sendSuccess(res, cat, 'Category updated')
})

// ═══════════════════════════════════════════════════════════════
// ITEM MASTER
// ═══════════════════════════════════════════════════════════════

const itemSchema = z.object({
  name: z.string().min(2),
  code: z.string().optional(),
  categoryId: z.string().uuid().optional().nullable(),
  description: z.string().optional(),
  unit: z.string().default('PCS'),
  alternateUnit: z.string().optional(),
  conversionFactor: z.coerce.number().optional(),
  hsnCode: z.string().optional(),
  sacCode: z.string().optional(),
  gstRate: z.coerce.number().min(0).max(100).default(18),
  cessRate: z.coerce.number().default(0),
  taxType: z.nativeEnum(TaxType).default('CGST_SGST'),
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

mastersRouter.get('/tax-masters', async (req: Request, res: Response) => {
  const taxes = await prisma.taxMaster.findMany({
    where: { companyId: req.companyId, isActive: true },
    orderBy: { gstRate: 'asc' },
  })
  sendSuccess(res, taxes)
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
