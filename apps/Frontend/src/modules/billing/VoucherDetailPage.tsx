import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, extractError } from '../../lib/api'
import { formatINR, formatDate, amountInWords } from '../../lib/india'
import { Button, Badge, PageHeader, Spinner, EmptyState } from '../../components/ui'
import { Dialog, ConfirmDialog } from '../../components/ui/dialog'
import { ArrowLeft, Printer, Edit, XCircle, BookOpen, CheckCircle2, AlertCircle } from 'lucide-react'

const STATUS_BADGE: Record<string, any> = {
  POSTED: 'success', DRAFT: 'outline', CANCELLED: 'destructive',
}

export default function VoucherDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showJournal, setShowJournal] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [actionError, setActionError] = useState('')

  const { data: voucher, isLoading } = useQuery({
    queryKey: ['voucher', id],
    queryFn: async () => {
      const { data } = await api.get(`/billing/vouchers/${id}`)
      return data.data
    },
    enabled: !!id,
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
    mutationFn: async () => { await api.post(`/billing/vouchers/${id}/cancel`, { reason: cancelReason }) },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['voucher', id] })
      setShowCancel(false)
      setActionError('')
    },
    onError: (e) => setActionError(extractError(e)),
  })

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>
  if (!voucher) return <EmptyState title="Voucher not found" />

  const gstTotal = Number(voucher.cgstAmount) + Number(voucher.sgstAmount) + Number(voucher.igstAmount)
  const backPath = `/billing/${voucher.voucherType.toLowerCase().replace('_', '-')}`

  return (
    <div>
      <PageHeader
        title={`${voucher.voucherType.replace(/_/g, ' ')} — ${voucher.voucherNumber}`}
        breadcrumbs={[
          { label: 'Billing' },
          { label: voucher.voucherType.replace(/_/g, ' '), href: backPath },
          { label: voucher.voucherNumber },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft size={14} /> Back
            </Button>

            {voucher.status === 'DRAFT' && (
              <>
                <Button variant="secondary" size="sm" onClick={() => navigate(`${backPath}/new?edit=${id}`)}>
                  <Edit size={14} /> Edit
                </Button>
                <Button size="sm" onClick={() => postMutation.mutate()} loading={postMutation.isPending}>
                  <CheckCircle2 size={14} /> Post Voucher
                </Button>
              </>
            )}

            {voucher.status === 'POSTED' && (
              <>
                <Button variant="outline" size="sm" onClick={() => setShowJournal(s => !s)}>
                  <BookOpen size={14} /> Journal
                </Button>
                <Button variant="outline" size="sm"
                  onClick={() => window.open(`/print/${voucher.voucherType.toLowerCase()}/${id}`, '_blank')}>
                  <Printer size={14} /> Print
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setShowCancel(true)}>
                  <XCircle size={14} /> Cancel
                </Button>
              </>
            )}
          </div>
        }
      />

      {actionError && (
        <div className="mb-4 flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-md px-4 py-3 text-sm text-destructive">
          <AlertCircle size={14} /> {actionError}
        </div>
      )}

      {/* Status + meta */}
      <div className="bg-card border border-border rounded-lg p-4 mb-4 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Badge variant={STATUS_BADGE[voucher.status]} className="text-xs px-3 py-1">{voucher.status}</Badge>
          <div className="text-sm text-muted-foreground">
            Date: <span className="text-foreground font-medium">{formatDate(voucher.date)}</span>
          </div>
          {voucher.party && (
            <div className="text-sm text-muted-foreground">
              Party: <span className="text-foreground font-medium">{voucher.party.name}</span>
            </div>
          )}
          {voucher.placeOfSupply && (
            <div className="text-sm text-muted-foreground">
              POS: <span className="font-mono text-foreground">{voucher.placeOfSupply}</span>
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-2xl font-display font-bold text-foreground">{formatINR(voucher.grandTotal)}</div>
          <div className="text-xs text-muted-foreground italic">{amountInWords(Number(voucher.grandTotal))}</div>
        </div>
      </div>

      {/* Items */}
      {voucher.items?.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden mb-4">
          <div className="px-4 py-2.5 border-b border-border bg-muted/30">
            <h3 className="text-sm font-semibold">Items</h3>
          </div>
          <table className="erp-table">
            <thead>
              <tr>
                <th>#</th><th>Item</th><th>HSN</th><th>Unit</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Rate</th>
                <th className="text-right">Disc%</th>
                <th className="text-right">Taxable</th>
                <th className="text-right">GST%</th>
                <th className="text-right">Tax</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {voucher.items.map((item: any, i: number) => (
                <tr key={item.id}>
                  <td className="text-muted-foreground">{i + 1}</td>
                  <td className="font-medium text-sm">{item.item?.name}</td>
                  <td className="font-mono text-xs">{item.item?.hsnCode || '—'}</td>
                  <td className="text-sm">{item.unit}</td>
                  <td className="amount-col text-sm">{Number(item.qty).toFixed(3)}</td>
                  <td className="amount-col text-sm">{formatINR(item.rate, 2)}</td>
                  <td className="amount-col text-sm">{Number(item.discountPct) > 0 ? `${item.discountPct}%` : '—'}</td>
                  <td className="amount-col text-sm">{formatINR(item.taxableAmount)}</td>
                  <td className="text-center text-sm">{item.gstRate}%</td>
                  <td className="amount-col text-sm">
                    {formatINR(Number(item.cgstAmount) + Number(item.sgstAmount) + Number(item.igstAmount))}
                  </td>
                  <td className="amount-col text-sm font-medium">{formatINR(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="px-4 py-3 border-t border-border flex justify-end">
            <div className="space-y-1 text-sm min-w-[240px]">
              {[
                { label: 'Taxable Amount', value: voucher.taxableAmount },
                ...(Number(voucher.cgstAmount) > 0 ? [{ label: 'CGST', value: voucher.cgstAmount }] : []),
                ...(Number(voucher.sgstAmount) > 0 ? [{ label: 'SGST', value: voucher.sgstAmount }] : []),
                ...(Number(voucher.igstAmount) > 0 ? [{ label: 'IGST', value: voucher.igstAmount }] : []),
                ...(Number(voucher.cessAmount) > 0 ? [{ label: 'Cess', value: voucher.cessAmount }] : []),
                ...(Number(voucher.roundOff) !== 0 ? [{ label: 'Round Off', value: voucher.roundOff }] : []),
              ].map(r => (
                <div key={r.label} className="flex justify-between text-muted-foreground">
                  <span>{r.label}</span>
                  <span className="font-mono">{formatINR(r.value)}</span>
                </div>
              ))}
              <div className="flex justify-between font-bold text-base pt-2 border-t border-border">
                <span>Grand Total</span>
                <span className="font-mono">{formatINR(voucher.grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Narration */}
      {voucher.narration && (
        <div className="bg-muted/30 rounded-lg px-4 py-3 mb-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Narration: </span>{voucher.narration}
        </div>
      )}

      {/* Journal entries */}
      {showJournal && journal && (
        <div className="bg-card border border-border rounded-lg overflow-hidden mb-4">
          <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Journal Entries (Double Entry)</h3>
            <div className="flex items-center gap-3 text-xs">
              {journal.isBalanced ? (
                <span className="text-success flex items-center gap-1"><CheckCircle2 size={12} /> Balanced</span>
              ) : (
                <span className="text-destructive">⚠ Not balanced</span>
              )}
            </div>
          </div>
          <table className="erp-table">
            <thead>
              <tr>
                <th>Ledger Account</th><th>Group</th>
                <th className="text-right">Debit (₹)</th>
                <th className="text-right">Credit (₹)</th>
              </tr>
            </thead>
            <tbody>
              {journal.entries.map((e: any) => (
                <tr key={e.id}>
                  <td className="font-medium text-sm">{e.ledger?.name}</td>
                  <td className="text-xs text-muted-foreground">{e.ledger?.group?.name}</td>
                  <td className="amount-col text-sm">
                    {Number(e.debit) > 0 ? <span className="amount-debit">{formatINR(e.debit)}</span> : '—'}
                  </td>
                  <td className="amount-col text-sm">
                    {Number(e.credit) > 0 ? <span className="amount-credit">{formatINR(e.credit)}</span> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted font-semibold">
                <td colSpan={2} className="px-3 py-2">Total</td>
                <td className="amount-col px-3 py-2 amount-debit">{formatINR(journal.totalDebit)}</td>
                <td className="amount-col px-3 py-2 amount-credit">{formatINR(journal.totalCredit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Cancel dialog */}
      <Dialog open={showCancel} onClose={() => { setShowCancel(false); setCancelReason('') }}
        title="Cancel Voucher" size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowCancel(false)}>Close</Button>
            <Button variant="destructive" onClick={() => cancelMutation.mutate()} loading={cancelMutation.isPending}
              disabled={!cancelReason.trim()}>
              Cancel Voucher
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This will reverse all journal entries and stock movements for this voucher.
          </p>
          <div>
            <label className="text-xs font-medium text-foreground block mb-1.5">Cancellation Reason *</label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              rows={3}
              placeholder="Enter reason for cancellation..."
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
            />
          </div>
          {actionError && <p className="text-sm text-destructive">{actionError}</p>}
        </div>
      </Dialog>
    </div>
  )
}
