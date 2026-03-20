import { Router, Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { authenticate, withCompany } from '../../middleware/auth'
import { sendSuccess, BadRequestError } from '../../utils/response'
import { getStockSummary, getItemLedger, calculateItemProfit } from '../../lib/fifo.engine'

export const inventoryRouter = Router()
inventoryRouter.use(authenticate, withCompany)

// GET /inventory/stock
inventoryRouter.get('/stock', async (req: Request, res: Response) => {
  const { godownId, itemId } = req.query
  const stock = await getStockSummary(req.companyId, {
    itemId: itemId ? String(itemId) : undefined,
    godownId: godownId ? String(godownId) : undefined,
  })
  sendSuccess(res, stock)
})

// GET /inventory/item-ledger/:itemId
inventoryRouter.get('/item-ledger/:itemId', async (req: Request, res: Response) => {
  const { from, to, variantId } = req.query
  const fromDate = from ? new Date(String(from)) : new Date(new Date().getFullYear(), 3, 1)
  const toDate = to ? new Date(String(to)) : new Date()

  const ledger = await getItemLedger(
    req.params.itemId,
    variantId ? String(variantId) : null,
    req.companyId,
    fromDate,
    toDate
  )
  sendSuccess(res, ledger)
})

// GET /inventory/profit
inventoryRouter.get('/profit', async (req: Request, res: Response) => {
  const { from, to } = req.query
  const fromDate = from ? new Date(String(from)) : new Date(new Date().getFullYear(), 3, 1)
  const toDate = to ? new Date(String(to)) : new Date()

  const profit = await calculateItemProfit(req.companyId, fromDate, toDate)
  sendSuccess(res, profit)
})
