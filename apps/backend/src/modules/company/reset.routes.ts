import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { authenticate, withCompany, requireRole } from '../../middleware/auth'
import { sendSuccess, BadRequestError, ForbiddenError } from '../../utils/response'
import { UserRole } from '@prisma/client'

export const resetRouter = Router()
resetRouter.use(authenticate, withCompany)

// Only Company Admin can do reset operations
const adminOnly = requireRole(UserRole.COMPANY_ADMIN)

// ─── Helper: get FYs in chronological order ───────────────────────────────────

async function getFYsInOrder(companyId: string) {
  const fys = await prisma.financialYear.findMany({
    where: { companyId },
    orderBy: { startDate: 'asc' },
  })
  return fys
}

// ─── GET /reset/preview — show what will be deleted ──────────────────────────

resetRouter.get('/preview', adminOnly, async (req: Request, res: Response) => {
  const companyId = req.companyId
  const { type, fy } = req.query

  const fys = await getFYsInOrder(companyId)

  const counts: any = {
    financialYears: fys.map(f => f.name),
    byFY: {},
  }

  // Count transactions per FY
  for (const fyRec of fys) {
    const [vouchers, journalEntries, stockMovements, gstEntries] = await Promise.all([
      prisma.voucher.count({ where: { companyId, financialYear: { in: [fyRec.name, fyRec.name.replace('20', '')] } } }),
      prisma.journalEntry.count({ where: { companyId, financialYear: fyRec.name } }),
      prisma.stockMovement.count({ where: { companyId, financialYear: fyRec.name } }),
      prisma.gSTEntry.count({ where: { companyId, financialYear: fyRec.name } }),
    ])
    counts.byFY[fyRec.name] = { vouchers, journalEntries, stockMovements, gstEntries }
  }

  // Master counts
  const [items, categories, parties, ledgers, openingBalanceCount] = await Promise.all([
    prisma.item.count({ where: { companyId } }),
    prisma.itemCategory.count({ where: { companyId } }),
    prisma.party.count({ where: { companyId } }),
    prisma.ledger.count({ where: { companyId, isSystem: false } }),
    prisma.ledger.count({ where: { companyId, openingBalance: { gt: 0 } } }),
  ])

  counts.masters = { items, categories, parties, ledgers, openingBalances: openingBalanceCount }

  sendSuccess(res, counts)
})

// ─── POST /reset/transactions — delete all transactions for a FY ──────────────

resetRouter.post('/transactions', adminOnly, async (req: Request, res: Response) => {
  const { financialYear, resetNumberSeries, confirm } = z.object({
    financialYear: z.string().min(1),
    resetNumberSeries: z.boolean().default(true),
    confirm: z.literal(true, { errorMap: () => ({ message: 'Must confirm deletion' }) }),
  }).parse(req.body)

  const companyId = req.companyId

  // Check FY exists
  const fy = await prisma.financialYear.findFirst({
    where: { companyId, name: financialYear },
  })
  if (!fy) throw new BadRequestError(`Financial year ${financialYear} not found`)

  // FY variants (e.g. "2025-26" and "25-26")
  const fyVariants = [financialYear]
  if (financialYear.startsWith('20')) fyVariants.push(financialYear.slice(2)) // "2025-26" → "25-26"
  else fyVariants.push(`20${financialYear}`) // "25-26" → "2025-26"

  // Get voucher IDs before transaction
  const voucherIds = await prisma.voucher.findMany({
    where: { companyId, financialYear: { in: fyVariants } },
    select: { id: true },
  })
  const ids = voucherIds.map(v => v.id)

  // Delete in correct order (foreign key dependencies)
  await prisma.$transaction(async (tx) => {
    // 1. Delete GST entries
    await tx.gSTEntry.deleteMany({ where: { companyId, financialYear: { in: fyVariants } } })

    // 2. Delete TDS entries
    await tx.tDSEntry.deleteMany({ where: { companyId } })

    if (ids.length > 0) {
      await tx.voucherSettlement.deleteMany({
        where: { OR: [{ voucherId: { in: ids } }, { againstVoucherId: { in: ids } }] },
      })
      await tx.voucherLink.deleteMany({
        where: { OR: [{ voucherId: { in: ids } }, { linkedVoucherId: { in: ids } }] },
      })
    }

    // 4. Delete journal entries
    await tx.journalEntry.deleteMany({ where: { companyId, financialYear: { in: fyVariants } } })

    // 5. Delete stock movements
    await tx.stockMovement.deleteMany({ where: { companyId, financialYear: { in: fyVariants } } })

    // 6. Delete inventory batches linked to these vouchers
    if (ids.length > 0) {
      await tx.inventoryBatch.deleteMany({ where: { sourceVoucherId: { in: ids } } })
    }

    // 7. Delete voucher items + ledger entries (cascade from voucher delete)
    // Delete vouchers (cascade deletes VoucherItem, VoucherLedger)
    await tx.voucher.deleteMany({ where: { companyId, financialYear: { in: fyVariants } } })

    // 8. Reset number series if requested
    if (resetNumberSeries) {
      await tx.numberSeries.updateMany({
        where: { companyId, financialYear: financialYear },
        data: { currentNumber: 0 },
      })
    }
  })

  sendSuccess(res, {
    financialYear,
    numberSeriesReset: resetNumberSeries,
  }, `Transactions for FY ${financialYear} deleted successfully`)
})

// ─── POST /reset/opening-balances — clear all opening balances ────────────────

resetRouter.post('/opening-balances', adminOnly, async (req: Request, res: Response) => {
  const { scope, confirm } = z.object({
    scope: z.enum(['ALL', 'LEDGERS', 'PARTIES']).default('ALL'),
    confirm: z.literal(true),
  }).parse(req.body)

  const companyId = req.companyId

  await prisma.$transaction(async (tx) => {
    if (scope === 'ALL' || scope === 'LEDGERS') {
      await tx.ledger.updateMany({
        where: { companyId },
        data: { openingBalance: 0, openingType: 'Dr' },
      })
    }
    if (scope === 'ALL' || scope === 'PARTIES') {
      await tx.party.updateMany({
        where: { companyId },
        data: { openingBalance: 0, openingType: 'Dr' },
      })
    }
  })

  sendSuccess(res, { scope }, 'Opening balances cleared')
})

// ─── POST /reset/categories — delete all item categories ─────────────────────

resetRouter.post('/categories', adminOnly, async (req: Request, res: Response) => {
  const { confirm, resetItemCategories } = z.object({
    confirm: z.literal(true),
    resetItemCategories: z.boolean().default(true), // Also clear categoryId from items
  }).parse(req.body)

  const companyId = req.companyId

  await prisma.$transaction(async (tx) => {
    // First clear categoryId from all items
    if (resetItemCategories) {
      await tx.item.updateMany({
        where: { companyId },
        data: { categoryId: null },
      })
    }
    // Delete all item categories
    await tx.itemCategory.deleteMany({ where: { companyId } })
  })

  const deleted = await prisma.itemCategory.count({ where: { companyId } })
  sendSuccess(res, { deleted: 0 }, 'Categories deleted')
})

// ─── POST /reset/items — delete all items and variants ───────────────────────

resetRouter.post('/items', adminOnly, async (req: Request, res: Response) => {
  const { confirm, forceDelete } = z.object({
    confirm: z.literal(true),
    forceDelete: z.boolean().default(false), // Force even if transactions exist
  }).parse(req.body)

  const companyId = req.companyId

  // Check if items have transactions
  const itemsWithTxn = await prisma.voucherItem.count({
    where: { item: { companyId } },
  })

  if (itemsWithTxn > 0 && !forceDelete) {
    throw new BadRequestError(
      `${itemsWithTxn} transaction lines use these items. Delete transactions first, or use forceDelete=true.`
    )
  }

  await prisma.$transaction(async (tx) => {
    // Delete variants first
    await tx.itemVariant.deleteMany({ where: { item: { companyId } } })
    // Delete items (cascade deletes VoucherItems if forceDelete)
    if (forceDelete) {
      await tx.stockMovement.deleteMany({ where: { companyId } })
      await tx.inventoryBatch.deleteMany({ where: { item: { companyId } } })
    }
    await tx.item.deleteMany({ where: { companyId } })
  })

  sendSuccess(res, {}, 'Items deleted')
})

// ─── POST /reset/all-transactions-all-fy — delete ALL transactions all FYs ───

resetRouter.post('/all-transactions', adminOnly, async (req: Request, res: Response) => {
  const { confirm, resetNumberSeries } = z.object({
    confirm: z.literal(true),
    resetNumberSeries: z.boolean().default(true),
  }).parse(req.body)

  const companyId = req.companyId
  const fys = await getFYsInOrder(companyId)

  // Delete oldest FY first → newest last
  for (const fy of fys) {
    const fyVariants = [fy.name]
    if (fy.name.startsWith('20')) fyVariants.push(fy.name.slice(2))
    else fyVariants.push(`20${fy.name}`)

    const vIds = await prisma.voucher.findMany({
      where: { companyId, financialYear: { in: fyVariants } },
      select: { id: true },
    })
    const ids = vIds.map(v => v.id)

    await prisma.$transaction(async (tx) => {
      await tx.gSTEntry.deleteMany({ where: { companyId, financialYear: { in: fyVariants } } })
      await tx.tDSEntry.deleteMany({ where: { companyId } })

      if (ids.length > 0) {
        await tx.voucherSettlement.deleteMany({
          where: { OR: [{ voucherId: { in: ids } }, { againstVoucherId: { in: ids } }] },
        })
        await tx.voucherLink.deleteMany({
          where: { OR: [{ voucherId: { in: ids } }, { linkedVoucherId: { in: ids } }] },
        })
        await tx.inventoryBatch.deleteMany({ where: { sourceVoucherId: { in: ids } } })
      }

      await tx.journalEntry.deleteMany({ where: { companyId, financialYear: { in: fyVariants } } })
      await tx.stockMovement.deleteMany({ where: { companyId, financialYear: { in: fyVariants } } })
      await tx.voucher.deleteMany({ where: { companyId, financialYear: { in: fyVariants } } })
    })
  }

  if (resetNumberSeries) {
    await prisma.numberSeries.updateMany({
      where: { companyId },
      data: { currentNumber: 0 },
    })
  }

  sendSuccess(res, {
    financialYearsProcessed: fys.map(f => f.name),
    order: 'Oldest to newest',
    numberSeriesReset: resetNumberSeries,
  }, 'All transactions deleted across all financial years')
})
