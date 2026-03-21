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

// ─── Helper: resolve voucher by ID or voucherNumber ──────────────────────────
async function resolveVoucher(idOrNumber: string, companyId: string) {
  // Try UUID first (internal use), then voucherNumber (human-readable URL)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrNumber)
  return prisma.voucher.findFirst({
    where: isUUID
      ? { id: idOrNumber, companyId }
      : { voucherNumber: idOrNumber, companyId },
  })
}

// ─── Helper: get company ledger mappings ─────────────────────────────────────
async function getLedgerMappings(companyId: string): Promise<Record<string, string>> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { ledgerMappings: true, gstRegType: true },
  })
  if (!company?.ledgerMappings) return {}
  try { return JSON.parse(company.ledgerMappings) } catch { return {} }
}

// ─── Helper: get ledger ID by name (fallback) ────────────────────────────────
async function getLedgerByName(companyId: string, name: string): Promise<string | null> {
  const l = await prisma.ledger.findFirst({ where: { companyId, name, isActive: true }, select: { id: true } })
  return l?.id || null
}

// ─── Helper: auto-generate journal entries for SALE / PURCHASE / CREDIT_NOTE / DEBIT_NOTE
async function autoGenerateJournalEntries(
  tx: any,
  voucher: any,
  companyId: string,
  mappings: Record<string, string>
) {
  const vType = voucher.voucherType
  const isSale = ['SALE', 'DEBIT_NOTE'].includes(vType)
  const isPurchase = ['PURCHASE', 'CREDIT_NOTE'].includes(vType)
  if (!isSale && !isPurchase) return

  const date = voucher.date
  const fy = voucher.financialYear
  const narration = voucher.narration || `${vType} - ${voucher.voucherNumber}`

  // Amount helpers
  const grandTotal = Number(voucher.grandTotal)
  const taxable = Number(voucher.taxableAmount)
  const cgst = Number(voucher.cgstAmount)
  const sgst = Number(voucher.sgstAmount)
  const igst = Number(voucher.igstAmount)
  const cess = Number(voucher.cessAmount)
  const discount = Number(voucher.discountAmount || 0)
  const roundOffAmt = Number(voucher.roundOff || 0)

  // Resolve ledger IDs from mappings or by name
  const resolveId = async (key: string, fallback: string) =>
    mappings[key] || await getLedgerByName(companyId, fallback) || null

  const partyLedgerId = voucher.party?.ledgerId || null
  const salesLedgerId = await resolveId('sale_sales_ledger', 'Sales')
  const purchaseLedgerId = await resolveId('purchase_purchase_ledger', 'Purchase')
  const cgstOutputId = await resolveId('gst_cgst_output', 'CGST Payable')
  const sgstOutputId = await resolveId('gst_sgst_output', 'SGST Payable')
  const igstOutputId = await resolveId('gst_igst_output', 'IGST Payable')
  const cgstInputId = await resolveId('gst_cgst_input', 'CGST Input')
  const sgstInputId = await resolveId('gst_sgst_input', 'SGST Input')
  const igstInputId = await resolveId('gst_igst_input', 'IGST Input')
  const discountAllowedId = await resolveId('sale_discount_ledger', 'Discount Allowed')
  const discountReceivedId = await resolveId('purchase_discount_ledger', 'Discount Received')
  const roundOffId = await resolveId('sale_roundoff_ledger', 'Round Off')

  const entries: any[] = []

  const addEntry = (ledgerId: string | null, debit: number, credit: number, note?: string) => {
    if (!ledgerId || (debit < 0.001 && credit < 0.001)) return
    entries.push({ companyId, voucherId: voucher.id, date, ledgerId, debit, credit, narration: note || narration, financialYear: fy })
  }

  if (isSale) {
    // SALE journal depends on payment mode:
    // Credit sale (no paymentMode / CHEQUE/NEFT/RTGS): Party Dr / Sales Cr + GST Cr
    // Cash sale (CASH): Cash-in-Hand Dr / Sales Cr + GST Cr → balanceDue = 0
    // UPI/CARD sale: Bank/Card ledger Dr / Sales Cr + GST Cr → balanceDue = 0
    const isCashPayment = ['CASH', 'UPI', 'CARD'].includes(voucher.paymentMode || '')
    const cashLedgerId = await resolveId('cash_in_hand', 'Cash-in-Hand')
    const bankLedgerId = voucher.bankLedgerId
      || await resolveId('primary_bank', 'Bank')
      || await getLedgerByName(companyId, 'State Bank of India')
      || await getLedgerByName(companyId, 'HDFC Bank')

    // Determine the debit ledger: cash/bank for immediate payment, party for credit
    const debitLedgerId = isCashPayment
      ? (voucher.paymentMode === 'CASH' ? cashLedgerId : bankLedgerId)
      : partyLedgerId

    addEntry(debitLedgerId, grandTotal, 0)             // Cash/Bank/Party Dr
    addEntry(salesLedgerId, 0, taxable)                // Sales Cr
    if (cgst > 0) addEntry(cgstOutputId, 0, cgst)     // CGST Output Cr
    if (sgst > 0) addEntry(sgstOutputId, 0, sgst)     // SGST Output Cr
    if (igst > 0) addEntry(igstOutputId, 0, igst)     // IGST Output Cr
    if (cess > 0) addEntry(cgstOutputId, 0, cess)     // Cess
    if (discount > 0) addEntry(discountAllowedId, discount, 0)  // Discount Allowed Dr
    if (Math.abs(roundOffAmt) > 0.001) {
      if (roundOffAmt > 0) addEntry(roundOffId, 0, roundOffAmt)
      else addEntry(roundOffId, Math.abs(roundOffAmt), 0)
    }
  } else {
    // PURCHASE: Purchase Dr + GST Dr  /  Party Cr
    // CREDIT_NOTE: Party Dr / Purchase Return Cr + GST Cr
    const isCreditNote = vType === 'CREDIT_NOTE'
    if (isCreditNote) {
      // Credit Note: Reverse purchase — Party Dr, Purchase Return Cr, GST Input reversed
      addEntry(partyLedgerId, grandTotal, 0)
      addEntry(purchaseLedgerId, 0, taxable)
      if (cgst > 0) addEntry(cgstInputId, 0, cgst)
      if (sgst > 0) addEntry(sgstInputId, 0, sgst)
      if (igst > 0) addEntry(igstInputId, 0, igst)
    } else {
      // Normal Purchase
      addEntry(purchaseLedgerId, taxable, 0)           // Purchase Dr
      if (cgst > 0) addEntry(cgstInputId, cgst, 0)    // CGST Input Dr (ITC)
      if (sgst > 0) addEntry(sgstInputId, sgst, 0)    // SGST Input Dr (ITC)
      if (igst > 0) addEntry(igstInputId, igst, 0)    // IGST Input Dr (ITC)
      if (cess > 0) addEntry(cgstInputId, cess, 0)    // Cess Dr
      if (discount > 0) addEntry(discountReceivedId, 0, discount)
      if (Math.abs(roundOffAmt) > 0.001) {
        if (roundOffAmt > 0) addEntry(roundOffId, 0, roundOffAmt)
        else addEntry(roundOffId, Math.abs(roundOffAmt), 0)
      }
      addEntry(partyLedgerId, 0, grandTotal)           // Party Cr (payable)
    }
  }

  if (entries.length > 0) {
    await tx.journalEntry.createMany({ data: entries })
  }
}

// ─── Helper: create proper GST entries for all voucher types ─────────────────
async function createGSTEntries(tx: any, voucher: any, companyId: string) {
  const { voucherType: vType, party } = voucher
  if (!['SALE', 'PURCHASE', 'CREDIT_NOTE', 'DEBIT_NOTE'].includes(vType)) return
  if (Number(voucher.taxableAmount) <= 0) return

  const period = `${String(voucher.date.getMonth() + 1).padStart(2, '0')}${voucher.date.getFullYear()}`

  // Check company GST type
  const company = await tx.company.findUnique({
    where: { id: companyId },
    select: { gstRegType: true, compositionRate: true, stateCode: true },
  })

  // Composition firm — no GST entries on invoice items
  if (company?.gstRegType === 'COMPOSITION' && vType === 'SALE') return

  const baseEntry = {
    companyId,
    voucherId: voucher.id,
    period,
    invoiceNumber: voucher.voucherNumber,
    invoiceDate: voucher.date,
    placeOfSupply: voucher.placeOfSupply || company?.stateCode || '08',
    reverseCharge: voucher.isReverseCharge || false,
    taxableValue: voucher.taxableAmount,
    igstAmount: voucher.igstAmount,
    cgstAmount: voucher.cgstAmount,
    sgstAmount: voucher.sgstAmount,
    cessAmount: voucher.cessAmount,
  }

  if (vType === 'SALE') {
    // Determine entry type: B2B (with GSTIN), B2CS (small unregistered), B2CL (large unregistered)
    const grandTotal = Number(voucher.grandTotal)
    const partyGstin = party?.gstin

    let entryType = 'B2CS'
    if (partyGstin) entryType = 'B2B'
    else if (grandTotal > 250000) entryType = 'B2CL'  // B2CL for >2.5L unregistered

    await tx.gSTEntry.create({
      data: {
        ...baseEntry,
        entryType,
        partyGstin: partyGstin || null,
        partyName: party?.name || 'Walk-in Customer',
      },
    })
  } else if (vType === 'PURCHASE') {
    // Purchase — ITC entry
    if (party?.gstin) {  // Only from registered vendors
      await tx.gSTEntry.create({
        data: {
          ...baseEntry,
          entryType: voucher.isReverseCharge ? 'RCM' : 'B2B_PURCHASE',
          partyGstin: party.gstin,
          partyName: party.name,
        },
      })
    }
  } else if (vType === 'CREDIT_NOTE') {
    if (party?.gstin) {
      await tx.gSTEntry.create({
        data: {
          ...baseEntry,
          entryType: 'CDNR',
          partyGstin: party.gstin,
          partyName: party.name,
        },
      })
    } else {
      await tx.gSTEntry.create({ data: { ...baseEntry, entryType: 'CDNUR' } })
    }
  } else if (vType === 'DEBIT_NOTE') {
    if (party?.gstin) {
      await tx.gSTEntry.create({
        data: {
          ...baseEntry,
          entryType: 'DBN',
          partyGstin: party.gstin,
          partyName: party.name,
        },
      })
    }
  }
}

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

// Voucher types that REQUIRE party
const PARTY_REQUIRED_TYPES = new Set<string>([
  // SALE does NOT require party — POS walk-in sales have no party
  'PURCHASE', 'CREDIT_NOTE', 'DEBIT_NOTE',
  'PURCHASE_ORDER', 'PURCHASE_CHALLAN',
  // RECEIPT and PAYMENT do NOT require party — can be for any ledger
])

const VENDOR_REF_REQUIRED = new Set<string>(['PURCHASE'])
const REF_REQUIRED = new Set<string>(['CREDIT_NOTE', 'DEBIT_NOTE'])
const ITEMS_REQUIRED = new Set<string>([
  'SALE', 'PURCHASE', 'CREDIT_NOTE', 'DEBIT_NOTE',
  'SALE_CHALLAN', 'PURCHASE_ORDER', 'PURCHASE_CHALLAN', 'PRODUCTION',
])
const LEDGER_BALANCED_TYPES = new Set<string>(['RECEIPT', 'PAYMENT', 'CONTRA', 'JOURNAL'])

const voucherSchema = z.object({
  voucherType: z.nativeEnum(VoucherType),
  date: z.string().min(1, 'Date is required'),
  branchId: z.string().uuid().optional().nullable(),
  partyId: z.string().uuid().optional().nullable(),
  narration: z.string().optional(),
  placeOfSupply: z.string().optional(),
  isReverseCharge: z.boolean().default(false),
  isExport: z.boolean().default(false),
  isInclusive: z.boolean().default(false),
  saleType: z.string().optional().nullable(),
  lut: z.string().optional().nullable(),
  lutDate: z.string().optional().nullable(),
  refVoucherType: z.nativeEnum(VoucherType).optional().nullable(),
  refVoucherNumber: z.string().optional().nullable(),
  refVoucherDate: z.string().optional().nullable(),
  // Receipt/Payment specific
  paymentMode: z.enum(['CASH', 'CHEQUE', 'NEFT', 'RTGS', 'UPI', 'CARD', 'OTHER']).optional().nullable(),
  chequeNumber: z.string().optional().nullable(),
  chequeDate: z.string().optional().nullable(),
  bankLedgerId: z.string().uuid().optional().nullable(),
  items: z.array(voucherItemSchema).optional().default([]),
  ledgerEntries: z.array(voucherLedgerSchema).optional().default([]),
  roundOff: z.coerce.number().default(0),
}).superRefine((data, ctx) => {
  if (!data.date) {
    ctx.addIssue({ code: 'custom', path: ['date'], message: 'Date is required' })
  }

  if (PARTY_REQUIRED_TYPES.has(data.voucherType) && !data.partyId) {
    const label = ['SALE', 'CREDIT_NOTE', 'SALE_CHALLAN'].includes(data.voucherType) ? 'Customer' : 'Vendor'
    ctx.addIssue({ code: 'custom', path: ['partyId'], message: `${label} is required` })
  }

  if (VENDOR_REF_REQUIRED.has(data.voucherType)) {
    if (!data.refVoucherNumber?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['refVoucherNumber'], message: 'Vendor bill number is required for Purchase' })
    }
    if (!data.refVoucherDate) {
      ctx.addIssue({ code: 'custom', path: ['refVoucherDate'], message: 'Vendor bill date is required for Purchase' })
    }
  }

  if (REF_REQUIRED.has(data.voucherType) && !data.refVoucherNumber?.trim()) {
    const label = data.voucherType === 'CREDIT_NOTE' ? 'Original sale invoice number' : 'Original purchase invoice number'
    ctx.addIssue({ code: 'custom', path: ['refVoucherNumber'], message: `${label} is required` })
  }

  if (ITEMS_REQUIRED.has(data.voucherType)) {
    if (!data.items || data.items.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['items'], message: 'At least one item is required' })
    }
  }

  if (LEDGER_BALANCED_TYPES.has(data.voucherType) && data.ledgerEntries.length > 0) {
    const totalDebit = data.ledgerEntries.reduce((s, e) => s + Number(e.debit || 0), 0)
    const totalCredit = data.ledgerEntries.reduce((s, e) => s + Number(e.credit || 0), 0)
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      ctx.addIssue({ code: 'custom', path: ['ledgerEntries'], message: `Entries not balanced. Dr: ₹${totalDebit.toFixed(2)}, Cr: ₹${totalCredit.toFixed(2)}` })
    }
  }

  // placeOfSupply is validated but defaults to '08' if missing - not a hard error for POS
  if (['PURCHASE'].includes(data.voucherType) && !data.placeOfSupply) {
    ctx.addIssue({ code: 'custom', path: ['placeOfSupply'], message: 'Place of supply is required for Purchase' })
  }
})

// Stock movement type sets
const INVENTORY_IN_TYPES = new Set<VoucherType>(['PURCHASE_CHALLAN', 'PRODUCTION'])
const INVENTORY_OUT_TYPES = new Set<VoucherType>(['SALE', 'SALE_CHALLAN'])
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
      },
    }),
    prisma.voucher.count({ where }),
  ])

  sendPaginated(res, vouchers, total, page, limit)
})

// ─── GET /billing/vouchers/:id — supports UUID and voucher number ─────────────

billingRouter.get('/vouchers/:id', async (req: Request, res: Response) => {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)

  const voucher = await prisma.voucher.findFirst({
    where: isUUID
      ? { id: req.params.id, companyId: req.companyId }
      : { voucherNumber: req.params.id, companyId: req.companyId },
    include: {
      party: true,
      branch: true,
      items: {
        include: {
          item: { select: { id: true, name: true, unit: true, hsnCode: true, sacCode: true, isService: true } },
          variant: { select: { id: true, attributeValues: true } },
        },
        orderBy: { sortOrder: 'asc' },
      },
      ledgerEntries: {
        include: { ledger: { select: { id: true, name: true } } },
        orderBy: { sortOrder: 'asc' },
      },
      journalEntries: {
        include: { ledger: { select: { id: true, name: true, group: { select: { name: true, nature: true } } } } },
        orderBy: [{ debit: 'desc' }, { credit: 'desc' }],
      },
      gstEntries: true,
      linkedFrom: { include: { parent: { select: { id: true, voucherType: true, voucherNumber: true } } } },
      linkedTo: { include: { child: { select: { id: true, voucherType: true, voucherNumber: true } } } },
      settlements: { include: { fromVoucher: { select: { id: true, voucherNumber: true, voucherType: true } } } },
    },
  })

  if (!voucher) throw new NotFoundError('Voucher')
  sendSuccess(res, voucher)
})

// ─── POST /billing/vouchers ───────────────────────────────────────────────────

billingRouter.post('/vouchers', async (req: Request, res: Response) => {
  const body = voucherSchema.safeParse(req.body)
  if (!body.success) {
    const msgs = body.error.errors.map(e => e.message).join(', ')
    throw new BadRequestError(msgs)
  }

  const data = body.data
  const voucherDate = new Date(data.date)
  const financialYear = getFinancialYear(voucherDate)

  const voucher = await prisma.$transaction(async (tx) => {
    const voucherNumber = await generateVoucherNumber(tx, req.companyId, data.branchId || null, data.voucherType, financialYear)

    let totalQty = 0, subtotal = 0, discountAmount = 0, taxableTotal = 0
    let cgstTotal = 0, sgstTotal = 0, igstTotal = 0, cessTotal = 0
    const processedItems: any[] = []

    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i]
      const gross = item.qty * item.rate
      const d1 = (item.discountPct || 0) / 100
      const d2 = (item.discount2Pct || 0) / 100
      const d3 = (item.discount3Pct || 0) / 100
      const netRate = item.rate * (1 - d1) * (1 - d2) * (1 - d3)
      const amountAfterDisc = netRate * item.qty
      const disc = gross - amountAfterDisc
      const gst = calculateGST(amountAfterDisc, item.gstRate, item.taxType as any, 0, data.isInclusive)
      const taxable = gst.taxableAmount ?? amountAfterDisc

      totalQty += item.qty; subtotal += gross; discountAmount += disc
      taxableTotal += taxable; cgstTotal += gst.cgst; sgstTotal += gst.sgst
      igstTotal += gst.igst; cessTotal += gst.cess

      processedItems.push({
        itemId: item.itemId, variantId: item.variantId || null,
        description: item.description, unit: item.unit, qty: item.qty,
        freeQty: item.freeQty, rate: item.rate,
        discountPct: item.discountPct || 0, discountAmt: disc,
        discount2Pct: item.discount2Pct || 0, discount2Amt: item.rate * item.qty * (1 - d1) * d2,
        discount3Pct: item.discount3Pct || 0, discount3Amt: item.rate * item.qty * (1 - d1) * (1 - d2) * d3,
        taxableAmount: taxable, gstRate: item.gstRate, taxType: item.taxType,
        cgstRate: item.taxType === 'CGST_SGST' ? item.gstRate / 2 : 0, cgstAmount: gst.cgst,
        sgstRate: item.taxType === 'CGST_SGST' ? item.gstRate / 2 : 0, sgstAmount: gst.sgst,
        igstRate: item.taxType === 'IGST' ? item.gstRate : 0, igstAmount: gst.igst,
        cessRate: 0, cessAmount: gst.cess, lineTotal: gst.total, sortOrder: i,
        batchNo: item.batchNo || null,
        mfgDate: item.mfgDate ? new Date(item.mfgDate) : null,
        expDate: item.expDate ? new Date(item.expDate) : null,
      })
    }

    const rawTotal = data.isInclusive
      ? processedItems.reduce((s, item) => s + Number(item.lineTotal), 0)
      : (taxableTotal + cgstTotal + sgstTotal + igstTotal + cessTotal)
    const { rounded: grandTotal, roundOff: roundOffAmt } = roundOff(rawTotal)

    // Grand total for accounting vouchers = sum of ledger entries debit side
    const acctTotal = data.ledgerEntries.reduce((s, e) => s + Number(e.debit || 0), 0)

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
        isInclusive: data.isInclusive,
        saleType: data.saleType || null,
        lut: data.lut || null,
        lutDate: data.lutDate ? new Date(data.lutDate) : null,
        refVoucherType: data.refVoucherType || null,
        refVoucherNumber: data.refVoucherNumber || null,
        refVoucherDate: data.refVoucherDate ? new Date(data.refVoucherDate) : null,
        paymentMode: data.paymentMode || null,
        chequeNumber: data.chequeNumber || null,
        chequeDate: data.chequeDate ? new Date(data.chequeDate) : null,
        bankLedgerId: data.bankLedgerId || null,
        totalQty,
        subtotal,
        discountAmount,
        taxableAmount: taxableTotal,
        cgstAmount: cgstTotal,
        sgstAmount: sgstTotal,
        igstAmount: igstTotal,
        cessAmount: cessTotal,
        roundOff: roundOffAmt,
        grandTotal: LEDGER_BALANCED_TYPES.has(data.voucherType) ? acctTotal : grandTotal,
        balanceDue: ACCOUNTING_TYPES.has(data.voucherType) &&
          ['SALE', 'PURCHASE', 'CREDIT_NOTE', 'DEBIT_NOTE'].includes(data.voucherType)
          ? grandTotal : 0,
        createdBy: req.user.userId,
        items: { create: processedItems },
        ledgerEntries: data.ledgerEntries.length > 0
          ? { create: data.ledgerEntries.map((le, i) => ({ ...le, sortOrder: i })) }
          : undefined,
      },
    })

    // Inventory IN movements (Purchase Challan, Production)
    if (INVENTORY_IN_TYPES.has(data.voucherType)) {
      for (const item of processedItems) {
        const itemMeta = await tx.item.findUnique({
          where: { id: item.itemId },
          select: { isService: true, maintainStock: true },
        })
        if (itemMeta?.isService || !itemMeta?.maintainStock) continue

        await addStockBatch(tx, {
          itemId: item.itemId, variantId: item.variantId,
          purchaseDate: voucherDate,
          purchaseRate: item.rate - (item.discountAmt / item.qty),
          qty: item.qty, batchNo: item.batchNo,
          mfgDate: item.mfgDate, expDate: item.expDate,
          sourceVoucherId: voucher.id,
        })

        await tx.stockMovement.create({
          data: {
            companyId: req.companyId, voucherId: voucher.id,
            itemId: item.itemId, variantId: item.variantId,
            date: voucherDate, movementType: MovementType.IN,
            qty: item.qty, rate: item.rate, value: item.taxableAmount, financialYear,
          },
        })
      }
    }

    return voucher
  })

  sendSuccess(res, voucher, 'Voucher created', 201)
})

// ─── POST /billing/vouchers/:id/post ─────────────────────────────────────────

billingRouter.post('/vouchers/:id/post', async (req: Request, res: Response) => {
  const voucher = await prisma.voucher.findFirst({
    where: { id: req.params.id, companyId: req.companyId },
    include: { items: true, ledgerEntries: true, party: true },
  })
  if (!voucher) throw new NotFoundError('Voucher')
  if (voucher.status !== 'DRAFT') throw new BadRequestError('Only DRAFT vouchers can be posted')

  const mappings = await getLedgerMappings(req.companyId)

  await prisma.$transaction(async (tx) => {
    // 1. Validate balance for accounting vouchers
    if (ACCOUNTING_TYPES.has(voucher.voucherType) && voucher.ledgerEntries.length > 0) {
      const totalDebit = voucher.ledgerEntries.reduce((s, e) => s + Number(e.debit), 0)
      const totalCredit = voucher.ledgerEntries.reduce((s, e) => s + Number(e.credit), 0)
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        throw new BadRequestError(`Voucher not balanced. Dr: ₹${totalDebit.toFixed(2)}, Cr: ₹${totalCredit.toFixed(2)}`)
      }
    }

    // 2. Auto-generate journal entries for SALE / PURCHASE / CREDIT_NOTE / DEBIT_NOTE
    if (['SALE', 'PURCHASE', 'CREDIT_NOTE', 'DEBIT_NOTE'].includes(voucher.voucherType)) {
      // Only auto-generate if no manual journal entries exist (don't duplicate)
      const existingJournals = await tx.journalEntry.count({ where: { voucherId: voucher.id } })
      if (existingJournals === 0) {
        await autoGenerateJournalEntries(tx, voucher, req.companyId, mappings)
      }
    }

    // 3. For RECEIPT/PAYMENT/CONTRA/JOURNAL — create journal from ledger entries
    if (LEDGER_BALANCED_TYPES.has(voucher.voucherType) && voucher.ledgerEntries.length > 0) {
      const existingJournals = await tx.journalEntry.count({ where: { voucherId: voucher.id } })
      if (existingJournals === 0) {
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
    }

    // 4. FIFO stock consumption for SALE (Goods only)
    if (INVENTORY_OUT_TYPES.has(voucher.voucherType)) {
      for (const item of voucher.items) {
        const itemRecord = await tx.item.findUnique({
          where: { id: item.itemId },
          select: { maintainStock: true, isService: true, saleRate: true },
        })
        if (!itemRecord?.maintainStock || itemRecord?.isService) continue

        let totalCost = 0
        try {
          const consumed = await consumeFIFO(tx, item.itemId, item.variantId, null, Number(item.qty), voucher.date)
          totalCost = consumed.reduce((s, c) => s + c.value, 0)
        } catch {
          totalCost = Number(item.rate) * Number(item.qty)
        }

        await tx.stockMovement.create({
          data: {
            companyId: req.companyId, voucherId: voucher.id,
            itemId: item.itemId, variantId: item.variantId,
            date: voucher.date, movementType: MovementType.OUT,
            qty: Number(item.qty),
            rate: Number(item.qty) > 0 ? totalCost / Number(item.qty) : 0,
            value: totalCost, financialYear: voucher.financialYear,
          },
        })
      }
    }

    // 5. Create GST entries (comprehensive — B2B, B2CS, B2CL, CDNR, Purchase ITC)
    await createGSTEntries(tx, voucher, req.companyId)

    // 6. Update voucher status
    await tx.voucher.update({
      where: { id: voucher.id },
      data: {
        status: VoucherStatus.POSTED,
        postedAt: new Date(),
        postedBy: req.user.userId,
        balanceDue: (() => {
          // Cash/UPI/Card sales are fully paid — no outstanding
          const isBillingType = ['SALE', 'PURCHASE', 'CREDIT_NOTE', 'DEBIT_NOTE'].includes(voucher.voucherType)
          if (!isBillingType) return 0
          const immediatePayment = ['CASH', 'UPI', 'CARD'].includes(voucher.paymentMode || '')
          return immediatePayment ? 0 : voucher.grandTotal
        })(),
      },
    })
  })

  sendSuccess(res, null, 'Voucher posted successfully')
})

// ─── PUT /billing/vouchers/:id ────────────────────────────────────────────────

billingRouter.put('/vouchers/:id', async (req: Request, res: Response) => {
  const existing = await prisma.voucher.findFirst({
    where: { id: req.params.id, companyId: req.companyId },
  })
  if (!existing) throw new NotFoundError('Voucher')
  if (existing.status === 'POSTED') throw new ForbiddenError('Posted vouchers cannot be edited. Cancel and re-create.')

  const body = voucherSchema.partial().safeParse(req.body)
  if (!body.success) throw new BadRequestError(body.error.errors[0].message)

  await prisma.$transaction(async (tx) => {
    if (body.data.items !== undefined) await tx.voucherItem.deleteMany({ where: { voucherId: req.params.id } })
    if (body.data.ledgerEntries !== undefined) await tx.voucherLedger.deleteMany({ where: { voucherId: req.params.id } })

    const updateData: any = {}
    if (body.data.date) updateData.date = new Date(body.data.date)
    if (body.data.partyId !== undefined) updateData.partyId = body.data.partyId
    if (body.data.narration !== undefined) updateData.narration = body.data.narration
    if (body.data.placeOfSupply !== undefined) updateData.placeOfSupply = body.data.placeOfSupply
    if (body.data.paymentMode !== undefined) updateData.paymentMode = body.data.paymentMode
    if (body.data.chequeNumber !== undefined) updateData.chequeNumber = body.data.chequeNumber
    if (body.data.chequeDate !== undefined) updateData.chequeDate = body.data.chequeDate ? new Date(body.data.chequeDate) : null
    if (body.data.bankLedgerId !== undefined) updateData.bankLedgerId = body.data.bankLedgerId

    if (body.data.items && body.data.items.length > 0) {
      let taxableTotal = 0, cgstTotal = 0, sgstTotal = 0, igstTotal = 0, cessTotal = 0
      let totalQty = 0, subtotal = 0, discountAmount = 0

      const processedItems = body.data.items.map((item, i) => {
        const gross = item.qty! * item.rate!
        const d1 = (item.discountPct || 0) / 100
        const netRate = item.rate! * (1 - d1)
        const amountAfterDisc = netRate * item.qty!
        const disc = gross - amountAfterDisc
        const gst = calculateGST(amountAfterDisc, item.gstRate!, item.taxType as any || 'CGST_SGST')
        const taxable = gst.taxableAmount ?? amountAfterDisc

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
          cgstRate: item.taxType === 'CGST_SGST' ? item.gstRate! / 2 : 0, cgstAmount: gst.cgst,
          sgstRate: item.taxType === 'CGST_SGST' ? item.gstRate! / 2 : 0, sgstAmount: gst.sgst,
          igstRate: item.taxType === 'IGST' ? item.gstRate! : 0, igstAmount: gst.igst,
          cessRate: 0, cessAmount: gst.cess, lineTotal: gst.total, sortOrder: i,
        }
      })

      await tx.voucherItem.createMany({ data: processedItems })

      const rawTotal = taxableTotal + cgstTotal + sgstTotal + igstTotal + cessTotal
      const { rounded: grandTotal, roundOff: ro } = roundOff(rawTotal)
      Object.assign(updateData, {
        totalQty, subtotal, discountAmount,
        taxableAmount: taxableTotal, cgstAmount: cgstTotal, sgstAmount: sgstTotal,
        igstAmount: igstTotal, cessAmount: cessTotal, roundOff: ro, grandTotal, balanceDue: grandTotal,
      })
    }

    if (body.data.ledgerEntries && body.data.ledgerEntries.length > 0) {
      await tx.voucherLedger.createMany({
        data: body.data.ledgerEntries.map((le, i) => ({ voucherId: req.params.id, ...le, sortOrder: i })),
      })
      const acctTotal = body.data.ledgerEntries.reduce((s, e) => s + Number(e.debit || 0), 0)
      updateData.grandTotal = acctTotal
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
    if (voucher.status === 'POSTED') {
      const journals = await tx.journalEntry.findMany({ where: { voucherId: voucher.id } })
      if (journals.length > 0) {
        await tx.journalEntry.createMany({
          data: journals.map((j) => ({
            companyId: req.companyId, voucherId: voucher.id,
            date: new Date(), ledgerId: j.ledgerId,
            debit: j.credit, credit: j.debit,
            narration: `Cancellation: ${reason || 'No reason'}`,
            financialYear: voucher.financialYear,
          })),
        })
      }

      // Also remove GST entries
      await tx.gSTEntry.deleteMany({ where: { voucherId: voucher.id } })

      const movements = await tx.stockMovement.findMany({ where: { voucherId: voucher.id } })
      if (movements.length > 0) {
        await tx.stockMovement.createMany({
          data: movements.map((m) => ({
            companyId: req.companyId, voucherId: voucher.id,
            itemId: m.itemId, variantId: m.variantId,
            date: new Date(),
            movementType: m.movementType === 'IN' ? MovementType.OUT : MovementType.IN,
            qty: m.qty, rate: m.rate, value: m.value,
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
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)
  const voucher = await prisma.voucher.findFirst({
    where: isUUID
      ? { id: req.params.id, companyId: req.companyId }
      : { voucherNumber: req.params.id, companyId: req.companyId },
    select: { id: true },
  })
  if (!voucher) throw new NotFoundError('Voucher')

  const entries = await prisma.journalEntry.findMany({
    where: { voucherId: voucher.id },
    include: { ledger: { select: { id: true, name: true, group: { select: { name: true, nature: true } } } } },
    orderBy: [{ debit: 'desc' }, { credit: 'desc' }],
  })

  const totalDebit = entries.reduce((s, e) => s + Number(e.debit), 0)
  const totalCredit = entries.reduce((s, e) => s + Number(e.credit), 0)

  sendSuccess(res, {
    entries,
    totalDebit,
    totalCredit,
    isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
  })
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
    include: {
      party: { select: { id: true, name: true, phone: true, creditDays: true } },
    },
    orderBy: { date: 'asc' },
  })

  const today = new Date()
  const result = vouchers.map((v) => {
    const daysElapsed = Math.floor((today.getTime() - v.date.getTime()) / (1000 * 60 * 60 * 24))
    const creditDays = Number(v.party?.creditDays || 0)
    return {
      id: v.id,
      voucherNumber: v.voucherNumber,
      voucherType: v.voucherType,
      date: v.date,
      party: v.party,
      grandTotal: Number(v.grandTotal),
      balanceDue: Number(v.balanceDue),
      daysElapsed,
      creditDays,
      dueDate: new Date(v.date.getTime() + creditDays * 24 * 60 * 60 * 1000),
      isOverdue: daysElapsed > creditDays,
      overdueBy: Math.max(0, daysElapsed - creditDays),
    }
  })

  sendSuccess(res, { vouchers: result, totalOutstanding: result.reduce((s, v) => s + v.balanceDue, 0) })
})

// ─── POST /billing/vouchers/settle ───────────────────────────────────────────

billingRouter.post('/vouchers/settle', async (req: Request, res: Response) => {
  const { fromVoucherId, againstVoucherId, amount, date, narration } = req.body
  if (!fromVoucherId || !againstVoucherId || !amount) {
    throw new BadRequestError('fromVoucherId, againstVoucherId, amount required')
  }

  const [fromV, againstV] = await Promise.all([
    prisma.voucher.findFirst({ where: { id: fromVoucherId, companyId: req.companyId } }),
    prisma.voucher.findFirst({ where: { id: againstVoucherId, companyId: req.companyId }, include: { party: true } }),
  ])
  if (!fromV || !againstV) throw new NotFoundError('Voucher')

  await prisma.$transaction(async (tx) => {
    await tx.voucherSettlement.create({
      data: {
        fromVoucherId, againstVoucherId,
        amount: Number(amount),
        date: date ? new Date(date) : new Date(),
        narration: narration || `Settlement against ${againstV.voucherNumber}`,
      },
    })
    await tx.voucher.update({
      where: { id: againstVoucherId },
      data: { balanceDue: { decrement: Number(amount) } },
    })
  })

  sendSuccess(res, null, 'Settlement saved')
})

// ─── GET /billing/party-ledger — outstanding invoices for a party ─────────────

billingRouter.get('/party-ledger', async (req: Request, res: Response) => {
  const { partyId, type = 'receivable' } = req.query
  if (!partyId) throw new BadRequestError('partyId required')

  const voucherTypes = type === 'receivable'
    ? ['SALE', 'DEBIT_NOTE', 'RECEIPT']
    : ['PURCHASE', 'CREDIT_NOTE', 'PAYMENT']

  const vouchers = await prisma.voucher.findMany({
    where: {
      companyId: req.companyId,
      partyId: String(partyId),
      voucherType: { in: voucherTypes },
      status: 'POSTED',
    },
    orderBy: { date: 'desc' },
    select: {
      id: true, voucherNumber: true, voucherType: true, date: true,
      grandTotal: true, balanceDue: true, narration: true,
    },
  })

  const invoices = vouchers.filter(v => ['SALE', 'PURCHASE', 'DEBIT_NOTE', 'CREDIT_NOTE'].includes(v.voucherType))
  const receipts = vouchers.filter(v => ['RECEIPT', 'PAYMENT'].includes(v.voucherType))

  sendSuccess(res, { invoices, receipts, partyId })
})
