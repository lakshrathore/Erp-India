import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Save, ArrowLeft, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { useItem, useCreateItem, useUpdateItem, useItemCategories } from '../../hooks/api.hooks'
import { Button, Input, Select, Textarea, PageHeader } from '../../components/ui'
import { extractError } from '../../lib/api'
import ItemVariantsManager from '../../components/forms/ItemVariantsManager'

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
  ptr: z.coerce.number().default(0),
  pts: z.coerce.number().default(0),
  wholesaleRate: z.coerce.number().default(0),
  tradeDiscount: z.coerce.number().min(0).max(100).default(0),
  cashDiscount: z.coerce.number().min(0).max(100).default(0),
  schemeDiscount: z.coerce.number().min(0).max(100).default(0),
  maintainStock: z.boolean().default(true),
  reorderLevel: z.coerce.number().default(0),
  reorderQty: z.coerce.number().default(0),
  minSaleQty: z.coerce.number().default(1),
})
type ItemForm = z.infer<typeof itemSchema>

const UNITS = ['PCS','KG','GM','LTR','ML','MTR','CM','BOX','BAG','PKT','SET','PAIR','DOZ','NOS','SQM','CFT','TAB','BTL','STR','AMP','CAP','VIA','TUB']
const GST_RATES = [0,0.1,0.25,1,1.5,3,5,6,7.5,9,12,14,18,28]
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
  const [showPTR, setShowPTR] = useState(false)
  const [activeTab, setActiveTab] = useState<'details'|'variants'>('details')

  const { data: item, isLoading } = useItem(isEdit ? id : '')
  const { data: categories = [] } = useItemCategories()
  const createItem = useCreateItem()
  const updateItem = useUpdateItem(id || '')

  const form = useForm<ItemForm>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      taxType: 'CGST_SGST', gstRate: 18, cessRate: 0,
      purchaseRate: 0, saleRate: 0, mrp: 0, ptr: 0, pts: 0, wholesaleRate: 0,
      tradeDiscount: 0, cashDiscount: 0, schemeDiscount: 0,
      unit: 'PCS', maintainStock: true, reorderLevel: 0, reorderQty: 0, minSaleQty: 1,
    },
  })

  useEffect(() => {
    if (item && isEdit) {
      form.reset({
        name: item.name, code: item.code || '', categoryId: item.categoryId || '',
        description: item.description || '', unit: item.unit,
        alternateUnit: item.alternateUnit || '',
        conversionFactor: item.conversionFactor ? Number(item.conversionFactor) : undefined,
        hsnCode: item.hsnCode || '', sacCode: item.sacCode || '',
        gstRate: Number(item.gstRate), cessRate: Number(item.cessRate), taxType: item.taxType,
        purchaseRate: Number(item.purchaseRate), saleRate: Number(item.saleRate),
        mrp: Number(item.mrp), ptr: Number(item.ptr || 0), pts: Number(item.pts || 0),
        wholesaleRate: Number(item.wholesaleRate || 0),
        tradeDiscount: Number(item.tradeDiscount || 0), cashDiscount: Number(item.cashDiscount || 0),
        schemeDiscount: Number(item.schemeDiscount || 0),
        maintainStock: item.maintainStock, reorderLevel: Number(item.reorderLevel),
        reorderQty: Number(item.reorderQty), minSaleQty: Number(item.minSaleQty),
      })
      if (Number(item.ptr || 0) > 0 || Number(item.pts || 0) > 0) setShowPTR(true)
    }
  }, [item, isEdit])

  const onSubmit = async (data: ItemForm) => {
    setSaveError('')
    try {
      if (isEdit) await updateItem.mutateAsync(data)
      else await createItem.mutateAsync(data)
      navigate('/masters/items')
    } catch (e) { setSaveError(extractError(e)) }
  }

  const isSaving = createItem.isPending || updateItem.isPending
  const w = form.watch()
  
  // Get attributes from currently selected category
  const selectedCategoryId = form.watch('categoryId')
  const selectedCategory = (categories as any[]).find((c: any) => c.id === selectedCategoryId)
  // category.attributes is stored as JSON in DB - parse if string
  const categoryAttributes = (() => {
    const attrs = selectedCategory?.attributes || item?.category?.attributes || []
    if (typeof attrs === 'string') {
      try { return JSON.parse(attrs) } catch { return [] }
    }
    return attrs
  })()

  const margin = w.saleRate > 0 && w.purchaseRate > 0
    ? (((w.saleRate - w.purchaseRate) / w.saleRate) * 100).toFixed(1) : null
  const netRate = w.saleRate > 0 ? (
    w.saleRate * (1 - (w.tradeDiscount || 0) / 100) *
    (1 - (w.cashDiscount || 0) / 100) * (1 - (w.schemeDiscount || 0) / 100)
  ).toFixed(2) : null

  if (isLoading && isEdit) return <div className="skeleton h-96 rounded-lg" />

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Edit Item' : 'New Item'}
        breadcrumbs={[{ label: 'Masters' }, { label: 'Items', href: '/masters/items' }, { label: isEdit ? 'Edit' : 'New' }]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/masters/items')}><ArrowLeft size={15} /> Back</Button>
            <Button onClick={form.handleSubmit(onSubmit)} loading={isSaving}><Save size={15} /> {isEdit ? 'Update' : 'Save'}</Button>
          </div>
        }
      />

      {/* Tabs */}
      {isEdit && (
        <div className="flex gap-1 border-b border-border mb-4">
          {(['details', 'variants'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {tab === 'variants' ? `Variants / Color / Size` : 'Item Details'}
            </button>
          ))}
        </div>
      )}

      {saveError && (
        <div className="mb-4 flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          <AlertCircle size={15} /> {saveError}
        </div>
      )}

      {(!isEdit || activeTab === 'details') && <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

        {/* Basic */}
        <div className="form-section">
          <h3 className="form-section-title">Basic Information</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <Input label="Item Name" required error={form.formState.errors.name?.message} {...form.register('name')} />
            </div>
            <Input label="Item Code" placeholder="Auto or manual" {...form.register('code')} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Select label="Category"
              options={[{ value: '', label: '-- No Category --' }, ...(categories as any[]).map((c: any) => ({ value: c.id, label: c.name }))]}
              {...form.register('categoryId')} />
            <Select label="Unit" required options={UNITS.map(u => ({ value: u, label: u }))} {...form.register('unit')} />
            <Select label="Alternate Unit" options={[{ value: '', label: 'None' }, ...UNITS.map(u => ({ value: u, label: u }))]} {...form.register('alternateUnit')} />
          </div>
          {w.alternateUnit && (
            <Input label={`1 ${w.unit} = ? ${w.alternateUnit}`} type="number" step="0.0001"
              {...form.register('conversionFactor')} className="w-48" />
          )}
          <Textarea label="Description" rows={2} {...form.register('description')} />
        </div>

        {/* GST */}
        <div className="form-section">
          <h3 className="form-section-title">GST & Tax</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Input label="HSN Code" className="font-mono" {...form.register('hsnCode')} helperText="For goods" />
            <Input label="SAC Code" className="font-mono" {...form.register('sacCode')} helperText="For services" />
            <Select label="GST Rate %" required options={GST_RATES.map(r => ({ value: String(r), label: `${r}%` }))} {...form.register('gstRate')} />
            <Input label="Cess %" type="number" step="0.01" {...form.register('cessRate')} />
          </div>
          <Select label="Tax Type" options={TAX_TYPES} {...form.register('taxType')} className="max-w-xs" />
        </div>

        {/* Pricing */}
        <div className="form-section">
          <h3 className="form-section-title">Pricing</h3>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Purchase Rate (₹)" type="number" step="0.0001" {...form.register('purchaseRate')} helperText="Your cost price" />
            <Input label="Sale Rate (₹)" type="number" step="0.0001" {...form.register('saleRate')}
              helperText={margin ? `Gross margin: ${margin}%` : 'Default selling price'} />
            <Input label="MRP (₹)" type="number" step="0.01" {...form.register('mrp')} helperText="Max retail price" />
          </div>

          {/* PTR / PTS toggle */}
          <button type="button" onClick={() => setShowPTR(s => !s)}
            className="flex items-center gap-1.5 text-xs text-primary font-medium mt-3">
            {showPTR ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {showPTR ? 'Hide' : 'Add'} PTR / PTS / Wholesale Rates
          </button>

          {showPTR && (
            <div className="grid grid-cols-3 gap-4 mt-3 p-4 bg-muted/30 rounded-lg">
              <Input label="PTR — Price to Retailer (₹)" type="number" step="0.0001"
                {...form.register('ptr')} helperText="Rate billed to retailers" />
              <Input label="PTS — Price to Stockist (₹)" type="number" step="0.0001"
                {...form.register('pts')} helperText="Rate billed to stockists/distributors" />
              <Input label="Wholesale Rate (₹)" type="number" step="0.0001"
                {...form.register('wholesaleRate')} helperText="Bulk / wholesale rate" />
            </div>
          )}
        </div>

        {/* Default Discounts */}
        <div className="form-section">
          <h3 className="form-section-title">Default Discounts</h3>
          <p className="text-xs text-muted-foreground mb-3">
            These auto-fill on vouchers — can be changed per transaction.
          </p>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Trade Discount %" type="number" step="0.01" min={0} max={100}
              {...form.register('tradeDiscount')} helperText="Applied on every sale automatically" />
            <Input label="Cash/Prompt Discount %" type="number" step="0.01" min={0} max={100}
              {...form.register('cashDiscount')} helperText="For prompt payment" />
            <Input label="Scheme Discount %" type="number" step="0.01" min={0} max={100}
              {...form.register('schemeDiscount')} helperText="Seasonal / festival scheme" />
          </div>

          {/* Net rate preview */}
          {netRate && (w.tradeDiscount > 0 || w.cashDiscount > 0 || w.schemeDiscount > 0) && (
            <div className="mt-3 bg-card border border-border rounded-lg px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">Net Rate after all discounts</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground line-through">₹{w.saleRate.toFixed(2)}</span>
                  <span className="font-bold text-primary font-mono">₹{netRate}</span>
                  <span className="text-xs text-success">
                    ({(((w.saleRate - Number(netRate)) / w.saleRate) * 100).toFixed(1)}% total disc)
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Inventory */}
        <div className="form-section">
          <h3 className="form-section-title">Inventory Control</h3>
          <label className="flex items-center gap-3 mb-4 cursor-pointer">
            <input type="checkbox" {...form.register('maintainStock')} className="w-4 h-4 rounded" />
            <span className="text-sm font-medium">Maintain Stock</span>
          </label>
          {w.maintainStock && (
            <div className="grid grid-cols-3 gap-4">
              <Input label="Reorder Level" type="number" step="0.001" {...form.register('reorderLevel')} helperText="Alert when below this" />
              <Input label="Reorder Qty" type="number" step="0.001" {...form.register('reorderQty')} helperText="Suggested order qty" />
              <Input label="Min Sale Qty" type="number" step="0.001" {...form.register('minSaleQty')} helperText="Min qty per order" />
            </div>
          )}
        </div>
      </form>}

      {/* Variants Tab */}
      {isEdit && activeTab === 'variants' && item && (
        <div className="form-section">
          <h3 className="form-section-title">Item Variants</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Variants allow you to manage different combinations like Color+Size, Batch+Expiry etc. 
            Attributes are defined in <strong>Masters → Item Categories</strong>.
          </p>
          <ItemVariantsManager
            itemId={item.id}
            itemName={item.name}
            categoryAttributes={categoryAttributes as any[]}
            basePrice={{ purchaseRate: Number(item.purchaseRate), saleRate: Number(item.saleRate) }}
          />
        </div>
      )}
    </div>
  )
}
