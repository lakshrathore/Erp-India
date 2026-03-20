import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, extractError } from '../../lib/api'
import { formatINR, formatDate, amountInWords } from '../../lib/india'
import { Button, Badge, PageHeader, Spinner } from '../../components/ui'
import {
  ArrowLeft, Printer, Edit, XCircle, BookOpen,
  CheckCircle2, AlertCircle, Copy, ExternalLink
} from 'lucide-react'

const STATUS_BADGE: Record<string, any> = {
  POSTED: 'success', DRAFT: 'outline', CANCELLED: 'destructive',
}

const VOUCHER_TITLE: Record<string, string> = {
  SALE: 'Sale Invoice', PURCHASE: 'Purchase Invoice',
  CREDIT_NOTE: 'Credit Note', DEBIT_NOTE: 'Debit Note',
  SALE_CHALLAN: 'Delivery Challan', PURCHASE_ORDER: 'Purchase Order',
  PURCHASE_CHALLAN: 'Goods Receipt Note', PRODUCTION: 'Production Order',
  RECEIPT: 'Receipt', PAYMENT: 'Payment', CONTRA: 'Contra', JOURNAL: 'Journal',
}

const VOUCHER_LIST_PATH: Record<string, string> = {
  SALE: '/billing/sale', PURCHASE: '/billing/purchase',
  CREDIT_NOTE: '/billing/credit-note', DEBIT_NOTE: '/billing/debit-note',
  SALE_CHALLAN: '/billing/sale-challan', PURCHASE_ORDER: '/billing/purchase-order',
  PURCHASE_CHALLAN: '/billing/purchase-challan', PRODUCTION: '/billing/production',
  RECEIPT: '/accounting/receipts', PAYMENT: '/accounting/payments',
  CONTRA: '/accounting/contra', JOURNAL: '/accounting/journal',
}

export default function VoucherDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showCancel, setShowCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [showJournal, setShowJournal] = useState(false)
  const [actionError, setActionError] = useState('')

  const { data: voucher, isLoading } = useQuery({
    queryKey: ['voucher', id],
    queryFn: async () => {
      const { data } = await api.get(`/billing/vouchers/${id}`)
      return data.data
    },
    enabled: !!id && !!JSON.parse(localStorage.getItem('erp-auth') || '{}')?.state?.activeCompany?.companyId,
  })

  const { data: journal } = useQuery({
    queryKey: ['voucher-journal', id],
    queryFn: async () => {
      const { data } = await api.get(`/billing/vouchers/${id}/journal`)
      return data.data
    },
    enabled: !!id && showJournal,
  })

  const postMutation = useMutation({
    mutationFn: async () => { await api.post(`/billing/vouchers/${id}/post`) },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['voucher', id] }); setActionError('') },
    onError: (e) => setActionError(extractError(e)),
  })

  const cancelMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/billing/vouchers/${id}/cancel`, { reason: cancelReason })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['voucher', id] })
      qc.invalidateQueries({ queryKey: ['vouchers'] })
      setShowCancel(false)
      setCancelReason('')
      setActionError('')
    },
    onError: (e) => setActionError(extractError(e)),
  })

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>
  if (!voucher) return (
    <div className="text-center py-20">
      <p className="text-muted-foreground">Voucher not found</p>
      <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>
        <ArrowLeft size={14} /> Go Back
      </Button>
    </div>
  )

  const isPosted = voucher.status === 'POSTED'
  const isDraft = voucher.status === 'DRAFT'
  const isCancelled = voucher.status === 'CANCELLED'
  const isInclusive = voucher.isInclusive
  const gstTotal = Number(voucher.cgstAmount) + Number(voucher.sgstAmount) + Number(voucher.igstAmount)
  const listPath = VOUCHER_LIST_PATH[voucher.voucherType] || '/billing/sale'
  const editPath = `${listPath}/${id}/edit`

  return (
    <div>
      <PageHeader
        title={VOUCHER_TITLE[voucher.voucherType] || voucher.voucherType}
        subtitle={
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-semibold">{voucher.voucherNumber}</span>
            <Badge variant={STATUS_BADGE[voucher.status] || 'default'}>{voucher.status}</Badge>
            {isInclusive && <Badge variant="info" className="text-[10px]">GST Inclusive</Badge>}
          </div>
        }
        breadcrumbs={[
          { label: VOUCHER_TITLE[voucher.voucherType] || 'Voucher', href: listPath },
          { label: voucher.voucherNumber },
        ]}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => navigate(listPath)}>
              <ArrowLeft size={14} /> Back
            </Button>
            {/* Print */}
            <Button variant="outline" size="sm"
              onClick={() => window.open(`/print/${voucher.voucherType.toLowerCase()}/${id}`, '_blank')}>
              <Printer size={14} />
              <span className="hidden sm:inline ml-1">Print</span>
            </Button>
            {/* Post (DRAFT only) */}
            {isDraft && (
              <Button size="sm" loading={postMutation.isPending} onClick={() => postMutation.mutate()}>
                <CheckCircle2 size={14} />
                <span className="hidden sm:inline ml-1">Post</span>
              </Button>
            )}
            {/* Edit (DRAFT only) */}
            {isDraft && (
              <Button variant="outline" size="sm" onClick={() => navigate(editPath)}>
                <Edit size={14} />
                <span className="hidden sm:inline ml-1">Edit</span>
              </Button>
            )}
            {/* Cancel */}
            {!isCancelled && (
              <Button variant="outline" size="sm"
                className="text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => setShowCancel(true)}>
                <XCircle size={14} />
                <span className="hidden sm:inline ml-1">Cancel</span>
              </Button>
            )}
          </div>
        }
      />

      {actionError && (
        <div className="mb-4 flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 text-sm text-destructive">
          <AlertCircle size={14} /> {actionError}
        </div>
      )}

      {isCancelled && (
        <div className="mb-4 bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 text-destructive font-semibold text-sm mb-1">
            <XCircle size={16} /> This voucher has been CANCELLED
          </div>
          {voucher.cancelReason && (
            <p className="text-sm text-destructive/80">Reason: {voucher.cancelReason}</p>
          )}
        </div>
      )}

      {/* ── Main content grid ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Left: Details */}
        <div className="lg:col-span-2 space-y-4">

          {/* Header info */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              {[
                { label: 'Date', value: formatDate(voucher.date) },
                { label: 'Voucher No.', value: <span className="font-mono font-bold">{voucher.voucherNumber}</span> },
                { label: 'FY', value: voucher.financialYear },
                voucher.placeOfSupply ? { label: 'Place of Supply', value: voucher.placeOfSupply } : null,
                voucher.saleType && voucher.saleType !== 'REGULAR' ? { label: 'Sale Type', value: voucher.saleType.replace(/_/g, ' ') } : null,
                voucher.lut ? { label: 'LUT Number', value: <span className="font-mono">{voucher.lut}</span> } : null,
                voucher.isReverseCharge ? { label: 'Reverse Charge', value: 'Yes (RCM)' } : null,
              ].filter(Boolean).map((f: any) => (
                <div key={f.label}>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">{f.label}</p>
                  <p className="font-medium">{f.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Party */}
          {voucher.party && (
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {['SALE', 'CREDIT_NOTE', 'SALE_CHALLAN'].includes(voucher.voucherType) ? 'Bill To (Customer)' : 'Vendor'}
              </p>
              <p className="font-bold">{voucher.party.name}</p>
              {voucher.party.gstin && (
                <p className="text-xs text-muted-foreground font-mono mt-0.5">GSTIN: {voucher.party.gstin}</p>
              )}
              {voucher.party.addressLine1 && (
                <p className="text-xs text-muted-foreground mt-0.5">{voucher.party.addressLine1}, {voucher.party.city}</p>
              )}
            </div>
          )}

          {/* Items table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30">
              <h3 className="text-sm font-semibold">Items</h3>
              {isInclusive && (
                <p className="text-xs text-info mt-0.5">GST Inclusive — rates include GST</p>
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">#</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">Item</th>
                    <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground">Unit</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground">Qty</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground">Rate</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground">Disc%</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground">Taxable</th>
                    <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground">GST%</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground">Tax</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(voucher.items || []).map((item: any, i: number) => {
                    const disc = Number(item.discountPct || 0) + Number(item.discount2Pct || 0) + Number(item.discount3Pct || 0)
                    const tax = Number(item.cgstAmount) + Number(item.sgstAmount) + Number(item.igstAmount) + Number(item.cessAmount)
                    const variantLabel = item.variant
                      ? Object.values(item.variant.attributeValues || {}).filter(Boolean).join(' · ')
                      : ''
                    return (
                      <tr key={item.id} className={`border-t border-border/30 ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                        <td className="px-3 py-2.5 text-muted-foreground text-center">{i + 1}</td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium">{item.item?.name || '—'}</div>
                          {variantLabel && <div className="text-[10px] text-primary font-medium">{variantLabel}</div>}
                          {item.item?.hsnCode && <div className="text-[10px] text-muted-foreground font-mono">{item.item.hsnCode}</div>}
                        </td>
                        <td className="px-3 py-2.5 text-center text-muted-foreground">{item.unit}</td>
                        <td className="px-3 py-2.5 text-right font-semibold">{Number(item.qty).toFixed(2)}</td>
                        <td className="px-3 py-2.5 text-right font-mono">
                          {formatINR(Number(item.rate))}
                          {isInclusive && <div className="text-[10px] text-muted-foreground">incl. GST</div>}
                        </td>
                        <td className="px-3 py-2.5 text-right text-muted-foreground">
                          {disc > 0 ? `${disc.toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono">{formatINR(Number(item.taxableAmount))}</td>
                        <td className="px-3 py-2.5 text-center">
                          <Badge variant="secondary" className="text-[9px] font-mono">{item.gstRate}%</Badge>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{formatINR(tax)}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold">{formatINR(Number(item.lineTotal))}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile items */}
            <div className="sm:hidden divide-y divide-border">
              {(voucher.items || []).map((item: any, i: number) => {
                const disc = Number(item.discountPct || 0) + Number(item.discount2Pct || 0) + Number(item.discount3Pct || 0)
                const variantLabel = item.variant
                  ? Object.values(item.variant.attributeValues || {}).filter(Boolean).join(' · ')
                  : ''
                return (
                  <div key={item.id} className="px-4 py-3">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <p className="font-medium text-sm">{item.item?.name}</p>
                        {variantLabel && <p className="text-xs text-primary">{variantLabel}</p>}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {Number(item.qty).toFixed(2)} {item.unit} × {formatINR(Number(item.rate))}
                          {disc > 0 && ` - ${disc.toFixed(1)}%`}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold font-mono">{formatINR(Number(item.lineTotal))}</p>
                        <p className="text-xs text-muted-foreground">Tax: {formatINR(Number(item.cgstAmount) + Number(item.sgstAmount) + Number(item.igstAmount))}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Narration */}
          {voucher.narration && (
            <div className="bg-card border border-border rounded-xl px-4 py-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Narration</p>
              <p className="text-sm">{voucher.narration}</p>
            </div>
          )}

          {/* Journal entries toggle */}
          {isPosted && (
            <div>
              <button
                onClick={() => setShowJournal(s => !s)}
                className="flex items-center gap-2 text-xs text-primary font-medium hover:underline">
                <BookOpen size={13} />
                {showJournal ? 'Hide' : 'Show'} Accounting Entries (Journal)
              </button>
              {showJournal && journal && (
                <div className="mt-2 bg-card border border-border rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/40 border-b border-border">
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Ledger</th>
                        <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Debit</th>
                        <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {journal.map((j: any, i: number) => (
                        <tr key={i} className="border-t border-border/30">
                          <td className="px-3 py-2">{j.ledger?.name || j.ledgerId}</td>
                          <td className="px-3 py-2 text-right font-mono">{Number(j.debit) > 0 ? formatINR(j.debit) : '—'}</td>
                          <td className="px-3 py-2 text-right font-mono">{Number(j.credit) > 0 ? formatINR(j.credit) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Totals */}
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-4 space-y-2 text-sm">
            <h3 className="font-semibold text-sm mb-3">Summary</h3>
            {[
              { label: 'Subtotal', value: formatINR(Number(voucher.subtotal)) },
              Number(voucher.discountAmount) > 0 ? { label: 'Discount', value: `−${formatINR(Number(voucher.discountAmount))}`, cls: 'text-warning' } : null,
              Number(voucher.taxableAmount) !== Number(voucher.subtotal) ? { label: 'Taxable', value: formatINR(Number(voucher.taxableAmount)) } : null,
              Number(voucher.cgstAmount) > 0 ? { label: 'CGST', value: formatINR(Number(voucher.cgstAmount)) } : null,
              Number(voucher.sgstAmount) > 0 ? { label: 'SGST', value: formatINR(Number(voucher.sgstAmount)) } : null,
              Number(voucher.igstAmount) > 0 ? { label: 'IGST', value: formatINR(Number(voucher.igstAmount)) } : null,
              Number(voucher.cessAmount) > 0 ? { label: 'Cess', value: formatINR(Number(voucher.cessAmount)) } : null,
              Math.abs(Number(voucher.roundOff)) > 0 ? { label: 'Round Off', value: formatINR(Number(voucher.roundOff)) } : null,
            ].filter(Boolean).map((r: any) => (
              <div key={r.label} className="flex justify-between text-muted-foreground">
                <span>{r.label}</span>
                <span className={`font-mono ${r.cls || ''}`}>{r.value}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold text-base border-t-2 border-border pt-2 mt-2">
              <span>Grand Total</span>
              <span className="font-mono text-primary">{formatINR(Number(voucher.grandTotal))}</span>
            </div>
            <p className="text-xs text-muted-foreground italic leading-relaxed">
              {amountInWords(Number(voucher.grandTotal))}
            </p>

            {/* Balance due */}
            {['SALE', 'PURCHASE', 'CREDIT_NOTE', 'DEBIT_NOTE'].includes(voucher.voucherType) && (
              <div className={`mt-2 pt-2 border-t border-border flex justify-between text-sm font-semibold ${Number(voucher.balanceDue) > 0 ? 'text-destructive' : 'text-success'}`}>
                <span>{Number(voucher.balanceDue) > 0 ? 'Balance Due' : 'Fully Settled'}</span>
                {Number(voucher.balanceDue) > 0 && <span className="font-mono">{formatINR(Number(voucher.balanceDue))}</span>}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-2">
            <h3 className="font-semibold text-sm mb-3">Actions</h3>
            <button
              onClick={() => window.open(`/print/${voucher.voucherType.toLowerCase()}/${id}`, '_blank')}
              className="w-full flex items-center gap-2.5 py-2.5 px-3 rounded-lg text-sm hover:bg-muted transition-colors border border-border">
              <Printer size={15} className="text-muted-foreground" /> Print Invoice
            </button>
            {isDraft && (
              <button
                onClick={() => postMutation.mutate()}
                disabled={postMutation.isPending}
                className="w-full flex items-center gap-2.5 py-2.5 px-3 rounded-lg text-sm bg-success/10 text-success hover:bg-success/20 transition-colors border border-success/20">
                <CheckCircle2 size={15} /> Post Voucher
              </button>
            )}
            {isDraft && (
              <button
                onClick={() => navigate(editPath)}
                className="w-full flex items-center gap-2.5 py-2.5 px-3 rounded-lg text-sm hover:bg-muted transition-colors border border-border">
                <Edit size={15} className="text-muted-foreground" /> Edit Voucher
              </button>
            )}
            {!isCancelled && (
              <button
                onClick={() => setShowCancel(true)}
                className="w-full flex items-center gap-2.5 py-2.5 px-3 rounded-lg text-sm bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors border border-destructive/20">
                <XCircle size={15} /> Cancel Voucher
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Cancel Modal ────────────────────────────────────────────────────── */}
      {showCancel && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
          <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-destructive/15 flex items-center justify-center shrink-0">
                <XCircle size={20} className="text-destructive" />
              </div>
              <div>
                <h3 className="font-bold text-base">Cancel Voucher?</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  <span className="font-mono font-semibold">{voucher.voucherNumber}</span>
                  {isPosted && ' — stock and ledger entries will be reversed.'}
                  {isDraft && ' — draft will be deleted.'}
                </p>
              </div>
            </div>

            {isPosted && (
              <div className="bg-warning-muted border border-warning/20 rounded-lg px-3 py-2.5 mb-4 text-xs text-warning space-y-1">
                <p>⚠️ This action will:</p>
                <p>• Reverse all stock movements for this voucher</p>
                <p>• Reverse all ledger/accounting entries</p>
                <p>• Mark voucher as CANCELLED (cannot be undone)</p>
              </div>
            )}

            <div className="mb-4">
              <label className="text-xs font-medium text-foreground block mb-1.5">
                Reason for Cancellation <span className="text-destructive">*</span>
              </label>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="e.g. Wrong party selected, Duplicate entry, Customer returned goods..."
                rows={3}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
              />
            </div>

            {actionError && (
              <div className="mb-3 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2 flex items-center gap-2">
                <AlertCircle size={14} /> {actionError}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="destructive" className="flex-1"
                loading={cancelMutation.isPending}
                disabled={!cancelReason.trim()}
                onClick={() => cancelMutation.mutate()}>
                <XCircle size={14} /> Confirm Cancel
              </Button>
              <Button variant="outline" onClick={() => { setShowCancel(false); setCancelReason('') }}
                disabled={cancelMutation.isPending}>
                Keep Voucher
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
