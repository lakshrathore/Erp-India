import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Filter, Download, Edit, Eye, Users } from 'lucide-react'
import { useParties } from '../../hooks/api.hooks'
import { formatINR, formatDate } from '../../lib/india'
import {
  Button, Badge, EmptyState, Spinner, PageHeader, Input, Select
} from '../../components/ui'
import { SafeDeleteButton } from '../../components/ui/SafeDeleteButton'
import { cn } from '../../components/ui/utils'

const TYPE_OPTS = [
  { value: '', label: 'All Types' },
  { value: 'CUSTOMER', label: 'Customer' },
  { value: 'VENDOR', label: 'Vendor' },
  { value: 'BOTH', label: 'Both' },
]

const TYPE_BADGE: Record<string, any> = {
  CUSTOMER: 'info',
  VENDOR: 'warning',
  BOTH: 'success',
  EMPLOYEE: 'default',
}

export default function PartiesPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useParties({ search, type, page, limit: 50 })
  const parties = data?.data || []
  const pagination = (data as any)?.pagination

  return (
    <div>
      <PageHeader
        title="Parties"
        subtitle="Customers, vendors, and other parties"
        breadcrumbs={[{ label: 'Masters' }, { label: 'Parties' }]}
        actions={
          <Button onClick={() => navigate('/masters/parties/new')}>
            <Plus size={15} /> Add Party
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Search name, GSTIN, phone..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <Select
          options={TYPE_OPTS}
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(1) }}
          className="w-36"
        />
        <Button variant="outline" size="sm">
          <Download size={14} /> Export
        </Button>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <Spinner />
          </div>
        ) : parties.length === 0 ? (
          <EmptyState
            icon={<Users size={40} />}
            title="No parties found"
            description="Add customers and vendors to get started"
            action={
              <Button onClick={() => navigate('/masters/parties/new')}>
                <Plus size={15} /> Add Party
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>GSTIN</th>
                  <th>Phone</th>
                  <th>City / State</th>
                  <th className="text-right">Opening Balance</th>
                  <th>Credit Days</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {parties.map((party: any) => (
                  <tr key={party.id} className="cursor-pointer" onClick={() => navigate(`/masters/parties/${party.id}`)}>
                    <td>
                      <div className="font-medium text-foreground">{party.name}</div>
                      {party.code && <div className="text-xs text-muted-foreground">{party.code}</div>}
                    </td>
                    <td>
                      <Badge variant={TYPE_BADGE[party.type] || 'default'} className="text-[10px]">
                        {party.type}
                      </Badge>
                    </td>
                    <td>
                      <span className="font-mono text-xs">{party.gstin || '—'}</span>
                    </td>
                    <td className="text-sm">{party.phone || '—'}</td>
                    <td className="text-sm text-muted-foreground">
                      {[party.city, party.state].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="amount-col text-sm">
                      <span className={party.openingType === 'Dr' ? 'amount-debit' : 'amount-credit'}>
                        {formatINR(party.openingBalance)}
                      </span>
                      <span className="text-muted-foreground text-xs ml-1">{party.openingType}</span>
                    </td>
                    <td className="text-sm text-muted-foreground text-center">
                      {party.creditDays > 0 ? `${party.creditDays}d` : '—'}
                    </td>
                    <td>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => navigate(`/masters/parties/${party.id}/edit`)}
                          title="Edit"
                        >
                          <Edit size={13} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <span className="text-xs text-muted-foreground">
              {pagination.total} parties total
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                {page} / {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
