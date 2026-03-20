import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { VoucherType, VoucherStatus, TaxType, MovementType } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { authenticate, withCompany } from '../../middleware/auth'
import { sendSuccess, sendPaginated, NotFoundError, BadRequestError, ForbiddenError } from '../../utils/response'
import { getPagination, getFinancialYear, calculateGST, roundOff } from '../../utils/india'
import { generateVoucherNumber } from '../../utils/voucher-number'
import { consumeFIFO, addStockBatch } from '../../lib/fifo.engine'

export const billingRouter = Router()
billingRouter.use(authenticate, withCompany)

// ─── Schemas ──────────────────────────────────────────────────────────────────

const voucherItemSchema = z.object({
  itemId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  description: z.string().optional(),
  unit: z.string().default('PCS'),
  qty: z.coerce.number().positive(),
  freeQty: z.coerce.number().default(0),
  rate: z.coerce.number().min(0),
  discountPct: z.coerce.number().min(0).max(100).default(0),
  discount2Pct: z.coerce.number().min(0).max(100).default(0),
  discount3Pct: z.coerce.number().min(0).max(100).default(0),
  gstRate: z.coerce.number().min(0).max(100),
  taxType: z.nativeEnum(TaxType).default('CGST_SGST'),
  batchNo: z.string().optional().nullable(),
  mfgDate: z.string().optional().nullable(),
  expDate: z.string().optional().nullable(),
  godownId: z.string().uuid().optional().nullable(),
})

const voucherLedgerSchema = z.object({
  ledgerId: z.string().uuid(),
  debit: z.coerce.number().default(0),
  credit: z.coerce.number().default(0),
  narration: z.string().optional(),
})

const voucherSchema = z.object({
  voucherType: z.nativeEnum(VoucherType),
  date: z.string(),
  branchId: z.string().uuid().optional().nullable(),
  partyId: z.string().uuid().optional().nullable(),
  narration: z.string().optional(),
  placeOfSupply: z.string().optional(),
  isReverseCharge: z.boolean().default(false),
  isExport: z.boolean().default(false),
  isInclusive: z.boolean().default(false),  // GST inclusive pricing
  saleType: z.string().optional().nullable(),
  lut: z.string().optional().nullable(),
  lutDate: z.string().optional().nullable(),
  refVoucherType: z.nativeEnum(VoucherType).optional().nullable(),
  refVoucherNumber: z.string().optional().nullable(),
  refVoucherDate: z.string().optional().nullable(),
  items: z.array(voucherItemSchema).optional().default([]),
  ledgerEntries: z.array(voucherLedgerSchema).optional().default([]),
  roundOff: z.coerce.number().default(0),
})

// ─── VOUCHER TYPES that affect inventory ─────────────────────────────────────

const INVENTORY_IN_TYPES = new Set<VoucherType>([
  'PURCHASE_CHALLAN',  // GRN - goods received
  'PRODUCTION',        // finished goods in
])

const INVENTORY_OUT_TYPES = new Set<VoucherType>([
  'SALE',              // goods out on sale
  'SALE_CHALLAN',      // Note: challans DO affect stock (goods dispatched)
])

const ACCOUNTING_TYPES = new Set<VoucherType>([
  'SALE', 'PURCHASE', 'CREDIT_NOTE', 'DEBIT_NOTE',
  'RECEIPT', 'PAYMENT', 'CONTRA', 'JOURNAL',
])

// ─── GET /billing/vouchers ────────────────────────────────────────────────────

billingRouter.get('/vouchers', async (req: Request, res: Response) => {
  const { page, limit, skip } = getPagination(req.query)
  const { voucherType, partyId, status, from, to, search } = req.query

  const where: any = { companyId: req.companyId }
  if (voucherType) where.voucherType = voucherType as any
  if (partyId) where.partyId = partyId
  if (status) where.status = status as any
  if (from || to) {
    where.date = {}
    if (from) {
      const fromDate = new Date(String(from))
      if (!isNaN(fromDate.getTime())) where.date.gte = fromDate
    }
    if (to) {
      const toDate = new Date(String(to))
      if (!isNaN(toDate.getTime())) where.date.lte = toDate
    }
  }
  if (search) {
    where.OR = [
      { voucherNumber: { contains: String(search), mode: 'insensitive' } },
      { party: { name: { contains: String(search), mode: 'insensitive' } } },
      { narration: { contains: String(search), mode: 'insensitive' } },
    ]
  }

  const [vouchers, total] = await Promise.all([
    prisma.voucher.findMany({
      where,
      skip,
      take: limit,
      orderBy: { date: 'desc' },
      include: {
        party: { select: { id: true, name: true, gstin: true } },
        branch: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.voucher.count({ where }),
  ])

  sendPaginated(res, vouchers, total, page, limit)
})

// ─── GET /billing/vouchers/:id ────────────────────────────────────────────────

billingRouter.get('/vouchers/:id', async (req: Request, res: Response) => {
  const voucher = await prisma.voucher.findFirst({
    where: { id: req.params.id, companyId: req.companyId },
    include: {
      party: true,
      branch: true,
      items: {
        include: {
          item: { select: { id: true, name: true, unit: true, hsnCode: true } },
          variant: { select: { id: true, attributeValues: true } },
        },
        orderBy: { sortOrder: 'asc' },
      },
      ledgerEntries: {
        include: { ledger: { select: { id: true, name: true } } },
        orderBy: { sortOrder: 'asc' },
      },
      journalEntries: {
        include: { ledger: { select: { id: true, name: true } } },
      },
      gstEntries: true,
      linkedFrom: {
        include: { parent: { select: { id: true, voucherType: true, voucherNumber: true } } },
      },
      linkedTo: {
        include: { child: { select: { id: true, voucherType: true, voucherNumber: true } } },
      },
    },
  })

  if (!voucher) throw new NotFoundError('Voucher')
  sendSuccess(res, voucher)
})

// ─── POST /billing/vouchers ───────────────────────────────────────────────────

billingRouter.post('/vouchers', async (req: Request, res: Response) => {
  const body = voucherSchema.safeParse(req.body)
  if (!body.success) {
    throw new BadRequestError(body.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '))
  }

  const data = body.data
  const voucherDate = new Date(data.date)
  const financialYear = getFinancialYear(voucherDate)

  const voucher = await prisma.$transaction(async (tx) => {
    // Generate voucher number
    const voucherNumber = await generateVoucherNumber(
      tx, req.companyId, data.branchId || null, data.voucherType, financialYear
    )

    // ── Calculate item totals ────────────────────────────────────────────────
    let totalQty = 0, subtotal = 0, discountAmount = 0, taxableTotal = 0
    let cgstTotal = 0, sgstTotal = 0, igstTotal = 0, cessTotal = 0

    const processedItems: any[] = []

    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i]
      const gross = item.qty * item.rate
      // Multi-level cascading discount: D1 on gross, D2 on (gross-D1), D3 on result
      const d1 = (item.discountPct || 0) / 100
      const d2 = (item.discount2Pct || 0) / 100
      const d3 = (item.discount3Pct || 0) / 100
      const netRate = item.rate * (1 - d1) * (1 - d2) * (1 - d3)
      const amountAfterDisc = netRate * item.qty
      const disc = gross - amountAfterDisc  // total discount in amount

      // Inclusive: taxable = amountAfterDisc / (1 + gstRate/100)
      const gst = calculateGST(amountAfterDisc, item.gstRate, item.taxType as any, 0, data.isInclusive)
      const taxable = gst.taxableAmount ?? amountAfterDisc

      totalQty += item.qty
      subtotal += gross
      discountAmount += disc
      taxableTotal += taxable
      cgstTotal += gst.cgst
      sgstTotal += gst.sgst
      igstTotal += gst.igst
      cessTotal += gst.cess

      processedItems.push({
        itemId: item.itemId,
        variantId: item.variantId || null,
        description: item.description,
        unit: item.unit,
        qty: item.qty,
        freeQty: item.freeQty,
        rate: item.rate,
        discountPct: item.discountPct || 0,
        discountAmt: disc,
        discount2Pct: item.discount2Pct || 0,
        discount2Amt: item.rate * item.qty * (1 - d1) * d2,
        discount3Pct: item.discount3Pct || 0,
        discount3Amt: item.rate * item.qty * (1 - d1) * (1 - d2) * d3,
        taxableAmount: taxable,
        gstRate: item.gstRate,
        taxType: item.taxType,
        cgstRate: item.taxType === 'CGST_SGST' ? item.gstRate / 2 : 0,
        cgstAmount: gst.cgst,
        sgstRate: item.taxType === 'CGST_SGST' ? item.gstRate / 2 : 0,
        sgstAmount: gst.sgst,
        igstRate: item.taxType === 'IGST' ? item.gstRate : 0,
        igstAmount: gst.igst,
        cessRate: 0,
        cessAmount: gst.cess,
        lineTotal: gst.total,
        sortOrder: i,
        batchNo: item.batchNo || null,
        mfgDate: item.mfgDate ? new Date(item.mfgDate) : null,
        expDate: item.expDate ? new Date(item.expDate) : null,
      })
    }

    // Inclusive: grandTotal = sum of gst.total (lineTotal) per item
    // Exclusive: grandTotal = taxable + all taxes
    const rawTotal = data.isInclusive
      ? processedItems.reduce((s, item) => s + Number(item.lineTotal), 0)
      : (taxableTotal + cgstTotal + sgstTotal + igstTotal + cessTotal)
    const { rounded: grandTotal, roundOff: roundOffAmt } = roundOff(rawTotal)

    // ── Create voucher ───────────────────────────────────────────────────────
    const voucher = await tx.voucher.create({
      data: {
        companyId: req.companyId,
        branchId: data.branchId || null,
        financialYear,
        voucherType: data.voucherType,
        voucherNumber,
        date: voucherDate,
        partyId: data.partyId || null,
        narration: data.narration,
        status: VoucherStatus.DRAFT,
        placeOfSupply: data.placeOfSupply,
        isReverseCharge: data.isReverseCharge,
        isExport: data.isExport,
        saleType: data.saleType || null,
        ...(data.isInclusive !== undefined ? { isInclusive: data.isInclusive } : {}),
        lut: data.lut || null,
        lutDate: data.lutDate ? new Date(data.lutDate) : null,
        refVoucherType: data.refVoucherType || null,
        refVoucherNumber: data.refVoucherNumber || null,
        refVoucherDate: data.refVoucherDate ? new Date(data.refVoucherDate) : null,
        totalQty,
        subtotal,
        discountAmount,
        taxableAmount: taxableTotal,
        cgstAmount: cgstTotal,
        sgstAmount: sgstTotal,
        igstAmount: igstTotal,
        cessAmount: cessTotal,
        roundOff: roundOffAmt,
        grandTotal,
        balanceDue: grandTotal,
        createdBy: req.user.userId,
        items: { create: processedItems },
        ledgerEntries: data.ledgerEntries.length > 0
          ? { create: data.ledgerEntries.map((le, i) => ({ ...le, sortOrder: i })) }
          : undefined,
      },
    })

    // ── Inventory movements (for DRAFT → we create movements on POST) ───────
    // Only for voucher types that move stock
    if (INVENTORY_IN_TYPES.has(data.voucherType)) {
      for (const item of processedItems) {
        await addStockBatch(tx, {
          itemId: item.itemId,
          variantId: item.variantId,
          purchaseDate: voucherDate,
          purchaseRate: item.rate - (item.discountAmt / item.qty),
          qty: item.qty,
          batchNo: item.batchNo,
          mfgDate: item.mfgDate,
          expDate: item.expDate,
          sourceVoucherId: voucher.id,
        })

        await tx.stockMovement.create({
          data: {
            companyId: req.companyId,
            voucherId: voucher.id,
            itemId: item.itemId,
            variantId: item.variantId,
            date: voucherDate,
            movementType: MovementType.IN,
            qty: item.qty,
            rate: item.rate,
            value: item.taxableAmount,
            financialYear,
          },
        })
      }
    }

    return voucher
  })

  sendSuccess(res, voucher, 'Voucher created', 201)
})

// ─── POST /billing/vouchers/:id/post ─────────────────────────────────────────
// Post a DRAFT voucher → creates journal entries, GST entries

billingRouter.post('/vouchers/:id/post', async (req: Request, res: Response) => {
  const voucher = await prisma.voucher.findFirst({
    where: { id: req.params.id, companyId: req.companyId },
    include: { items: true, ledgerEntries: true, party: true },
  })
  if (!voucher) throw new NotFoundError('Voucher')
  if (voucher.status !== 'DRAFT') throw new BadRequestError('Only DRAFT vouchers can be posted')

  await prisma.$transaction(async (tx) => {
    // Validate ledger entries balance for accounting vouchers
    if (ACCOUNTING_TYPES.has(voucher.voucherType) && voucher.ledgerEntries.length > 0) {
      const totalDebit = voucher.ledgerEntries.reduce((s, e) => s + Number(e.debit), 0)
      const totalCredit = voucher.ledgerEntries.reduce((s, e) => s + Number(e.credit), 0)
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        throw new BadRequestError(`Voucher not balanced. Debit: ₹${totalDebit.toFixed(2)}, Credit: ₹${totalCredit.toFixed(2)}`)
      }
    }

    // Auto-generate journal entries from ledger entries
    if (voucher.ledgerEntries.length > 0) {
      await tx.journalEntry.createMany({
        data: voucher.ledgerEntries.map((le) => ({
          companyId: req.companyId,
          voucherId: voucher.id,
          date: voucher.date,
          ledgerId: le.ledgerId,
          debit: le.debit,
          credit: le.credit,
          narration: le.narration || voucher.narration,
          financialYear: voucher.financialYear,
        })),
      })
    }

    // FIFO consumption for sale-type vouchers
    if (INVENTORY_OUT_TYPES.has(voucher.voucherType)) {
      for (const item of voucher.items) {
        const consumed = await consumeFIFO(
          tx,
          item.itemId,
          item.variantId,
          null,
          Number(item.qty),
          voucher.date
        )

        const totalCost = consumed.reduce((s, c) => s + c.value, 0)

        await tx.stockMovement.create({
          data: {
            companyId: req.companyId,
            voucherId: voucher.id,
            itemId: item.itemId,
            variantId: item.variantId,
            date: voucher.date,
            movementType: MovementType.OUT,
            qty: Number(item.qty),
            rate: totalCost / Number(item.qty),
            value: totalCost,
            financialYear: voucher.financialYear,
          },
        })
      }
    }

    // Create GST entry for B2B sales
    if (
      voucher.voucherType === 'SALE' &&
      voucher.party?.gstin &&
      Number(voucher.taxableAmount) > 0
    ) {
      const period = `${String(voucher.date.getMonth() + 1).padStart(2, '0')}${voucher.date.getFullYear()}`
      await tx.gSTEntry.create({
        data: {
          companyId: req.companyId,
          voucherId: voucher.id,
          entryType: 'B2B',
          period,
          invoiceNumber: voucher.voucherNumber,
          invoiceDate: voucher.date,
          partyGstin: voucher.party.gstin,
          partyName: voucher.party.name,
          placeOfSupply: voucher.placeOfSupply || '08',
          reverseCharge: voucher.isReverseCharge,
          taxableValue: voucher.taxableAmount,
          igstAmount: voucher.igstAmount,
          cgstAmount: voucher.cgstAmount,
          sgstAmount: voucher.sgstAmount,
          cessAmount: voucher.cessAmount,
        },
      })
    }

    // Update voucher status
    await tx.voucher.update({
      where: { id: voucher.id },
      data: {
        status: VoucherStatus.POSTED,
        postedAt: new Date(),
        postedBy: req.user.userId,
        balanceDue: ['SALE', 'PURCHASE', 'CREDIT_NOTE', 'DEBIT_NOTE'].includes(voucher.voucherType)
          ? voucher.grandTotal
          : 0,
      },
    })
  })

  sendSuccess(res, null, 'Voucher posted successfully')
})

// ─── PUT /billing/vouchers/:id ────────────────────────────────────────────────
// Only DRAFT vouchers can be edited

billingRouter.put('/vouchers/:id', async (req: Request, res: Response) => {
  const existing = await prisma.voucher.findFirst({
    where: { id: req.params.id, companyId: req.companyId },
  })
  if (!existing) throw new NotFoundError('Voucher')
  if (existing.status === 'POSTED') throw new ForbiddenError('Posted vouchers cannot be edited. Cancel and re-create.')

  const body = voucherSchema.partial().safeParse(req.body)
  if (!body.success) throw new BadRequestError(body.error.errors[0].message)

  // Delete and recreate items / ledger entries
  await prisma.$transaction(async (tx) => {
    if (body.data.items !== undefined) {
      await tx.voucherItem.deleteMany({ where: { voucherId: req.params.id } })
    }
    if (body.data.ledgerEntries !== undefined) {
      await tx.voucherLedger.deleteMany({ where: { voucherId: req.params.id } })
    }

    const updateData: any = {}
    if (body.data.date) updateData.date = new Date(body.data.date)
    if (body.data.partyId !== undefined) updateData.partyId = body.data.partyId
    if (body.data.narration !== undefined) updateData.narration = body.data.narration
    if (body.data.placeOfSupply !== undefined) updateData.placeOfSupply = body.data.placeOfSupply

    if (body.data.items && body.data.items.length > 0) {
      let taxableTotal = 0, cgstTotal = 0, sgstTotal = 0, igstTotal = 0, cessTotal = 0
      let totalQty = 0, subtotal = 0, discountAmount = 0

      const processedItems = body.data.items.map((item, i) => {
        const gross = item.qty! * item.rate!
        const disc = (gross * (item.discountPct || 0)) / 100
        const taxable = gross - disc
        const gst = calculateGST(taxable, item.gstRate!, item.taxType as any || 'CGST_SGST')

        totalQty += item.qty!; subtotal += gross; discountAmount += disc
        taxableTotal += taxable; cgstTotal += gst.cgst; sgstTotal += gst.sgst
        igstTotal += gst.igst; cessTotal += gst.cess

        return {
          voucherId: req.params.id,
          itemId: item.itemId!, variantId: item.variantId || null,
          description: item.description, unit: item.unit || 'PCS',
          qty: item.qty!, freeQty: item.freeQty || 0, rate: item.rate!,
          discountPct: item.discountPct || 0, discountAmt: disc,
          taxableAmount: taxable, gstRate: item.gstRate!, taxType: item.taxType!,
          cgstRate: item.taxType === 'CGST_SGST' ? item.gstRate! / 2 : 0,
          cgstAmount: gst.cgst,
          sgstRate: item.taxType === 'CGST_SGST' ? item.gstRate! / 2 : 0,
          sgstAmount: gst.sgst,
          igstRate: item.taxType === 'IGST' ? item.gstRate! : 0,
          igstAmount: gst.igst, cessRate: 0, cessAmount: gst.cess,
          lineTotal: gst.total, sortOrder: i,
        }
      })

      await tx.voucherItem.createMany({ data: processedItems })

      const rawTotal = taxableTotal + cgstTotal + sgstTotal + igstTotal + cessTotal
      const { rounded: grandTotal, roundOff: ro } = roundOff(rawTotal)

      Object.assign(updateData, {
        totalQty, subtotal, discountAmount,
        taxableAmount: taxableTotal,
        cgstAmount: cgstTotal, sgstAmount: sgstTotal, igstAmount: igstTotal,
        cessAmount: cessTotal, roundOff: ro, grandTotal, balanceDue: grandTotal,
      })
    }

    if (body.data.ledgerEntries && body.data.ledgerEntries.length > 0) {
      await tx.voucherLedger.createMany({
        data: body.data.ledgerEntries.map((le, i) => ({
          voucherId: req.params.id, ...le, sortOrder: i,
        })),
      })
    }

    await tx.voucher.update({ where: { id: req.params.id }, data: updateData })
  })

  const updated = await prisma.voucher.findUnique({
    where: { id: req.params.id },
    include: { items: true, ledgerEntries: true },
  })
  sendSuccess(res, updated, 'Voucher updated')
})

// ─── POST /billing/vouchers/:id/cancel ───────────────────────────────────────

billingRouter.post('/vouchers/:id/cancel', async (req: Request, res: Response) => {
  const { reason } = req.body
  const voucher = await prisma.voucher.findFirst({
    where: { id: req.params.id, companyId: req.companyId },
  })
  if (!voucher) throw new NotFoundError('Voucher')
  if (voucher.status === 'CANCELLED') throw new BadRequestError('Already cancelled')

  await prisma.$transaction(async (tx) => {
    // Reverse journal entries if posted
    if (voucher.status === 'POSTED') {
      const journals = await tx.journalEntry.findMany({ where: { voucherId: voucher.id } })
      // Create reversal entries
      if (journals.length > 0) {
        await tx.journalEntry.createMany({
          data: journals.map((j) => ({
            companyId: req.companyId,
            voucherId: voucher.id,
            date: new Date(),
            ledgerId: j.ledgerId,
            debit: j.credit,   // reversed
            credit: j.debit,   // reversed
            narration: `Cancellation: ${reason || 'No reason'}`,
            financialYear: voucher.financialYear,
          })),
        })
      }

      // Reverse stock movements
      const movements = await tx.stockMovement.findMany({ where: { voucherId: voucher.id } })
      if (movements.length > 0) {
        await tx.stockMovement.createMany({
          data: movements.map((m) => ({
            companyId: req.companyId,
            voucherId: voucher.id,
            itemId: m.itemId,
            variantId: m.variantId,
            date: new Date(),
            movementType: m.movementType === 'IN' ? MovementType.OUT : MovementType.IN,
            qty: m.qty,
            rate: m.rate,
            value: m.value,
            narration: `Reversal: ${reason || ''}`,
            financialYear: voucher.financialYear,
          })),
        })
      }
    }

    await tx.voucher.update({
      where: { id: voucher.id },
      data: {
        status: VoucherStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledBy: req.user.userId,
        cancelReason: reason,
        balanceDue: 0,
      },
    })
  })

  sendSuccess(res, null, 'Voucher cancelled')
})

// ─── GET /billing/vouchers/:id/journal ───────────────────────────────────────

billingRouter.get('/vouchers/:id/journal', async (req: Request, res: Response) => {
  const entries = await prisma.journalEntry.findMany({
    where: { voucherId: req.params.id },
    include: { ledger: { select: { id: true, name: true, group: { select: { name: true, nature: true } } } } },
    orderBy: { debit: 'desc' },
  })

  const totalDebit = entries.reduce((s, e) => s + Number(e.debit), 0)
  const totalCredit = entries.reduce((s, e) => s + Number(e.credit), 0)

  sendSuccess(res, { entries, totalDebit, totalCredit, isBalanced: Math.abs(totalDebit - totalCredit) < 0.01 })
})

// ─── GET /billing/outstanding ─────────────────────────────────────────────────

billingRouter.get('/outstanding', async (req: Request, res: Response) => {
  const { type = 'receivable', partyId } = req.query

  const voucherTypes = type === 'receivable'
    ? ['SALE', 'DEBIT_NOTE']
    : ['PURCHASE', 'CREDIT_NOTE']

  const where: any = {
    companyId: req.companyId,
    voucherType: { in: voucherTypes },
    status: 'POSTED',
    balanceDue: { gt: 0 },
  }
  if (partyId) where.partyId = partyId

  const vouchers = await prisma.voucher.findMany({
    where,
    include: { party: { select: { id: true, name: true, phone: true } } },
    orderBy: { date: 'asc' },
  })

  const today = new Date()
  const result = vouchers.map((v) => {
    const daysElapsed = Math.floor((today.getTime() - v.date.getTime()) / (1000 * 60 * 60 * 24))
    return {
      ...v,
      daysElapsed,
      isOverdue: daysElapsed > 0, // in real app use credit days from party
      grandTotal: Number(v.grandTotal),
      balanceDue: Number(v.balanceDue),
    }
  })

  const totalOutstanding = result.reduce((s, v) => s + v.balanceDue, 0)
  sendSuccess(res, { vouchers: result, totalOutstanding })
})

// ─── POST /billing/vouchers/settle ───────────────────────────────────────────

billingRouter.post('/vouchers/settle', async (req: Request, res: Response) => {
  const { fromVoucherId, againstVoucherId, amount, date } = req.body
  if (!fromVoucherId || !againstVoucherId || !amount) {
    throw new BadRequestError('fromVoucherId, againstVoucherId, amount required')
  }

  await prisma.$transaction(async (tx) => {
    await tx.voucherSettlement.create({
      data: {
        fromVoucherId,
        againstVoucherId,
        amount: Number(amount),
        date: new Date(date),
      },
    })
    // Reduce balance due on against voucher
    await tx.voucher.update({
      where: { id: againstVoucherId },
      data: { balanceDue: { decrement: Number(amount) } },
    })
  })

  sendSuccess(res, null, 'Settlement saved')
})
