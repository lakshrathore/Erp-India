import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
dayjs.extend(customParseFormat)

// ─── Indian Number / Currency Format ─────────────────────────────────────────

export function formatINR(amount: number | string | null | undefined, decimals = 2): string {
  if (amount == null || amount === '') return '—'
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(n)) return '—'

  const fixed = Math.abs(n).toFixed(decimals)
  const [integer, decimal] = fixed.split('.')

  const lastThree = integer.slice(-3)
  const rest = integer.slice(0, -3)
  const formatted = rest
    ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree
    : lastThree

  const result = decimal ? `${formatted}.${decimal}` : formatted
  return n < 0 ? `-₹${result}` : `₹${result}`
}

export function formatNumber(n: number | string, decimals = 3): string {
  if (n == null) return '0'
  const num = typeof n === 'string' ? parseFloat(n) : n
  return num.toFixed(decimals).replace(/\.?0+$/, '')
}

export function parseCurrency(value: string): number {
  return parseFloat(value.replace(/[₹,\s]/g, '')) || 0
}

// ─── Date Formatting ──────────────────────────────────────────────────────────

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return dayjs(date).format('DD-MM-YYYY')
}

export function formatDateLong(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return dayjs(date).format('DD MMM YYYY')
}

export function toInputDate(date: string | Date | null | undefined): string {
  if (!date) return ''
  return dayjs(date).format('YYYY-MM-DD')
}

export function fromInputDate(date: string): Date {
  return dayjs(date, 'YYYY-MM-DD').toDate()
}

// ─── Financial Year ───────────────────────────────────────────────────────────

export function getFinancialYear(date: Date = new Date()): string {
  const d = dayjs(date)
  const month = d.month() + 1
  const year = d.year()
  if (month >= 4) {
    return `${String(year).slice(2)}-${String(year + 1).slice(2)}`
  }
  return `${String(year - 1).slice(2)}-${String(year).slice(2)}`
}

export function getFYLabel(fy: string): string {
  // "25-26" → "FY 2025-26" or "2025-26" → "FY 2025-26"
  const parts = fy.split('-')
  if (parts.length !== 2) return fy
  const y = parseInt(parts[0])
  const year = y < 100 ? `20${parts[0]}` : parts[0]
  const year2 = y < 100 ? parts[1] : String(y + 1).slice(2)
  return `FY ${year}-${year2}`
}

// ─── Parse FY string to start/end dates ───────────────────────────────────────
// Handles both "25-26" and "2025-26" formats safely
export function parseFYDates(fy: string | null): { from: string; to: string } {
  if (!fy) {
    const now = new Date()
    const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
    return { from: `${y}-04-01`, to: `${y + 1}-03-31` }
  }
  const startPart = fy.split('-')[0]
  const raw = parseInt(startPart)
  const year = raw < 100 ? 2000 + raw : raw
  return { from: `${year}-04-01`, to: `${year + 1}-03-31` }
}

export function getGSTRPeriodLabel(period: string): string {
  // "062025" → "June 2025"
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const month = parseInt(period.substring(0, 2))
  const year = period.substring(2)
  return `${months[month - 1]} ${year}`
}

// ─── GST Calculations ─────────────────────────────────────────────────────────

export type TaxType = 'CGST_SGST' | 'IGST' | 'EXEMPT' | 'NIL_RATED' | 'NON_GST'

export interface GSTResult {
  taxableAmount: number
  cgstRate: number
  cgstAmount: number
  sgstRate: number
  sgstAmount: number
  igstRate: number
  igstAmount: number
  cessRate: number
  cessAmount: number
  totalTax: number
  lineTotal: number
}

export function calculateLineGST(
  qty: number,
  rate: number,
  discountPct: number,
  gstRate: number,
  taxType: TaxType,
  cessRate = 0,
  inclusive = false   // NEW: true = GST already included in rate
): GSTResult {
  const gross = qty * rate
  const discountAmt = (gross * discountPct) / 100
  const grossAfterDisc = gross - discountAmt

  // ── Inclusive: back-calculate taxable from gross ───────────────────────────
  // Formula: taxableAmount = grossAfterDisc / (1 + gstRate/100)
  // Example: Rate=118, GST=18% → taxable = 118/1.18 = 100, GST = 18
  let taxableAmount: number
  if (inclusive && gstRate > 0 && taxType !== 'EXEMPT' && taxType !== 'NIL_RATED' && taxType !== 'NON_GST') {
    taxableAmount = grossAfterDisc / (1 + gstRate / 100)
  } else {
    taxableAmount = grossAfterDisc
  }
  taxableAmount = Math.round(taxableAmount * 100) / 100

  if (taxType === 'EXEMPT' || taxType === 'NIL_RATED' || taxType === 'NON_GST') {
    return {
      taxableAmount: grossAfterDisc,
      cgstRate: 0, cgstAmount: 0, sgstRate: 0, sgstAmount: 0,
      igstRate: 0, igstAmount: 0, cessRate: 0, cessAmount: 0,
      totalTax: 0, lineTotal: grossAfterDisc,
    }
  }

  const cess = Math.round((taxableAmount * cessRate) / 100 * 100) / 100

  if (taxType === 'IGST') {
    const igstAmount = Math.round((taxableAmount * gstRate) / 100 * 100) / 100
    return {
      taxableAmount, cgstRate: 0, cgstAmount: 0, sgstRate: 0, sgstAmount: 0,
      igstRate: gstRate, igstAmount,
      cessRate, cessAmount: cess,
      totalTax: igstAmount + cess,
      // Inclusive: lineTotal = grossAfterDisc (rate already includes tax)
      lineTotal: inclusive ? grossAfterDisc + cess : taxableAmount + igstAmount + cess,
    }
  }

  const halfRate = gstRate / 2
  const cgstAmount = Math.round((taxableAmount * halfRate) / 100 * 100) / 100
  const sgstAmount = cgstAmount
  return {
    taxableAmount, cgstRate: halfRate, cgstAmount, sgstRate: halfRate, sgstAmount,
    igstRate: 0, igstAmount: 0, cessRate, cessAmount: cess,
    totalTax: cgstAmount + sgstAmount + cess,
    lineTotal: inclusive ? grossAfterDisc + cess : taxableAmount + cgstAmount + sgstAmount + cess,
  }
}

export function roundOff(total: number): number {
  return Math.round(total) - total
}

// ─── Validations ──────────────────────────────────────────────────────────────

export function isValidGSTIN(gstin: string): boolean {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin?.toUpperCase() || '')
}

export function isValidPAN(pan: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan?.toUpperCase() || '')
}

export function isValidIFSC(ifsc: string): boolean {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc?.toUpperCase() || '')
}

export function formatGSTIN(gstin: string): string {
  return gstin?.toUpperCase().trim() || ''
}

// ─── Amount in Words ──────────────────────────────────────────────────────────

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen']
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function convertHundreds(n: number): string {
  if (n === 0) return ''
  if (n < 20) return ones[n] + ' '
  if (n < 100) return tens[Math.floor(n / 10)] + ' ' + (ones[n % 10] ? ones[n % 10] + ' ' : '')
  return ones[Math.floor(n / 100)] + ' Hundred ' + convertHundreds(n % 100)
}

export function amountInWords(amount: number): string {
  const n = Math.floor(Math.abs(amount))
  const paise = Math.round((Math.abs(amount) - n) * 100)
  if (n === 0 && paise === 0) return 'Zero Rupees Only'

  let result = ''
  if (n >= 10000000) result += convertHundreds(Math.floor(n / 10000000)) + 'Crore '
  if (n >= 100000)   result += convertHundreds(Math.floor((n % 10000000) / 100000)) + 'Lakh '
  if (n >= 1000)     result += convertHundreds(Math.floor((n % 100000) / 1000)) + 'Thousand '
  result += convertHundreds(n % 1000)

  result = result.trim() + ' Rupees'
  if (paise > 0) result += ' and ' + convertHundreds(paise).trim() + ' Paise'
  result += ' Only'
  return result.replace(/\s+/g, ' ').trim()
}

// ─── State Codes ──────────────────────────────────────────────────────────────

export const INDIAN_STATES: { code: string; name: string }[] = [
  { code: '01', name: 'Jammu & Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '25', name: 'Daman & Diu' },
  { code: '26', name: 'Dadra & Nagar Haveli' },
  { code: '27', name: 'Maharashtra' },
  { code: '28', name: 'Andhra Pradesh (old)' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman & Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
  { code: '97', name: 'Other Territory' },
]

export function getStateName(code: string): string {
  return INDIAN_STATES.find((s) => s.code === code)?.name || code
}
