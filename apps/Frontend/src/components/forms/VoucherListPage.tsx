import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Filter, Download, Eye, FileText, Printer, X, CheckCircle2, AlertTriangle } from 'lucide-react'
import dayjs from 'dayjs'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatINR, formatDate, getFinancialYear } from '../../lib/india'
import { Button, Badge, EmptyState, Spinner, PageHeader, Select } from '../../components/ui'
import { useAuthStore } from '../../stores/auth.store'

export type VoucherType = 'SALE' | 'PURCHASE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'SALE_CHALLAN' | 'PURCHASE_ORDER' | 'PURCHASE_CHALLAN' | 'PRODUCTION' | 'RECEIPT' | 'PAYMENT' | 'CONTRA' | 'JOURNAL'

interface VoucherListPageProps {
  voucherType: VoucherType
  title: string
  newPath: string
  breadcrumbs?: string[]
}

const STATUS_BADGE: Record<string, any> = {
  POSTED: 'success',
  DRAFT: 'outline',
  CANCELLED: 'destructive',
}

export default function VoucherListPage({ voucherType, title, newPath, breadcrumbs = [] }: VoucherListPageProps) {
  const navigate = useNavigate()
  const { activeCompany, activeFY } = useAuthStore()
  const today = dayjs()
  const fyDates = activeFY ? getFYDates(activeFY) : { from: today.subtract(365, 'day').format('YYYY-MM-DD'), to: today.format('YYYY-MM-DD') }

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState(fyDates.from)
  const [to, setTo] = useState(fyDates.to)
  const [page, setPage] = useState(1)
  const limit = 50

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['vouchers', voucherType, { search, status, from, to, page }],
    queryFn: async () => {
      const params: any = { voucherType, from, to, page, limit }
      if (search) params.search = search
      if (status) params.status = status
      const { data } = await api.get('/billing/vouchers', { params })
      return data
    },
    enabled: !!activeCompany,
  })

  const vouchers: any[] = data?.data || []
  const pagination = data?.pagination

  // Summary totals from current page
  const totalAmount = vouchers.reduce((s: number, v: any) => s + Number(v.grandTotal || 0), 0)
  const postedCount = vouchers.filter((v: any) => v.status === 'POSTED').length

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={activeFY ? `FY ${activeFY}` : ''}
        breadcrumbs={[{ label: 'Billing' }, { label: title }]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Download size={14} /> Export
            </Button>
            <Button onClick={() => navigate(newPath)}>
              <Plus size={15} /> New {title.replace(/s$/, '')}
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Search voucher no, party..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1) }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          <span className="text-muted-foreground text-sm">to</span>
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1) }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <Select
          options={[
            { value: '', label: 'All Status' },
            { value: 'DRAFT', label: 'Draft' },
            { value: 'POSTED', label: 'Posted' },
            { value: 'CANCELLED', label: 'Cancelled' },
          ]}
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1) }}
          className="w-32"
        />
      </div>

      {/* Summary strip */}
      {vouchers.length > 0 && (
        <div className="flex items-center gap-6 bg-muted/40 rounded-lg px-4 py-2.5 mb-4 text-sm">
          <span className="text-muted-foreground">{pagination?.total || vouchers.length} vouchers</span>
          <span className="text-muted-foreground">·</span>
          <span className="font-medium">{formatINR(totalAmount)}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-success">{postedCount} posted</span>
          {(pagination?.total || 0) - postedCount > 0 && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-warning">{(pagination?.total || vouchers.length) - postedCount} draft/cancelled</span>
            </>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
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
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Voucher No</th>
                  <th>Date</th>
                  <th>Party</th>
                  <th>Narration</th>
                  <th className="text-right">Taxable</th>
                  <th className="text-right">GST</th>
                  <th className="text-right">Grand Total</th>
                  {['SALE', 'PURCHASE', 'CREDIT_NOTE', 'DEBIT_NOTE'].includes(voucherType) && (
                    <th className="text-right">Balance Due</th>
                  )}
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {vouchers.map((v: any) => {
                  const gstAmt = Number(v.cgstAmount) + Number(v.sgstAmount) + Number(v.igstAmount)
                  return (
                    <tr key={v.id} className="cursor-pointer"
                      onClick={() => navigate(`${newPath.replace('/new', '')}/${v.id}`)}>
                      <td>
                        <span className="font-mono text-xs font-medium">{v.voucherNumber}</span>
                      </td>
                      <td className="text-sm whitespace-nowrap">{formatDate(v.date)}</td>
                      <td className="text-sm max-w-[160px] truncate">{v.party?.name || '—'}</td>
                      <td className="text-xs text-muted-foreground max-w-[120px] truncate">{v.narration || '—'}</td>
                      <td className="amount-col text-sm">{formatINR(v.taxableAmount)}</td>
                      <td className="amount-col text-sm text-muted-foreground">{formatINR(gstAmt)}</td>
                      <td className="amount-col text-sm font-medium">{formatINR(v.grandTotal)}</td>
                      {['SALE', 'PURCHASE', 'CREDIT_NOTE', 'DEBIT_NOTE'].includes(voucherType) && (
                        <td className="amount-col text-sm">
                          {Number(v.balanceDue) > 0 ? (
                            <span className="amount-debit">{formatINR(v.balanceDue)}</span>
                          ) : (
                            <span className="text-success text-xs">Settled</span>
                          )}
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
                            onClick={() => navigate(`${newPath.replace('/new', '')}/${v.id}`)}>
                            <Eye size={13} />
                          </Button>
                          <Button variant="ghost" size="icon-sm" title="Print"
                            onClick={() => window.open(`/print/${voucherType.toLowerCase()}/${v.id}`, '_blank')}>
                            <Printer size={13} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <span className="text-xs text-muted-foreground">
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, pagination.total)} of {pagination.total}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <span className="text-xs text-muted-foreground">{page} / {pagination.totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Helpers
function getFYDates(fy: string) {
  const parts = fy.split('-')
  const startYear = 2000 + parseInt(parts[0])
  return {
    from: `${startYear}-04-01`,
    to: `${startYear + 1}-03-31`,
  }
}
