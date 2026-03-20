import { VoucherType } from '@prisma/client'
import { prisma } from '../lib/prisma'

const DEFAULT_PREFIXES: Record<VoucherType, string> = {
  SALE:              'INV',
  PURCHASE:          'PUR',
  CREDIT_NOTE:       'CRN',
  DEBIT_NOTE:        'DBN',
  SALE_CHALLAN:      'SCH',
  PURCHASE_ORDER:    'PO',
  PURCHASE_CHALLAN:  'PCH',
  PRODUCTION:        'PRD',
  RECEIPT:           'RCT',
  PAYMENT:           'PMT',
  CONTRA:            'CTR',
  JOURNAL:           'JV',
}

/**
 * Generate next voucher number — atomic, uses DB transaction
 * Format: INV-25-26-0001
 */
export async function generateVoucherNumber(
  tx: any,
  companyId: string,
  branchId: string | null,
  voucherType: VoucherType,
  financialYear: string  // "25-26"
): Promise<string> {
  // Find or create series record
  let series = await tx.numberSeries.findFirst({
    where: {
      companyId,
      voucherType,
      financialYear,
    },
  })

  if (!series) {
    // Create default series
    series = await tx.numberSeries.create({
      data: {
        companyId,
        voucherType,
        prefix: DEFAULT_PREFIXES[voucherType] || 'VCH',
        separator: '-',
        startNumber: 1,
        currentNumber: 0,
        padLength: 4,
        fyDependent: true,
        financialYear,
      },
    })
  }

  // Increment atomically
  const updated = await tx.numberSeries.update({
    where: { id: series.id },
    data: { currentNumber: { increment: 1 } },
  })

  const number = updated.currentNumber
  const padded = String(number).padStart(series.padLength, '0')
  const sep = series.separator || '-'

  return `${series.prefix}${sep}${financialYear}${sep}${padded}`
}
