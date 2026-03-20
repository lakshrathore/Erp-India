import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Package, Edit, Tag } from 'lucide-react'
import { useItems, useItemCategories } from '../../hooks/api.hooks'
import { formatINR } from '../../lib/india'
import { Button, Badge, EmptyState, Spinner, PageHeader, Select } from '../../components/ui'

export default function ItemsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useItems({ search, categoryId, page, limit: 50 })
  const { data: categories } = useItemCategories()
  const items = data?.data || []
  const pagination = (data as any)?.pagination

  const categoryOpts = [
    { value: '', label: 'All Categories' },
    ...(categories || []).map((c: any) => ({ value: c.id, label: c.name })),
  ]

  return (
    <div>
      <PageHeader
        title="Items"
        subtitle="Product and service master with dynamic attributes"
        breadcrumbs={[{ label: 'Masters' }, { label: 'Items' }]}
        actions={
          <Button onClick={() => navigate('/masters/items/new')}>
            <Plus size={15} /> Add Item
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Search name, code, HSN..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <Select
          options={categoryOpts}
          value={categoryId}
          onChange={(e) => { setCategoryId(e.target.value); setPage(1) }}
          className="w-44"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/masters/item-categories')}
        >
          <Tag size={14} /> Categories
        </Button>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center items-center py-20"><Spinner /></div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Package size={40} />}
            title="No items found"
            description="Add products and services to use in billing"
            action={
              <Button onClick={() => navigate('/masters/items/new')}>
                <Plus size={15} /> Add Item
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Category</th>
                  <th>HSN/SAC</th>
                  <th>Unit</th>
                  <th>GST %</th>
                  <th className="text-right">Purchase Rate</th>
                  <th className="text-right">Sale Rate</th>
                  <th>Variants</th>
                  <th>Stock</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any) => (
                  <tr
                    key={item.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/masters/items/${item.id}`)}
                  >
                    <td>
                      <div className="font-medium text-foreground">{item.name}</div>
                      {item.code && <div className="text-xs text-muted-foreground">{item.code}</div>}
                    </td>
                    <td>
                      {item.category ? (
                        <Badge variant="secondary" className="text-[10px]">
                          {item.category.name}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td>
                      <span className="font-mono text-xs">{item.hsnCode || item.sacCode || '—'}</span>
                    </td>
                    <td className="text-sm">{item.unit}</td>
                    <td>
                      <Badge
                        variant={item.gstRate === 0 ? 'outline' : 'info'}
                        className="text-[10px]"
                      >
                        {item.gstRate}%
                      </Badge>
                    </td>
                    <td className="amount-col text-sm">{formatINR(item.purchaseRate, 2)}</td>
                    <td className="amount-col text-sm">{formatINR(item.saleRate, 2)}</td>
                    <td className="text-center text-sm">
                      {item._count?.variants > 0 ? (
                        <Badge variant="secondary" className="text-[10px]">{item._count.variants}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td>
                      <Badge
                        variant={item.maintainStock ? 'success' : 'outline'}
                        className="text-[10px]"
                      >
                        {item.maintainStock ? 'Yes' : 'No'}
                      </Badge>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => navigate(`/masters/items/${item.id}/edit`)}
                      >
                        <Edit size={13} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <span className="text-xs text-muted-foreground">{pagination.total} items total</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span className="text-xs text-muted-foreground">{page} / {pagination.totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
