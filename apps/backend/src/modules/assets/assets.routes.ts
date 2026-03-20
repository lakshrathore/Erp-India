import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { authenticate, withCompany } from '../../middleware/auth'
import { sendSuccess, sendPaginated, NotFoundError, BadRequestError } from '../../utils/response'
import { getPagination } from '../../utils/india'
import { DepreciationMethod, AssetStatus } from '@prisma/client'

export const assetsRouter = Router()
assetsRouter.use(authenticate, withCompany)

// ─── Schema ───────────────────────────────────────────────────────────────────

const assetSchema = z.object({
  code: z.string().optional(),
  name: z.string().min(2),
  description: z.string().optional(),
  category: z.string().min(1, 'Category required'),
  location: z.string().optional(),
  purchaseDate: z.string(),
  purchaseValue: z.coerce.number().positive('Purchase value must be > 0'),
  salvageValue: z.coerce.number().min(0).default(0),
  usefulLifeYears: z.coerce.number().int().min(1).default(5),
  depreciationMethod: z.nativeEnum(DepreciationMethod).default(DepreciationMethod.WDV),
  depreciationRate: z.coerce.number().min(0).max(100),
  vendorName: z.string().optional(),
  vendorInvoiceNo: z.string().optional(),
  warrantyExpiry: z.string().optional(),
  hsnCode: z.string().optional(),
  gstRate: z.coerce.number().default(18),
  assetLedgerId: z.string().uuid().optional(),
  depExpLedgerId: z.string().uuid().optional(),
  accDepLedgerId: z.string().uuid().optional(),
})

// ─── GET /assets ──────────────────────────────────────────────────────────────

assetsRouter.get('/', async (req: Request, res: Response) => {
  const { page, limit, skip } = getPagination(req.query)
  const { category, status, search } = req.query

  const where: any = { companyId: req.companyId, isActive: true }
  if (category) where.category = category
  if (status) where.status = status
  if (search) where.OR = [
    { name: { contains: String(search), mode: 'insensitive' } },
    { code: { contains: String(search), mode: 'insensitive' } },
  ]

  const [assets, total] = await Promise.all([
    prisma.fixedAsset.findMany({
      where, skip, take: limit,
      orderBy: { purchaseDate: 'desc' },
      include: { _count: { select: { depreciations: true } } },
    }),
    prisma.fixedAsset.count({ where }),
  ])

  sendPaginated(res, assets, total, page, limit)
})

// ─── GET /assets/summary ──────────────────────────────────────────────────────

assetsRouter.get('/summary', async (req: Request, res: Response) => {
  const assets = await prisma.fixedAsset.findMany({
    where: { companyId: req.companyId, isActive: true },
    select: { category: true, purchaseValue: true, currentValue: true, totalDepreciation: true, status: true },
  })

  const summary = assets.reduce((acc: any, a) => {
    if (!acc[a.category]) acc[a.category] = { count: 0, purchaseValue: 0, currentValue: 0, depreciation: 0 }
    acc[a.category].count++
    acc[a.category].purchaseValue += Number(a.purchaseValue)
    acc[a.category].currentValue += Number(a.currentValue)
    acc[a.category].depreciation += Number(a.totalDepreciation)
    return acc
  }, {})

  const totals = {
    totalAssets: assets.length,
    activeAssets: assets.filter(a => a.status === 'ACTIVE').length,
    totalPurchaseValue: assets.reduce((s, a) => s + Number(a.purchaseValue), 0),
    totalCurrentValue: assets.reduce((s, a) => s + Number(a.currentValue), 0),
    totalDepreciation: assets.reduce((s, a) => s + Number(a.totalDepreciation), 0),
    categories: summary,
  }

  sendSuccess(res, totals)
})

// ─── POST /assets/bulk-depreciate ────────────────────────────────────────────
// Run depreciation for all active assets for a given month

// ─── GET /assets/:id ──────────────────────────────────────────────────────────

assetsRouter.post('/bulk-depreciate', async (req: Request, res: Response) => {
  const { month, year } = z.object({ month: z.coerce.number().int().min(1).max(12), year: z.coerce.number().int() }).parse(req.body)

  const assets = await prisma.fixedAsset.findMany({
    where: { companyId: req.companyId, status: 'ACTIVE', isActive: true },
  })

  const results: any[] = []
  let skipped = 0

  for (const asset of assets) {
    const existing = await prisma.assetDepreciation.findUnique({
      where: { assetId_financialYear_month: { assetId: asset.id, financialYear: `${year}-${year + 1}`, month } },
    })
    if (existing) { skipped++; continue }

    const openingValue = Number(asset.currentValue)
    let depAmt = 0
    if (asset.depreciationMethod === 'WDV') {
      depAmt = (openingValue * Number(asset.depreciationRate)) / 100 / 12
    } else {
      depAmt = (Number(asset.purchaseValue) - Number(asset.salvageValue)) / (asset.usefulLifeYears * 12)
    }
    const maxDep = Math.max(0, openingValue - Number(asset.salvageValue))
    depAmt = Math.min(Math.round(Math.min(depAmt, maxDep) * 100) / 100, maxDep)

    const closingValue = openingValue - depAmt
    const fyName = month >= 4 ? `${year}-${String(year + 1).slice(2)}` : `${year - 1}-${String(year).slice(2)}`

    await prisma.$transaction([
      prisma.assetDepreciation.create({
        data: { assetId: asset.id, companyId: req.companyId, financialYear: fyName, month, year, openingValue, depreciationAmt: depAmt, closingValue },
      }),
      prisma.fixedAsset.update({
        where: { id: asset.id },
        data: { currentValue: closingValue, totalDepreciation: Number(asset.totalDepreciation) + depAmt, status: closingValue <= Number(asset.salvageValue) ? 'FULLY_DEPRECIATED' : 'ACTIVE' },
      }),
    ])
    results.push({ name: asset.name, depAmt })
  }

  sendSuccess(res, { processed: results.length, skipped, results }, 'Bulk depreciation complete')
})

assetsRouter.get('/:id', async (req: Request, res: Response) => {
  const asset = await prisma.fixedAsset.findFirst({
    where: { id: req.params.id, companyId: req.companyId },
    include: {
      depreciations: { orderBy: [{ year: 'desc' }, { month: 'desc' }] },
    },
  })
  if (!asset) throw new NotFoundError('Asset')
  sendSuccess(res, asset)
})

// ─── POST /assets ─────────────────────────────────────────────────────────────

assetsRouter.post('/', async (req: Request, res: Response) => {
  const body = assetSchema.safeParse(req.body)
  if (!body.success) throw new BadRequestError(body.error.errors[0].message)

  const asset = await prisma.fixedAsset.create({
    data: {
      ...body.data,
      companyId: req.companyId,
      currentValue: body.data.purchaseValue,
      purchaseDate: new Date(body.data.purchaseDate),
      warrantyExpiry: body.data.warrantyExpiry ? new Date(body.data.warrantyExpiry) : null,
    },
  })
  sendSuccess(res, asset, 'Asset created', 201)
})

// ─── PUT /assets/:id ──────────────────────────────────────────────────────────

assetsRouter.put('/:id', async (req: Request, res: Response) => {
  const body = assetSchema.partial().safeParse(req.body)
  if (!body.success) throw new BadRequestError(body.error.errors[0].message)

  const data: any = { ...body.data }
  if (data.purchaseDate) data.purchaseDate = new Date(data.purchaseDate)
  if (data.warrantyExpiry) data.warrantyExpiry = new Date(data.warrantyExpiry)

  const asset = await prisma.fixedAsset.update({ where: { id: req.params.id }, data })
  sendSuccess(res, asset, 'Asset updated')
})

// ─── POST /assets/:id/depreciate ─────────────────────────────────────────────
// Calculate and record depreciation for given month/year

assetsRouter.post('/:id/depreciate', async (req: Request, res: Response) => {
  const { month, year } = z.object({ month: z.coerce.number().int().min(1).max(12), year: z.coerce.number().int() }).parse(req.body)

  const asset = await prisma.fixedAsset.findFirst({ where: { id: req.params.id, companyId: req.companyId } })
  if (!asset) throw new NotFoundError('Asset')
  if (asset.status !== 'ACTIVE') throw new BadRequestError('Asset is not active')

  // Check not already done
  const existing = await prisma.assetDepreciation.findUnique({
    where: { assetId_financialYear_month: { assetId: asset.id, financialYear: `${year}-${year + 1}`, month } },
  })
  if (existing) throw new BadRequestError(`Depreciation already recorded for ${month}/${year}`)

  const openingValue = Number(asset.currentValue)
  let depAmt = 0

  if (asset.depreciationMethod === 'WDV') {
    // Monthly WDV = Opening × Rate / 12
    depAmt = (openingValue * Number(asset.depreciationRate)) / 100 / 12
  } else if (asset.depreciationMethod === 'SLM') {
    // Monthly SLM = (Cost - Salvage) / (Life × 12)
    depAmt = (Number(asset.purchaseValue) - Number(asset.salvageValue)) / (asset.usefulLifeYears * 12)
  }

  // Don't go below salvage value
  const maxDep = Math.max(0, openingValue - Number(asset.salvageValue))
  depAmt = Math.min(depAmt, maxDep)
  depAmt = Math.round(depAmt * 100) / 100

  const closingValue = openingValue - depAmt
  const fyName = month >= 4 ? `${year}-${String(year + 1).slice(2)}` : `${year - 1}-${String(year).slice(2)}`

  const [dep] = await prisma.$transaction([
    prisma.assetDepreciation.create({
      data: {
        assetId: asset.id, companyId: req.companyId,
        financialYear: fyName, month, year,
        openingValue, depreciationAmt: depAmt, closingValue,
      },
    }),
    prisma.fixedAsset.update({
      where: { id: asset.id },
      data: {
        currentValue: closingValue,
        totalDepreciation: Number(asset.totalDepreciation) + depAmt,
        status: closingValue <= Number(asset.salvageValue) ? 'FULLY_DEPRECIATED' : 'ACTIVE',
      },
    }),
  ])

  sendSuccess(res, dep, `Depreciation of ₹${depAmt.toFixed(2)} recorded`)
})

// ─── POST /assets/:id/dispose ────────────────────────────────────────────────

assetsRouter.post('/:id/dispose', async (req: Request, res: Response) => {
  const { disposalDate, disposalValue, disposalReason } = z.object({
    disposalDate: z.string(),
    disposalValue: z.coerce.number().min(0),
    disposalReason: z.string().optional(),
  }).parse(req.body)

  const asset = await prisma.fixedAsset.update({
    where: { id: req.params.id },
    data: {
      status: 'DISPOSED',
      disposalDate: new Date(disposalDate),
      disposalValue,
      disposalReason: disposalReason || null,
    },
  })
  sendSuccess(res, asset, 'Asset disposed')
})

