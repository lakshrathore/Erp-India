import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Save, ArrowLeft, Plus, Trash2, AlertCircle, Tag } from 'lucide-react'
import { useItem, useCreateItem, useUpdateItem, useItemCategories } from '../../hooks/api.hooks'
import { Button, Input, Select, Textarea, PageHeader, Badge } from '../../components/ui'
import { extractError } from '../../lib/api'

const itemSchema = z.object({
  name: z.string().min(2, 'Name required'),
  code: z.string().optional(),
  categoryId: z.string().optional(),
  description: z.string().optional(),
  unit: z.string().default('PCS'),
  alternateUnit: z.string().optional(),
  conversionFactor: z.coerce.number().optional(),
  hsnCode: z.string().optional(),
  sacCode: z.string().optional(),
  gstRate: z.coerce.number().min(0).max(100).default(18),
  cessRate: z.coerce.number().default(0),
  taxType: z.enum(['CGST_SGST', 'IGST', 'EXEMPT', 'NIL_RATED', 'NON_GST']).default('CGST_SGST'),
  purchaseRate: z.coerce.number().default(0),
  saleRate: z.coerce.number().default(0),
  mrp: z.coerce.number().default(0),
  maintainStock: z.boolean().default(true),
  reorderLevel: z.coerce.number().default(0),
  reorderQty: z.coerce.number().default(0),
  minSaleQty: z.coerce.number().default(1),
})

type ItemForm = z.infer<typeof itemSchema>

const UNITS = ['PCS', 'KG', 'GM', 'LTR', 'ML', 'MTR', 'CM', 'BOX', 'BAG', 'PKT', 'SET', 'PAIR', 'DOZ', 'NOS', 'SQM', 'CFT']
const GST_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 9, 12, 14, 18, 28]
const TAX_TYPES = [
  { value: 'CGST_SGST', label: 'CGST + SGST (Intra-state)' },
  { value: 'IGST', label: 'IGST (Inter-state)' },
  { value: 'EXEMPT', label: 'Exempt' },
  { value: 'NIL_RATED', label: 'Nil Rated' },
  { value: 'NON_GST', label: 'Non-GST Supply' },
]

export default function ItemFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id && id !== 'new'
  const [saveError, setSaveError] = useState('')

  const { data: item, isLoading } = useItem(isEdit ? id : '')
  const { data: categories = [] } = useItemCategories()
  const createItem = useCreateItem()
  const updateItem = useUpdateItem(id || '')

  const form = useForm<ItemForm>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      taxType: 'CGST_SGST', gstRate: 18, cessRate: 0,
      purchaseRate: 0, saleRate: 0, mrp: 0,
      unit: 'PCS', maintainStock: true,
      reorderLevel: 0, reorderQty: 0, minSaleQty: 1,
    },
  })

  useEffect(() => {
    if (item && isEdit) {
      form.reset({
        name: item.name,
        code: item.code || '',
        categoryId: item.categoryId || '',
        description: item.description || '',
        unit: item.unit,
        alternateUnit: item.alternateUnit || '',
        conversionFactor: item.conversionFactor || undefined,
        hsnCode: item.hsnCode || '',
        sacCode: item.sacCode || '',
        gstRate: Number(item.gstRate),
        cessRate: Number(item.cessRate),
        taxType: item.taxType,
        purchaseRate: Number(item.purchaseRate),
        saleRate: Number(item.saleRate),
        mrp: Number(item.mrp),
        maintainStock: item.maintainStock,
        reorderLevel: Number(item.reorderLevel),
        reorderQty: Number(item.reorderQty),
        minSaleQty: Number(item.minSaleQty),
      })
    }
  }, [item, isEdit])

  const selectedCategoryId = form.watch('categoryId')
  const selectedCategory = categories.find((c: any) => c.id === selectedCategoryId)
  const categoryAttributes = selectedCategory?.attributes || []

  const onSubmit = async (data: ItemForm) => {
    setSaveError('')
    try {
      if (isEdit) {
        await updateItem.mutateAsync(data)
      } else {
        await createItem.mutateAsync(data)
      }
      navigate('/masters/items')
    } catch (e) {
      setSaveError(extractError(e))
    }
  }

  const isSaving = createItem.isPending || updateItem.isPending

  if (isLoading && isEdit) {
    return <div className="skeleton h-96 rounded-lg" />
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Edit Item' : 'New Item'}
        breadcrumbs={[{ label: 'Masters' }, { label: 'Items', href: '/masters/items' }, { label: isEdit ? 'Edit' : 'New' }]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/masters/items')}><ArrowLeft size={15} /> Back</Button>
            <Button onClick={form.handleSubmit(onSubmit)} loading={isSaving}><Save size={15} /> {isEdit ? 'Update' : 'Save'} Item</Button>
          </div>
        }
      />

      {saveError && (
        <div className="mb-4 flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          <AlertCircle size={15} /> {saveError}
        </div>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Basic */}
        <div className="form-section">
          <h3 className="form-section-title">Basic Information</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <Input label="Item Name" required placeholder="Enter item name"
                error={form.formState.errors.name?.message} {...form.register('name')} />
            </div>
            <Input label="Item Code" placeholder="Auto or manual" {...form.register('code')} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Select label="Category" options={[{ value: '', label: '-- No Category --' }, ...categories.map((c: any) => ({ value: c.id, label: c.name }))]}
              {...form.register('categoryId')} />
            <Select label="Unit of Measurement" required
              options={UNITS.map(u => ({ value: u, label: u }))}
              {...form.register('unit')} />
            <Select label="Alternate Unit" options={[{ value: '', label: 'None' }, ...UNITS.map(u => ({ value: u, label: u }))]}
              {...form.register('alternateUnit')} />
          </div>
          {form.watch('alternateUnit') && (
            <div className="grid grid-cols-4 gap-4">
              <Input label={`1 ${form.watch('unit')} = ? ${form.watch('alternateUnit')}`}
                type="number" step="0.0001" {...form.register('conversionFactor')} />
            </div>
          )}
          <Textarea label="Description" placeholder="Item description (optional)" rows={2} {...form.register('description')} />
        </div>

        {/* Category attributes info */}
        {categoryAttributes.length > 0 && (
          <div className="bg-info-muted border border-info/20 rounded-lg px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-info font-medium mb-2">
              <Tag size={14} /> Dynamic Attributes for "{selectedCategory?.name}"
            </div>
            <div className="flex flex-wrap gap-2">
              {categoryAttributes.map((attr: any) => (
                <Badge key={attr.name} variant="info" className="text-xs">
                  {attr.label} ({attr.type})
                  {attr.required && <span className="text-destructive ml-1">*</span>}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              These fields will appear on every voucher entry for this item.
            </p>
          </div>
        )}

        {/* GST */}
        <div className="form-section">
          <h3 className="form-section-title">GST & Tax Information</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Input label="HSN Code" placeholder="e.g. 6205" className="font-mono"
              {...form.register('hsnCode')} helperText="For goods" />
            <Input label="SAC Code" placeholder="e.g. 9954" className="font-mono"
              {...form.register('sacCode')} helperText="For services" />
            <Select label="GST Rate %" required
              options={GST_RATES.map(r => ({ value: String(r), label: `${r}%` }))}
              {...form.register('gstRate')} />
            <Input label="Cess %" type="number" step="0.01" placeholder="0"
              {...form.register('cessRate')} helperText="e.g. 12 for tobacco" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Tax Type" options={TAX_TYPES} {...form.register('taxType')} />
          </div>
        </div>

        {/* Pricing */}
        <div className="form-section">
          <h3 className="form-section-title">Pricing</h3>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Purchase Rate (₹)" type="number" step="0.0001"
              placeholder="0.00" {...form.register('purchaseRate')} helperText="Default purchase price" />
            <Input label="Sale Rate (₹)" type="number" step="0.0001"
              placeholder="0.00" {...form.register('saleRate')} helperText="Default selling price" />
            <Input label="MRP (₹)" type="number" step="0.01"
              placeholder="0.00" {...form.register('mrp')} helperText="Maximum retail price" />
          </div>
        </div>

        {/* Inventory */}
        <div className="form-section">
          <h3 className="form-section-title">Inventory Control</h3>
          <div className="flex items-center gap-3 mb-4">
            <input type="checkbox" id="maintainStock" {...form.register('maintainStock')}
              className="w-4 h-4 rounded border-input" />
            <label htmlFor="maintainStock" className="text-sm font-medium text-foreground">
              Maintain Stock (track inventory for this item)
            </label>
          </div>
          {form.watch('maintainStock') && (
            <div className="grid grid-cols-3 gap-4">
              <Input label="Reorder Level" type="number" step="0.001"
                placeholder="0" {...form.register('reorderLevel')} helperText="Alert when stock falls below" />
              <Input label="Reorder Qty" type="number" step="0.001"
                placeholder="0" {...form.register('reorderQty')} helperText="Suggested reorder quantity" />
              <Input label="Min Sale Qty" type="number" step="0.001"
                placeholder="1" {...form.register('minSaleQty')} helperText="Minimum quantity per sale" />
            </div>
          )}
        </div>
      </form>
    </div>
  )
}
