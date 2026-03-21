import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Edit, ChevronRight, ChevronDown, Tag,
  Folder, FolderOpen, Package, X, Check, Info,
  Settings2, Layers, GripVertical, Trash2
} from 'lucide-react'
import { api, extractError } from '../../lib/api'
import { Button, Input, Badge, PageHeader, Spinner } from '../../components/ui'
import { cn } from '../../components/ui/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Attribute {
  name: string
  label: string
  type: 'text' | 'number' | 'date' | 'select' | 'boolean'
  options?: string[]
  required: boolean
  showInReport: boolean
}

interface Category {
  id: string
  name: string
  parentId: string | null
  level: number
  description: string | null
  color: string | null
  attributes: Attribute[]
  trackBatch: boolean
  trackExpiry: boolean
  children: Category[]
  _count: { items: number; children: number }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ATTR_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'select', label: 'Dropdown' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Yes/No' },
]

const LEVEL_STYLE = [
  { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', badge: 'bg-blue-100 text-blue-700', label: 'L1 — Main Category' },
  { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', badge: 'bg-purple-100 text-purple-700', label: 'L2 — Sub Category' },
  { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', badge: 'bg-emerald-100 text-emerald-700', label: 'L3 — Sub-Sub Category' },
]

const BLANK_ATTR: Attribute = {
  name: '', label: '', type: 'text', required: false, showInReport: true
}

// ─── Attribute Row ────────────────────────────────────────────────────────────

function AttrRow({ attr, onChange, onDelete }: {
  attr: Attribute
  onChange: (a: Attribute) => void
  onDelete: () => void
}) {
  const [optInput, setOptInput] = useState('')

  return (
    <div className="grid grid-cols-12 gap-2 px-3 py-2 items-start border-t border-border/30 bg-card">
      <div className="col-span-1 mt-2 text-muted-foreground"><GripVertical size={13} /></div>

      {/* Field name (slug) */}
      <div className="col-span-2">
        <input
          value={attr.name}
          placeholder="field_name"
          onChange={e => onChange({ ...attr, name: e.target.value.replace(/\s+/g, '_').toLowerCase() })}
          className="h-7 w-full rounded border border-input bg-background px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Display label */}
      <div className="col-span-2">
        <input
          value={attr.label}
          placeholder="Display Label"
          onChange={e => onChange({ ...attr, label: e.target.value })}
          className="h-7 w-full rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Type */}
      <div className="col-span-2">
        <select
          value={attr.type}
          onChange={e => onChange({ ...attr, type: e.target.value as any, options: undefined })}
          className="h-7 w-full rounded border border-input bg-background px-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {ATTR_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {/* Options (only for select type) */}
      <div className="col-span-3">
        {attr.type === 'select' ? (
          <div className="space-y-1">
            <div className="flex flex-wrap gap-1">
              {(attr.options || []).map((opt, i) => (
                <span key={i} className="inline-flex items-center gap-1 bg-muted px-1.5 py-0.5 rounded text-[10px]">
                  {opt}
                  <button onClick={() => onChange({ ...attr, options: attr.options?.filter((_, idx) => idx !== i) })} className="text-muted-foreground hover:text-destructive">
                    <X size={9} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-1">
              <input
                value={optInput}
                placeholder="Add option..."
                onChange={e => setOptInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && optInput.trim()) {
                    onChange({ ...attr, options: [...(attr.options || []), optInput.trim()] })
                    setOptInput('')
                    e.preventDefault()
                  }
                }}
                className="h-6 flex-1 rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                onClick={() => {
                  if (optInput.trim()) {
                    onChange({ ...attr, options: [...(attr.options || []), optInput.trim()] })
                    setOptInput('')
                  }
                }}
                className="px-2 text-xs bg-muted rounded border border-input hover:bg-muted/80"
              >+</button>
            </div>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground italic">—</span>
        )}
      </div>

      {/* Required + In Report */}
      <div className="col-span-1 flex flex-col gap-1 pt-1">
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={attr.required}
            onChange={e => onChange({ ...attr, required: e.target.checked })} className="w-3 h-3" />
          Reqd
        </label>
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={attr.showInReport}
            onChange={e => onChange({ ...attr, showInReport: e.target.checked })} className="w-3 h-3" />
          Report
        </label>
      </div>

      {/* Delete attr */}
      <div className="col-span-1 flex justify-center pt-1">
        <button onClick={onDelete} className="text-muted-foreground hover:text-destructive"><X size={13} /></button>
      </div>
    </div>
  )
}

// ─── Category Form (Create + Edit) ────────────────────────────────────────────

interface FormState {
  name: string
  description: string
  color: string
  trackBatch: boolean
  trackExpiry: boolean
  attributes: Attribute[]
}

interface CategoryFormProps {
  // null = create new, object = edit existing
  editing: Category | null
  // For create: which parent? null = L1 root
  parentCategory: Category | null
  allFlat: Category[]   // flat list for "move to parent" dropdown
  onSave: () => void
  onCancel: () => void
}

function CategoryForm({ editing, parentCategory, allFlat, onSave, onCancel }: CategoryFormProps) {
  const qc = useQueryClient()
  const isEdit = !!editing

  const level = editing
    ? editing.level
    : parentCategory
      ? parentCategory.level + 1
      : 1

  const [form, setForm] = useState<FormState>({
    name: editing?.name || '',
    description: editing?.description || '',
    color: editing?.color || '',
    trackBatch: editing?.trackBatch || false,
    trackExpiry: editing?.trackExpiry || false,
    attributes: editing?.attributes || [],
  })
  const [error, setError] = useState('')

  // Inherited attributes from parent chain (readonly)
  const parentAttrs = parentCategory?.attributes || []

  const addAttr = () => setForm(f => ({ ...f, attributes: [...f.attributes, { ...BLANK_ATTR }] }))
  const updateAttr = (i: number, a: Attribute) => setForm(f => ({ ...f, attributes: f.attributes.map((x, idx) => idx === i ? a : x) }))
  const deleteAttr = (i: number) => setForm(f => ({ ...f, attributes: f.attributes.filter((_, idx) => idx !== i) }))

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        description: form.description || null,
        color: form.color || null,
        trackBatch: form.trackBatch,
        trackExpiry: form.trackExpiry,
        attributes: form.attributes.filter(a => a.name.trim() && a.label.trim()),
        ...(isEdit ? {} : {
          parentId: parentCategory?.id || null,
          level,
        }),
      }
      if (isEdit) {
        await api.put(`/masters/item-categories/${editing!.id}`, payload)
      } else {
        await api.post('/masters/item-categories', payload)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['item-categories'] })
      onSave()
    },
    onError: (e) => setError(extractError(e)),
  })

  const levelStyle = LEVEL_STYLE[level - 1] || LEVEL_STYLE[2]

  return (
    <div className="form-section mb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={cn('text-xs px-2 py-1 rounded font-medium', levelStyle.badge)}>
            {levelStyle.label}
          </span>
          {parentCategory && (
            <span className="text-xs text-muted-foreground">
              under <strong>{parentCategory.name}</strong>
            </span>
          )}
        </div>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
      </div>

      {/* Basic info */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <Input
          label="Category Name *"
          placeholder={level === 1 ? "e.g. Men's Wear, Electronics, Medicines" : level === 2 ? 'e.g. Formal Shirts, Laptops' : 'e.g. White Formal, 15" Laptops'}
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          autoFocus
        />
        <Input
          label="Description"
          placeholder="Optional short description"
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
        />
      </div>

      <div className="flex gap-4 mb-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={form.trackBatch}
            onChange={e => setForm(f => ({ ...f, trackBatch: e.target.checked }))}
            className="w-4 h-4" />
          Track Batch No.
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={form.trackExpiry}
            onChange={e => setForm(f => ({ ...f, trackExpiry: e.target.checked }))}
            className="w-4 h-4" />
          Track Expiry Date
        </label>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Color</label>
          <input type="color" value={form.color || '#6366f1'}
            onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
            className="w-8 h-8 rounded border border-input cursor-pointer" />
        </div>
      </div>

      {/* Attributes section */}
      <div className="border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-3 py-2.5 bg-muted/40 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold">Item Attributes</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                These fields appear on items in <strong>{form.name || 'this category'}</strong>
                {level < 3 && ' and all its sub-categories'}
              </p>
            </div>
          </div>

          {/* Inherited attrs notice */}
          {parentAttrs.length > 0 && (
            <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
              <span className="font-medium">Inherited from parent:</span>{' '}
              {parentAttrs.map(a => a.label).join(', ')} — these are automatically applied, no need to re-add.
            </div>
          )}
        </div>

        {/* Column headers */}
        {form.attributes.length > 0 && (
          <div className="bg-muted px-3 py-1.5 grid grid-cols-12 gap-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wide border-b border-border">
            <div className="col-span-1" />
            <div className="col-span-2">Field Name</div>
            <div className="col-span-2">Label</div>
            <div className="col-span-2">Type</div>
            <div className="col-span-3">Options (for dropdown)</div>
            <div className="col-span-1">Flags</div>
            <div className="col-span-1" />
          </div>
        )}

        {form.attributes.map((attr, i) => (
          <AttrRow
            key={i}
            attr={attr}
            onChange={a => updateAttr(i, a)}
            onDelete={() => deleteAttr(i)}
          />
        ))}

        <div className="px-3 py-2 border-t border-border/30">
          <button onClick={addAttr}
            className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 font-medium">
            <Plus size={12} /> Add Attribute
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive mb-3">{error}</p>}

      <div className="flex gap-2">
        <Button onClick={() => {
          if (!form.name.trim()) { setError('Category name is required'); return }
          setError('')
          saveMut.mutate()
        }} loading={saveMut.isPending} size="sm">
          <Check size={14} /> {isEdit ? 'Update Category' : 'Create Category'}
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

// ─── Delete confirm (inline, no modal) ───────────────────────────────────────

function DeleteCategoryButton({ cat, onDeleted }: { cat: Category; onDeleted: () => void }) {
  const qc = useQueryClient()
  const [confirm, setConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const canDelete = cat._count.items === 0 && cat._count.children === 0

  if (!canDelete) {
    const reason = cat._count.children > 0
      ? `Has ${cat._count.children} sub-categor${cat._count.children > 1 ? 'ies' : 'y'} — delete them first`
      : `${cat._count.items} item(s) use this category — reassign items first`
    return (
      <button title={reason} disabled className="opacity-30 cursor-not-allowed p-1 rounded">
        <Trash2 size={13} className="text-muted-foreground" />
      </button>
    )
  }

  if (confirm) {
    return (
      <div className="flex items-center gap-1 bg-destructive/10 border border-destructive/20 rounded px-2 py-1">
        <span className="text-[10px] text-destructive font-medium">Delete?</span>
        <button onClick={async () => {
          setLoading(true)
          setError('')
          try {
            await api.delete(`/masters/item-categories/${cat.id}`)
            qc.invalidateQueries({ queryKey: ['item-categories'] })
            onDeleted()
          } catch (e) {
            setError(extractError(e))
            setConfirm(false)
          } finally {
            setLoading(false)
          }
        }} disabled={loading}
          className="text-destructive hover:text-destructive/80 font-medium text-[10px]">
          {loading ? '...' : 'Yes'}
        </button>
        <button onClick={() => setConfirm(false)} className="text-muted-foreground hover:text-foreground text-[10px]">No</button>
        {error && <span className="text-[10px] text-destructive">{error}</span>}
      </div>
    )
  }

  return (
    <button onClick={() => setConfirm(true)} title="Delete category"
      className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
      <Trash2 size={13} />
    </button>
  )
}

// ─── Category Card ────────────────────────────────────────────────────────────

function CategoryCard({
  cat,
  allFlat,
  onEditDone,
}: {
  cat: Category
  allFlat: Category[]
  onEditDone: () => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [editing, setEditing] = useState(false)
  const [addingChild, setAddingChild] = useState(false)

  const levelStyle = LEVEL_STYLE[cat.level - 1] || LEVEL_STYLE[2]
  const hasChildren = cat.children && cat.children.length > 0
  const canAddChild = cat.level < 3

  const attrs: Attribute[] = cat.attributes || []

  if (editing) {
    return (
      <CategoryForm
        editing={cat}
        parentCategory={allFlat.find(c => c.id === cat.parentId) || null}
        allFlat={allFlat}
        onSave={() => { setEditing(false); onEditDone() }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <div className={cn('border rounded-xl overflow-hidden mb-2', levelStyle.border)}>
      {/* Header row */}
      <div className={cn('flex items-center gap-2 px-3 py-2.5', levelStyle.bg)}>
        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-muted-foreground hover:text-foreground flex-shrink-0"
        >
          {hasChildren
            ? (expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />)
            : <span className="w-[15px]" />}
        </button>

        {/* Folder icon */}
        {hasChildren
          ? <FolderOpen size={15} className={levelStyle.text} />
          : <Folder size={15} className={levelStyle.text} />}

        {/* Name */}
        <span className={cn('font-medium text-sm flex-1', levelStyle.text)}>{cat.name}</span>

        {/* Attributes summary */}
        {attrs.length > 0 && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <Tag size={11} className="text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">
              {attrs.map(a => a.label).join(', ')}
            </span>
          </div>
        )}

        {/* Counts */}
        {cat._count.items > 0 && (
          <Badge variant="secondary" className="text-[10px] flex-shrink-0">
            <Package size={9} className="mr-0.5" />{cat._count.items} items
          </Badge>
        )}

        {/* Batch/expiry badges */}
        {cat.trackBatch && <Badge variant="outline" className="text-[9px] flex-shrink-0">Batch</Badge>}
        {cat.trackExpiry && <Badge variant="outline" className="text-[9px] flex-shrink-0">Expiry</Badge>}

        {/* Actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ opacity: 1 }}>
          {canAddChild && (
            <button
              onClick={() => setAddingChild(a => !a)}
              title={`Add L${cat.level + 1} sub-category`}
              className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
              <Plus size={13} />
            </button>
          )}
          <button
            onClick={() => setEditing(true)}
            title="Edit category"
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <Edit size={13} />
          </button>
          <DeleteCategoryButton cat={cat} onDeleted={onEditDone} />
        </div>
      </div>

      {/* Add child form */}
      {addingChild && (
        <div className="px-3 pt-3 pb-1 bg-card border-t border-border">
          <CategoryForm
            editing={null}
            parentCategory={cat}
            allFlat={allFlat}
            onSave={() => { setAddingChild(false); onEditDone() }}
            onCancel={() => setAddingChild(false)}
          />
        </div>
      )}

      {/* Children */}
      {expanded && hasChildren && (
        <div className="pl-6 pr-2 py-2 bg-card border-t border-border/30 space-y-1">
          {cat.children.map(child => (
            <CategoryCard
              key={child.id}
              cat={child}
              allFlat={allFlat}
              onEditDone={onEditDone}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ItemCategoriesPage() {
  const qc = useQueryClient()
  const [showNewRoot, setShowNewRoot] = useState(false)

  const { data: treeData = [], isLoading } = useQuery<Category[]>({
    queryKey: ['item-categories'],
    queryFn: () => api.get('/masters/item-categories').then(r => r.data.data),
  })

  // Flat list for parent picker
  const { data: flatData = [] } = useQuery<Category[]>({
    queryKey: ['item-categories', 'flat'],
    queryFn: () => api.get('/masters/item-categories?flat=1').then(r => r.data.data),
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['item-categories'] })
    setShowNewRoot(false)
  }

  const totalCount = flatData.length

  return (
    <div>
      <PageHeader
        title="Item Categories"
        subtitle={`${totalCount} categor${totalCount !== 1 ? 'ies' : 'y'} — up to 3 levels`}
        breadcrumbs={[{ label: 'Masters' }, { label: 'Item Categories' }]}
        actions={
          <Button size="sm" onClick={() => setShowNewRoot(s => !s)}>
            <Plus size={14} /> New Category
          </Button>
        }
      />

      {/* Concept explainer */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 flex gap-2">
        <Info size={14} className="shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold">3-Level Hierarchy: </span>
          <span className="font-medium text-blue-700">L1 Main</span>
          <ChevronRight size={10} className="inline mx-1" />
          <span className="font-medium text-purple-700">L2 Sub-Category</span>
          <ChevronRight size={10} className="inline mx-1" />
          <span className="font-medium text-emerald-700">L3 Sub-Sub-Category</span>
          {' '}— Items are assigned to any level. Attributes set on a category automatically apply to all items in that category and its children.
          {' '}Example: set <em>Color</em> & <em>Size</em> on "Formal Shirts" → all items under it get those fields.
        </div>
      </div>

      {/* New root category form */}
      {showNewRoot && (
        <CategoryForm
          editing={null}
          parentCategory={null}
          allFlat={flatData}
          onSave={refresh}
          onCancel={() => setShowNewRoot(false)}
        />
      )}

      {/* Category tree */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : treeData.length === 0 && !showNewRoot ? (
        <div className="text-center py-16 border-2 border-dashed border-border rounded-xl">
          <Layers size={40} className="mx-auto text-muted-foreground mb-3" />
          <h3 className="text-sm font-semibold mb-1">No categories yet</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Create your first main category (L1) — e.g. Men's Wear, Electronics, Medicines
          </p>
          <Button size="sm" onClick={() => setShowNewRoot(true)}>
            <Plus size={14} /> Create First Category
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {treeData.map(cat => (
            <CategoryCard
              key={cat.id}
              cat={cat}
              allFlat={flatData}
              onEditDone={() => qc.invalidateQueries({ queryKey: ['item-categories'] })}
            />
          ))}
        </div>
      )}
    </div>
  )
}
