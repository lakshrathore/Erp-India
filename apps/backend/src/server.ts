import 'express-async-errors'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'

import { errorHandler } from './middleware/errorHandler'
import { authRouter } from './modules/auth/auth.routes'
import { companyRouter } from './modules/company/company.routes'
import { mastersRouter } from './modules/masters/masters.routes'
import { billingRouter } from './modules/billing/billing.routes'
import { accountingRouter } from './modules/accounting/accounting.routes'
import { gstRouter } from './modules/gst/gst.routes'
import { payrollRouter } from './modules/payroll/payroll.routes'
import { inventoryRouter } from './modules/inventory/inventory.routes'
import { assetsRouter } from './modules/assets/assets.routes'
import { logger } from './lib/logger'

const app = express()
const PORT = process.env.PORT || 5000

// ─── Security & Parsing ───────────────────────────────────────────────────────
app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-company-id'],
}))
app.use(compression())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

// ─── Logging ──────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (message) => logger.info(message.trim()) },
  }))
}

// ─── Rate Limiting ────────────────────────────────────────────────────────────
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many login attempts. Try again after 15 minutes.' },
}))

app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { success: false, message: 'Rate limit exceeded. Please slow down.' },
}))

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' })
})

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter)
app.use('/api/companies', companyRouter)
app.use('/api/masters', mastersRouter)
app.use('/api/billing', billingRouter)
app.use('/api/accounting', accountingRouter)
app.use('/api/gst', gstRouter)
app.use('/api/payroll', payrollRouter)
app.use('/api/inventory', inventoryRouter)
app.use('/api/assets', assetsRouter)

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' })
})

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use(errorHandler)

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`🚀 ERP India API running on http://localhost:${PORT}`)
  logger.info(`📊 Environment: ${process.env.NODE_ENV}`)
})

export default app
