import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { formatINR, formatDate, amountInWords, getStateName } from '../../lib/india'
import { Printer, X } from 'lucide-react'

const SALE_TYPE_LABELS: Record<string, string> = {
  REGULAR: '',
  EXPORT_WITH_LUT: 'Export — Zero Rated (Under LUT)',
  EXPORT_WITHOUT_LUT: 'Export — IGST Paid',
  SEZ_WITH_PAYMENT: 'Supply to SEZ — With Payment of Tax',
  SEZ_WITHOUT_PAYMENT: 'Supply to SEZ — Without Payment of Tax',
  DEEMED_EXPORT: 'Deemed Export',
  COMPOSITION: 'Composition Dealer',
}

export default function VoucherPrintPage() {
  const { type, id } = useParams()

  const { data: voucher, isLoading } = useQuery({
    queryKey: ['voucher-print', id],
    queryFn: async () => {
      const { data } = await api.get(`/billing/vouchers/${id}`)
      return data.data
    },
    enabled: !!id,
  })

  const { data: company } = useQuery({
    queryKey: ['company-print'],
    queryFn: async () => {
      const stored = localStorage.getItem('erp-auth')
      if (!stored) return null
      const state = JSON.parse(stored)?.state
      const companyId = state?.activeCompany?.companyId
      if (!companyId) return null
      const { data } = await api.get(`/companies/${companyId}`)
      return data.data
    },
  })

  if (isLoading) return <div className="flex items-center justify-center min-h-screen text-sm">Loading...</div>
  if (!voucher) return <div className="flex items-center justify-center min-h-screen text-sm">Voucher not found</div>

  const isSale = ['SALE', 'CREDIT_NOTE', 'SALE_CHALLAN'].includes(voucher.voucherType)
  const isIGST = voucher.igstAmount > 0

  const TITLE_MAP: Record<string, string> = {
    SALE: 'TAX INVOICE', PURCHASE: 'PURCHASE INVOICE',
    CREDIT_NOTE: 'CREDIT NOTE', DEBIT_NOTE: 'DEBIT NOTE',
    SALE_CHALLAN: 'DELIVERY CHALLAN', PURCHASE_ORDER: 'PURCHASE ORDER',
    PURCHASE_CHALLAN: 'GOODS RECEIPT NOTE', PRODUCTION: 'PRODUCTION ORDER',
    RECEIPT: 'RECEIPT VOUCHER', PAYMENT: 'PAYMENT VOUCHER',
    CONTRA: 'CONTRA VOUCHER', JOURNAL: 'JOURNAL VOUCHER',
  }
  const docTitle = TITLE_MAP[voucher.voucherType] || voucher.voucherType
  const saleTypeLabel = SALE_TYPE_LABELS[voucher.saleType] || ''
  const isExportType = voucher.saleType && voucher.saleType !== 'REGULAR'

  // GST tax rate-wise breakup
  const taxBreakup: Record<string, { taxable: number; cgst: number; sgst: number; igst: number }> = {}
  for (const item of voucher.items || []) {
    const rate = Number(item.gstRate)
    const key = String(rate)
    if (!taxBreakup[key]) taxBreakup[key] = { taxable: 0, cgst: 0, sgst: 0, igst: 0 }
    taxBreakup[key].taxable += Number(item.taxableAmount)
    taxBreakup[key].cgst += Number(item.cgstAmount)
    taxBreakup[key].sgst += Number(item.sgstAmount)
    taxBreakup[key].igst += Number(item.igstAmount)
  }

  const S = {
    page: { background: '#fff', maxWidth: '210mm', margin: '0 auto', padding: '8mm', fontFamily: 'Arial, sans-serif', fontSize: '10pt', color: '#1a1a1a' } as React.CSSProperties,
    border: { border: '1.5px solid #1a1a2e', borderRadius: '4px', overflow: 'hidden' } as React.CSSProperties,
    headerBg: { background: '#1a1a2e', color: '#fff', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } as React.CSSProperties,
    sectionTitle: { background: '#f0f4ff', borderBottom: '1px solid #dde3f0', padding: '4px 10px', fontWeight: 700, fontSize: '9pt', color: '#1a1a2e', textTransform: 'uppercase', letterSpacing: '0.05em' } as React.CSSProperties,
    grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #e8ecf0' } as React.CSSProperties,
    cell: { padding: '8px 10px', borderRight: '1px solid #e8ecf0' } as React.CSSProperties,
    label: { fontSize: '8pt', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '2px' } as React.CSSProperties,
    value: { fontSize: '10pt', fontWeight: 500 } as React.CSSProperties,
    th: { background: '#f0f4ff', padding: '6px 8px', fontWeight: 700, fontSize: '8.5pt', borderBottom: '1.5px solid #1a1a2e', borderRight: '1px solid #e0e7f0', textAlign: 'left', color: '#1a1a2e' } as React.CSSProperties,
    td: { padding: '5px 8px', borderBottom: '1px solid #f0f0f0', borderRight: '1px solid #f0f0f0', verticalAlign: 'top' } as React.CSSProperties,
    tdRight: { padding: '5px 8px', borderBottom: '1px solid #f0f0f0', borderRight: '1px solid #f0f0f0', textAlign: 'right', verticalAlign: 'top', fontFamily: 'monospace' } as React.CSSProperties,
    totalRow: { background: '#f8f9fb', padding: '5px 10px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e8ecf0' } as React.CSSProperties,
    grandRow: { background: '#1a1a2e', color: '#fff', padding: '7px 10px', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '11pt' } as React.CSSProperties,
  }

  return (
    <>
      {/* Screen controls */}
      <div className="no-print fixed top-4 right-4 flex gap-2 z-50">
        <button onClick={() => window.print()}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 shadow-lg">
          <Printer size={15} /> Print Invoice
        </button>
        <button onClick={() => window.close()}
          className="flex items-center gap-2 bg-card text-foreground px-4 py-2 rounded-lg text-sm border border-border hover:bg-muted shadow-lg">
          <X size={15} /> Close
        </button>
      </div>

      <div style={S.page}>
        <div style={S.border}>

          {/* ── Header ───────────────────────────────────────────────────── */}
          <div style={S.headerBg}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              {company?.logo && (
                <img src={company.logo.startsWith('http') ? company.logo : `http://localhost:5000${company.logo}`}
                  alt="logo" style={{ height: '50px', width: '50px', objectFit: 'contain', background: '#fff', padding: '3px', borderRadius: '4px' }} />
              )}
              <div>
                <div style={{ fontSize: '15pt', fontWeight: 700, letterSpacing: '0.02em' }}>{company?.name || 'Company Name'}</div>
                {company?.legalName && company.legalName !== company.name && (
                  <div style={{ fontSize: '8.5pt', color: '#cbd5e1', marginTop: '2px' }}>{company.legalName}</div>
                )}
                <div style={{ fontSize: '8.5pt', color: '#cbd5e1', marginTop: '3px' }}>
                  {[company?.addressLine1, company?.city, company?.state, company?.pincode].filter(Boolean).join(', ')}
                </div>
                <div style={{ fontSize: '8.5pt', color: '#cbd5e1', marginTop: '2px', display: 'flex', gap: '12px' }}>
                  {company?.gstin && <span>GSTIN: <strong style={{ color: '#fff' }}>{company.gstin}</strong></span>}
                  {company?.phone && <span>📞 {company.phone}</span>}
                  {company?.email && <span>✉ {company.email}</span>}
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '16pt', fontWeight: 700, letterSpacing: '0.08em', color: '#f0f4ff' }}>{docTitle}</div>
              {isExportType && saleTypeLabel && (
                <div style={{ fontSize: '7.5pt', color: '#fbbf24', marginTop: '4px', background: 'rgba(251,191,36,0.15)', padding: '3px 8px', borderRadius: '4px', border: '1px solid rgba(251,191,36,0.3)' }}>
                  {saleTypeLabel}
                </div>
              )}
            </div>
          </div>

          {/* ── Invoice Details & Party ───────────────────────────────────── */}
          <div style={S.grid2}>
            {/* Left: invoice info */}
            <div style={S.cell}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {[
                  { label: 'Invoice No.', value: voucher.voucherNumber },
                  { label: 'Date', value: formatDate(voucher.date) },
                  voucher.lut ? { label: 'LUT No.', value: voucher.lut } : null,
                  voucher.lutDate ? { label: 'LUT Date', value: formatDate(voucher.lutDate) } : null,
                  { label: 'Place of Supply', value: voucher.placeOfSupply ? `${voucher.placeOfSupply} - ${getStateName(voucher.placeOfSupply)}` : '—' },
                  voucher.isReverseCharge ? { label: 'Reverse Charge', value: 'Yes (RCM Applicable)' } : null,
                ].filter(Boolean).map((f: any) => (
                  <div key={f.label}>
                    <div style={S.label}>{f.label}</div>
                    <div style={S.value}>{f.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: party details */}
            <div style={{ ...S.cell, borderRight: 'none' }}>
              <div style={S.label}>Bill To</div>
              {voucher.party ? (
                <div>
                  <div style={{ fontSize: '11pt', fontWeight: 700, marginBottom: '3px' }}>{voucher.party.name}</div>
                  {voucher.party.gstin && <div style={{ fontSize: '8.5pt', color: '#374151' }}>GSTIN: <strong>{voucher.party.gstin}</strong></div>}
                  {voucher.party.gstType && voucher.party.gstType !== 'REGULAR' && (
                    <div style={{ fontSize: '8pt', color: '#d97706', marginTop: '2px' }}>({voucher.party.gstType})</div>
                  )}
                  {voucher.party.addressLine1 && (
                    <div style={{ fontSize: '8.5pt', color: '#6b7280', marginTop: '3px', lineHeight: '1.5' }}>
                      {[voucher.party.addressLine1, voucher.party.city, voucher.party.state, voucher.party.pincode].filter(Boolean).join(', ')}
                    </div>
                  )}
                  {voucher.party.phone && <div style={{ fontSize: '8.5pt', color: '#6b7280' }}>📞 {voucher.party.phone}</div>}
                </div>
              ) : (
                <div style={{ color: '#9ca3af', fontStyle: 'italic' }}>Walk-in Customer</div>
              )}
            </div>
          </div>

          {/* ── Items Table ───────────────────────────────────────────────── */}
          <div style={S.sectionTitle}>Items</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...S.th, width: '28px' }}>#</th>
                <th style={S.th}>Description of Goods / Services</th>
                <th style={{ ...S.th, width: '50px' }}>HSN</th>
                <th style={{ ...S.th, width: '42px', textAlign: 'right' }}>Qty</th>
                <th style={{ ...S.th, width: '40px', textAlign: 'center' }}>Unit</th>
                <th style={{ ...S.th, width: '72px', textAlign: 'right' }}>Rate</th>
                <th style={{ ...S.th, width: '55px', textAlign: 'right' }}>Disc</th>
                <th style={{ ...S.th, width: '78px', textAlign: 'right' }}>Taxable Amt</th>
                <th style={{ ...S.th, width: '42px', textAlign: 'center' }}>GST%</th>
                <th style={{ ...S.th, width: '70px', textAlign: 'right' }}>Tax Amt</th>
                <th style={{ ...S.th, width: '78px', textAlign: 'right', borderRight: 'none' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {(voucher.items || []).map((item: any, i: number) => {
                const discPct = Number(item.discountPct || 0) + Number(item.discount2Pct || 0) + Number(item.discount3Pct || 0)
                const tax = Number(item.cgstAmount) + Number(item.sgstAmount) + Number(item.igstAmount) + Number(item.cessAmount)
                return (
                  <tr key={item.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafbff' }}>
                    <td style={{ ...S.td, textAlign: 'center', color: '#9ca3af', fontSize: '8pt' }}>{i + 1}</td>
                    <td style={S.td}>
                      <div style={{ fontWeight: 600 }}>{item.item?.name || item.description || '—'}</div>
                      {item.batchNo && <div style={{ fontSize: '8pt', color: '#9ca3af' }}>Batch: {item.batchNo}</div>}
                    </td>
                    <td style={{ ...S.td, fontSize: '8pt', color: '#6b7280', fontFamily: 'monospace' }}>{item.item?.hsnCode || '—'}</td>
                    <td style={{ ...S.tdRight, fontWeight: 600 }}>{Number(item.qty).toFixed(2)}</td>
                    <td style={{ ...S.td, textAlign: 'center', color: '#6b7280', fontSize: '8.5pt' }}>{item.unit}</td>
                    <td style={S.tdRight}>{formatINR(Number(item.rate))}</td>
                    <td style={{ ...S.tdRight, fontSize: '8.5pt', color: '#d97706' }}>
                      {discPct > 0 ? `${discPct.toFixed(2)}%` : '—'}
                    </td>
                    <td style={S.tdRight}>{formatINR(Number(item.taxableAmount))}</td>
                    <td style={{ ...S.td, textAlign: 'center', fontSize: '8.5pt', fontWeight: 600 }}>
                      {Number(item.gstRate) > 0 ? `${item.gstRate}%` : 'Nil'}
                    </td>
                    <td style={S.tdRight}>{formatINR(tax)}</td>
                    <td style={{ ...S.tdRight, borderRight: 'none', fontWeight: 700 }}>{formatINR(Number(item.lineTotal))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* ── Summary + Tax Breakup ─────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1.5px solid #1a1a2e' }}>

            {/* Left: Tax breakup */}
            <div style={{ borderRight: '1px solid #e8ecf0' }}>
              <div style={S.sectionTitle}>GST Summary</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, fontSize: '8pt' }}>HSN/GST%</th>
                    <th style={{ ...S.th, textAlign: 'right', fontSize: '8pt' }}>Taxable</th>
                    {!isIGST && <th style={{ ...S.th, textAlign: 'right', fontSize: '8pt' }}>CGST</th>}
                    {!isIGST && <th style={{ ...S.th, textAlign: 'right', fontSize: '8pt' }}>SGST</th>}
                    {isIGST && <th style={{ ...S.th, textAlign: 'right', fontSize: '8pt' }}>IGST</th>}
                    <th style={{ ...S.th, textAlign: 'right', fontSize: '8pt', borderRight: 'none' }}>Total Tax</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(taxBreakup).map(([rate, t]) => (
                    <tr key={rate}>
                      <td style={S.td}>{rate}%</td>
                      <td style={S.tdRight}>{formatINR(t.taxable)}</td>
                      {!isIGST && <td style={S.tdRight}>{formatINR(t.cgst)}</td>}
                      {!isIGST && <td style={S.tdRight}>{formatINR(t.sgst)}</td>}
                      {isIGST && <td style={S.tdRight}>{formatINR(t.igst)}</td>}
                      <td style={{ ...S.tdRight, borderRight: 'none', fontWeight: 600 }}>
                        {formatINR(isIGST ? t.igst : t.cgst + t.sgst)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Amount in words */}
              <div style={{ padding: '8px 10px', borderTop: '1px solid #e8ecf0', background: '#f8f9fb' }}>
                <div style={{ fontSize: '8pt', color: '#6b7280', marginBottom: '2px' }}>Amount in Words:</div>
                <div style={{ fontStyle: 'italic', fontSize: '9pt', fontWeight: 500 }}>
                  {amountInWords(Number(voucher.grandTotal))}
                </div>
              </div>
            </div>

            {/* Right: Totals */}
            <div>
              <div style={S.sectionTitle}>Amount</div>
              {[
                { label: 'Subtotal', value: Number(voucher.subtotal) },
                Number(voucher.discountAmount) > 0 ? { label: 'Discount', value: -Number(voucher.discountAmount), color: '#d97706' } : null,
                Number(voucher.cgstAmount) > 0 ? { label: 'CGST', value: Number(voucher.cgstAmount) } : null,
                Number(voucher.sgstAmount) > 0 ? { label: 'SGST', value: Number(voucher.sgstAmount) } : null,
                Number(voucher.igstAmount) > 0 ? { label: 'IGST', value: Number(voucher.igstAmount) } : null,
                Number(voucher.cessAmount) > 0 ? { label: 'Cess', value: Number(voucher.cessAmount) } : null,
                Math.abs(Number(voucher.roundOff)) > 0 ? { label: 'Round Off', value: Number(voucher.roundOff) } : null,
              ].filter(Boolean).map((row: any) => (
                <div key={row.label} style={S.totalRow}>
                  <span style={{ fontSize: '9pt', color: '#6b7280' }}>{row.label}</span>
                  <span style={{ fontSize: '9pt', fontFamily: 'monospace', color: row.color || '#1a1a1a' }}>
                    {row.value < 0 ? `- ${formatINR(-row.value)}` : formatINR(row.value)}
                  </span>
                </div>
              ))}
              <div style={S.grandRow}>
                <span>GRAND TOTAL</span>
                <span>{formatINR(Number(voucher.grandTotal))}</span>
              </div>
              {Number(voucher.balanceDue) < Number(voucher.grandTotal) && (
                <div style={{ ...S.totalRow, background: '#fef3c7' }}>
                  <span style={{ fontSize: '9pt', fontWeight: 600, color: '#d97706' }}>Balance Due</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#d97706' }}>{formatINR(Number(voucher.balanceDue))}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Footer ───────────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderTop: '1px solid #e8ecf0', padding: '10px 12px', gap: '12px', background: '#fafbff' }}>
            {/* Bank details */}
            <div>
              <div style={S.label}>Payment Details</div>
              {company?.bankDetails ? (
                <div style={{ fontSize: '8.5pt', color: '#374151', lineHeight: '1.6', whiteSpace: 'pre-line' }}>{company.bankDetails}</div>
              ) : (
                <div style={{ fontSize: '8.5pt', color: '#9ca3af' }}>—</div>
              )}
            </div>
            {/* Terms */}
            <div>
              <div style={S.label}>Terms & Conditions</div>
              <div style={{ fontSize: '8pt', color: '#6b7280', lineHeight: '1.6' }}>
                {company?.termsText || 'Goods once sold will not be taken back.\nSubject to local jurisdiction.'}
              </div>
            </div>
            {/* Signature */}
            <div style={{ textAlign: 'center' }}>
              <div style={S.label}>For {company?.name || ''}</div>
              {company?.signature && (
                <img src={company.signature.startsWith('http') ? company.signature : `http://localhost:5000${company.signature}`}
                  alt="signature" style={{ height: '40px', maxWidth: '120px', objectFit: 'contain', margin: '4px auto', display: 'block' }} />
              )}
              <div style={{ borderTop: '1px solid #1a1a2e', paddingTop: '4px', marginTop: company?.signature ? '4px' : '30px', fontSize: '8pt', color: '#6b7280' }}>
                Authorised Signatory
              </div>
            </div>
          </div>

          {/* Narration */}
          {voucher.narration && (
            <div style={{ padding: '6px 12px', borderTop: '1px solid #e8ecf0', fontSize: '8.5pt', color: '#6b7280' }}>
              <strong>Narration:</strong> {voucher.narration}
            </div>
          )}

          {/* Computer generated notice */}
          <div style={{ textAlign: 'center', padding: '6px', borderTop: '1px solid #e8ecf0', fontSize: '7.5pt', color: '#9ca3af', background: '#f9fafb' }}>
            This is a computer generated document. No signature required.
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; padding: 0; }
          @page { size: A4; margin: 8mm; }
        }
      `}</style>
    </>
  )
}
