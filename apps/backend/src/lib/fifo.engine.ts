import { prisma } from '../lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FIFOConsumed {
  batchId: string
  qty: number
  purchaseRate: number
  value: number
}

export interface StockSummary {
  itemId: string
  variantId: string | null
  godownId: string | null
  totalQty: number
  totalValue: number
  avgRate: number
}

// ─── FIFO Engine ──────────────────────────────────────────────────────────────

/**
 * Consume stock using FIFO - returns list of batches consumed with cost
 * Call inside a transaction
 */
export async function consumeFIFO(
  tx: any,
  itemId: string,
  variantId: string | null,
  godownId: string | null,
  qtyNeeded: number,
  date: Date
): Promise<FIFOConsumed[]> {
  // Get batches oldest-first with available qty
  const batches = await tx.inventoryBatch.findMany({
    where: {
      itemId,
      ...(variantId ? { variantId } : {}),
      ...(godownId ? { godownId } : {}),
      qtyBalance: { gt: 0 },
      isActive: true,
    },
    orderBy: { purchaseDate: 'asc' },
  })

  const consumed: FIFOConsumed[] = []
  let remaining = qtyNeeded

  for (const batch of batches) {
    if (remaining <= 0) break

    const available = Number(batch.qtyBalance)
    const take = Math.min(available, remaining)

    consumed.push({
      batchId: batch.id,
      qty: take,
      purchaseRate: Number(batch.purchaseRate),
      value: take * Number(batch.purchaseRate),
    })

    // Update batch
    await tx.inventoryBatch.update({
      where: { id: batch.id },
      data: {
        qtyOut: { increment: take },
        qtyBalance: { decrement: take },
      },
    })

    remaining -= take
  }

  if (remaining > 0.001) {
    throw new Error(
      `Insufficient stock for item. Required: ${qtyNeeded}, Available: ${qtyNeeded - remaining}`
    )
  }

  return consumed
}

/**
 * Add stock batch (on purchase / production)
 */
export async function addStockBatch(
  tx: any,
  params: {
    itemId: string
    variantId?: string | null
    godownId?: string | null
    purchaseDate: Date
    purchaseRate: number
    qty: number
    batchNo?: string | null
    mfgDate?: Date | null
    expDate?: Date | null
    sourceVoucherId?: string
  }
) {
  return tx.inventoryBatch.create({
    data: {
      itemId: params.itemId,
      variantId: params.variantId ?? null,
      godownId: params.godownId ?? null,
      purchaseDate: params.purchaseDate,
      purchaseRate: params.purchaseRate,
      qtyIn: params.qty,
      qtyOut: 0,
      qtyBalance: params.qty,
      batchNo: params.batchNo ?? null,
      mfgDate: params.mfgDate ?? null,
      expDate: params.expDate ?? null,
      sourceVoucherId: params.sourceVoucherId,
    },
  })
}

/**
 * Get current stock summary for items in a company
 */
export async function getStockSummary(
  companyId: string,
  params: {
    itemId?: string
    godownId?: string
    date?: Date
  } = {}
): Promise<StockSummary[]> {
  const where: any = {
    item: { companyId },
    isActive: true,
  }
  if (params.itemId) where.itemId = params.itemId
  if (params.godownId) where.godownId = params.godownId

  const batches = await prisma.inventoryBatch.groupBy({
    by: ['itemId', 'variantId', 'godownId'],
    where,
    _sum: { qtyBalance: true, qtyIn: true },
    // value = sum(qtyBalance * purchaseRate) — need raw SQL for this
  })

  // For value calculation, need weighted average
  const result: StockSummary[] = []

  for (const b of batches) {
    const valueBatches = await prisma.inventoryBatch.findMany({
      where: {
        itemId: b.itemId,
        variantId: b.variantId,
        godownId: b.godownId,
        isActive: true,
        qtyBalance: { gt: 0 },
      },
      select: { qtyBalance: true, purchaseRate: true },
    })

    const totalQty = valueBatches.reduce((s, x) => s + Number(x.qtyBalance), 0)
    const totalValue = valueBatches.reduce(
      (s, x) => s + Number(x.qtyBalance) * Number(x.purchaseRate),
      0
    )

    result.push({
      itemId: b.itemId,
      variantId: b.variantId,
      godownId: b.godownId,
      totalQty,
      totalValue,
      avgRate: totalQty > 0 ? totalValue / totalQty : 0,
    })
  }

  return result
}

/**
 * Get item ledger (movement history) with running balance
 */
export async function getItemLedger(
  itemId: string,
  variantId: string | null,
  companyId: string,
  from: Date,
  to: Date
) {
  const movements = await prisma.stockMovement.findMany({
    where: {
      itemId,
      ...(variantId ? { variantId } : {}),
      companyId,
      date: { gte: from, lte: to },
    },
    include: {
      voucher: {
        select: {
          voucherType: true,
          voucherNumber: true,
          party: { select: { name: true } },
        },
      },
      godown: { select: { name: true } },
    },
    orderBy: { date: 'asc' },
  })

  // Add running balance
  let runningQty = 0
  return movements.map((m) => {
    if (m.movementType === 'IN') runningQty += Number(m.qty)
    else if (m.movementType === 'OUT') runningQty -= Number(m.qty)
    return {
      ...m,
      runningQty,
      qty: Number(m.qty),
      rate: Number(m.rate),
      value: Number(m.value),
    }
  })
}

/**
 * Calculate gross profit for sale vouchers using FIFO cost
 */
export async function calculateItemProfit(
  companyId: string,
  from: Date,
  to: Date
) {
  // Get all OUT movements (sales) in period
  const saleMovements = await prisma.stockMovement.findMany({
    where: {
      companyId,
      movementType: 'OUT',
      date: { gte: from, lte: to },
      voucher: { voucherType: 'SALE' },
    },
    include: {
      item: { select: { id: true, name: true, hsnCode: true } },
      variant: { select: { id: true, attributeValues: true } },
      voucher: {
        select: {
          voucherNumber: true,
          grandTotal: true,
          party: { select: { name: true } },
        },
      },
    },
  })

  // Get sale amounts per item from voucher_items
  const profitByItem: Record<string, {
    itemId: string
    itemName: string
    saleQty: number
    saleValue: number
    cogs: number
    grossProfit: number
    grossMarginPct: number
  }> = {}

  for (const m of saleMovements) {
    const key = m.itemId
    if (!profitByItem[key]) {
      profitByItem[key] = {
        itemId: m.itemId,
        itemName: m.item.name,
        saleQty: 0,
        saleValue: 0,
        cogs: 0,
        grossProfit: 0,
        grossMarginPct: 0,
      }
    }

    const entry = profitByItem[key]
    entry.saleQty += Number(m.qty)
    entry.cogs += Number(m.value) // FIFO cost at time of sale
  }

  // Get sale value from voucher items (taxable amount = actual sale price)
  const voucherItems = await prisma.voucherItem.findMany({
    where: {
      itemId: { in: Object.keys(profitByItem) },
      voucher: {
        companyId,
        voucherType: 'SALE',
        date: { gte: from, lte: to },
        status: 'POSTED',
      },
    },
    select: { itemId: true, taxableAmount: true },
  })

  for (const vi of voucherItems) {
    if (profitByItem[vi.itemId]) {
      profitByItem[vi.itemId].saleValue += Number(vi.taxableAmount)
    }
  }

  // Calculate profit
  for (const key of Object.keys(profitByItem)) {
    const e = profitByItem[key]
    e.grossProfit = e.saleValue - e.cogs
    e.grossMarginPct = e.saleValue > 0 ? (e.grossProfit / e.saleValue) * 100 : 0
  }

  return Object.values(profitByItem).sort((a, b) => b.grossProfit - a.grossProfit)
}
