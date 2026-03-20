import { Router, Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { authenticate, withCompany } from '../../middleware/auth'
import { sendSuccess, BadRequestError } from '../../utils/response'
import { parseGSTRPeriod } from '../../utils/india'

export const gstRouter = Router()
gstRouter.use(authenticate, withCompany)

// ─── GSTR-1 Data ──────────────────────────────────────────────────────────────

gstRouter.get('/gstr1', async (req: Request, res: Response) => {
  const { period } = req.query
  if (!period) throw new BadRequestError('period is required (format: MMYYYY, e.g. 032025)')

  const { month, year } = parseGSTRPeriod(String(period))
  const fromDate = new Date(year, month - 1, 1)
  const toDate = new Date(year, month, 0)

  const gstEntries = await prisma.gSTEntry.findMany({
    where: { companyId: req.companyId, period: String(period) },
    include: {
      voucher: {
        select: {
          voucherNumber: true,
          date: true,
          grandTotal: true,
          party: { select: { name: true, gstin: true } },
        },
      },
    },
  })

  // Group by entry type
  const b2b = gstEntries.filter((e) => e.entryType === 'B2B')
  const b2cs = gstEntries.filter((e) => e.entryType === 'B2CS')
  const b2cl = gstEntries.filter((e) => e.entryType === 'B2CL')
  const cdnr = gstEntries.filter((e) => e.entryType === 'CDNR')
  const exp = gstEntries.filter((e) => e.entryType === 'EXP')

  // HSN Summary — aggregate from voucher items
  const voucherIds = gstEntries.map((e) => e.voucherId)
  const itemTotals = await prisma.voucherItem.groupBy({
    by: ['itemId'],
    where: { voucherId: { in: voucherIds } },
    _sum: { qty: true, taxableAmount: true, cgstAmount: true, sgstAmount: true, igstAmount: true },
  })

  const itemDetails = await prisma.item.findMany({
    where: { id: { in: itemTotals.map((i) => i.itemId) } },
    select: { id: true, hsnCode: true, unit: true, name: true },
  })

  const hsnSummary = itemTotals.map((it) => {
    const item = itemDetails.find((d) => d.id === it.itemId)
    return {
      hsn: item?.hsnCode || '',
      description: item?.name || '',
      uom: item?.unit || 'PCS',
      qty: Number(it._sum.qty || 0),
      taxableValue: Number(it._sum.taxableAmount || 0),
      cgst: Number(it._sum.cgstAmount || 0),
      sgst: Number(it._sum.sgstAmount || 0),
      igst: Number(it._sum.igstAmount || 0),
    }
  })

  const summary = {
    totalTaxableValue: gstEntries.reduce((s, e) => s + Number(e.taxableValue), 0),
    totalIGST: gstEntries.reduce((s, e) => s + Number(e.igstAmount), 0),
    totalCGST: gstEntries.reduce((s, e) => s + Number(e.cgstAmount), 0),
    totalSGST: gstEntries.reduce((s, e) => s + Number(e.sgstAmount), 0),
    totalCess: gstEntries.reduce((s, e) => s + Number(e.cessAmount), 0),
  }

  sendSuccess(res, { period, b2b, b2cs, b2cl, cdnr, exp, hsnSummary, summary })
})

// ─── GSTR-3B Computation ─────────────────────────────────────────────────────

gstRouter.get('/gstr3b', async (req: Request, res: Response) => {
  const { period } = req.query
  if (!period) throw new BadRequestError('period required')

  const { month, year } = parseGSTRPeriod(String(period))
  const fromDate = new Date(year, month - 1, 1)
  const toDate = new Date(year, month, 0)

  // 3.1 - Outward taxable supplies (from GST entries)
  const outwardEntries = await prisma.gSTEntry.findMany({
    where: { companyId: req.companyId, period: String(period) },
  })

  const table31 = {
    taxable: { taxableValue: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 },
    zeroRated: { taxableValue: 0, igst: 0 },
    nil: { taxableValue: 0 },
    exempted: { taxableValue: 0 },
    nonGST: { taxableValue: 0 },
  }

  for (const e of outwardEntries) {
    table31.taxable.taxableValue += Number(e.taxableValue)
    table31.taxable.igst += Number(e.igstAmount)
    table31.taxable.cgst += Number(e.cgstAmount)
    table31.taxable.sgst += Number(e.sgstAmount)
    table31.taxable.cess += Number(e.cessAmount)
  }

  // 4 - ITC available (from purchase entries with GST)
  const purchaseVouchers = await prisma.voucher.findMany({
    where: {
      companyId: req.companyId,
      voucherType: 'PURCHASE',
      status: 'POSTED',
      date: { gte: fromDate, lte: toDate },
    },
    select: {
      cgstAmount: true, sgstAmount: true, igstAmount: true, cessAmount: true,
      isReverseCharge: true, party: { select: { gstType: true } },
    },
  })

  const table4 = {
    itcAvailable: {
      importOfGoods: { igst: 0, cess: 0 },
      importOfServices: { igst: 0, cess: 0 },
      inwardRCM: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
      inwardISDs: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
      allOtherITC: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
    },
  }

  for (const pv of purchaseVouchers) {
    if (!pv.isReverseCharge && pv.party?.gstType === 'REGULAR') {
      table4.itcAvailable.allOtherITC.igst += Number(pv.igstAmount)
      table4.itcAvailable.allOtherITC.cgst += Number(pv.cgstAmount)
      table4.itcAvailable.allOtherITC.sgst += Number(pv.sgstAmount)
      table4.itcAvailable.allOtherITC.cess += Number(pv.cessAmount)
    }
    if (pv.isReverseCharge) {
      table4.itcAvailable.inwardRCM.igst += Number(pv.igstAmount)
      table4.itcAvailable.inwardRCM.cgst += Number(pv.cgstAmount)
      table4.itcAvailable.inwardRCM.sgst += Number(pv.sgstAmount)
    }
  }

  // Net tax payable
  const totalITCIGST = Object.values(table4.itcAvailable).reduce((s, v: any) => s + (v.igst || 0), 0)
  const totalITCCGST = Object.values(table4.itcAvailable).reduce((s, v: any) => s + (v.cgst || 0), 0)
  const totalITCSGST = Object.values(table4.itcAvailable).reduce((s, v: any) => s + (v.sgst || 0), 0)

  const netIGST = Math.max(0, table31.taxable.igst - totalITCIGST)
  const netCGST = Math.max(0, table31.taxable.cgst - totalITCCGST)
  const netSGST = Math.max(0, table31.taxable.sgst - totalITCSGST)

  sendSuccess(res, {
    period,
    table31,
    table4,
    netTaxPayable: { igst: netIGST, cgst: netCGST, sgst: netSGST, cess: table31.taxable.cess },
    totalOutwardTax: table31.taxable.igst + table31.taxable.cgst + table31.taxable.sgst,
    totalITC: totalITCIGST + totalITCCGST + totalITCSGST,
    totalPayable: netIGST + netCGST + netSGST,
  })
})

// ─── 2B Reconciliation ────────────────────────────────────────────────────────

gstRouter.get('/recon/2b', async (req: Request, res: Response) => {
  const { period } = req.query
  if (!period) throw new BadRequestError('period required')

  const [b2bEntries, booksEntries] = await Promise.all([
    // 2B entries from portal
    prisma.gSTR2BEntry.findMany({
      where: { companyId: req.companyId, period: String(period) },
    }),
    // Purchase entries in books for this period
    prisma.gSTEntry.findMany({
      where: {
        companyId: req.companyId,
        period: String(period),
        // For purchases - entries from purchase vouchers
      },
      include: { voucher: { select: { voucherType: true, voucherNumber: true } } },
    }),
  ])

  // Auto-reconcile: match by supplier GSTIN + invoice number
  const matched: any[] = []
  const inPortalNotBooks: any[] = []
  const inBooksNotPortal: any[] = []

  for (const b2b of b2bEntries) {
    const bookMatch = booksEntries.find(
      (be) =>
        be.partyGstin === b2b.supplierGstin &&
        be.invoiceNumber.toLowerCase() === b2b.invoiceNumber.toLowerCase()
    )

    if (bookMatch) {
      const taxDiff = Math.abs(
        (Number(b2b.igstAmount) + Number(b2b.cgstAmount) + Number(b2b.sgstAmount)) -
        (Number(bookMatch.igstAmount) + Number(bookMatch.cgstAmount) + Number(bookMatch.sgstAmount))
      )
      matched.push({
        gstin: b2b.supplierGstin,
        supplierName: b2b.supplierName,
        invoiceNumber: b2b.invoiceNumber,
        invoiceDate: b2b.invoiceDate,
        portal: { taxable: Number(b2b.taxableValue), igst: Number(b2b.igstAmount), cgst: Number(b2b.cgstAmount), sgst: Number(b2b.sgstAmount) },
        books: { taxable: Number(bookMatch.taxableValue), igst: Number(bookMatch.igstAmount), cgst: Number(bookMatch.cgstAmount), sgst: Number(bookMatch.sgstAmount) },
        taxDifference: taxDiff,
        status: taxDiff < 1 ? 'MATCHED' : 'PARTIAL',
      })
    } else {
      inPortalNotBooks.push({
        gstin: b2b.supplierGstin,
        supplierName: b2b.supplierName,
        invoiceNumber: b2b.invoiceNumber,
        invoiceDate: b2b.invoiceDate,
        taxableValue: Number(b2b.taxableValue),
        igst: Number(b2b.igstAmount),
        cgst: Number(b2b.cgstAmount),
        sgst: Number(b2b.sgstAmount),
        message: 'Available in GSTR-2B but not booked in purchases',
      })
    }
  }

  sendSuccess(res, {
    period,
    summary: {
      total2BEntries: b2bEntries.length,
      matched: matched.length,
      inPortalNotBooks: inPortalNotBooks.length,
      inBooksNotPortal: inBooksNotPortal.length,
      totalITCAtRisk: inPortalNotBooks.reduce((s, e) => s + e.igst + e.cgst + e.sgst, 0),
    },
    matched,
    inPortalNotBooks,
    inBooksNotPortal,
  })
})

// ─── Upload 2B JSON ───────────────────────────────────────────────────────────

gstRouter.post('/recon/2b/upload', async (req: Request, res: Response) => {
  const { period, entries } = req.body
  if (!period || !Array.isArray(entries)) throw new BadRequestError('period and entries[] required')

  let created = 0
  for (const e of entries) {
    await prisma.gSTR2BEntry.upsert({
      where: {
        companyId_period_supplierGstin_invoiceNumber: {
          companyId: req.companyId,
          period,
          supplierGstin: e.supplierGstin,
          invoiceNumber: e.invoiceNumber,
        },
      },
      create: {
        companyId: req.companyId,
        period,
        supplierGstin: e.supplierGstin,
        supplierName: e.supplierName,
        invoiceNumber: e.invoiceNumber,
        invoiceDate: new Date(e.invoiceDate),
        invoiceType: e.invoiceType || 'B2B',
        placeOfSupply: e.placeOfSupply,
        reverseCharge: e.reverseCharge || false,
        taxableValue: e.taxableValue,
        igstAmount: e.igstAmount || 0,
        cgstAmount: e.cgstAmount || 0,
        sgstAmount: e.sgstAmount || 0,
        cessAmount: e.cessAmount || 0,
        itcAvailable: e.itcAvailable !== false,
      },
      update: {
        taxableValue: e.taxableValue,
        igstAmount: e.igstAmount || 0,
        cgstAmount: e.cgstAmount || 0,
        sgstAmount: e.sgstAmount || 0,
      },
    })
    created++
  }

  sendSuccess(res, { uploaded: created }, `${created} 2B entries uploaded`)
})
