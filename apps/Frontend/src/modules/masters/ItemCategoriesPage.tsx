import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Trash2, Tag, Edit, ChevronRight, ChevronDown,
  Package, Info, GripVertical, FolderOpen, Folder,
  FolderTree, X, Check, Layers, Settings2,
} from 'lucide-react'
import { api, extractError } from '../../lib/api'
import { Button, Input, Badge, PageHeader, Spinner } from '../../components/ui'
import { SafeDeleteButton } from '../../components/ui/SafeDeleteButton'
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
  sortOrder: number
  color: string | null
  icon: string | null
  description: string | null
  attributes: Attribute[]
  trackBatch: boolean
  trackExpiry: boolean
  children: Category[]
  _count: { items: number; children: number }
}

const ATTR_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown' },
  { value: 'boolean', label: 'Yes/No' },
]

const LEVEL_COLORS = [
  { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500' },
  { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', dot: 'bg-purple-500' },
  { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
]

const PRESET_TEMPLATES: Array<{
  name: string
  description: string
  levels: Array<{
    name: string
    examples: string[]
  }>
  leafAttributes: Attribute[]
  trackBatch?: boolean
  trackExpiry?: boolean
}> = [
  {
    name: 'Retail / Garments',
    description: '3 levels: Type → Brand → Style',
    levels: [
      { name: 'Type', examples: ['Men\'s Wear', 'Women\'s Wear', 'Kids'] },
      { name: 'Brand', examples: ['Arrow', 'Raymond', 'Mufti'] },
      { name: 'Style', examples: ['Formal Shirts', 'Casual T-Shirts'] },
    ],
    leafAttributes: [
      { name: 'color', label: 'Color', type: 'text', required: false, showInReport: true },
      { name: 'size', label: 'Size', type: 'select', options: ['XS','S','M','L','XL','XXL','XXXL'], required: true, showInReport: true },
      { name: 'fabric', label: 'Fabric', type: 'text', required: false, showInReport: false },
    ],
  },
  {
    name: 'Pharmaceuticals',
    description: '2 levels: Therapeutic Class → Drug Type',
    levels: [
      { name: 'Therapeutic Class', examples: ['Antibiotics', 'Analgesics', 'Vitamins'] },
      { name: 'Drug Type', examples: ['Tablets', 'Syrups', 'Injections'] },
    ],
    leafAttributes: [
      { name: 'batch_no', label: 'Batch No', type: 'text', required: true, showInReport: true },
      { name: 'mfg_date', label: 'Mfg Date', type: 'date', required: true, showInReport: true },
      { name: 'exp_date', label: 'Exp Date', type: 'date', required: true, showInReport: true },
    ],
    trackBatch: true,
    trackExpiry: true,
  },
  {
    name: 'Electronics',
    description: '2 levels: Category → Sub-Category',
    levels: [
      { name: 'Category', examples: ['Mobile Phones', 'Laptops', 'Accessories'] },
      { name: 'Sub-Category', examples: ['Android', 'iPhone', 'Chargers'] },
    ],
    leafAttributes: [
      { name: 'brand', label: 'Brand', type: 'text', required: false, showInReport: true },
      { name: 'model_no', label: 'Model No', type: 'text', required: false, showInReport: true },
      { name: 'serial_no', label: 'Serial No', type: 'text', required: false, showInReport: false },
      { name: 'warranty_months', label: 'Warranty (months)', type: 'number', required: false, showInReport: false },
    ],
  },
  {
    name: 'FMCG / Grocery',
    description: '2 levels: Department → Category',
    levels: [
      { name: 'Department', examples: ['Beverages', 'Personal Care', 'Dairy'] },
      { name: 'Category', examples: ['Cold Drinks', 'Juices', 'Shampoo'] },
    ],
    leafAttributes: [
      { name: 'batch_no', label: 'Batch No', type: 'text', required: true, showInReport: true },
      { name: 'exp_date', label: 'Expiry Date', type: 'date', required: true, showInReport: true },
    ],
    trackBatch: true,
    trackExpiry: true,
  },
  {
    name: 'Jewellery',
    description: '2 levels: Metal Type → Jewellery Type',
    levels: [
      { name: 'Metal', examples: ['Gold', 'Silver', 'Diamond'] },
      { name: 'Jewellery Type', examples: ['Rings', 'Necklaces', 'Earrings'] },
    ],
    leafAttributes: [
      { name: 'purity', label: 'Purity (e.g. 22K)', type: 'text', required: true, showInReport: true },
      { name: 'weight_gm', label: 'Weight (gm)', type: 'number', required: true, showInReport: true },
      { name: 'hallmark', label: 'Hallmark No', type: 'text', required: false, showInReport: false },
    ],
  },
  {
    name: 'Simple (1 level)',
    description: 'Just flat categories, no sub-levels',
    levels: [
      { name: 'Category', examples: ['Stationery', 'Hardware', 'Spare Parts'] },
    ],
    leafAttributes: [],
  },
]

// ─── Attribute Row ────────────────────────────────────────────────────────────

function AttrRow({ attr, index, onChange, onDelete }: {
  attr: Attribute
  index: number
  onChange: (i: number, a: Attribute) => void
  onDelete: (i: number) => void
}) {
  const [optInput, setOptInput] = useState(attr.options?.join(', ') || '')

  return (
    <div className="grid grid-cols-12 gap-1.5 items-start py-2 border-b border-border/30 last:border-0">
      <div className="col-span-1 flex items-center pt-2">
        <GripVertical size={13} className="text-muted-foreground cursor-grab" />
        <span className="text-xs text-muted-foreground ml-0.5">{index + 1}</span>
      </div>
      {/* Field key */}
      <div className="col-span-2">
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
          onChange={e => onChange(index, { ...attr, type: e.target.value as Attribute['type'] })}
          className="h-7 w-full rounded border border-input bg-background px-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {ATTR_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      {/* Options */}
      <div className="col-span-2">
        {attr.type === 'select' ? (
          <input
            value={optInput}
            onChange={e => {
              setOptInput(e.target.value)
              onChange(index, { ...attr, options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })
            }}
            placeholder="A, B, C"
            className="h-7 w-full rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
        ) : <span className="text-xs text-muted-foreground px-1">—</span>}
      </div>
      {/* Required + Report toggles */}
      <div className="col-span-1 flex flex-col gap-1 items-center pt-1">
        <button
          type="button"
          onClick={() => onChange(index, { ...attr, required: !attr.required })}
          title={attr.required ? 'Required: ON' : 'Required: OFF'}
          className={cn('w-5 h-5 rounded text-xs font-bold transition-colors',
            attr.required ? 'bg-red-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80')}
        >R</button>
        <button
          type="button"
          onClick={() => onChange(index, { ...attr, showInReport: !attr.showInReport })}
          title={attr.showInReport ? 'Show in report: ON' : 'Show in report: OFF'}
          className={cn('w-5 h-5 rounded text-xs font-bold transition-colors',
            attr.showInReport ? 'bg-blue-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80')}
        >S</button>
      </div>
      {/* Delete */}
      <div className="col-span-1 flex items-center justify-center pt-1">
        <button type="button" onClick={() => onDelete(index)}
          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
          <X size={13} />
        </button>
      </div>
    </div>
  )
}

// ─── Category Form (Create / Edit) ───────────────────────────────────────────

interface FormState {
  name: string
  parentId: string | null
  description: string
  color: string
  attributes: Attribute[]
  trackBatch: boolean
  trackExpiry: boolean
}

function blankForm(parentId: string | null = null): FormState {
  return { name: '', parentId, description: '', color: '', attributes: [], trackBatch: false, trackExpiry: false }
}

function CategoryForm({
  initial,
  allCats,
  parentCategory,
  onSave,
  onCancel,
  saving,
}: {
  initial: FormState
  allCats: Category[]
  parentCategory: Category | null
  onSave: (f: FormState) => void
  onCancel: () => void
  saving: boolean
}) {
  const [form, setForm] = useState<FormState>(initial)

  const set = (patch: Partial<FormState>) => setForm(f => ({ ...f, ...patch }))

  const addAttr = () => set({
    attributes: [...form.attributes, { name: '', label: '', type: 'text', required: false, showInReport: true }]
  })

  const changeAttr = (i: number, a: Attribute) => {
    const attrs = [...form.attributes]; attrs[i] = a; set({ attributes: attrs })
  }

  const deleteAttr = (i: number) => set({ attributes: form.attributes.filter((_, idx) => idx !== i) })

  // Available parents: can only place this under root (level 1) or sub (level 2) — not level 3
  const availableParents = allCats.filter(c => c.level < 3)

  const parentLevel = parentCategory?.level ?? 0
  const newLevel = parentLevel + 1

  const levelInfo = LEVEL_COLORS[newLevel - 1] || LEVEL_COLORS[0]

  return (
    <div className="space-y-4">
      {/* Level badge */}
      <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium', levelInfo.bg, levelInfo.border, levelInfo.text)}>
        <Layers size={14} />
        <span>
          {newLevel === 1 ? 'Root Category (Level 1)' :
           newLevel === 2 ? `Sub-Category under: ${parentCategory?.name}` :
           `Leaf Category under: ${parentCategory?.name}`}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 md:col-span-1">
          <label className="block text-xs font-medium mb-1">Category Name *</label>
          <Input
            value={form.name}
            onChange={e => set({ name: e.target.value })}
            placeholder="e.g. Men's Wear, Antibiotics..."
            autoFocus
          />
        </div>
        <div className="col-span-2 md:col-span-1">
          <label className="block text-xs font-medium mb-1">Parent Category</label>
          <select
            value={form.parentId || ''}
            onChange={e => set({ parentId: e.target.value || null })}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">— None (Root Level) —</option>
            {availableParents.map(c => (
              <option key={c.id} value={c.id}>
                {'  '.repeat(c.level - 1)}{c.level > 1 ? '└ ' : ''}{c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium mb-1">Description (optional)</label>
          <Input
            value={form.description}
            onChange={e => set({ description: e.target.value })}
            placeholder="Brief description of this category..."
          />
        </div>
      </div>

      {/* Tracking options */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.trackBatch} onChange={e => set({ trackBatch: e.target.checked })}
            className="w-4 h-4 rounded border-gray-300 text-primary" />
          <span className="text-sm">Track Batch No.</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.trackExpiry} onChange={e => set({ trackExpiry: e.target.checked })}
            className="w-4 h-4 rounded border-gray-300 text-primary" />
          <span className="text-sm">Track Expiry Date</span>
        </label>
      </div>

      {/* Attributes section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-sm font-medium">Custom Attributes</p>
            <p className="text-xs text-muted-foreground">Fields shown on items in this category (e.g. Color, Size, Batch No)</p>
          </div>
          <Button variant="outline" size="sm" onClick={addAttr} type="button">
            <Plus size={13} className="mr-1" /> Add Field
          </Button>
        </div>

        {form.attributes.length === 0 ? (
          <div className="text-xs text-muted-foreground py-3 text-center border border-dashed border-border rounded-lg">
            No attributes defined. Items in this category will have no extra fields.
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-12 gap-1.5 px-3 py-1.5 bg-muted/40 text-xs font-medium text-muted-foreground border-b border-border">
              <div className="col-span-1">#</div>
              <div className="col-span-2">Key</div>
              <div className="col-span-3">Label</div>
              <div className="col-span-2">Type</div>
              <div className="col-span-2">Options</div>
              <div className="col-span-1 text-center" title="R = Required, S = Show in Report">R/S</div>
              <div className="col-span-1"></div>
            </div>
            <div className="px-3 divide-y divide-border/20">
              {form.attributes.map((attr, i) => (
                <AttrRow key={i} attr={attr} index={i} onChange={changeAttr} onDelete={deleteAttr} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <Button onClick={() => onSave(form)} disabled={saving || !form.name.trim()}>
          {saving ? <Spinner className="h-4 w-4 mr-1" /> : <Check size={14} className="mr-1" />}
          Save Category
        </Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

// ─── Category Tree Node ───────────────────────────────────────────────────────

function CategoryNode({
  cat,
  allCats,
  depth,
  onEdit,
  onAddChild,
  onDelete,
}: {
  cat: Category
  allCats: Category[]
  depth: number
  onEdit: (c: Category) => void
  onAddChild: (parentId: string) => void
  onDelete: (c: Category) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = cat.children && cat.children.length > 0
  const levelColor = LEVEL_COLORS[depth] || LEVEL_COLORS[0]

  return (
    <div className={cn(depth > 0 && 'ml-6 border-l border-border pl-3')}>
      <div className={cn(
        'group flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-all',
        'hover:shadow-sm',
        depth === 0 ? 'bg-card border-border' :
        depth === 1 ? 'bg-muted/20 border-border/60' :
        'bg-muted/10 border-border/40'
      )}>
        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(e => !e)}
          className={cn('shrink-0 transition-colors', hasChildren ? 'text-muted-foreground hover:text-foreground' : 'opacity-0 pointer-events-none')}
        >
          {expanded
            ? <ChevronDown size={14} />
            : <ChevronRight size={14} />}
        </button>

        {/* Folder icon */}
        <span className={cn('shrink-0', levelColor.text)}>
          {hasChildren
            ? <FolderOpen size={16} />
            : <Folder size={15} className="opacity-70" />}
        </span>

        {/* Name + info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{cat.name}</span>
            <Badge variant="secondary" className={cn('text-xs py-0 px-1.5', levelColor.bg, levelColor.text, levelColor.border)}>
              L{cat.level}
            </Badge>
            {cat.trackBatch && <Badge variant="outline" className="text-xs py-0 px-1.5">Batch</Badge>}
            {cat.trackExpiry && <Badge variant="outline" className="text-xs py-0 px-1.5 text-orange-600">Expiry</Badge>}
            {cat.attributes.length > 0 && (
              <Badge variant="outline" className="text-xs py-0 px-1.5">
                {cat.attributes.length} attr{cat.attributes.length > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          {cat.description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{cat.description}</p>
          )}
        </div>

        {/* Stats */}
        <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground shrink-0">
          {cat._count.children > 0 && <span>{cat._count.children} sub</span>}
          <span className={cn(cat._count.items > 0 ? 'text-foreground font-medium' : '')}>{cat._count.items} items</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {cat.level < 3 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onAddChild(cat.id)}
              title="Add sub-category"
            >
              <Plus size={12} className="mr-1" />Sub
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onEdit(cat)}
            title="Edit"
          >
            <Edit size={13} />
          </Button>
          <SafeDeleteButton
            onDelete={() => onDelete(cat)}
            itemName={cat.name}
            disabled={cat._count.items > 0 || cat._count.children > 0}
            disabledReason={
              cat._count.children > 0
                ? `${cat._count.children} sub-categories exist`
                : `${cat._count.items} items use this category`
            }
          />
        </div>
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div className="mt-1 space-y-1">
          {cat.children.map(child => (
            <CategoryNode
              key={child.id}
              cat={child}
              allCats={allCats}
              depth={depth + 1}
              onEdit={onEdit}
              onAddChild={onAddChild}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Template Picker ──────────────────────────────────────────────────────────

function TemplatePicker({ onSelect, onClose }: { onSelect: (t: typeof PRESET_TEMPLATES[0]) => void; onClose: () => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">Choose a Template</p>
          <p className="text-xs text-muted-foreground">Pick a ready-made structure or build from scratch</p>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors">
          <X size={16} />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {PRESET_TEMPLATES.map(t => (
          <button
            key={t.name}
            onClick={() => onSelect(t)}
            className="text-left p-3 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all group"
          >
            <p className="text-sm font-medium group-hover:text-primary transition-colors">{t.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
            <div className="flex flex-wrap gap-1 mt-2">
              {t.levels.map((l, i) => (
                <span key={i} className={cn('text-xs px-1.5 py-0.5 rounded-full border',
                  i === 0 ? 'bg-blue-50 border-blue-200 text-blue-700' :
                  i === 1 ? 'bg-purple-50 border-purple-200 text-purple-700' :
                  'bg-emerald-50 border-emerald-200 text-emerald-700'
                )}>
                  L{i+1}: {l.name}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ItemCategoriesPage() {
  const qc = useQueryClient()
  const [panel, setPanel] = useState<'none' | 'form' | 'templates'>('none')
  const [editingCat, setEditingCat] = useState<Category | null>(null)
  const [formInit, setFormInit] = useState<FormState>(blankForm())
  const [err, setErr] = useState('')

  // Fetch tree
  const { data: treeData, isLoading } = useQuery<Category[]>({
    queryKey: ['item-categories'],
    queryFn: () => api.get('/masters/item-categories').then(r => r.data.data),
  })

  // Fetch flat (for parent dropdown)
  const { data: flatData } = useQuery<Category[]>({
    queryKey: ['item-categories', 'flat'],
    queryFn: () => api.get('/masters/item-categories?flat=1').then(r => r.data.data),
  })

  const tree: Category[] = treeData || []
  const flat: Category[] = flatData || []

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['item-categories'] })
  }

  const createMut = useMutation({
    mutationFn: (data: FormState) => api.post('/masters/item-categories', data),
    onSuccess: () => { invalidate(); closePanel() },
    onError: e => setErr(extractError(e)),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<FormState> }) =>
      api.put(`/masters/item-categories/${id}`, data),
    onSuccess: () => { invalidate(); closePanel() },
    onError: e => setErr(extractError(e)),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/masters/item-categories/${id}`),
    onSuccess: () => invalidate(),
    onError: e => setErr(extractError(e)),
  })

  const openCreate = (parentId: string | null = null) => {
    setEditingCat(null)
    setFormInit(blankForm(parentId))
    setErr('')
    setPanel('form')
  }

  const openEdit = (cat: Category) => {
    setEditingCat(cat)
    setFormInit({
      name: cat.name,
      parentId: cat.parentId,
      description: cat.description || '',
      color: cat.color || '',
      attributes: cat.attributes || [],
      trackBatch: cat.trackBatch,
      trackExpiry: cat.trackExpiry,
    })
    setErr('')
    setPanel('form')
  }

  const closePanel = () => {
    setPanel('none')
    setEditingCat(null)
    setErr('')
  }

  const handleSave = (f: FormState) => {
    if (editingCat) {
      updateMut.mutate({ id: editingCat.id, data: f })
    } else {
      createMut.mutate(f)
    }
  }

  const handleDelete = (cat: Category) => {
    deleteMut.mutate(cat.id)
  }

  const handleTemplate = (t: typeof PRESET_TEMPLATES[0]) => {
    // Just open the form with the leaf attributes pre-filled as a starting point
    setEditingCat(null)
    setFormInit({
      name: '',
      parentId: null,
      description: `${t.name} — ${t.description}`,
      color: '',
      attributes: t.leafAttributes,
      trackBatch: t.trackBatch || false,
      trackExpiry: t.trackExpiry || false,
    })
    setErr('')
    setPanel('form')
  }

  const saving = createMut.isPending || updateMut.isPending

  // Count total categories
  const totalCount = flat.length

  return (
    <div className="space-y-4">
      <PageHeader
        title="Item Categories"
        subtitle={`${totalCount} categor${totalCount !== 1 ? 'ies' : 'y'} — up to 3 levels deep`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPanel(p => p === 'templates' ? 'none' : 'templates')}>
              <Settings2 size={14} className="mr-1.5" /> Templates
            </Button>
            <Button size="sm" onClick={() => openCreate(null)}>
              <Plus size={14} className="mr-1.5" /> New Category
            </Button>
          </div>
        }
      />

      {/* How hierarchy works — info bar */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs">
        <Info size={14} className="shrink-0 mt-0.5" />
        <div>
          <span className="font-medium">Hierarchy System: </span>
          You can create up to <strong>3 levels</strong> of categories.
          {' '}Example: <strong>Men's Wear</strong> (L1) → <strong>Formal Shirts</strong> (L2) → <strong>White Formal</strong> (L3).
          {' '}Items are assigned to any level. Custom attributes (Color, Size, Batch No, etc.) can be set per category.
        </div>
      </div>

      {/* Side panel */}
      {panel !== 'none' && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          {panel === 'templates' ? (
            <TemplatePicker
              onSelect={handleTemplate}
              onClose={() => setPanel('none')}
            />
          ) : (
            <>
              <h3 className="font-semibold text-sm mb-3">
                {editingCat ? `Edit: ${editingCat.name}` : 'Create New Category'}
              </h3>
              {err && (
                <div className="mb-3 p-2 rounded-lg bg-destructive/10 text-destructive text-xs border border-destructive/20">
                  {err}
                </div>
              )}
              <CategoryForm
                initial={formInit}
                allCats={flat}
                parentCategory={formInit.parentId ? flat.find(c => c.id === formInit.parentId) || null : null}
                onSave={handleSave}
                onCancel={closePanel}
                saving={saving}
              />
            </>
          )}
        </div>
      )}

      {/* Tree */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : tree.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl">
          <FolderTree size={36} className="mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No categories yet</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">Create your first category or pick a template to get started</p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" size="sm" onClick={() => setPanel('templates')}>
              <Settings2 size={13} className="mr-1" /> Use Template
            </Button>
            <Button size="sm" onClick={() => openCreate(null)}>
              <Plus size={13} className="mr-1" /> Create Category
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Level legend */}
          <div className="flex items-center gap-3 pb-1">
            {LEVEL_COLORS.map((c, i) => (
              <div key={i} className={cn('flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border', c.bg, c.border, c.text)}>
                <span className={cn('w-2 h-2 rounded-full', c.dot)} />
                Level {i + 1}
              </div>
            ))}
          </div>

          {tree.map(cat => (
            <CategoryNode
              key={cat.id}
              cat={cat}
              allCats={flat}
              depth={0}
              onEdit={openEdit}
              onAddChild={parentId => openCreate(parentId)}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
