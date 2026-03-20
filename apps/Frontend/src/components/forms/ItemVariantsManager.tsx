import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Edit, Check, X, Package, Info, Tag, Barcode } from 'lucide-react'
import { api, extractError } from '../../lib/api'
import { Button, Badge, Spinner, Input } from '../ui'
import { formatINR } from '../../lib/india'
import { cn } from '../ui/utils'

interface Attribute {
  name: string
  label: string
  type: 'text' | 'number' | 'date' | 'select' | 'boolean'
  options?: string[]
  required: boolean
}

interface VariantForm {
  code: string
  barcode: string
  attributeValues: Record<string, any>
  purchaseRate: number
  saleRate: number
  isActive: boolean
}

interface Props {
  itemId: string
  itemName: string
  categoryAttributes: Attribute[]
  basePrice: { purchaseRate: number; saleRate: number }
}

export default function ItemVariantsManager({ itemId, itemName, categoryAttributes, basePrice }: Props) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<VariantForm>({
    code: '', barcode: '',
    attributeValues: {},
    purchaseRate: basePrice.purchaseRate,
    saleRate: basePrice.saleRate,
    isActive: true,
  })
  const [error, setError] = useState('')

  const { data: itemData, isLoading } = useQuery({
    queryKey: ['item-variants', itemId],
    queryFn: async () => {
      const { data } = await api.get(`/masters/items/${itemId}`)
      return data.data
    },
    enabled: !!itemId,
  })

  const variants = itemData?.variants || []

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        code: form.code || null,
        barcode: form.barcode || null,
        attributeValues: form.attributeValues,
        purchaseRate: form.purchaseRate,
        saleRate: form.saleRate,
        isActive: form.isActive,
      }
      if (editId) {
        await api.put(`/masters/items/${itemId}/variants/${editId}`, payload)
      } else {
        await api.post(`/masters/items/${itemId}/variants`, payload)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['item-variants', itemId] })
      resetForm()
    },
    onError: (e) => setError(extractError(e)),
  })

  const deleteMutation = useMutation({
    mutationFn: async (variantId: string) => {
      await api.put(`/masters/items/${itemId}/variants/${variantId}`, { isActive: false })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['item-variants', itemId] }),
  })

  const resetForm = () => {
    setForm({ code: '', barcode: '', attributeValues: {}, purchaseRate: basePrice.purchaseRate, saleRate: basePrice.saleRate, isActive: true })
    setEditId(null)
    setShowForm(false)
    setError('')
  }

  const startEdit = (v: any) => {
    setForm({
      code: v.code || '',
      barcode: v.barcode || '',
      attributeValues: { ...(v.attributeValues || {}) },
      purchaseRate: Number(v.purchaseRate),
      saleRate: Number(v.saleRate),
      isActive: v.isActive,
    })
    setEditId(v.id)
    setShowForm(true)
    setError('')
  }

  const setAttr = (name: string, value: any) => {
    setForm(prev => ({ ...prev, attributeValues: { ...prev.attributeValues, [name]: value } }))
  }

  // Auto-generate code from attribute values
  const autoCode = () => {
    const parts = categoryAttributes
      .map(attr => form.attributeValues[attr.name])
      .filter(Boolean)
      .map(v => String(v).toUpperCase().replace(/\s+/g, ''))
    setForm(prev => ({ ...prev, code: parts.join('-') }))
  }

  // Render dynamic input for each attribute type
  const renderAttrInput = (attr: Attribute) => {
    const val = form.attributeValues[attr.name] ?? ''
    const base = "h-8 w-full rounded border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"

    if (attr.type === 'select' && attr.options?.length) {
      return (
        <select value={val} onChange={e => setAttr(attr.name, e.target.value)} className={base}>
          <option value="">— Select —</option>
          {attr.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )
    }
    if (attr.type === 'boolean') {
      return (
        <select value={val} onChange={e => setAttr(attr.name, e.target.value)} className={base}>
          <option value="">—</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      )
    }
    if (attr.type === 'date') {
      return (
        <input type="date" value={val} onChange={e => setAttr(attr.name, e.target.value)} className={base} />
      )
    }
    if (attr.type === 'number') {
      return (
        <input type="number" value={val} onChange={e => setAttr(attr.name, e.target.value)}
          placeholder={`Enter ${attr.label.toLowerCase()}`} className={base} />
      )
    }
    return (
      <input type="text" value={val} onChange={e => setAttr(attr.name, e.target.value)}
        placeholder={`Enter ${attr.label.toLowerCase()}`} className={base} />
    )
  }

  // No category attributes defined
  if (categoryAttributes.length === 0) {
    return (
      <div className="bg-muted/30 border border-dashed border-border rounded-lg p-6 text-center">
        <Package size={28} className="mx-auto mb-2 text-muted-foreground/50" />
        <p className="text-sm font-medium text-muted-foreground">No variant attributes configured</p>
        <p className="text-xs text-muted-foreground mt-1">
          Go to <strong className="text-primary">Masters → Item Categories</strong> → select or create a category → add attributes like Color, Size, Batch No, Expiry Date etc.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Then assign this item to that category to enable variants.
        </p>
      </div>
    )
  }

  const activeVariants = variants.filter((v: any) => v.isActive)

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            <strong>{itemName}</strong> — attributes:
            {categoryAttributes.map(a => (
              <span key={a.name} className="ml-1 inline-flex items-center gap-0.5 bg-primary/10 text-primary text-xs px-1.5 py-0.5 rounded">
                <Tag size={9} /> {a.label}
                {a.required && <span className="text-destructive">*</span>}
              </span>
            ))}
          </p>
        </div>
        <Button size="sm" onClick={() => { resetForm(); setShowForm(true) }}>
          <Plus size={13} /> Add Variant
        </Button>
      </div>

      {/* ── Add/Edit Form ──────────────────────────────────────────────── */}
      {showForm && (
        <div className="bg-card border border-primary/30 rounded-xl p-4 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">{editId ? 'Edit Variant' : 'New Variant'}</h4>
            <button onClick={resetForm} className="text-muted-foreground hover:text-foreground"><X size={15} /></button>
          </div>

          {/* Dynamic attribute fields */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Variant Attributes</p>
            <div className={cn(
              'grid gap-3',
              categoryAttributes.length === 1 ? 'grid-cols-1' :
              categoryAttributes.length === 2 ? 'grid-cols-2' :
              categoryAttributes.length <= 4 ? 'grid-cols-2 md:grid-cols-4' :
              'grid-cols-2 md:grid-cols-3'
            )}>
              {categoryAttributes.map(attr => (
                <div key={attr.name}>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    {attr.label}
                    {attr.required && <span className="text-destructive ml-0.5">*</span>}
                    <span className="text-muted-foreground ml-1 font-normal">({attr.type})</span>
                  </label>
                  {renderAttrInput(attr)}
                </div>
              ))}
            </div>
          </div>

          {/* Code + Barcode */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Identification</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">Variant Code</label>
                <div className="flex gap-1">
                  <input
                    value={form.code}
                    onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                    placeholder="e.g. RED-M or BATCH001"
                    className="h-8 flex-1 rounded border border-input bg-background px-2 text-sm font-mono uppercase focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button type="button" onClick={autoCode} title="Auto-generate from attributes"
                    className="h-8 px-2 rounded border border-border bg-muted text-xs hover:bg-primary/10 hover:text-primary transition-colors whitespace-nowrap">
                    Auto
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">Barcode / SKU</label>
                <input
                  value={form.barcode}
                  onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))}
                  placeholder="Scan barcode or enter SKU"
                  className="h-8 w-full rounded border border-input bg-background px-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
          </div>

          {/* Price overrides */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Price Override (optional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">Purchase Rate (₹)</label>
                <input type="number" step="0.01" value={form.purchaseRate}
                  onChange={e => setForm(f => ({ ...f, purchaseRate: Number(e.target.value) }))}
                  className="h-8 w-full rounded border border-input bg-background px-2 text-sm text-right font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
                <p className="text-[10px] text-muted-foreground mt-0.5">Base: {formatINR(basePrice.purchaseRate)}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">Sale Rate (₹)</label>
                <input type="number" step="0.01" value={form.saleRate}
                  onChange={e => setForm(f => ({ ...f, saleRate: Number(e.target.value) }))}
                  className="h-8 w-full rounded border border-input bg-background px-2 text-sm text-right font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
                <p className="text-[10px] text-muted-foreground mt-0.5">Base: {formatINR(basePrice.saleRate)}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.isActive}
                onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                className="w-4 h-4 rounded" />
              Active
            </label>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
                <Check size={12} /> {editId ? 'Update' : 'Save Variant'}
              </Button>
              <Button size="sm" variant="outline" onClick={resetForm}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Variants Table ─────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : activeVariants.length === 0 && !showForm ? (
        <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-xl">
          <Package size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No variants yet</p>
          <p className="text-xs mt-1">Click "Add Variant" to create your first combination</p>
        </div>
      ) : activeVariants.length > 0 ? (
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  {/* Code */}
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Code
                  </th>
                  {/* Dynamic attribute columns — from category definition */}
                  {categoryAttributes.map(attr => (
                    <th key={attr.name} className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {attr.label}
                      {attr.required && <span className="text-destructive ml-0.5">*</span>}
                    </th>
                  ))}
                  {/* Barcode */}
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Barcode
                  </th>
                  {/* Rates */}
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Purchase ₹
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Sale ₹
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Status
                  </th>
                  <th className="w-14"></th>
                </tr>
              </thead>
              <tbody>
                {activeVariants.map((v: any, i: number) => (
                  <tr key={v.id} className={cn(
                    'border-t border-border/40 hover:bg-muted/20 transition-colors',
                    i % 2 === 1 && 'bg-muted/10'
                  )}>
                    {/* Code */}
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold text-primary">
                      {v.code || <span className="text-muted-foreground">—</span>}
                    </td>
                    {/* Dynamic attribute values */}
                    {categoryAttributes.map(attr => {
                      const val = v.attributeValues?.[attr.name]
                      return (
                        <td key={attr.name} className="px-3 py-2.5 text-sm">
                          {val != null && val !== ''
                            ? String(val)
                            : <span className="text-muted-foreground text-xs">—</span>
                          }
                        </td>
                      )
                    })}
                    {/* Barcode */}
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                      {v.barcode || <span className="text-muted-foreground">—</span>}
                    </td>
                    {/* Rates */}
                    <td className="px-3 py-2.5 text-right font-mono text-sm">
                      {formatINR(Number(v.purchaseRate))}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-sm font-semibold">
                      {formatINR(Number(v.saleRate))}
                    </td>
                    {/* Status */}
                    <td className="px-3 py-2.5 text-center">
                      <Badge variant={v.isActive ? 'success' : 'secondary'} className="text-[10px]">
                        {v.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    {/* Actions */}
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => startEdit(v)}
                          className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors">
                          <Edit size={13} />
                        </button>
                        <button
                          onClick={() => { if (confirm('Remove this variant?')) deleteMutation.mutate(v.id) }}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary footer */}
          <div className="bg-muted/20 border-t border-border px-4 py-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{activeVariants.length} variant{activeVariants.length !== 1 ? 's' : ''}</span>
            <span>Columns: Code · {categoryAttributes.map(a => a.label).join(' · ')} · Barcode · Rates</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
