import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma'
import { UnauthorizedError, ForbiddenError, NotFoundError } from '../utils/response'
import { UserRole } from '@prisma/client'

export interface JwtPayload {
  userId: string
  email: string
  isSuperAdmin: boolean
}

declare global {
  namespace Express {
    interface Request {
      user: JwtPayload
      companyId: string
      companyUserId: string
      userRole: UserRole
      userPermissions: Record<string, boolean>
      branchIds: string[]
    }
  }
}

// ─── Verify Access Token ──────────────────────────────────────────────────────

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('No token provided')
  }

  const token = authHeader.split(' ')[1]
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload
    req.user = decoded
    next()
  } catch {
    throw new UnauthorizedError('Invalid or expired token')
  }
}

// ─── Inject Company Context ───────────────────────────────────────────────────
// Call after authenticate. Reads x-company-id header.

export async function withCompany(req: Request, _res: Response, next: NextFunction) {
  const companyId = req.headers['x-company-id'] as string
  if (!companyId) throw new ForbiddenError('Company not selected')

  if (req.user.isSuperAdmin) {
    // Super admin bypasses company user check
    req.companyId = companyId
    req.userRole = UserRole.SUPER_ADMIN
    req.userPermissions = {}
    req.branchIds = []
    return next()
  }

  const companyUser = await prisma.companyUser.findUnique({
    where: { companyId_userId: { companyId, userId: req.user.userId } },
    include: { company: { select: { isActive: true } } },
  })

  if (!companyUser || !companyUser.isActive) {
    throw new ForbiddenError('You do not have access to this company')
  }

  if (!companyUser.company.isActive) {
    throw new ForbiddenError('This company account is inactive')
  }

  req.companyId = companyId
  req.companyUserId = companyUser.id
  req.userRole = companyUser.role
  req.userPermissions = companyUser.permissions as Record<string, boolean>
  req.branchIds = companyUser.branchIds

  next()
}

// ─── Role Guards ──────────────────────────────────────────────────────────────

export function requireRole(...roles: UserRole[]) {
  return (_req: Request, _res: Response, next: NextFunction) => {
    const userRole = _req.userRole
    if (!roles.includes(userRole) && userRole !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenError('Insufficient permissions')
    }
    next()
  }
}

export function requirePermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.userRole === UserRole.SUPER_ADMIN || req.userRole === UserRole.COMPANY_ADMIN) {
      return next()
    }
    if (!req.userPermissions[permission]) {
      throw new ForbiddenError(`Permission required: ${permission}`)
    }
    next()
  }
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user.isSuperAdmin) throw new ForbiddenError('Super admin access required')
  next()
}
