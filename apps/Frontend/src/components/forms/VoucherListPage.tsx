import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Eye, FileText, Printer, X, CheckCircle2, XCircle, Filter } from 'lucide-react'
import dayjs from 'dayjs'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, extractError } from '../../lib/api'
import { formatINR, formatDate, getFinancialYear } from '../../lib/india'
import { Button, Badge, EmptyState, Spinner, PageHeader, Select } from '../../components/ui'
import { useAuthStore } from '../../stores/auth.store'
import { cn } from '../ui/utils'

export type VoucherType = 'SALE' | 'PURCHASE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'SALE_CHALLAN' | 'PURCHASE_ORDER' | 'PURCHASE_CHALLAN' | 'PRODUCTION' | 'RECEIPT' | 'PAYMENT' | 'CONTRA' | 'JOURNAL'

interface VoucherListPageProps {
  voucherType: VoucherType
  title: string
  newPath: string
  breadcrumbs?: string[]
}

const STATUS_BADGE: Record<string, any> = {
  POSTED: 'success', DRAFT: 'outline', CANCELLED: 'destructive',
}

function getFYDates(fy: string) {
  // Handle both "25-26" and "2025-26" formats
  const [startPart] = fy.split('-')
  const rawYear = parseInt(startPart)
  // If 2-digit year, convert to full year (25 → 2025)
  const year = rawYear < 100 ? 2000 + rawYear : rawYear
  return {
    from: `${year}-04-01`,
    to: `${year + 1}-03-31`,
  }
}

// ─── Cancel Modal ─────────────────────────────────────────────────────────────

function CancelModal({ voucherId, voucherNumber, onClose, onDone }: {
  voucherId: string; voucherNumber: string; onClose: () => void; onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const cancelMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/billing/vouchers/${voucherId}/cancel`, { reason })
    },
    onSuccess: () => { onDone(); onClose() },
    onError: (e) => setError(extractError(e)),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-destructive/15 flex items-center justify-center shrink-0">
            <XCircle size={20} className="text-destructive" />
          </div>
          <div>
            <h3 className="font-bold text-base">Cancel Voucher?</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              <span className="font-mono font-medium">{voucherNumber}</span> will be cancelled and stock/ledger reversed.
            </p>
          </div>
        </div>

        <div className="mb-4">
          <label className="text-xs font-medium text-foreground block mb-1.5">
            Reason for Cancellation <span className="text-destructive">*</span>
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Enter reason (e.g. Wrong party, Wrong amount, Duplicate entry...)"
            rows={3}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {error && (
          <div className="mb-3 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="destructive" className="flex-1" loading={cancelMutation.isPending}
            disabled={!reason.trim()} onClick={() => cancelMutation.mutate()}>
            <XCircle size={14} /> Confirm Cancel
          </Button>
          <Button variant="outline" onClick={onClose} disabled={cancelMutation.isPending}>
            Keep
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Main List Page ───────────────────────────────────────────────────────────

export default function VoucherListPage({ voucherType, title, newPath, breadcrumbs = [] }: VoucherListPageProps) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { activeCompany, activeFY } = useAuthStore()
  const today = dayjs()
  const fyDates = activeFY
    ? getFYDates(activeFY)
    : { from: today.subtract(365, 'day').format('YYYY-MM-DD'), to: today.format('YYYY-MM-DD') }

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('POSTED') // default: show only posted
  const [from, setFrom] = useState(fyDates.from)
  const [to, setTo] = useState(fyDates.to)
  const [page, setPage] = useState(1)
  const [showFilters, setShowFilters] = useState(false)
  const [cancelId, setCancelId] = useState<{ id: string; number: string } | null>(null)
  const limit = 50

  const companyId = activeCompany?.companyId || ''

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['vouchers', voucherType, search, status, from, to, page, companyId],
    queryFn: async () => {
      const { data } = await api.get('/billing/vouchers', {
        params: { voucherType, search, status, from, to, page, limit },
      })
      return data
    },
    enabled: !!companyId,
  })

  const vouchers: any[] = data?.data || []
  const pagination = data?.pagination
  const totalAmount = vouchers.filter(v => v.status === 'POSTED').reduce((s, v) => s + Number(v.grandTotal || 0), 0)
  const postedCount = vouchers.filter(v => v.status === 'POSTED').length

  const hasBalance = ['SALE', 'PURCHASE', 'CREDIT_NOTE', 'DEBIT_NOTE'].includes(voucherType)

  return (
    <div>
      <PageHeader
        title={title}
        breadcrumbs={[{ label: title }]}
        actions={
          <Button onClick={() => navigate(newPath)}>
            <Plus size={15} /> New
          </Button>
        }
      />

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div className="mb-4 space-y-3">

        {/* Search + Filter toggle */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder={`Search ${title.toLowerCase()}...`}
              className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
            {[
              { label: 'Posted', value: 'POSTED' },
              { label: 'All', value: '' },
              { label: 'Draft', value: 'DRAFT' },
            ].map(opt => (
              <button key={opt.value}
                onClick={() => { setStatus(opt.value); setPage(1) }}
                className={cn('px-3 py-2 transition-colors', status === opt.value ? 'bg-primary text-white' : 'hover:bg-muted text-muted-foreground')}>
                {opt.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowFilters(s => !s)}>
            <Filter size={14} /> {showFilters ? 'Hide' : 'Filters'}
          </Button>
          <Button onClick={() => navigate(newPath)} className="sm:hidden">
            <Plus size={14} />
          </Button>
        </div>

        {/* Expanded filters */}
        {showFilters && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-muted/30 rounded-lg">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">From</label>
              <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1) }}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">To</label>
              <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1) }}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Status</label>
              <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring">
                <option value="">All Status</option>
                <option value="DRAFT">Draft</option>
                <option value="POSTED">Posted</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button size="sm" variant="outline" className="w-full h-8 text-xs"
                onClick={() => { setSearch(''); setStatus(''); setFrom(fyDates.from); setTo(fyDates.to); setPage(1) }}>
                Reset
              </Button>
            </div>
          </div>
        )}

        {/* Summary strip */}
        {vouchers.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 bg-muted/40 rounded-lg px-3 py-2 text-xs">
            <span className="text-muted-foreground">{pagination?.total || vouchers.length} records</span>
            <span className="text-muted-foreground hidden sm:inline">·</span>
            <span className="font-semibold">{formatINR(totalAmount)}</span>
            <span className="text-muted-foreground hidden sm:inline">·</span>
            <span className="text-success">{postedCount} posted</span>
          </div>
        )}
      </div>

      {/* ── Table / Cards ─────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : vouchers.length === 0 ? (
        <EmptyState
          icon={<FileText size={40} />}
          title={`No ${title.toLowerCase()} found`}
          description="Create your first entry to get started"
          action={<Button onClick={() => navigate(newPath)}><Plus size={15} /> New {title.replace(/s$/, '')}</Button>}
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Voucher No</th>
                    <th>Date</th>
                    <th>Party</th>
                    <th className="hidden lg:table-cell">Narration</th>
                    <th className="text-right">Amount</th>
                    <th className="text-right hidden sm:table-cell">GST</th>
                    <th className="text-right">Total</th>
                    {hasBalance && <th className="text-right hidden lg:table-cell">Balance</th>}
                    <th>Status</th>
                    <th className="w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {vouchers.map((v: any) => {
                    const gstAmt = Number(v.cgstAmount) + Number(v.sgstAmount) + Number(v.igstAmount)
                    const isCancelled = v.status === 'CANCELLED'
                    const isPosted = v.status === 'POSTED'
                    return (
                      <tr key={v.id}
                        className={`cursor-pointer ${isCancelled ? 'opacity-60' : ''}`}
                        onClick={() => navigate(`${newPath.replace('/new', '')}/${v.voucherNumber}`)}>
                        <td>
                          <span className="font-mono text-xs font-semibold">{v.voucherNumber}</span>
                          {isCancelled && <div className="text-[10px] text-destructive">CANCELLED</div>}
                        </td>
                        <td className="whitespace-nowrap">{formatDate(v.date)}</td>
                        <td className="max-w-[140px] truncate">{v.party?.name || '—'}</td>
                        <td className="hidden lg:table-cell text-xs text-muted-foreground max-w-[120px] truncate">
                          {v.narration || '—'}
                        </td>
                        <td className="amount-col">{formatINR(v.taxableAmount)}</td>
                        <td className="amount-col text-muted-foreground hidden sm:table-cell">
                          {formatINR(gstAmt)}
                        </td>
                        <td className="amount-col font-semibold">{formatINR(v.grandTotal)}</td>
                        {hasBalance && (
                          <td className="amount-col hidden lg:table-cell">
                            {Number(v.balanceDue) > 0
                              ? <span className="text-destructive font-mono">{formatINR(v.balanceDue)}</span>
                              : <span className="text-success text-xs">Settled</span>}
                          </td>
                        )}
                        <td>
                          <Badge variant={STATUS_BADGE[v.status] || 'default'} className="text-[10px]">
                            {v.status}
                          </Badge>
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon-sm" title="View"
                              onClick={() => navigate(`${newPath.replace('/new', '')}/${v.voucherNumber}`)}>
                              <Eye size={13} />
                            </Button>
                            <Button variant="ghost" size="icon-sm" title="Print"
                              onClick={() => window.open(`/print/${voucherType.toLowerCase()}/${v.voucherNumber}`, '_blank')}>
                              <Printer size={13} />
                            </Button>
                            {/* Cancel button — only for POSTED/DRAFT */}
                            {!isCancelled && (
                              <Button variant="ghost" size="icon-sm" title="Cancel"
                                className="hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setCancelId({ id: v.id, number: v.voucherNumber })}>
                                <XCircle size={13} />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {vouchers.map((v: any) => {
              const isCancelled = v.status === 'CANCELLED'
              return (
                <div key={v.id}
                  className={`bg-card border border-border rounded-xl p-4 ${isCancelled ? 'opacity-60' : ''}`}>
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold">{v.voucherNumber}</span>
                        <Badge variant={STATUS_BADGE[v.status] || 'default'} className="text-[9px]">
                          {v.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{formatDate(v.date)}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold font-mono text-sm">{formatINR(v.grandTotal)}</div>
                      {hasBalance && Number(v.balanceDue) > 0 && (
                        <div className="text-xs text-destructive font-mono">{formatINR(v.balanceDue)} due</div>
                      )}
                    </div>
                  </div>

                  {/* Party */}
                  {v.party?.name && (
                    <div className="text-sm font-medium mb-1 truncate">{v.party.name}</div>
                  )}
                  {v.narration && (
                    <div className="text-xs text-muted-foreground truncate mb-2">{v.narration}</div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                    <button
                      onClick={() => navigate(`${newPath.replace('/new', '')}/${v.voucherNumber}`)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                      <Eye size={12} /> View
                    </button>
                    <button
                      onClick={() => window.open(`/print/${voucherType.toLowerCase()}/${v.voucherNumber}`, '_blank')}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium bg-muted hover:bg-muted/70 transition-colors">
                      <Printer size={12} /> Print
                    </button>
                    {!isCancelled && (
                      <button
                        onClick={() => setCancelId({ id: v.id, number: v.voucherNumber })}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors">
                        <XCircle size={12} /> Cancel
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <span className="text-xs text-muted-foreground">
                Page {page} of {pagination.totalPages} · {pagination.total} records
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Cancel Modal */}
      {cancelId && (
        <CancelModal
          voucherId={cancelId.id}
          voucherNumber={cancelId.number}
          onClose={() => setCancelId(null)}
          onDone={() => { refetch(); setCancelId(null) }}
        />
      )}
    </div>
  )
}
