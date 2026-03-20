import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { formatINR, formatDate, amountInWords, getStateName } from '../../lib/india'
import { Button } from '../../components/ui'
import { Printer } from 'lucide-react'

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

  if (isLoading) return <div className="flex items-center justify-center min-h-screen text-sm">Loading...</div>
  if (!voucher) return <div className="flex items-center justify-center min-h-screen text-sm">Voucher not found</div>

  const isSale = ['SALE', 'CREDIT_NOTE', 'SALE_CHALLAN'].includes(voucher.voucherType)
  const title = {
    SALE: 'TAX INVOICE', PURCHASE: 'PURCHASE INVOICE',
    CREDIT_NOTE: 'CREDIT NOTE', DEBIT_NOTE: 'DEBIT NOTE',
    SALE_CHALLAN: 'DELIVERY CHALLAN', PURCHASE_ORDER: 'PURCHASE ORDER',
    PURCHASE_CHALLAN: 'GOODS RECEIPT NOTE', PRODUCTION: 'PRODUCTION ORDER',
    RECEIPT: 'RECEIPT VOUCHER', PAYMENT: 'PAYMENT VOUCHER',
    CONTRA: 'CONTRA VOUCHER', JOURNAL: 'JOURNAL VOUCHER',
  }[voucher.voucherType] || voucher.voucherType

  const gstTotal = Number(voucher.cgstAmount) + Number(voucher.sgstAmount) + Number(voucher.igstAmount)

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {/* Print button - hidden on print */}
      <div className="no-print mb-4 flex gap-2">
        <Button onClick={() => window.print()}><Printer size={15} /> Print</Button>
        <Button variant="outline" onClick={() => window.close()}>Close</Button>
      </div>

      {/* Voucher document */}
      <div className="bg-white max-w-4xl mx-auto border border-gray-200 print-full" id="voucher-doc" style={{ fontFamily: 'Arial, sans-serif', fontSize: '11px' }}>

        {/* Header */}
        <div style={{ borderBottom: '2px solid #1a1a2e', padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, color: '#1a1a2e' }}>
                [COMPANY NAME]
              </h1>
              <p style={{ margin: '2px 0', color: '#555' }}>[Address Line 1], [City] - [PIN]</p>
              <p style={{ margin: '2px 0', color: '#555' }}>GSTIN: [GSTIN] | Phone: [Phone]</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1a1a2e', margin: 0 }}>{title}</h2>
              <p style={{ margin: '4px 0' }}><strong>No:</strong> {voucher.voucherNumber}</p>
              <p style={{ margin: '2px 0' }}><strong>Date:</strong> {formatDate(voucher.date)}</p>
            </div>
          </div>
        </div>

        {/* Bill To / Ship To */}
        {voucher.party && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #ddd' }}>
            <div style={{ padding: '12px 20px', borderRight: '1px solid #ddd' }}>
              <p style={{ fontWeight: 'bold', marginBottom: '4px', color: '#555', fontSize: '10px', textTransform: 'uppercase' }}>
                {isSale ? 'Bill To' : 'From'}
              </p>
              <p style={{ fontWeight: 'bold', fontSize: '12px', margin: '0 0 2px 0' }}>{voucher.party.name}</p>
              {voucher.party.addressLine1 && <p style={{ margin: '1px 0', color: '#555' }}>{voucher.party.addressLine1}</p>}
              {voucher.party.city && <p style={{ margin: '1px 0', color: '#555' }}>{voucher.party.city}, {voucher.party.state} - {voucher.party.pincode}</p>}
              {voucher.party.gstin && <p style={{ margin: '4px 0', fontFamily: 'monospace' }}>GSTIN: {voucher.party.gstin}</p>}
            </div>
            <div style={{ padding: '12px 20px' }}>
              <p style={{ fontWeight: 'bold', marginBottom: '4px', color: '#555', fontSize: '10px', textTransform: 'uppercase' }}>Place of Supply</p>
              <p>{voucher.placeOfSupply ? `${voucher.placeOfSupply} - ${getStateName(voucher.placeOfSupply)}` : '—'}</p>
              {voucher.isReverseCharge && <p style={{ color: '#c00', marginTop: '8px', fontWeight: 'bold' }}>Reverse Charge: Yes</p>}
            </div>
          </div>
        )}

        {/* Items table */}
        {voucher.items && voucher.items.length > 0 && (
          <div style={{ padding: '0 20px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', margin: '12px 0' }}>
              <thead>
                <tr style={{ backgroundColor: '#f0f0f0' }}>
                  {['#', 'Description', 'HSN', 'Qty', 'Unit', 'Rate', 'Disc%', 'Taxable', 'GST%', 'Tax', 'Total'].map(h => (
                    <th key={h} style={{ border: '1px solid #ddd', padding: '6px 8px', textAlign: h === '#' || h === 'Qty' || h === 'Unit' || h === 'Rate' || h === 'Disc%' || h === 'Taxable' || h === 'GST%' || h === 'Tax' || h === 'Total' ? 'right' : 'left', fontSize: '10px', fontWeight: 'bold' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {voucher.items.map((item: any, i: number) => (
                  <tr key={item.id}>
                    <td style={{ border: '1px solid #ddd', padding: '5px 8px', textAlign: 'right' }}>{i + 1}</td>
                    <td style={{ border: '1px solid #ddd', padding: '5px 8px' }}>
                      <strong>{item.item?.name}</strong>
                      {item.description && <div style={{ color: '#777', fontSize: '10px' }}>{item.description}</div>}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '5px 8px', fontFamily: 'monospace' }}>{item.item?.hsnCode || '—'}</td>
                    <td style={{ border: '1px solid #ddd', padding: '5px 8px', textAlign: 'right' }}>{Number(item.qty).toFixed(2)}</td>
                    <td style={{ border: '1px solid #ddd', padding: '5px 8px', textAlign: 'right' }}>{item.unit}</td>
                    <td style={{ border: '1px solid #ddd', padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{formatINR(item.rate, 2)}</td>
                    <td style={{ border: '1px solid #ddd', padding: '5px 8px', textAlign: 'right' }}>{Number(item.discountPct) > 0 ? `${item.discountPct}%` : '—'}</td>
                    <td style={{ border: '1px solid #ddd', padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{formatINR(item.taxableAmount)}</td>
                    <td style={{ border: '1px solid #ddd', padding: '5px 8px', textAlign: 'right' }}>{item.gstRate}%</td>
                    <td style={{ border: '1px solid #ddd', padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                      {formatINR(Number(item.cgstAmount) + Number(item.sgstAmount) + Number(item.igstAmount))}
                    </td>
                    <td style={{ border: '1px solid #ddd', padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 'bold' }}>{formatINR(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Totals */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', padding: '0 20px 16px', gap: '16px' }}>
          <div>
            <p style={{ fontStyle: 'italic', color: '#555', marginTop: '8px', fontSize: '10px' }}>
              Amount in words: <strong>{amountInWords(Number(voucher.grandTotal))}</strong>
            </p>
            {voucher.narration && (
              <p style={{ color: '#555', marginTop: '4px' }}>Narration: {voucher.narration}</p>
            )}
          </div>
          <div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              {[
                { label: 'Taxable Amount', value: formatINR(voucher.taxableAmount) },
                ...(Number(voucher.cgstAmount) > 0 ? [{ label: 'CGST', value: formatINR(voucher.cgstAmount) }] : []),
                ...(Number(voucher.sgstAmount) > 0 ? [{ label: 'SGST', value: formatINR(voucher.sgstAmount) }] : []),
                ...(Number(voucher.igstAmount) > 0 ? [{ label: 'IGST', value: formatINR(voucher.igstAmount) }] : []),
                ...(Number(voucher.cessAmount) > 0 ? [{ label: 'Cess', value: formatINR(voucher.cessAmount) }] : []),
                ...(Number(voucher.roundOff) !== 0 ? [{ label: 'Round Off', value: formatINR(voucher.roundOff) }] : []),
              ].map(row => (
                <tr key={row.label}>
                  <td style={{ padding: '3px 8px', color: '#555' }}>{row.label}</td>
                  <td style={{ padding: '3px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{row.value}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid #333', fontWeight: 'bold', fontSize: '13px' }}>
                <td style={{ padding: '6px 8px' }}>Grand Total</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{formatINR(voucher.grandTotal)}</td>
              </tr>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid #ddd', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ fontSize: '10px', color: '#777' }}>
            <p>This is a computer-generated document.</p>
            {voucher.eInvoiceIRN && <p>IRN: {voucher.eInvoiceIRN}</p>}
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ marginTop: '40px', borderTop: '1px solid #333', paddingTop: '4px', minWidth: '150px' }}>
              Authorised Signatory
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          #voucher-doc { border: none !important; max-width: 100% !important; }
        }
      `}</style>
    </div>
  )
}
