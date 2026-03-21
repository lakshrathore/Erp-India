import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { authenticate, withCompany } from '../../middleware/auth'
import { sendSuccess, NotFoundError, BadRequestError } from '../../utils/response'
import { getFinancialYearDates } from '../../utils/india'

export const accountingRouter = Router()
accountingRouter.use(authenticate, withCompany)

// ─── Party Statement ──────────────────────────────────────────────────────────

accountingRouter.get('/party-statement', async (req: Request, res: Response) => {
  const { partyId, from, to } = req.query
  if (!partyId) throw new BadRequestError('partyId is required')

  const party = await prisma.party.findFirst({
    where: { id: String(partyId), companyId: req.companyId },
    include: { ledger: true },
  })
  if (!party || !party.ledgerId) throw new NotFoundError('Party')

  const fromDate = from ? new Date(String(from)) : new Date(new Date().getFullYear(), 3, 1)
  const toDate = to ? new Date(String(to)) : new Date()

  // Get all journal entries for this party's ledger
  const entries = await prisma.journalEntry.findMany({
    where: {
      ledgerId: party.ledgerId,
      date: { gte: fromDate, lte: toDate },
    },
    include: {
      voucher: {
        select: {
          voucherType: true,
          voucherNumber: true,
          narration: true,
          date: true,
        },
      },
    },
    orderBy: { date: 'asc' },
  })

  // Opening balance (before from date)
  const openingEntries = await prisma.journalEntry.findMany({
    where: { ledgerId: party.ledgerId, date: { lt: fromDate } },
    select: { debit: true, credit: true },
  })

  const openingDebit = openingEntries.reduce((s, e) => s + Number(e.debit), 0)
  const openingCredit = openingEntries.reduce((s, e) => s + Number(e.credit), 0)
  const openingBalance = Number(party.ledger!.openingBalance)
  const openingType = party.ledger!.openingType

  let runningBalance = openingType === 'Dr'
    ? openingBalance + openingDebit - openingCredit
    : openingBalance + openingCredit - openingDebit

  const statement = entries.map((e) => {
    const debit = Number(e.debit)
    const credit = Number(e.credit)
    runningBalance = runningBalance + debit - credit

    return {
      date: e.date,
      voucherType: e.voucher.voucherType,
      voucherNumber: e.voucher.voucherNumber,
      narration: e.voucher.narration || e.narration,
      debit: debit || null,
      credit: credit || null,
      balance: Math.abs(runningBalance),
      balanceType: runningBalance >= 0 ? 'Dr' : 'Cr',
    }
  })

  sendSuccess(res, {
    party: { id: party.id, name: party.name, gstin: party.gstin },
    openingBalance: Math.abs(openingBalance + openingDebit - openingCredit),
    openingType,
    statement,
    closingBalance: Math.abs(runningBalance),
    closingType: runningBalance >= 0 ? 'Dr' : 'Cr',
    totalDebit: entries.reduce((s, e) => s + Number(e.debit), 0),
    totalCredit: entries.reduce((s, e) => s + Number(e.credit), 0),
  })
})

// ─── Ledger Statement ─────────────────────────────────────────────────────────

accountingRouter.get('/ledger-statement', async (req: Request, res: Response) => {
  const { ledgerId, from, to } = req.query
  if (!ledgerId) throw new BadRequestError('ledgerId is required')

  const ledger = await prisma.ledger.findFirst({
    where: { id: String(ledgerId), companyId: req.companyId },
    include: { group: true },
  })
  if (!ledger) throw new NotFoundError('Ledger')

  const fromDate = from ? new Date(String(from)) : new Date(new Date().getFullYear(), 3, 1)
  const toDate = to ? new Date(String(to)) : new Date()

  const entries = await prisma.journalEntry.findMany({
    where: {
      ledgerId: String(ledgerId),
      date: { gte: fromDate, lte: toDate },
    },
    include: {
      voucher: {
        select: {
          voucherType: true,
          voucherNumber: true,
          narration: true,
          party: { select: { name: true } },
        },
      },
    },
    orderBy: { date: 'asc' },
  })

  const priorEntries = await prisma.journalEntry.findMany({
    where: { ledgerId: String(ledgerId), date: { lt: fromDate } },
    select: { debit: true, credit: true },
  })

  const priorDebit = priorEntries.reduce((s, e) => s + Number(e.debit), 0)
  const priorCredit = priorEntries.reduce((s, e) => s + Number(e.credit), 0)
  const opening = Number(ledger.openingBalance)
  const openingType = ledger.openingType

  let runningBal = openingType === 'Dr'
    ? opening + priorDebit - priorCredit
    : opening + priorCredit - priorDebit

  const statement = entries.map((e) => {
    const debit = Number(e.debit)
    const credit = Number(e.credit)
    runningBal += debit - credit

    return {
      date: e.date,
      voucherType: e.voucher?.voucherType,
      voucherNumber: e.voucher?.voucherNumber,
      party: e.voucher?.party?.name,
      narration: e.voucher?.narration || e.narration,
      debit: debit || null,
      credit: credit || null,
      balance: Math.abs(runningBal),
      balanceType: runningBal >= 0 ? 'Dr' : 'Cr',
    }
  })

  sendSuccess(res, {
    ledger: { id: ledger.id, name: ledger.name, groupName: ledger.group.name, nature: ledger.group.nature },
    openingBalance: Math.abs(opening + priorDebit - priorCredit),
    openingType,
    statement,
    closingBalance: Math.abs(runningBal),
    closingType: runningBal >= 0 ? 'Dr' : 'Cr',
    totalDebit: entries.reduce((s, e) => s + Number(e.debit), 0),
    totalCredit: entries.reduce((s, e) => s + Number(e.credit), 0),
  })
})

// ─── Trial Balance ────────────────────────────────────────────────────────────

accountingRouter.get('/trial-balance', async (req: Request, res: Response) => {
  const { fy } = req.query
  const fyString = String(fy || '25-26')
  const { start, end } = getFinancialYearDates(fyString)

  const ledgers = await prisma.ledger.findMany({
    where: { companyId: req.companyId, isActive: true },
    include: { group: { select: { name: true, nature: true } } },
    orderBy: { name: 'asc' },
  })

  const journalTotals = await prisma.journalEntry.groupBy({
    by: ['ledgerId'],
    where: {
      companyId: req.companyId,
      date: { gte: start, lte: end },
    },
    _sum: { debit: true, credit: true },
  })

  const totalMap: Record<string, { debit: number; credit: number }> = {}
  for (const t of journalTotals) {
    totalMap[t.ledgerId] = {
      debit: Number(t._sum.debit || 0),
      credit: Number(t._sum.credit || 0),
    }
  }

  const result = ledgers.map((l) => {
    const txn = totalMap[l.id] || { debit: 0, credit: 0 }
    const openingDebit = l.openingType === 'Dr' ? Number(l.openingBalance) : 0
    const openingCredit = l.openingType === 'Cr' ? Number(l.openingBalance) : 0
    const totalDebit = openingDebit + txn.debit
    const totalCredit = openingCredit + txn.credit
    const netDebit = Math.max(0, totalDebit - totalCredit)
    const netCredit = Math.max(0, totalCredit - totalDebit)

    return {
      ledgerId: l.id,
      ledgerName: l.name,
      groupName: l.group.name,
      nature: l.group.nature,
      openingDebit,
      openingCredit,
      txnDebit: txn.debit,
      txnCredit: txn.credit,
      closingDebit: netDebit,
      closingCredit: netCredit,
    }
  }).filter((r) => r.openingDebit > 0 || r.openingCredit > 0 || r.txnDebit > 0 || r.txnCredit > 0)

  const grandTotals = result.reduce(
    (s, r) => ({
      closingDebit: s.closingDebit + r.closingDebit,
      closingCredit: s.closingCredit + r.closingCredit,
    }),
    { closingDebit: 0, closingCredit: 0 }
  )

  sendSuccess(res, { ledgers: result, grandTotals, isBalanced: Math.abs(grandTotals.closingDebit - grandTotals.closingCredit) < 1 })
})

// ─── Balance Sheet ────────────────────────────────────────────────────────────

accountingRouter.get('/balance-sheet', async (req: Request, res: Response) => {
  const { fy } = req.query
  const fyString = String(fy || '25-26')
  const { start, end } = getFinancialYearDates(fyString)

  const ledgers = await prisma.ledger.findMany({
    where: { companyId: req.companyId, isActive: true },
    include: { group: { include: { parent: true } } },
  })

  const journalTotals = await prisma.journalEntry.groupBy({
    by: ['ledgerId'],
    where: { companyId: req.companyId, date: { gte: start, lte: end } },
    _sum: { debit: true, credit: true },
  })

  const totalMap: Record<string, { debit: number; credit: number }> = {}
  for (const t of journalTotals) {
    totalMap[t.ledgerId] = {
      debit: Number(t._sum.debit || 0),
      credit: Number(t._sum.credit || 0),
    }
  }

  const ledgerBalances = ledgers.map((l) => {
    const txn = totalMap[l.id] || { debit: 0, credit: 0 }
    const openingDebit = l.openingType === 'Dr' ? Number(l.openingBalance) : 0
    const openingCredit = l.openingType === 'Cr' ? Number(l.openingBalance) : 0
    const totalDebit = openingDebit + txn.debit
    const totalCredit = openingCredit + txn.credit
    const net = totalDebit - totalCredit

    return {
      id: l.id,
      name: l.name,
      groupId: l.groupId,
      groupName: l.group.name,
      parentGroupName: l.group.parent?.name,
      nature: l.group.nature,
      balance: Math.abs(net),
      balanceType: net >= 0 ? 'Dr' : 'Cr',
    }
  })

  const groupByNature = (nature: string) =>
    ledgerBalances.filter((l) => l.nature === nature && l.balance > 0)

  const assets = groupByNature('ASSET')
  const liabilities = groupByNature('LIABILITY')
  const equity = groupByNature('EQUITY')

  const totalAssets = assets.reduce((s, l) => s + (l.balanceType === 'Dr' ? l.balance : -l.balance), 0)
  const totalLiabilities = liabilities.reduce((s, l) => s + (l.balanceType === 'Cr' ? l.balance : -l.balance), 0)
  const totalEquity = equity.reduce((s, l) => s + l.balance, 0)

  sendSuccess(res, {
    assets, liabilities, equity,
    totalAssets, totalLiabilities, totalEquity,
    isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1,
    fyString,
  })
})

// ─── Profit & Loss ────────────────────────────────────────────────────────────

accountingRouter.get('/profit-loss', async (req: Request, res: Response) => {
  const { fy } = req.query
  const fyString = String(fy || '25-26')
  const { start, end } = getFinancialYearDates(fyString)

  const ledgers = await prisma.ledger.findMany({
    where: { companyId: req.companyId, isActive: true },
    include: { group: { include: { parent: true } } },
  })

  const journalTotals = await prisma.journalEntry.groupBy({
    by: ['ledgerId'],
    where: { companyId: req.companyId, date: { gte: start, lte: end } },
    _sum: { debit: true, credit: true },
  })

  const totalMap: Record<string, { debit: number; credit: number }> = {}
  for (const t of journalTotals) {
    totalMap[t.ledgerId] = {
      debit: Number(t._sum.debit || 0),
      credit: Number(t._sum.credit || 0),
    }
  }

  const incomes: any[] = []
  const expenses: any[] = []

  for (const l of ledgers) {
    const txn = totalMap[l.id] || { debit: 0, credit: 0 }
    const net = txn.credit - txn.debit  // income = credit side

    if (l.group.nature === 'INCOME' && Math.abs(net) > 0) {
      incomes.push({ name: l.name, groupName: l.group.name, amount: net })
    }
    if (l.group.nature === 'EXPENSE' && Math.abs(net) > 0) {
      expenses.push({ name: l.name, groupName: l.group.name, amount: Math.abs(net) })
    }
  }

  const totalIncome = incomes.reduce((s, i) => s + i.amount, 0)
  const totalExpense = expenses.reduce((s, e) => s + e.amount, 0)
  const netProfit = totalIncome - totalExpense

  sendSuccess(res, {
    incomes, expenses,
    totalIncome, totalExpense,
    netProfit,
    isProfitable: netProfit > 0,
    fyString,
  })
})

// ─── Bank Reconciliation ──────────────────────────────────────────────────────

accountingRouter.get('/bank-recon/:ledgerId', async (req: Request, res: Response) => {
  const { from, to } = req.query
  const fromDate = from ? new Date(String(from)) : new Date(new Date().getFullYear(), 3, 1)
  const toDate = to ? new Date(String(to)) : new Date()

  const ledger = await prisma.ledger.findFirst({
    where: { id: req.params.ledgerId, companyId: req.companyId },
  })
  if (!ledger) throw new NotFoundError('Ledger')

  const [bookEntries, bankStatements] = await Promise.all([
    prisma.journalEntry.findMany({
      where: { ledgerId: req.params.ledgerId, date: { gte: fromDate, lte: toDate } },
      include: { voucher: { select: { voucherType: true, voucherNumber: true, narration: true, chequeNumber: true, chequeDate: true } } },
      orderBy: { date: 'asc' },
    }),
    prisma.bankStatement.findMany({
      where: { ledgerId: req.params.ledgerId, txnDate: { gte: fromDate, lte: toDate } },
      orderBy: { txnDate: 'asc' },
    }),
  ])

  const unreconciled = bankStatements.filter((s) => !s.isReconciled)
  const reconciledCount = bankStatements.filter((s) => s.isReconciled).length

  sendSuccess(res, {
    ledger: { id: ledger.id, name: ledger.name },
    bookEntries: bookEntries.map((e) => ({
      id: e.id,
      date: e.date,
      debit: Number(e.debit),
      credit: Number(e.credit),
      narration: e.voucher?.narration || e.narration,
      voucherNumber: e.voucher?.voucherNumber,
      chequeNo: e.voucher?.chequeNumber,
    })),
    bankStatements: bankStatements.map((s) => ({
      id: s.id,
      date: s.txnDate,
      debit: Number(s.debit),
      credit: Number(s.credit),
      description: s.description,
      refNo: s.refNo,
      isReconciled: s.isReconciled,
      matchedVoucherId: s.matchedVoucherId,
    })),
    summary: {
      totalBankStatements: bankStatements.length,
      reconciledCount,
      unreconciledCount: unreconciled.length,
      unreconciledDebit: unreconciled.reduce((s, x) => s + Number(x.debit), 0),
      unreconciledCredit: unreconciled.reduce((s, x) => s + Number(x.credit), 0),
    },
  })
})

// POST /accounting/bank-recon/reconcile — match bank statement entries
accountingRouter.post('/bank-recon/reconcile', async (req: Request, res: Response) => {
  const { bankStatementId, voucherId } = req.body
  if (!bankStatementId) throw new BadRequestError('bankStatementId is required')

  await prisma.bankStatement.update({
    where: { id: bankStatementId },
    data: {
      isReconciled: true,
      reconciledAt: new Date(),
      matchedVoucherId: voucherId || null,
    },
  })

  sendSuccess(res, null, 'Entry reconciled')
})

// POST /accounting/bank-recon/upload — upload bank statement CSV
accountingRouter.post('/bank-recon/upload', async (req: Request, res: Response) => {
  const { ledgerId, entries } = req.body
  // entries: [{txnDate, debit, credit, description, refNo, balance}]
  if (!ledgerId || !Array.isArray(entries)) throw new BadRequestError('ledgerId and entries[] required')

  const created = await prisma.bankStatement.createMany({
    data: entries.map((e: any) => ({
      companyId: req.companyId,
      ledgerId,
      txnDate: new Date(e.txnDate),
      valueDate: e.valueDate ? new Date(e.valueDate) : null,
      description: e.description || '',
      refNo: e.refNo || null,
      debit: e.debit || 0,
      credit: e.credit || 0,
      balance: e.balance || null,
    })),
    skipDuplicates: true,
  })

  sendSuccess(res, { count: created.count }, `${created.count} entries uploaded`)
})

// ─── Day Book — all vouchers for a date ───────────────────────────────────────

accountingRouter.get('/day-book', async (req: Request, res: Response) => {
  const { date, from, to } = req.query
  const fromDate = from ? new Date(String(from)) : date ? new Date(String(date)) : new Date()
  const toDate = to ? new Date(String(to)) : date ? new Date(String(date)) : new Date()

  // Set time to full day
  fromDate.setHours(0, 0, 0, 0)
  toDate.setHours(23, 59, 59, 999)

  const entries = await prisma.journalEntry.findMany({
    where: {
      companyId: req.companyId,
      date: { gte: fromDate, lte: toDate },
    },
    include: {
      ledger: { select: { id: true, name: true, group: { select: { name: true, nature: true } } } },
      voucher: {
        select: {
          id: true, voucherType: true, voucherNumber: true,
          narration: true, date: true, grandTotal: true,
          party: { select: { name: true } },
        },
      },
    },
    orderBy: [{ date: 'asc' }, { voucher: { voucherNumber: 'asc' } }],
  })

  // Group by voucher
  const voucherMap = new Map<string, any>()
  for (const e of entries) {
    const vid = e.voucherId
    if (!voucherMap.has(vid)) {
      voucherMap.set(vid, {
        voucherId: vid,
        voucherType: e.voucher?.voucherType,
        voucherNumber: e.voucher?.voucherNumber,
        date: e.voucher?.date || e.date,
        party: e.voucher?.party?.name,
        narration: e.voucher?.narration,
        grandTotal: Number(e.voucher?.grandTotal || 0),
        entries: [],
        totalDebit: 0,
        totalCredit: 0,
      })
    }
    const v = voucherMap.get(vid)
    v.entries.push({
      ledgerName: e.ledger.name,
      groupName: e.ledger.group.name,
      nature: e.ledger.group.nature,
      debit: Number(e.debit),
      credit: Number(e.credit),
      narration: e.narration,
    })
    v.totalDebit += Number(e.debit)
    v.totalCredit += Number(e.credit)
  }

  const vouchers = Array.from(voucherMap.values())
  const grandTotals = {
    debit: vouchers.reduce((s, v) => s + v.totalDebit, 0),
    credit: vouchers.reduce((s, v) => s + v.totalCredit, 0),
    count: vouchers.length,
  }

  sendSuccess(res, { vouchers, grandTotals, fromDate, toDate })
})

// ─── Cash Book — journal entries for cash-group ledgers ──────────────────────

accountingRouter.get('/cash-book', async (req: Request, res: Response) => {
  const { ledgerId, from, to } = req.query
  const fromDate = from ? new Date(String(from)) : new Date(new Date().getFullYear(), 3, 1)
  const toDate = to ? new Date(String(to)) : new Date()

  // If specific ledger provided, use it; otherwise get all cash ledgers
  let ledgerIds: string[] = []
  if (ledgerId) {
    ledgerIds = [String(ledgerId)]
  } else {
    const cashLedgers = await prisma.ledger.findMany({
      where: {
        companyId: req.companyId,
        isActive: true,
        group: { name: 'Cash-in-Hand' },
      },
      select: { id: true, name: true },
    })
    ledgerIds = cashLedgers.map(l => l.id)
  }

  if (ledgerIds.length === 0) {
    return sendSuccess(res, { ledgers: [], statement: [], totalDebit: 0, totalCredit: 0 })
  }

  const results = []
  for (const lid of ledgerIds) {
    const ledger = await prisma.ledger.findUnique({
      where: { id: lid },
      include: { group: true },
    })
    if (!ledger) continue

    const entries = await prisma.journalEntry.findMany({
      where: { ledgerId: lid, date: { gte: fromDate, lte: toDate } },
      include: {
        voucher: {
          select: { voucherType: true, voucherNumber: true, narration: true, party: { select: { name: true } } },
        },
      },
      orderBy: { date: 'asc' },
    })

    const priorEntries = await prisma.journalEntry.aggregate({
      where: { ledgerId: lid, date: { lt: fromDate } },
      _sum: { debit: true, credit: true },
    })

    const opening = Number(ledger.openingBalance)
    const openingType = ledger.openingType
    const priorDr = Number(priorEntries._sum.debit || 0)
    const priorCr = Number(priorEntries._sum.credit || 0)

    let runningBal = openingType === 'Dr'
      ? opening + priorDr - priorCr
      : opening + priorCr - priorDr

    const statement = entries.map(e => {
      const dr = Number(e.debit); const cr = Number(e.credit)
      runningBal += dr - cr
      return {
        date: e.date,
        voucherType: e.voucher?.voucherType,
        voucherNumber: e.voucher?.voucherNumber,
        party: e.voucher?.party?.name,
        narration: e.voucher?.narration || e.narration,
        debit: dr || null, credit: cr || null,
        balance: Math.abs(runningBal),
        balanceType: runningBal >= 0 ? 'Dr' : 'Cr',
      }
    })

    results.push({
      ledger: { id: ledger.id, name: ledger.name, groupName: ledger.group.name },
      openingBalance: Math.abs(opening + priorDr - priorCr),
      openingType,
      statement,
      closingBalance: Math.abs(runningBal),
      closingType: runningBal >= 0 ? 'Dr' : 'Cr',
      totalDebit: entries.reduce((s, e) => s + Number(e.debit), 0),
      totalCredit: entries.reduce((s, e) => s + Number(e.credit), 0),
    })
  }

  sendSuccess(res, results.length === 1 ? results[0] : { accounts: results })
})

// ─── Bank Book — journal entries for bank ledgers ─────────────────────────────

accountingRouter.get('/bank-book', async (req: Request, res: Response) => {
  const { ledgerId, from, to } = req.query
  const fromDate = from ? new Date(String(from)) : new Date(new Date().getFullYear(), 3, 1)
  const toDate = to ? new Date(String(to)) : new Date()

  let ledgerIds: string[] = []
  if (ledgerId) {
    ledgerIds = [String(ledgerId)]
  } else {
    const bankLedgers = await prisma.ledger.findMany({
      where: {
        companyId: req.companyId,
        isActive: true,
        group: { name: 'Bank Accounts' },
      },
      select: { id: true, name: true },
    })
    ledgerIds = bankLedgers.map(l => l.id)
  }

  if (ledgerIds.length === 0) {
    return sendSuccess(res, { accounts: [] })
  }

  const results = []
  for (const lid of ledgerIds) {
    const ledger = await prisma.ledger.findUnique({
      where: { id: lid },
      include: { group: true },
    })
    if (!ledger) continue

    const entries = await prisma.journalEntry.findMany({
      where: { ledgerId: lid, date: { gte: fromDate, lte: toDate } },
      include: {
        voucher: {
          select: {
            voucherType: true, voucherNumber: true, narration: true,
            chequeNumber: true, chequeDate: true,
            party: { select: { name: true } },
          },
        },
      },
      orderBy: { date: 'asc' },
    })

    const priorEntries = await prisma.journalEntry.aggregate({
      where: { ledgerId: lid, date: { lt: fromDate } },
      _sum: { debit: true, credit: true },
    })

    const opening = Number(ledger.openingBalance)
    const openingType = ledger.openingType
    const priorDr = Number(priorEntries._sum.debit || 0)
    const priorCr = Number(priorEntries._sum.credit || 0)

    let runningBal = openingType === 'Dr'
      ? opening + priorDr - priorCr
      : opening + priorCr - priorDr

    const statement = entries.map(e => {
      const dr = Number(e.debit); const cr = Number(e.credit)
      runningBal += dr - cr
      return {
        date: e.date,
        voucherType: e.voucher?.voucherType,
        voucherNumber: e.voucher?.voucherNumber,
        chequeNumber: e.voucher?.chequeNumber,
        chequeDate: e.voucher?.chequeDate,
        party: e.voucher?.party?.name,
        narration: e.voucher?.narration || e.narration,
        debit: dr || null, credit: cr || null,
        balance: Math.abs(runningBal),
        balanceType: runningBal >= 0 ? 'Dr' : 'Cr',
      }
    })

    results.push({
      ledger: { id: ledger.id, name: ledger.name, groupName: ledger.group.name },
      openingBalance: Math.abs(opening + priorDr - priorCr),
      openingType,
      statement,
      closingBalance: Math.abs(runningBal),
      closingType: runningBal >= 0 ? 'Dr' : 'Cr',
      totalDebit: entries.reduce((s, e) => s + Number(e.debit), 0),
      totalCredit: entries.reduce((s, e) => s + Number(e.credit), 0),
    })
  }

  sendSuccess(res, results.length === 1 ? results[0] : { accounts: results })
})
