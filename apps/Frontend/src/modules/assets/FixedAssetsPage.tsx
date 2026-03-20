import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus, Search, Building2, Truck, Monitor, Package, Wrench,
  TrendingDown, Save, ArrowLeft, AlertCircle, Check, Edit,
  Trash2, BarChart3, Calendar, ChevronDown, ChevronUp,
  Play, FileText, Info, RotateCcw, Tag
} from 'lucide-react'
import { api, extractError } from '../../lib/api'
import {
  Button, Input, Select, Textarea, PageHeader,
  Badge, Spinner, EmptyState, Card, CardContent, CardHeader, CardTitle
} from '../../components/ui'
import { formatINR, formatDate } from '../../lib/india'
import { cn } from '../../components/ui/utils'
import { useAuthStore } from '../../stores/auth.store'
import dayjs from 'dayjs'

// ─── Constants ────────────────────────────────────────────────────────────────

const ASSET_CATEGORIES = [
  'Land & Building',
  'Plant & Machinery',
  'Vehicles',
  'Computer & IT Equipment',
  'Furniture & Fixtures',
  'Office Equipment',
  'Electrical Installations',
  'Intangible Assets',
  'Other',
]

// Companies Act 2013 — Schedule II WDV rates
const WDV_RATES: Record<string, number> = {
  'Land & Building': 10,
  'Plant & Machinery': 15,
  'Vehicles': 15,
  'Computer & IT Equipment': 40,
  'Furniture & Fixtures': 10,
  'Office Equipment': 20,
  'Electrical Installations': 10,
  'Intangible Assets': 25,
  'Other': 15,
}

// Companies Act useful life (SLM)
const USEFUL_LIFE: Record<string, number> = {
  'Land & Building': 30,
  'Plant & Machinery': 15,
  'Vehicles': 8,
  'Computer & IT Equipment': 3,
  'Furniture & Fixtures': 10,
  'Office Equipment': 5,
  'Electrical Installations': 10,
  'Intangible Assets': 5,
  'Other': 10,
}

const STATUS_BADGE: Record<string, any> = {
  ACTIVE: 'success',
  DISPOSED: 'destructive',
  FULLY_DEPRECIATED: 'secondary',
  UNDER_REPAIR: 'warning',
  WRITTEN_OFF: 'outline',
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ─── Projected depreciation schedule ─────────────────────────────────────────

function buildProjectedSchedule(
  purchaseValue: number,
  salvageValue: number,
  rate: number,
  method: string,
  usefulLife: number,
  existingDep: number = 0,
  purchaseDate: string
) {
  const schedule: Array<{
    fy: string; openingValue: number; depAmt: number;
    closingValue: number; accumulated: number
  }> = []

  let currentValue = purchaseValue - existingDep
  const depreciable = purchaseValue - salvageValue

  for (let year = 0; year < Math.min(usefulLife + 2, 30); year++) {
    if (currentValue <= salvageValue + 0.01) break

    const purchaseYear = new Date(purchaseDate).getFullYear()
    const fyStart = purchaseYear + year
    const fy = `${String(fyStart).slice(2)}-${String(fyStart + 1).slice(2)}`

    let depAmt = 0
    if (method === 'WDV') {
      depAmt = (currentValue * rate) / 100
    } else {
      depAmt = depreciable / usefulLife
    }

    // Cap at salvage value
    depAmt = Math.min(depAmt, Math.max(0, currentValue - salvageValue))
    depAmt = Math.round(depAmt * 100) / 100

    const closingValue = Math.round((currentValue - depAmt) * 100) / 100
    const accumulated = purchaseValue - closingValue

    schedule.push({ fy, openingValue: currentValue, depAmt, closingValue, accumulated })
    currentValue = closingValue
  }

  return schedule
}

// ─── ═══════════════════════════════════════════════════════════════════════════
// ASSET LIST PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export function FixedAssetListPage() {
  const navigate = useNavigate()
  const { activeCompany } = useAuthStore()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')

  const { data: assetsData, isLoading } = useQuery({
    queryKey: ['fixed-assets', activeCompany?.companyId, search, category, status],
    queryFn: async () => {
      const { data } = await api.get('/assets', { params: { search, category, status, limit: 200 } })
      return data
    },
    enabled: !!activeCompany?.companyId,
  })

  const { data: summary } = useQuery({
    queryKey: ['assets-summary', activeCompany?.companyId],
    queryFn: async () => {
      const { data } = await api.get('/assets/summary')
      return data.data
    },
    enabled: !!activeCompany?.companyId,
  })

  const assets = (assetsData as any)?.data || []

  return (
    <div>
      <PageHeader
        title="Fixed Assets Register"
        subtitle="Capital assets — purchase, depreciation, disposal"
        breadcrumbs={[{ label: 'Fixed Assets' }]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/assets/depreciation')}>
              <TrendingDown size={15} /> Run Depreciation
            </Button>
            <Button onClick={() => navigate('/assets/new')}>
              <Plus size={15} /> Add Asset
            </Button>
          </div>
        }
      />

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          {[
            { label: 'Total Assets', value: summary.totalAssets, sub: `${summary.activeAssets} active`, color: '' },
            { label: 'Gross Block', value: formatINR(summary.totalPurchaseValue), sub: 'Original cost', color: '' },
            { label: 'Net Block', value: formatINR(summary.totalCurrentValue), sub: 'Current book value', color: 'text-primary' },
            { label: 'Accumulated Depreciation', value: formatINR(summary.totalDepreciation), sub: 'Total written off', color: 'text-destructive' },
          ].map(s => (
            <div key={s.label} className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-lg font-bold mt-1 ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Category breakdown */}
      {summary?.categories && Object.keys(summary.categories).length > 0 && (
        <div className="bg-card border border-border rounded-lg p-4 mb-5">
          <h3 className="text-sm font-semibold mb-3">Category-wise Block</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-muted-foreground font-medium">Category</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Assets</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Gross Block</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Acc. Depreciation</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Net Block</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(summary.categories).map(([cat, vals]: any) => (
                  <tr key={cat} className="border-b border-border/30">
                    <td className="py-2 font-medium">{cat}</td>
                    <td className="py-2 text-right">{vals.count}</td>
                    <td className="py-2 text-right font-mono">{formatINR(vals.purchaseValue)}</td>
                    <td className="py-2 text-right font-mono text-destructive">{formatINR(vals.depreciation)}</td>
                    <td className="py-2 text-right font-mono font-semibold text-primary">{formatINR(vals.currentValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Search assets..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={category} onChange={e => setCategory(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
          <option value="">All Categories</option>
          {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="FULLY_DEPRECIATED">Fully Depreciated</option>
          <option value="DISPOSED">Disposed</option>
          <option value="UNDER_REPAIR">Under Repair</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : assets.length === 0 ? (
        <EmptyState title="No assets found"
          description="Add your capital assets — building, machinery, vehicles, computers etc."
          action={<Button onClick={() => navigate('/assets/new')}><Plus size={15} /> Add First Asset</Button>} />
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Asset Name</th>
                <th>Category</th>
                <th>Purchase Date</th>
                <th className="text-right">Cost</th>
                <th className="text-right">Acc. Dep.</th>
                <th className="text-right">Net Block</th>
                <th className="text-center">Method</th>
                <th className="text-center">Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a: any) => {
                const depPct = Number(a.purchaseValue) > 0
                  ? ((Number(a.totalDepreciation) / Number(a.purchaseValue)) * 100).toFixed(1) : '0'
                return (
                  <tr key={a.id}>
                    <td>
                      <div className="font-medium text-sm">{a.name}</div>
                      {a.code && <div className="text-xs text-muted-foreground font-mono">{a.code}</div>}
                      {a.location && <div className="text-xs text-muted-foreground">{a.location}</div>}
                    </td>
                    <td className="text-sm text-muted-foreground">{a.category}</td>
                    <td className="text-sm">{formatDate(a.purchaseDate)}</td>
                    <td className="amount-col">{formatINR(Number(a.purchaseValue))}</td>
                    <td className="amount-col">
                      <span className="text-destructive">{formatINR(Number(a.totalDepreciation))}</span>
                      <div className="text-[10px] text-muted-foreground">{depPct}%</div>
                    </td>
                    <td className="amount-col font-semibold text-primary">
                      {formatINR(Number(a.currentValue))}
                    </td>
                    <td className="text-center">
                      <Badge variant="secondary" className="text-[10px]">{a.depreciationMethod}</Badge>
                      <div className="text-[10px] text-muted-foreground">{Number(a.depreciationRate)}% p.a.</div>
                    </td>
                    <td className="text-center">
                      <Badge variant={STATUS_BADGE[a.status] || 'default'} className="text-[10px]">
                        {a.status.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td>
                      <Button size="icon-sm" variant="ghost" onClick={() => navigate(`/assets/${a.id}`)}>
                        <Edit size={13} />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── ═══════════════════════════════════════════════════════════════════════════
// DEPRECIATION PAGE — Run monthly/yearly + view schedule
// ═══════════════════════════════════════════════════════════════════════════════

export function DepreciationPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { activeCompany } = useAuthStore()
  const today = dayjs()
  const [month, setMonth] = useState(today.month() + 1)
  const [year, setYear] = useState(today.year())
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')

  // Load active assets for preview
  const { data: assetsData } = useQuery({
    queryKey: ['fixed-assets-dep', activeCompany?.companyId],
    queryFn: async () => {
      const { data } = await api.get('/assets', { params: { status: 'ACTIVE', limit: 200 } })
      return data.data || []
    },
    enabled: !!activeCompany?.companyId,
  })
  const assets = (assetsData as any[]) || []

  // Preview — calculate what will happen
  const preview = assets.map((a: any) => {
    const openingValue = Number(a.currentValue)
    let depAmt = 0
    if (a.depreciationMethod === 'WDV') {
      depAmt = (openingValue * Number(a.depreciationRate)) / 100 / 12
    } else {
      depAmt = (Number(a.purchaseValue) - Number(a.salvageValue)) / (a.usefulLifeYears * 12)
    }
    const maxDep = Math.max(0, openingValue - Number(a.salvageValue))
    depAmt = Math.min(Math.round(depAmt * 100) / 100, maxDep)
    return { ...a, previewDep: depAmt, closingValue: openingValue - depAmt }
  })

  const totalPreviewDep = preview.reduce((s: number, a: any) => s + a.previewDep, 0)

  const runBulk = async () => {
    setRunning(true); setError(''); setResult(null)
    try {
      const { data } = await api.post('/assets/bulk-depreciate', { month, year })
      setResult(data.data)
      qc.invalidateQueries({ queryKey: ['fixed-assets'] })
      qc.invalidateQueries({ queryKey: ['assets-summary'] })
      qc.invalidateQueries({ queryKey: ['fixed-assets-dep'] })
    } catch (e) { setError(extractError(e)) }
    finally { setRunning(false) }
  }

  // Years for dropdown
  const years = Array.from({ length: 6 }, (_, i) => today.year() - 2 + i)

  return (
    <div>
      <PageHeader
        title="Run Depreciation"
        subtitle="Calculate and post monthly depreciation for all active assets"
        breadcrumbs={[{ label: 'Fixed Assets', href: '/assets' }, { label: 'Run Depreciation' }]}
        actions={<Button variant="outline" onClick={() => navigate('/assets')}><ArrowLeft size={15} /> Back</Button>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Left: Controls */}
        <div className="space-y-4">
          <div className="form-section">
            <h3 className="form-section-title">Select Period</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">Month</label>
                <select value={month} onChange={e => setMonth(Number(e.target.value))}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">Year</label>
                <select value={year} onChange={e => setYear(Number(e.target.value))}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-4 bg-muted/30 rounded-lg p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Active Assets</span>
                <span className="font-semibold">{assets.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Period</span>
                <span className="font-semibold">{MONTHS[month-1]} {year}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2">
                <span className="text-muted-foreground">Total Depreciation</span>
                <span className="font-bold text-destructive">{formatINR(totalPreviewDep)}</span>
              </div>
            </div>

            {error && (
              <div className="mt-3 flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5 text-sm text-destructive">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            {result && (
              <div className="mt-3 bg-success/10 border border-success/20 rounded-lg px-3 py-2.5 text-sm text-success">
                <Check size={14} className="inline mr-1" />
                <strong>{result.processed}</strong> assets processed,{' '}
                <strong>{result.skipped}</strong> already done
              </div>
            )}

            <Button className="w-full mt-3" onClick={runBulk} loading={running}
              disabled={assets.length === 0}>
              <Play size={15} /> Run Depreciation for {MONTHS[month-1]} {year}
            </Button>

            <p className="text-xs text-muted-foreground mt-2 text-center">
              Already run periods will be skipped automatically
            </p>
          </div>

          <div className="bg-info-muted border border-info/20 rounded-lg px-4 py-3 text-xs text-info space-y-1.5">
            <p className="font-semibold">How it works:</p>
            <p>• <strong>WDV</strong> (Written Down Value): Rate% of opening book value ÷ 12</p>
            <p>• <strong>SLM</strong> (Straight Line): (Cost − Salvage) ÷ (Life × 12)</p>
            <p>• Will not go below salvage value</p>
            <p>• Fully depreciated assets are skipped</p>
          </div>
        </div>

        {/* Right: Preview table */}
        <div className="lg:col-span-2">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30">
              <h3 className="text-sm font-semibold">
                Preview — {MONTHS[month-1]} {year} Depreciation
              </h3>
            </div>
            {assets.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                No active assets found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wide">Asset</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wide">Method</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground uppercase tracking-wide">Opening Value</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground uppercase tracking-wide">Depreciation</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground uppercase tracking-wide">Closing Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((a: any, i: number) => (
                      <tr key={a.id} className={cn('border-t border-border/30', i % 2 === 1 && 'bg-muted/10')}>
                        <td className="px-3 py-2">
                          <div className="font-medium">{a.name}</div>
                          <div className="text-muted-foreground">{a.category}</div>
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="secondary" className="text-[9px]">{a.depreciationMethod}</Badge>
                          <div className="text-muted-foreground mt-0.5">{Number(a.depreciationRate)}% p.a.</div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{formatINR(Number(a.currentValue))}</td>
                        <td className="px-3 py-2 text-right font-mono">
                          <span className={a.previewDep > 0 ? 'text-destructive font-semibold' : 'text-muted-foreground'}>
                            {a.previewDep > 0 ? `− ${formatINR(a.previewDep)}` : 'Already done / Nil'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-primary font-semibold">
                          {formatINR(a.closingValue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/30">
                      <td colSpan={3} className="px-3 py-2.5 font-semibold text-sm">Total</td>
                      <td className="px-3 py-2.5 text-right font-bold text-destructive font-mono">
                        − {formatINR(totalPreviewDep)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-primary font-mono">
                        {formatINR(preview.reduce((s: number, a: any) => s + a.closingValue, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── ═══════════════════════════════════════════════════════════════════════════
// ASSET FORM PAGE — Add / Edit with full depreciation schedule
// ═══════════════════════════════════════════════════════════════════════════════

const assetSchema = z.object({
  code: z.string().optional(),
  name: z.string().min(2, 'Name required'),
  description: z.string().optional(),
  category: z.string().min(1, 'Category required'),
  location: z.string().optional(),
  purchaseDate: z.string().min(1, 'Purchase date required'),
  purchaseValue: z.coerce.number().positive('Must be > 0'),
  salvageValue: z.coerce.number().min(0).default(0),
  usefulLifeYears: z.coerce.number().int().min(1).default(5),
  depreciationMethod: z.enum(['SLM', 'WDV']).default('WDV'),
  depreciationRate: z.coerce.number().min(0).max(100),
  vendorName: z.string().optional(),
  vendorInvoiceNo: z.string().optional(),
  warrantyExpiry: z.string().optional(),
  hsnCode: z.string().optional(),
  gstRate: z.coerce.number().default(18),
})

export function FixedAssetFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const isEdit = !!id && id !== 'new'
  const [saveError, setSaveError] = useState('')
  const [activeTab, setActiveTab] = useState<'details'|'schedule'|'history'>('details')
  const [showDispose, setShowDispose] = useState(false)
  const [disposeData, setDisposeData] = useState({ disposalDate: '', disposalValue: '', disposalReason: '' })
  const [runningDep, setRunningDep] = useState(false)
  const [depResult, setDepResult] = useState<any>(null)
  const today = dayjs()
  const [depMonth, setDepMonth] = useState(today.month() + 1)
  const [depYear, setDepYear] = useState(today.year())

  const { data: asset, isLoading } = useQuery({
    queryKey: ['fixed-asset', id],
    queryFn: async () => {
      const { data } = await api.get(`/assets/${id}`)
      return data.data
    },
    enabled: !!isEdit,
  })

  const form = useForm({
    resolver: zodResolver(assetSchema),
    defaultValues: {
      depreciationMethod: 'WDV', depreciationRate: 15,
      usefulLifeYears: 5, salvageValue: 0, gstRate: 18,
    },
  })

  useEffect(() => {
    if (asset && isEdit) {
      form.reset({
        code: asset.code || '', name: asset.name, description: asset.description || '',
        category: asset.category, location: asset.location || '',
        purchaseDate: asset.purchaseDate?.substring(0, 10),
        purchaseValue: Number(asset.purchaseValue), salvageValue: Number(asset.salvageValue),
        usefulLifeYears: asset.usefulLifeYears,
        depreciationMethod: asset.depreciationMethod, depreciationRate: Number(asset.depreciationRate),
        vendorName: asset.vendorName || '', vendorInvoiceNo: asset.vendorInvoiceNo || '',
        warrantyExpiry: asset.warrantyExpiry?.substring(0, 10) || '',
        hsnCode: asset.hsnCode || '', gstRate: Number(asset.gstRate),
      })
    }
  }, [asset, isEdit])

  const catVal = form.watch('category')
  const purVal = form.watch('purchaseValue') || 0
  const salVal = form.watch('salvageValue') || 0
  const lifeVal = form.watch('usefulLifeYears') || 5
  const rateVal = form.watch('depreciationRate') || 0
  const method = form.watch('depreciationMethod')
  const purchaseDateVal = form.watch('purchaseDate') || new Date().toISOString().substring(0, 10)

  // Auto-fill when category changes
  useEffect(() => {
    if (catVal) {
      if (WDV_RATES[catVal]) form.setValue('depreciationRate', WDV_RATES[catVal])
      if (USEFUL_LIFE[catVal]) form.setValue('usefulLifeYears', USEFUL_LIFE[catVal])
    }
  }, [catVal])

  // Projected schedule
  const projectedSchedule = purVal > 0 ? buildProjectedSchedule(
    purVal, salVal, rateVal, method, lifeVal,
    isEdit && asset ? Number(asset.totalDepreciation) : 0,
    purchaseDateVal
  ) : []

  const firstYearDep = method === 'WDV' ? (purVal * rateVal) / 100 : (purVal - salVal) / lifeVal
  const slmAutoRate = purVal > 0 && lifeVal > 0 ? (((purVal - salVal) / purVal / lifeVal) * 100).toFixed(2) : '0'

  const onSubmit = async (data: any) => {
    setSaveError('')
    try {
      if (isEdit) await api.put(`/assets/${id}`, data)
      else await api.post('/assets', data)
      qc.invalidateQueries({ queryKey: ['fixed-assets'] })
      navigate('/assets')
    } catch (e) { setSaveError(extractError(e)) }
  }

  const runDepreciation = async () => {
    if (!id) return
    setRunningDep(true); setDepResult(null)
    try {
      const { data } = await api.post(`/assets/${id}/depreciate`, { month: depMonth, year: depYear })
      setDepResult(data)
      qc.invalidateQueries({ queryKey: ['fixed-asset', id] })
      qc.invalidateQueries({ queryKey: ['fixed-assets'] })
      qc.invalidateQueries({ queryKey: ['assets-summary'] })
    } catch (e) { setDepResult({ error: extractError(e) }) }
    finally { setRunningDep(false) }
  }

  const handleDispose = async () => {
    try {
      await api.post(`/assets/${id}/dispose`, disposeData)
      qc.invalidateQueries({ queryKey: ['fixed-assets'] })
      navigate('/assets')
    } catch (e) { setSaveError(extractError(e)) }
  }

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>

  const TABS = [
    { key: 'details', label: 'Asset Details' },
    { key: 'schedule', label: 'Depreciation Schedule' },
    ...(isEdit ? [{ key: 'history', label: `History (${asset?.depreciations?.length || 0})` }] : []),
  ]

  return (
    <div>
      <PageHeader
        title={isEdit ? asset?.name || 'Edit Asset' : 'Add Fixed Asset'}
        subtitle={isEdit ? `${asset?.category} · ${formatDate(asset?.purchaseDate)}` : 'Register a new capital asset'}
        breadcrumbs={[{ label: 'Fixed Assets', href: '/assets' }, { label: isEdit ? 'Edit' : 'New' }]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/assets')}><ArrowLeft size={15} /> Back</Button>
            {activeTab === 'details' && (
              <Button onClick={form.handleSubmit(onSubmit)}><Save size={15} /> {isEdit ? 'Update' : 'Save Asset'}</Button>
            )}
          </div>
        }
      />

      {/* Current value banner for edit */}
      {isEdit && asset && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
          {[
            { label: 'Original Cost', value: formatINR(Number(asset.purchaseValue)), color: '' },
            { label: 'Acc. Depreciation', value: formatINR(Number(asset.totalDepreciation)), color: 'text-destructive' },
            { label: 'Net Book Value', value: formatINR(Number(asset.currentValue)), color: 'text-primary font-bold' },
            { label: 'Salvage Value', value: formatINR(Number(asset.salvageValue)), color: '' },
            { label: 'Depreciated', value: `${Number(asset.purchaseValue) > 0 ? ((Number(asset.totalDepreciation)/Number(asset.purchaseValue))*100).toFixed(1) : 0}%`, color: '' },
            { label: 'Status', value: asset.status.replace('_',' '), color: '' },
          ].map(s => (
            <div key={s.label} className="bg-card border border-border rounded-lg px-3 py-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{s.label}</p>
              <p className={`text-sm font-semibold mt-0.5 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Depreciation progress bar */}
      {isEdit && asset && Number(asset.purchaseValue) > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Depreciation Progress</span>
            <span>{((Number(asset.totalDepreciation)/Number(asset.purchaseValue))*100).toFixed(1)}% of cost written off</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-destructive/70 to-destructive rounded-full transition-all"
              style={{ width: `${Math.min(100, (Number(asset.totalDepreciation)/Number(asset.purchaseValue))*100)}%` }} />
          </div>
        </div>
      )}

      {saveError && (
        <div className="mb-4 flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-md px-4 py-3 text-sm text-destructive">
          <AlertCircle size={15} /> {saveError}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-5">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
            className={cn('px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              activeTab === tab.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Details ──────────────────────────────────────────────────── */}
      {activeTab === 'details' && (
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 space-y-4">

              {/* Basic */}
              <div className="form-section">
                <h3 className="form-section-title">Asset Information</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <Input label="Asset Name" required error={(form.formState.errors as any).name?.message} {...form.register('name')} />
                  </div>
                  <Input label="Asset Code" placeholder="Auto/Manual" {...form.register('code')} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-foreground block mb-1.5">Category *</label>
                    <select {...form.register('category')}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                      <option value="">Select category...</option>
                      {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <Input label="Location / Department" placeholder="e.g. Factory, Office" {...form.register('location')} />
                </div>
                <Textarea label="Description" rows={2} {...form.register('description')} />
              </div>

              {/* Purchase */}
              <div className="form-section">
                <h3 className="form-section-title">Purchase Details</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Purchase Date" required type="date" {...form.register('purchaseDate')} />
                  <Input label="Purchase / Cost Value (₹)" required type="number" step="0.01" {...form.register('purchaseValue')} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Input label="Vendor Name" {...form.register('vendorName')} />
                  <Input label="Invoice / Bill No." {...form.register('vendorInvoiceNo')} />
                  <Input label="Warranty Expiry" type="date" {...form.register('warrantyExpiry')} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="HSN Code" className="font-mono" {...form.register('hsnCode')} />
                  <Select label="GST Rate %" options={[0,5,12,18,28].map(r => ({ value: String(r), label: `${r}%` }))} {...form.register('gstRate')} />
                </div>
              </div>

              {/* Depreciation */}
              <div className="form-section">
                <h3 className="form-section-title">Depreciation Method</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-foreground block mb-1.5">Method</label>
                    <select {...form.register('depreciationMethod')}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                      <option value="WDV">WDV — Written Down Value</option>
                      <option value="SLM">SLM — Straight Line Method</option>
                    </select>
                  </div>
                  <Input label={`Rate (% p.a.) ${method === 'SLM' ? `— Auto: ${slmAutoRate}%` : ''}`}
                    type="number" step="0.01"
                    helperText={method === 'WDV' ? 'Companies Act WDV rate' : 'Or enter custom SLM rate'}
                    {...form.register('depreciationRate')} />
                  <Input label="Useful Life (years)"
                    type="number" helperText="As per Companies Act"
                    {...form.register('usefulLifeYears')} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Salvage / Residual Value (₹)"
                    type="number" step="0.01"
                    helperText="Value at end of useful life (usually 5% of cost)"
                    {...form.register('salvageValue')} />
                </div>

                {/* Method comparison info */}
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className={cn('border rounded-lg p-3 text-xs transition-all', method === 'WDV' ? 'border-primary bg-primary/5' : 'border-border')}>
                    <p className="font-semibold mb-1">WDV Method</p>
                    <p className="text-muted-foreground">Higher depreciation in early years, reduces over time. Rate applied on reducing book value.</p>
                    <p className="mt-2 font-mono text-primary">Dep = Book Value × {rateVal}% ÷ 12</p>
                  </div>
                  <div className={cn('border rounded-lg p-3 text-xs transition-all', method === 'SLM' ? 'border-primary bg-primary/5' : 'border-border')}>
                    <p className="font-semibold mb-1">SLM Method</p>
                    <p className="text-muted-foreground">Equal depreciation every year throughout useful life. Simpler calculation.</p>
                    <p className="mt-2 font-mono text-primary">Dep = (Cost − Salvage) ÷ {lifeVal} years</p>
                  </div>
                </div>

                {/* Year 1 preview */}
                {purVal > 0 && (
                  <div className="mt-3 bg-muted/30 rounded-lg p-3 grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Depreciable Amount</p>
                      <p className="font-bold">{formatINR(purVal - salVal)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Year 1 Depreciation</p>
                      <p className="font-bold text-destructive">{formatINR(firstYearDep)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Net Block after Yr 1</p>
                      <p className="font-bold text-primary">{formatINR(purVal - firstYearDep)}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right panel */}
            <div className="space-y-4">
              {isEdit && asset?.status === 'ACTIVE' && (
                <div className="form-section">
                  <h3 className="form-section-title">Run Depreciation (This Asset)</h3>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Month</label>
                      <select value={depMonth} onChange={e => setDepMonth(Number(e.target.value))}
                        className="h-8 w-full rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring">
                        {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Year</label>
                      <input type="number" value={depYear} onChange={e => setDepYear(Number(e.target.value))}
                        className="h-8 w-full rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
                    </div>
                  </div>

                  {/* Preview for this month */}
                  {(() => {
                    const curVal = Number(asset.currentValue)
                    const salv = Number(asset.salvageValue)
                    let dep = asset.depreciationMethod === 'WDV'
                      ? (curVal * Number(asset.depreciationRate)) / 100 / 12
                      : (Number(asset.purchaseValue) - salv) / (asset.usefulLifeYears * 12)
                    dep = Math.min(Math.round(dep * 100) / 100, Math.max(0, curVal - salv))
                    return (
                      <div className="bg-muted/30 rounded-lg px-3 py-2 text-xs mb-3">
                        <div className="flex justify-between mb-1">
                          <span className="text-muted-foreground">Opening</span>
                          <span className="font-mono">{formatINR(curVal)}</span>
                        </div>
                        <div className="flex justify-between mb-1 text-destructive">
                          <span>Depreciation ({MONTHS[depMonth-1]} {depYear})</span>
                          <span className="font-mono font-semibold">− {formatINR(dep)}</span>
                        </div>
                        <div className="flex justify-between border-t border-border pt-1 font-semibold">
                          <span>Closing</span>
                          <span className="font-mono text-primary">{formatINR(curVal - dep)}</span>
                        </div>
                      </div>
                    )
                  })()}

                  {depResult && (
                    <div className={cn('text-xs rounded-lg px-3 py-2 mb-2', depResult.error ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success')}>
                      {depResult.error ? `Error: ${depResult.error}` : `✓ ${depResult.message}`}
                    </div>
                  )}

                  <Button className="w-full" size="sm" onClick={runDepreciation} loading={runningDep}>
                    <Play size={13} /> Post Depreciation
                  </Button>

                  <div className="mt-2 text-center">
                    <button onClick={() => navigate('/assets/depreciation')} className="text-xs text-primary hover:underline">
                      Run for all assets →
                    </button>
                  </div>
                </div>
              )}

              {isEdit && asset?.status === 'ACTIVE' && (
                <div className="form-section">
                  <h3 className="form-section-title text-destructive">Dispose Asset</h3>
                  {!showDispose ? (
                    <Button variant="outline" size="sm" className="text-destructive border-destructive/40 w-full"
                      onClick={() => setShowDispose(true)}>
                      Mark as Disposed / Sold
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <Input label="Disposal Date" type="date" value={disposeData.disposalDate}
                        onChange={e => setDisposeData(d => ({ ...d, disposalDate: e.target.value }))} />
                      <Input label="Sale / Disposal Value (₹)" type="number" value={disposeData.disposalValue}
                        onChange={e => setDisposeData(d => ({ ...d, disposalValue: e.target.value }))} />
                      <Input label="Reason" placeholder="Sold / Scrapped / Written off" value={disposeData.disposalReason}
                        onChange={e => setDisposeData(d => ({ ...d, disposalReason: e.target.value }))} />
                      <div className="flex gap-2">
                        <Button size="sm" variant="destructive" onClick={handleDispose}>Confirm</Button>
                        <Button size="sm" variant="outline" onClick={() => setShowDispose(false)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </form>
      )}

      {/* ── TAB: Depreciation Schedule (Projected) ──────────────────────── */}
      {activeTab === 'schedule' && (
        <div>
          <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground bg-info-muted border border-info/20 rounded-lg px-4 py-3">
            <Info size={14} className="text-info shrink-0" />
            <span>This is the <strong>projected full depreciation schedule</strong> from purchase date until fully depreciated or end of useful life.</span>
          </div>
          {projectedSchedule.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Enter purchase value, rate, and method in Asset Details tab to see schedule
            </div>
          ) : (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Financial Year</th>
                    <th className="text-right">Opening Value</th>
                    <th className="text-right">Depreciation ({method})</th>
                    <th className="text-right">Accumulated Dep.</th>
                    <th className="text-right">Closing / Net Block</th>
                    <th className="text-right">Dep %</th>
                  </tr>
                </thead>
                <tbody>
                  {projectedSchedule.map((row, i) => {
                    const isActual = isEdit && asset?.depreciations?.some((d: any) =>
                      d.financialYear === row.fy || String(d.year) === row.fy.split('-')[0]
                    )
                    return (
                      <tr key={row.fy} className={cn(
                        i % 2 === 1 ? 'bg-muted/10' : '',
                        isActual ? 'bg-success/5' : ''
                      )}>
                        <td>
                          <span className="font-medium">FY {row.fy}</span>
                          {isActual && <Badge variant="success" className="text-[9px] ml-2">Posted</Badge>}
                        </td>
                        <td className="amount-col">{formatINR(row.openingValue)}</td>
                        <td className="amount-col text-destructive font-semibold">− {formatINR(row.depAmt)}</td>
                        <td className="amount-col text-muted-foreground">{formatINR(row.accumulated)}</td>
                        <td className="amount-col text-primary font-bold">{formatINR(row.closingValue)}</td>
                        <td className="text-right text-xs text-muted-foreground">
                          {purVal > 0 ? ((row.accumulated / purVal) * 100).toFixed(1) : 0}%
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/30 border-t-2 border-border font-bold">
                    <td className="px-4 py-3">Total</td>
                    <td className="amount-col">{formatINR(purVal)}</td>
                    <td className="amount-col text-destructive">− {formatINR(projectedSchedule.reduce((s, r) => s + r.depAmt, 0))}</td>
                    <td className="amount-col">{formatINR(projectedSchedule[projectedSchedule.length-1]?.accumulated || 0)}</td>
                    <td className="amount-col text-primary">{formatINR(salVal)}</td>
                    <td className="text-right">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Actual History ──────────────────────────────────────────── */}
      {activeTab === 'history' && isEdit && (
        <div>
          {!asset?.depreciations?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <TrendingDown size={40} className="mx-auto mb-3 opacity-30" />
              <p>No depreciation posted yet for this asset.</p>
              <p className="text-xs mt-1">Go to Asset Details tab and use "Post Depreciation" to record monthly depreciation.</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Financial Year</th>
                    <th className="text-right">Opening Value</th>
                    <th className="text-right">Depreciation</th>
                    <th className="text-right">Closing Value</th>
                  </tr>
                </thead>
                <tbody>
                  {asset.depreciations.map((d: any, i: number) => (
                    <tr key={d.id} className={i % 2 === 1 ? 'bg-muted/10' : ''}>
                      <td className="font-medium">{MONTHS[d.month-1]} {d.year}</td>
                      <td className="text-muted-foreground">FY {d.financialYear}</td>
                      <td className="amount-col">{formatINR(Number(d.openingValue))}</td>
                      <td className="amount-col text-destructive font-semibold">− {formatINR(Number(d.depreciationAmt))}</td>
                      <td className="amount-col text-primary font-bold">{formatINR(Number(d.closingValue))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/30 border-t-2 border-border font-bold">
                    <td colSpan={3} className="px-4 py-3">Total Depreciation Posted</td>
                    <td className="amount-col text-destructive">
                      − {formatINR(asset.depreciations.reduce((s: number, d: any) => s + Number(d.depreciationAmt), 0))}
                    </td>
                    <td className="amount-col text-primary">{formatINR(Number(asset.currentValue))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
