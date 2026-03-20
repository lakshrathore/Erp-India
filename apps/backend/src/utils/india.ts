import dayjs from 'dayjs'

// ─── GST / PAN Validation ─────────────────────────────────────────────────────

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/

export function validateGSTIN(gstin: string): boolean {
  return GSTIN_REGEX.test(gstin.toUpperCase())
}

export function validatePAN(pan: string): boolean {
  return PAN_REGEX.test(pan.toUpperCase())
}

export function validateIFSC(ifsc: string): boolean {
  return IFSC_REGEX.test(ifsc.toUpperCase())
}

export function extractStateCodeFromGSTIN(gstin: string): string {
  return gstin.substring(0, 2)
}

// ─── Indian Number Formatting ─────────────────────────────────────────────────

export function formatIndianNumber(amount: number, decimals = 2): string {
  const fixed = amount.toFixed(decimals)
  const [integer, decimal] = fixed.split('.')
  
  // Indian format: last 3 digits, then groups of 2
  const lastThree = integer.slice(-3)
  const rest = integer.slice(0, -3)
  const formatted = rest
    ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree
    : lastThree

  return decimal !== undefined ? `${formatted}.${decimal}` : formatted
}

export function formatCurrency(amount: number, symbol = '₹'): string {
  return `${symbol} ${formatIndianNumber(amount)}`
}

export function amountInWords(amount: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
    'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  function convertHundreds(n: number): string {
    if (n === 0) return ''
    if (n < 20) return ones[n] + ' '
    if (n < 100) return tens[Math.floor(n / 10)] + ' ' + ones[n % 10] + ' '
    return ones[Math.floor(n / 100)] + ' Hundred ' + convertHundreds(n % 100)
  }

  const n = Math.floor(amount)
  const paise = Math.round((amount - n) * 100)

  if (n === 0) return 'Zero Rupees Only'

  let result = ''
  if (n >= 10000000) result += convertHundreds(Math.floor(n / 10000000)) + 'Crore '
  if (n >= 100000) result += convertHundreds(Math.floor((n % 10000000) / 100000)) + 'Lakh '
  if (n >= 1000) result += convertHundreds(Math.floor((n % 100000) / 1000)) + 'Thousand '
  result += convertHundreds(n % 1000)

  result = result.trim() + ' Rupees'
  if (paise > 0) result += ' and ' + convertHundreds(paise).trim() + ' Paise'
  result += ' Only'

  return result.replace(/\s+/g, ' ').trim()
}

// ─── Financial Year ───────────────────────────────────────────────────────────

export function getFinancialYear(date: Date): string {
  const d = dayjs(date)
  const month = d.month() + 1 // 1-based
  const year = d.year()

  if (month >= 4) {
    // April onwards → current FY
    const shortYear = String(year).slice(2)
    const nextShortYear = String(year + 1).slice(2)
    return `${shortYear}-${nextShortYear}` // "25-26"
  } else {
    const shortYear = String(year - 1).slice(2)
    const nextShortYear = String(year).slice(2)
    return `${shortYear}-${nextShortYear}`
  }
}

export function getFinancialYearFull(date: Date): string {
  const d = dayjs(date)
  const month = d.month() + 1
  const year = d.year()

  if (month >= 4) {
    return `${year}-${year + 1}` // "2025-2026"
  } else {
    return `${year - 1}-${year}`
  }
}

export function getFinancialYearDates(fyString: string): { start: Date; end: Date } {
  // fyString: "25-26" or "2025-26"
  const parts = fyString.split('-')
  let startYear: number

  if (parts[0].length === 2) {
    startYear = 2000 + parseInt(parts[0])
  } else {
    startYear = parseInt(parts[0])
  }

  return {
    start: new Date(`${startYear}-04-01`),
    end: new Date(`${startYear + 1}-03-31`),
  }
}

export function getGSTRPeriod(date: Date): string {
  // Returns "062025" for June 2025
  const d = dayjs(date)
  return d.format('MMYYYY')
}

export function parseGSTRPeriod(period: string): { month: number; year: number } {
  return {
    month: parseInt(period.substring(0, 2)),
    year: parseInt(period.substring(2)),
  }
}

// ─── Pagination Helpers ───────────────────────────────────────────────────────

export function getPagination(query: { page?: string; limit?: string }) {
  const page = Math.max(1, parseInt(query.page || '1'))
  const limit = Math.min(500, Math.max(1, parseInt(query.limit || '50')))
  const skip = (page - 1) * limit
  return { page, limit, skip }
}

// ─── GST Calculation ──────────────────────────────────────────────────────────

export function calculateGST(
  amountIn: number,
  gstRate: number,
  taxType: 'CGST_SGST' | 'IGST' | 'EXEMPT' | 'NIL_RATED' | 'NON_GST',
  cessRate = 0,
  inclusive = false  // true = rate already includes GST
) {
  if (taxType === 'EXEMPT' || taxType === 'NIL_RATED' || taxType === 'NON_GST' || gstRate === 0) {
    return { cgst: 0, sgst: 0, igst: 0, cess: 0, total: amountIn, taxableAmount: amountIn }
  }

  // Inclusive: reverse-calculate taxable amount
  const taxableAmount = inclusive
    ? Math.round(amountIn / (1 + gstRate / 100) * 100) / 100
    : amountIn

  const cess = Math.round((taxableAmount * cessRate) / 100 * 100) / 100

  if (taxType === 'IGST') {
    const igst = Math.round((taxableAmount * gstRate) / 100 * 100) / 100
    return {
      cgst: 0, sgst: 0, igst, cess, taxableAmount,
      total: inclusive ? amountIn + cess : taxableAmount + igst + cess
    }
  }

  // CGST + SGST (half-half)
  const halfRate = gstRate / 2
  const cgst = Math.round((taxableAmount * halfRate) / 100 * 100) / 100
  const sgst = cgst
  return {
    cgst, sgst, igst: 0, cess, taxableAmount,
    total: inclusive ? amountIn + cess : taxableAmount + cgst + sgst + cess
  }
}

// ─── Round Off (nearest 50 paise or rupee) ────────────────────────────────────

export function roundOff(amount: number): { rounded: number; roundOff: number } {
  const rounded = Math.round(amount)
  return { rounded, roundOff: rounded - amount }
}

// ─── Professional Tax Slab (Maharashtra as default) ───────────────────────────

const PT_SLABS: Record<string, Array<{ upto: number; pt: number }>> = {
  MH: [
    { upto: 7500, pt: 0 },
    { upto: 10000, pt: 175 },
    { upto: Infinity, pt: 200 }, // 300 in Feb
  ],
  KA: [
    { upto: 15000, pt: 0 },
    { upto: 25000, pt: 150 },
    { upto: 35000, pt: 200 },
    { upto: Infinity, pt: 200 },
  ],
  AP: [
    { upto: 15000, pt: 0 },
    { upto: 20000, pt: 150 },
    { upto: Infinity, pt: 200 },
  ],
  RJ: [{ upto: Infinity, pt: 0 }], // Rajasthan has no PT
  // Add more states as needed
}

export function calculatePT(grossSalary: number, stateCode: string): number {
  const slabs = PT_SLABS[stateCode] || PT_SLABS['MH']
  for (const slab of slabs) {
    if (grossSalary <= slab.upto) return slab.pt
  }
  return 0
}
