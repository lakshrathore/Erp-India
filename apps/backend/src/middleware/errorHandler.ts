import { Request, Response, NextFunction } from 'express'
import { AppError, ValidationError } from '../utils/response'
import { logger } from '../lib/logger'
import { Prisma } from '@prisma/client'

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  logger.error(`${req.method} ${req.path} - ${err.message}`, { stack: err.stack })

  // Validation errors (zod)
  if (err instanceof ValidationError) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: err.errors,
    })
  }

  // Our custom errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    })
  }

  // Prisma unique constraint violation
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const field = (err.meta?.target as string[])?.join(', ') || 'field'
      return res.status(409).json({
        success: false,
        message: `A record with this ${field} already exists`,
      })
    }
    if (err.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Record not found',
      })
    }
    if (err.code === 'P2003') {
      return res.status(400).json({
        success: false,
        message: 'Referenced record does not exist',
      })
    }
  }

  // Unknown error
  return res.status(500).json({
    success: false,
    message:
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message,
  })
}
