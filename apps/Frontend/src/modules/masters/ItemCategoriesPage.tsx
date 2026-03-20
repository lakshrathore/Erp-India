import { useState } from 'react'
import { Plus, Trash2, GripVertical, Tag, Edit, Check, X } from 'lucide-react'
import { useItemCategories, useCreateItemCategory } from '../../hooks/api.hooks'
import { Button, Input, Select, Badge, PageHeader, Card, CardContent, EmptyState, Spinner } from '../../components/ui'
import { extractError } from '../../lib/api'
import { api } from '../../lib/api'
import { useQueryClient } from '@tanstack/react-query'

interface Attribute {
  name: string
  label: string
  type: 'text' | 'number' | 'date' | 'select' | 'boolean'
  options?: string[]
  required: boolean
  showInReport: boolean
}

const ATTR_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown (Select)' },
  { value: 'boolean', label: 'Yes/No (Boolean)' },
]

const PRESET_CATEGORIES = [
  {
    name: 'Garments / Textiles',
    trackBatch: false,
    attributes: [
      { name: 'color', label: 'Color', type: 'text', required: false, showInReport: true },
      { name: 'size', label: 'Size', type: 'select', options: ['XS','S','M','L','XL','XXL','XXXL'], required: false, showInReport: true },
      { name: 'fabric', label: 'Fabric', type: 'text', required: false, showInReport: false },
    ],
  },
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
    name: 'Electronics',
    trackBatch: false,
    attributes: [
      { name: 'serial_no', label: 'Serial No', type: 'text', required: false, showInReport: true },
      { name: 'warranty_months', label: 'Warranty (months)', type: 'number', required: false, showInReport: false },
      { name: 'color', label: 'Color', type: 'text', required: false, showInReport: false },
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
      { name: 'weight_gm', label: 'Weight (gm)', type: 'number', required: false, showInReport: true },
    ],
  },
]

function AttributeRow({ attr, index, onChange, onDelete }: {
  attr: Attribute; index: number
  onChange: (i: number, a: Attribute) => void
  onDelete: (i: number) => void
}) {
  const [optionsInput, setOptionsInput] = useState(attr.options?.join(', ') || '')

  return (
    <div className="grid grid-cols-12 gap-2 items-start py-2 border-b border-border/50 last:border-0">
      <div className="col-span-1 flex items-center justify-center pt-2 text-muted-foreground">
        <GripVertical size={14} />
      </div>
      <div className="col-span-2">
        <Input placeholder="field_name" value={attr.name}
          onChange={e => onChange(index, { ...attr, name: e.target.value.toLowerCase().replace(/\s/g, '_') })}
          className="text-xs font-mono" />
      </div>
      <div className="col-span-2">
        <Input placeholder="Display Label" value={attr.label}
          onChange={e => onChange(index, { ...attr, label: e.target.value })}
          className="text-xs" />
      </div>
      <div className="col-span-2">
        <Select options={ATTR_TYPES} value={attr.type}
          onChange={e => onChange(index, { ...attr, type: e.target.value as any, options: [] })}
          className="text-xs" />
      </div>
      <div className="col-span-3">
        {attr.type === 'select' ? (
          <Input placeholder="Option1, Option2, Option3" value={optionsInput}
            onChange={e => {
              setOptionsInput(e.target.value)
              onChange(index, { ...attr, options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })
            }}
            className="text-xs" />
        ) : (
          <span className="text-xs text-muted-foreground pt-2 block">—</span>
        )}
      </div>
      <div className="col-span-1 flex items-center gap-1 pt-1.5">
        <button type="button"
          onClick={() => onChange(index, { ...attr, required: !attr.required })}
          className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${attr.required ? 'bg-destructive/10 text-destructive border-destructive/30' : 'border-border text-muted-foreground hover:border-primary'}`}
          title="Required field">
          {attr.required ? 'Req' : 'Opt'}
        </button>
      </div>
      <div className="col-span-1 flex items-center pt-1.5">
        <button type="button" onClick={() => onDelete(index)}
          className="text-muted-foreground hover:text-destructive transition-colors">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

export default function ItemCategoriesPage() {
  const qc = useQueryClient()
  const { data: categories = [], isLoading } = useItemCategories()
  const createCategory = useCreateItemCategory()

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [trackBatch, setTrackBatch] = useState(false)
  const [trackExpiry, setTrackExpiry] = useState(false)
  const [attributes, setAttributes] = useState<Attribute[]>([])
  const [saveError, setSaveError] = useState('')

  const addAttribute = () => {
    setAttributes(prev => [...prev, {
      name: `attr${prev.length + 1}`,
      label: `Attribute ${prev.length + 1}`,
      type: 'text',
      required: false,
      showInReport: true,
    }])
  }

  const updateAttribute = (i: number, a: Attribute) => {
    setAttributes(prev => prev.map((x, idx) => idx === i ? a : x))
  }

  const deleteAttribute = (i: number) => {
    setAttributes(prev => prev.filter((_, idx) => idx !== i))
  }

  const applyPreset = (preset: typeof PRESET_CATEGORIES[0]) => {
    setName(preset.name)
    setTrackBatch(preset.trackBatch)
    setTrackExpiry(!!(preset as any).trackExpiry)
    setAttributes(preset.attributes as Attribute[])
  }

  const handleSave = async () => {
    setSaveError('')
    if (!name.trim()) { setSaveError('Category name is required'); return }
    try {
      await createCategory.mutateAsync({ name, trackBatch, trackExpiry, attributes })
      setShowForm(false)
      setName(''); setTrackBatch(false); setTrackExpiry(false); setAttributes([])
    } catch (e) {
      setSaveError(extractError(e))
    }
  }

  return (
    <div>
      <PageHeader
        title="Item Categories"
        subtitle="Define dynamic attributes per category"
        breadcrumbs={[{ label: 'Masters' }, { label: 'Item Categories' }]}
        actions={
          <Button onClick={() => setShowForm(s => !s)}>
            <Plus size={15} /> New Category
          </Button>
        }
      />

      {/* New category form */}
      {showForm && (
        <div className="form-section mb-4">
          <h3 className="form-section-title">New Category</h3>

          {/* Presets */}
          <div className="mb-4">
            <p className="text-xs text-muted-foreground mb-2">Quick presets:</p>
            <div className="flex flex-wrap gap-2">
              {PRESET_CATEGORIES.map(p => (
                <button key={p.name} type="button" onClick={() => applyPreset(p)}
                  className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary hover:text-primary transition-colors">
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="col-span-2">
              <Input label="Category Name" required placeholder="e.g. Textiles, Pharmaceuticals"
                value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2 pt-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={trackBatch} onChange={e => setTrackBatch(e.target.checked)} className="w-4 h-4" />
                Track Batch
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={trackExpiry} onChange={e => setTrackExpiry(e.target.checked)} className="w-4 h-4" />
                Track Expiry
              </label>
            </div>
          </div>

          {/* Attribute builder */}
          <div className="border border-border rounded-lg overflow-hidden mb-4">
            <div className="bg-muted px-4 py-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Dynamic Attributes ({attributes.length})
              </span>
              <Button variant="ghost" size="sm" onClick={addAttribute}>
                <Plus size={13} /> Add Attribute
              </Button>
            </div>

            {attributes.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                No attributes defined. Click "Add Attribute" or use a preset.
              </div>
            ) : (
              <div className="p-3">
                <div className="grid grid-cols-12 gap-2 mb-1 px-1">
                  {['', 'Field Name', 'Label', 'Type', 'Options', 'Req', ''].map((h, i) => (
                    <div key={i} className={`text-[10px] uppercase tracking-wide text-muted-foreground font-medium ${i === 0 ? 'col-span-1' : i === 4 ? 'col-span-3' : i === 5 ? 'col-span-1' : i === 6 ? 'col-span-1' : 'col-span-2'}`}>{h}</div>
                  ))}
                </div>
                {attributes.map((attr, i) => (
                  <AttributeRow key={i} attr={attr} index={i}
                    onChange={updateAttribute} onDelete={deleteAttribute} />
                ))}
              </div>
            )}
          </div>

          {saveError && (
            <div className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2 mb-3">{saveError}</div>
          )}

          <div className="flex gap-2">
            <Button onClick={handleSave} loading={createCategory.isPending}>
              <Check size={15} /> Save Category
            </Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setSaveError('') }}>
              <X size={15} /> Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Existing categories */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : categories.length === 0 && !showForm ? (
        <EmptyState
          icon={<Tag size={40} />}
          title="No categories yet"
          description="Create categories to enable dynamic attributes on items"
          action={<Button onClick={() => setShowForm(true)}><Plus size={15} /> New Category</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((cat: any) => {
            const attrs = (cat.attributes || []) as Attribute[]
            return (
              <Card key={cat.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-medium text-sm text-foreground">{cat.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {cat._count?.items || 0} items
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {cat.trackBatch && <Badge variant="info" className="text-[10px]">Batch</Badge>}
                      {cat.trackExpiry && <Badge variant="warning" className="text-[10px]">Expiry</Badge>}
                    </div>
                  </div>
                  {attrs.length > 0 ? (
                    <div className="space-y-1">
                      {attrs.map(a => (
                        <div key={a.name} className="flex items-center justify-between text-xs">
                          <span className="font-mono text-muted-foreground">{a.name}</span>
                          <div className="flex items-center gap-1">
                            <Badge variant="secondary" className="text-[10px]">{a.type}</Badge>
                            {a.required && <Badge variant="destructive" className="text-[10px]">req</Badge>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No dynamic attributes</p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
