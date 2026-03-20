import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Trash2, GripVertical, Tag, Edit, Check, X,
  ChevronDown, ChevronRight, Info, Package
} from 'lucide-react'
import { api, extractError } from '../../lib/api'
import { Button, Input, Badge, PageHeader, Spinner } from '../../components/ui'
import { SafeDeleteButton } from '../../components/ui/SafeDeleteButton'
import { useAuthStore } from '../../stores/auth.store'
import { cn } from '../../components/ui/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Attribute {
  name: string        // field key e.g. "batch_no"
  label: string       // display label e.g. "Batch No"
  type: 'text' | 'number' | 'date' | 'select' | 'boolean'
  options?: string[]  // for select type
  required: boolean
  showInReport: boolean
}

const ATTR_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown' },
  { value: 'boolean', label: 'Yes/No' },
]

// ─── Preset Categories ────────────────────────────────────────────────────────
// These are TEMPLATES — user can apply and then customize before saving

const PRESET_CATEGORIES: Array<{
  name: string
  trackBatch: boolean
  trackExpiry?: boolean
  attributes: Attribute[]
}> = [
  {
    name: 'Pharmaceuticals',
    trackBatch: true,
    trackExpiry: true,
    attributes: [
      { name: 'batch_no', label: 'Batch No', type: 'text', required: true, showInReport: true },
      { name: 'mfg_date', label: 'Mfg Date', type: 'date', required: true, showInReport: true },
      { name: 'exp_date', label: 'Exp Date', type: 'date', required: true, showInReport: true },
    ],
  },
  {
    name: 'Garments / Textiles',
    trackBatch: false,
    attributes: [
      { name: 'color', label: 'Color', type: 'text', required: false, showInReport: true },
      { name: 'size', label: 'Size', type: 'select', options: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'], required: false, showInReport: true },
      { name: 'fabric', label: 'Fabric', type: 'text', required: false, showInReport: false },
    ],
  },
  {
    name: 'Electronics',
    trackBatch: false,
    attributes: [
      { name: 'brand', label: 'Brand', type: 'text', required: false, showInReport: true },
      { name: 'model_no', label: 'Model No', type: 'text', required: false, showInReport: true },
      { name: 'serial_no', label: 'Serial No', type: 'text', required: false, showInReport: false },
      { name: 'warranty', label: 'Warranty (months)', type: 'number', required: false, showInReport: false },
    ],
  },
  {
    name: 'Food & FMCG',
    trackBatch: true,
    trackExpiry: true,
    attributes: [
      { name: 'batch_no', label: 'Batch No', type: 'text', required: true, showInReport: true },
      { name: 'mfg_date', label: 'Mfg Date', type: 'date', required: true, showInReport: true },
      { name: 'exp_date', label: 'Exp Date', type: 'date', required: true, showInReport: true },
    ],
  },
  {
    name: 'Jewellery',
    trackBatch: false,
    attributes: [
      { name: 'purity', label: 'Purity (e.g. 22K)', type: 'text', required: true, showInReport: true },
      { name: 'weight_gm', label: 'Weight (gm)', type: 'number', required: true, showInReport: true },
      { name: 'hallmark', label: 'Hallmark No', type: 'text', required: false, showInReport: false },
    ],
  },
  {
    name: 'No Attributes',
    trackBatch: false,
    attributes: [],
  },
]

// ─── Single Attribute Row ─────────────────────────────────────────────────────

function AttrRow({ attr, index, onChange, onDelete }: {
  attr: Attribute
  index: number
  onChange: (i: number, a: Attribute) => void
  onDelete: (i: number) => void
}) {
  const [optInput, setOptInput] = useState(attr.options?.join(', ') || '')

  return (
    <div className="grid grid-cols-12 gap-2 items-start py-2 border-b border-border/30">
      <div className="col-span-1 flex items-center pt-2">
        <GripVertical size={14} className="text-muted-foreground cursor-grab" />
        <span className="text-xs text-muted-foreground ml-1">{index + 1}</span>
      </div>

      {/* Field name (key) */}
      <div className="col-span-3">
        <input
          value={attr.name}
          onChange={e => onChange(index, { ...attr, name: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
          placeholder="field_key"
          className="h-7 w-full rounded border border-input bg-background px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Label */}
      <div className="col-span-3">
        <input
          value={attr.label}
          onChange={e => onChange(index, { ...attr, label: e.target.value })}
          placeholder="Display Label"
          className="h-7 w-full rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Type */}
      <div className="col-span-2">
        <select
          value={attr.type}
          onChange={e => onChange(index, { ...attr, type: e.target.value as any })}
          className="h-7 w-full rounded border border-input bg-background px-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {ATTR_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {/* Options (for select) */}
      <div className="col-span-2">
        {attr.type === 'select' ? (
          <input
            value={optInput}
            onChange={e => {
              setOptInput(e.target.value)
              onChange(index, { ...attr, options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })
            }}
            placeholder="A, B, C"
            title="Comma-separated options"
            className="h-7 w-full rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
        ) : (
          <span className="text-xs text-muted-foreground block pt-1.5">—</span>
        )}
      </div>

      {/* Required + Delete */}
      <div className="col-span-1 flex items-center gap-1.5 pt-0.5">
        <button
          type="button"
          onClick={() => onChange(index, { ...attr, required: !attr.required })}
          title={attr.required ? 'Required' : 'Optional'}
          className={cn(
            'text-[10px] px-1 py-0.5 rounded border transition-colors',
            attr.required
              ? 'bg-destructive/10 text-destructive border-destructive/30'
              : 'border-border text-muted-foreground hover:border-primary'
          )}
        >
          {attr.required ? 'Req' : 'Opt'}
        </button>
        <button type="button" onClick={() => onDelete(index)}
          className="text-muted-foreground hover:text-destructive transition-colors">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}

// ─── Category Form ────────────────────────────────────────────────────────────

function CategoryForm({
  editCat,
  onSaved,
  onCancel,
}: {
  editCat?: any
  onSaved: () => void
  onCancel: () => void
}) {
  const { activeCompany } = useAuthStore()
  const qc = useQueryClient()
  const isEdit = !!editCat

  const [name, setName] = useState(editCat?.name || '')
  const [trackBatch, setTrackBatch] = useState(editCat?.trackBatch || false)
  const [trackExpiry, setTrackExpiry] = useState(editCat?.trackExpiry || false)
  const [attributes, setAttributes] = useState<Attribute[]>(editCat?.attributes || [])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const applyPreset = (p: typeof PRESET_CATEGORIES[0]) => {
    // Only apply name if creating new
    if (!isEdit) setName(p.name)
    setTrackBatch(p.trackBatch)
    setTrackExpiry(p.trackExpiry || false)
    setAttributes([...(p.attributes as Attribute[])])
  }

  const addAttr = () => setAttributes(prev => [...prev, {
    name: `attr_${prev.length + 1}`,
    label: `Attribute ${prev.length + 1}`,
    type: 'text', required: false, showInReport: true,
  }])

  const save = async () => {
    setError('')
    if (!name.trim()) { setError('Category name is required'); return }

    // Validate attributes
    for (const a of attributes) {
      if (!a.name.trim()) { setError('All attribute field names are required'); return }
      if (!a.label.trim()) { setError('All attribute labels are required'); return }
    }

    setSaving(true)
    try {
      const payload = { name: name.trim(), trackBatch, trackExpiry, attributes }
      if (isEdit) {
        await api.put(`/masters/item-categories/${editCat.id}`, payload)
      } else {
        await api.post('/masters/item-categories', payload)
      }
      qc.invalidateQueries({ queryKey: ['item-categories'] })
      onSaved()
    } catch (e) {
      const msg = extractError(e)
      if (msg.includes('already exists')) {
        setError(`Category "${name}" already exists. Use a different name.`)
      } else {
        setError(msg)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-base">{isEdit ? `Edit: ${editCat.name}` : 'New Category'}</h3>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted">
          <X size={16} />
        </button>
      </div>

      {/* Presets — only shown when creating, as attribute TEMPLATES */}
      {!isEdit && (
        <div className="mb-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Quick presets — fills name + attributes as a starting point (you can edit after):
          </p>
          <div className="flex flex-wrap gap-2">
            {PRESET_CATEGORIES.map(p => (
              <button
                key={p.name}
                onClick={() => applyPreset(p)}
                className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* When editing - show preset attribute templates */}
      {isEdit && (
        <div className="mb-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Apply attribute template (replaces current attributes):
          </p>
          <div className="flex flex-wrap gap-2">
            {PRESET_CATEGORIES.filter(p => p.name !== 'No Attributes').map(p => (
              <button
                key={p.name}
                onClick={() => {
                  setTrackBatch(p.trackBatch)
                  setTrackExpiry(p.trackExpiry || false)
                  setAttributes([...(p.attributes as Attribute[])])
                }}
                className="px-2.5 py-1 rounded-lg border border-border text-xs hover:border-primary hover:text-primary transition-all"
              >
                {p.name}
              </button>
            ))}
            <button
              onClick={() => setAttributes([])}
              className="px-2.5 py-1 rounded-lg border border-border text-xs text-destructive hover:border-destructive transition-all"
            >
              Clear all
            </button>
          </div>
        </div>
      )}

      {/* Category name + options */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-foreground block mb-1.5">
            Category Name <span className="text-destructive">*</span>
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Pharmaceuticals, Electronics, Garments..."
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex items-end gap-4 pb-1">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={trackBatch} onChange={e => setTrackBatch(e.target.checked)} className="w-4 h-4 rounded" />
            Track Batch
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={trackExpiry} onChange={e => setTrackExpiry(e.target.checked)} className="w-4 h-4 rounded" />
            Track Expiry
          </label>
        </div>
      </div>

      {/* Dynamic Attributes */}
      <div className="border border-border rounded-lg overflow-hidden mb-4">
        <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Dynamic Attributes</span>
            <Badge variant="secondary" className="text-[10px]">{attributes.length}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              These fields appear on Item form for this category
            </span>
            <Button size="sm" variant="outline" onClick={addAttr}>
              <Plus size={12} /> Add Attribute
            </Button>
          </div>
        </div>

        {attributes.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            <Package size={24} className="mx-auto mb-2 opacity-30" />
            No attributes — items in this category won't have extra fields.
          </div>
        ) : (
          <div className="px-4 py-2">
            {/* Header */}
            <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide pb-1 border-b border-border/30">
              <div className="col-span-1"></div>
              <div className="col-span-3">Field Key</div>
              <div className="col-span-3">Label</div>
              <div className="col-span-2">Type</div>
              <div className="col-span-2">Options</div>
              <div className="col-span-1">Req</div>
            </div>
            {attributes.map((a, i) => (
              <AttrRow key={i} attr={a} index={i}
                onChange={(idx, val) => setAttributes(prev => prev.map((x, j) => j === idx ? val : x))}
                onDelete={(idx) => setAttributes(prev => prev.filter((_, j) => j !== idx))}
              />
            ))}
          </div>
        )}
      </div>

      {/* Info about what attributes do */}
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 mb-4 text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2">
        <Info size={13} className="mt-0.5 shrink-0" />
        <div>
          <strong>What are Dynamic Attributes?</strong> These are extra fields that will appear on the Item form for items in this category.
          For example: Pharma → Batch No, Mfg Date, Exp Date. Garments → Color, Size.
          They are used as item <strong>variant attributes</strong> (e.g., each size/color = a variant with its own rate).
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 text-sm text-destructive mb-3">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <Button onClick={save} loading={saving}>
          <Check size={14} /> {isEdit ? 'Save Changes' : 'Create Category'}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
      </div>
    </div>
  )
}

// ─── Category Card ─────────────────────────────────────────────────────────────

function CategoryCard({ cat, onEdit }: { cat: any; onEdit: (cat: any) => void }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const attrs: Attribute[] = cat.attributes || []

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/masters/item-categories/${cat.id}`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['item-categories'] }),
  })

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/30 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <Tag size={15} className="text-primary shrink-0" />
          <span className="font-semibold text-sm truncate">{cat.name}</span>
          {cat.trackBatch && <Badge variant="warning" className="text-[9px] shrink-0">Batch</Badge>}
          {cat.trackExpiry && <Badge variant="destructive" className="text-[9px] shrink-0">Expiry</Badge>}
          {attrs.length > 0 && (
            <Badge variant="secondary" className="text-[9px] shrink-0">{attrs.length} attrs</Badge>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {attrs.length > 0 && (
            <button onClick={() => setExpanded(e => !e)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          )}
          <button onClick={() => onEdit(cat)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
            <Edit size={14} />
          </button>
          <SafeDeleteButton
            itemName={cat.name}
            itemType="category"
            onDelete={async () => { await deleteMutation.mutateAsync() }}
            checkUsage={async () => {
              const { data } = await api.get(`/masters/item-categories/${cat.id}/usage`)
              return data.data
            }}
          />
        </div>
      </div>

      {/* Attributes preview */}
      {expanded && attrs.length > 0 && (
        <div className="border-t border-border/50 px-4 py-3 bg-muted/10">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Attributes</p>
          <div className="flex flex-wrap gap-1.5">
            {attrs.map((a: any, i: number) => (
              <span key={i} className={cn(
                'text-xs px-2 py-0.5 rounded-full border font-mono',
                a.required ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-muted border-border text-muted-foreground'
              )}>
                {a.label}
                <span className="ml-1 text-[9px] opacity-60">({a.type})</span>
                {a.required && <span className="ml-0.5 text-destructive">*</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ItemCategoriesPage() {
  const { activeCompany } = useAuthStore()
  const companyId = activeCompany?.companyId || ''
  const [showForm, setShowForm] = useState(false)
  const [editCat, setEditCat] = useState<any>(null)
  const [search, setSearch] = useState('')

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['item-categories', companyId],
    queryFn: async () => {
      const { data } = await api.get('/masters/item-categories')
      return data.data || []
    },
    enabled: !!companyId,
  })

  const filtered = (categories as any[]).filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  )

  const openCreate = () => { setEditCat(null); setShowForm(true) }
  const openEdit = (cat: any) => { setEditCat(cat); setShowForm(true) }
  const closeForm = () => { setShowForm(false); setEditCat(null) }

  return (
    <div>
      <PageHeader
        title="Item Categories"
        subtitle="Define categories with dynamic attribute fields for items — Pharma, Garments, Electronics etc."
        breadcrumbs={[{ label: 'Masters' }, { label: 'Item Categories' }]}
        actions={
          <Button onClick={openCreate}>
            <Plus size={15} /> New Category
          </Button>
        }
      />

      {/* Form */}
      {showForm && (
        <CategoryForm
          editCat={editCat}
          onSaved={closeForm}
          onCancel={closeForm}
        />
      )}

      {/* Search */}
      {(categories as any[]).length > 0 && !showForm && (
        <div className="mb-4">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search categories..."
            className="h-9 w-64 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (categories as any[]).length === 0 ? (
        <div className="text-center py-16 bg-card border border-border rounded-xl">
          <Tag size={36} className="mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="font-semibold text-base mb-1">No categories yet</p>
          <p className="text-sm text-muted-foreground mb-4">
            Create categories to organize items and add dynamic attributes
          </p>
          <Button onClick={openCreate}><Plus size={14} /> Create First Category</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((cat: any) => (
            <CategoryCard key={cat.id} cat={cat} onEdit={openEdit} />
          ))}
          {filtered.length === 0 && search && (
            <p className="text-center text-sm text-muted-foreground py-8">No categories match "{search}"</p>
          )}
        </div>
      )}
    </div>
  )
}
