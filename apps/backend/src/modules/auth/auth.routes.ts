import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { sendSuccess, BadRequestError, UnauthorizedError, NotFoundError } from '../../utils/response'
import { authenticate } from '../../middleware/auth'

export const authRouter = Router()

// ─── Schemas ──────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8),
})

// ─── Token Helpers ────────────────────────────────────────────────────────────

function generateTokens(userId: string, email: string, isSuperAdmin: boolean) {
  const payload = { userId, email, isSuperAdmin }

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
  })

  const refreshToken = jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d',
  })

  return { accessToken, refreshToken }
}

// ─── POST /auth/login ─────────────────────────────────────────────────────────

authRouter.post('/login', async (req: Request, res: Response) => {
  const body = loginSchema.safeParse(req.body)
  if (!body.success) throw new BadRequestError('Invalid email or password format')

  const user = await prisma.user.findUnique({
    where: { email: body.data.email.toLowerCase() },
  })

  if (!user || !user.isActive) {
    throw new UnauthorizedError('Invalid credentials')
  }

  const isPasswordValid = await bcrypt.compare(body.data.password, user.passwordHash)
  if (!isPasswordValid) throw new UnauthorizedError('Invalid credentials')

  const { accessToken, refreshToken } = generateTokens(user.id, user.email, user.isSuperAdmin)

  // Save refresh token
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)
  await prisma.refreshToken.create({
    data: { userId: user.id, token: refreshToken, expiresAt },
  })

  // Get user's companies
  const companies = await prisma.companyUser.findMany({
    where: { userId: user.id, isActive: true },
    include: {
      company: {
        select: { id: true, name: true, gstin: true, logo: true, isActive: true },
      },
    },
  })

  sendSuccess(res, {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      isSuperAdmin: user.isSuperAdmin,
    },
    companies: companies
      .filter((cu) => cu.company.isActive)
      .map((cu) => ({
        companyId: cu.company.id,
        companyName: cu.company.name,
        gstin: cu.company.gstin,
        logo: cu.company.logo,
        role: cu.role,
      })),
  })
})

// ─── POST /auth/register ──────────────────────────────────────────────────────
// Only for super admin to create users, or self-registration if enabled

authRouter.post('/register', async (req: Request, res: Response) => {
  const body = registerSchema.safeParse(req.body)
  if (!body.success) {
    throw new BadRequestError(body.error.errors.map((e) => e.message).join(', '))
  }

  const existing = await prisma.user.findUnique({
    where: { email: body.data.email.toLowerCase() },
  })
  if (existing) throw new BadRequestError('Email already registered')

  const passwordHash = await bcrypt.hash(body.data.password, 12)

  const user = await prisma.user.create({
    data: {
      name: body.data.name,
      email: body.data.email.toLowerCase(),
      phone: body.data.phone,
      passwordHash,
    },
    select: { id: true, name: true, email: true, phone: true },
  })

  sendSuccess(res, user, 'Registration successful', 201)
})

// ─── POST /auth/refresh ───────────────────────────────────────────────────────

authRouter.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body
  if (!refreshToken) throw new BadRequestError('Refresh token required')

  let decoded: jwt.JwtPayload
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_SECRET!) as jwt.JwtPayload
  } catch {
    throw new UnauthorizedError('Invalid refresh token')
  }

  const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } })
  if (!stored || stored.expiresAt < new Date()) {
    throw new UnauthorizedError('Refresh token expired')
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: { id: true, email: true, isSuperAdmin: true, isActive: true },
  })
  if (!user || !user.isActive) throw new UnauthorizedError('User not found')

  // Rotate refresh token
  await prisma.refreshToken.delete({ where: { token: refreshToken } })
  const tokens = generateTokens(user.id, user.email, user.isSuperAdmin)

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)
  await prisma.refreshToken.create({
    data: { userId: user.id, token: tokens.refreshToken, expiresAt },
  })

  sendSuccess(res, tokens)
})

// ─── POST /auth/logout ────────────────────────────────────────────────────────

authRouter.post('/logout', authenticate, async (req: Request, res: Response) => {
  const { refreshToken } = req.body
  if (refreshToken) {
    await prisma.refreshToken.deleteMany({ where: { token: refreshToken } })
  }
  // Delete all refresh tokens for user
  await prisma.refreshToken.deleteMany({ where: { userId: req.user.userId } })
  sendSuccess(res, null, 'Logged out successfully')
})

// ─── GET /auth/me ─────────────────────────────────────────────────────────────

authRouter.get('/me', authenticate, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      isSuperAdmin: true,
      createdAt: true,
    },
  })
  if (!user) throw new NotFoundError('User')

  const companies = await prisma.companyUser.findMany({
    where: { userId: user.id, isActive: true },
    include: {
      company: { select: { id: true, name: true, gstin: true, logo: true, isActive: true } },
    },
  })

  sendSuccess(res, {
    ...user,
    companies: companies
      .filter((cu) => cu.company.isActive)
      .map((cu) => ({
        companyId: cu.company.id,
        companyName: cu.company.name,
        gstin: cu.company.gstin,
        logo: cu.company.logo,
        role: cu.role,
        permissions: cu.permissions,
      })),
  })
})

// ─── PUT /auth/change-password ────────────────────────────────────────────────

authRouter.put('/change-password', authenticate, async (req: Request, res: Response) => {
  const body = changePasswordSchema.safeParse(req.body)
  if (!body.success) throw new BadRequestError('Invalid input')

  const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
  if (!user) throw new NotFoundError('User')

  const isValid = await bcrypt.compare(body.data.currentPassword, user.passwordHash)
  if (!isValid) throw new BadRequestError('Current password is incorrect')

  const passwordHash = await bcrypt.hash(body.data.newPassword, 12)
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } })

  // Invalidate all refresh tokens
  await prisma.refreshToken.deleteMany({ where: { userId: user.id } })

  sendSuccess(res, null, 'Password changed successfully')
})
