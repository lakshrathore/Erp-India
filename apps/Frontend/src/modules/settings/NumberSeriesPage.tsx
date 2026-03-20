import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, extractError } from '../../lib/api'
import { useAuthStore } from '../../stores/auth.store'
import { Button, Input, Select, Badge, PageHeader, Spinner } from '../../components/ui'
import { Save, Check, RefreshCw, Eye } from 'lucide-react'
import { cn } from '../../components/ui/utils'

const VOUCHER_TYPES = [
  { key: 'SALE', label: 'Sale Invoice', group: 'Billing', color: 'text-info' },
  { key: 'PURCHASE', label: 'Purchase Invoice', group: 'Billing', color: 'text-warning' },
  { key: 'CREDIT_NOTE', label: 'Credit Note', group: 'Billing', color: 'text-destructive' },
  { key: 'DEBIT_NOTE', label: 'Debit Note', group: 'Billing', color: 'text-destructive' },
  { key: 'SALE_CHALLAN', label: 'Sale Challan / DC', group: 'Billing', color: 'text-primary' },
  { key: 'PURCHASE_ORDER', label: 'Purchase Order', group: 'Billing', color: 'text-primary' },
  { key: 'PURCHASE_CHALLAN', label: 'Purchase Challan / GRN', group: 'Billing', color: 'text-primary' },
  { key: 'PRODUCTION', label: 'Production / Manufacturing', group: 'Billing', color: 'text-primary' },
  { key: 'RECEIPT', label: 'Receipt', group: 'Accounts', color: 'text-success' },
  { key: 'PAYMENT', label: 'Payment', group: 'Accounts', color: 'text-destructive' },
  { key: 'CONTRA', label: 'Contra', group: 'Accounts', color: 'text-muted-foreground' },
  { key: 'JOURNAL', label: 'Journal', group: 'Accounts', color: 'text-muted-foreground' },
]

const SEPARATORS = [
  { value: '-', label: '— Hyphen  (INV-25-26-0001)' },
  { value: '/', label: '/ Slash   (INV/25-26/0001)' },
  { value: '_', label: '_ Underscore (INV_2526_0001)' },
  { value: '', label: 'None  (INV25260001)' },
]

interface SeriesRow {
  id?: string
  voucherType: string
  prefix: string
  suffix: string
  separator: string
  padLength: number
  startNumber: number
  currentNumber: number
  fyDependent: boolean
  financialYear: string
}

function buildSample(row: SeriesRow, fy: string) {
  const fyShort = fy || '25-26'
  const num = String(row.startNumber || 1).padStart(row.padLength, '0')
  if (row.fyDependent) {
    return `${row.prefix}${row.separator}${fyShort}${row.separator}${num}${row.suffix}`
  }
  return `${row.prefix}${row.separator}${num}${row.suffix}`
}

export default function NumberSeriesPage() {
  const { activeCompany, activeFY } = useAuthStore()
  const companyId = activeCompany?.companyId || ''
  const qc = useQueryClient()
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [rows, setRows] = useState<Record<string, SeriesRow>>({})

  const { data: series = [], isLoading } = useQuery({
    queryKey: ['number-series', companyId],
    queryFn: async () => {
      const { data } = await api.get('/masters/number-series')
      return data.data as SeriesRow[]
    },
    enabled: !!companyId,
  })

  useEffect(() => {
    if (series.length > 0) {
      const map: Record<string, SeriesRow> = {}
      for (const s of series) {
        map[s.voucherType] = { ...s }
      }
      // Fill defaults for missing types
      for (const vt of VOUCHER_TYPES) {
        if (!map[vt.key]) {
          map[vt.key] = {
            voucherType: vt.key, prefix: vt.key.substring(0, 3),
            suffix: '', separator: '-', padLength: 4,
            startNumber: 1, currentNumber: 0,
            fyDependent: true, financialYear: activeFY || '',
          }
        }
      }
      setRows(map)
    }
  }, [series])

  const updateRow = (key: string, field: string, value: any) => {
    setRows(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }))
  }

  const saveSeries = async (voucherType: string) => {
    setSaving(voucherType); setError('')
    const row = rows[voucherType]
    try {
      if (row.id) {
        await api.put(`/masters/number-series/${row.id}`, row)
      } else {
        const { data } = await api.post('/masters/number-series', { ...row, companyId })
        setRows(prev => ({ ...prev, [voucherType]: { ...prev[voucherType], id: data.data.id } }))
      }
      qc.invalidateQueries({ queryKey: ['number-series', companyId] })
      setSaved(voucherType)
      setTimeout(() => setSaved(null), 2000)
    } catch (e) {
      setError(extractError(e))
    } finally {
      setSaving(null)
    }
  }

  const saveAll = async () => {
    setError('')
    for (const vt of VOUCHER_TYPES) {
      await saveSeries(vt.key)
    }
  }

  const groups = [...new Set(VOUCHER_TYPES.map(v => v.group))]

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>

  return (
    <div>
      <PageHeader
        title="Transaction Number Series"
        subtitle="Configure voucher numbering — prefix, suffix, FY-wise"
        breadcrumbs={[{ label: 'Settings' }, { label: 'Number Series' }]}
        actions={
          <Button onClick={saveAll}>
            <Save size={14} /> Save All
          </Button>
        }
      />

      {error && (
        <div className="mb-4 bg-destructive/10 border border-destructive/20 rounded-md px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {groups.map(group => (
          <div key={group}>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{group}</h3>
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide w-40">Voucher Type</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide w-24">Prefix</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide w-20">Separator</th>
                    <th className="text-center px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide w-20">FY-wise</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide w-20">Suffix</th>
                    <th className="text-center px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide w-20">Pad</th>
                    <th className="text-center px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide w-24">Start No.</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Preview</th>
                    <th className="w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {VOUCHER_TYPES.filter(v => v.group === group).map((vt, i) => {
                    const row = rows[vt.key]
                    if (!row) return null
                    const isSaving = saving === vt.key
                    const isSaved = saved === vt.key
                    const preview = buildSample(row, activeFY || '25-26')

                    return (
                      <tr key={vt.key} className={cn('border-t border-border/50', i % 2 === 1 && 'bg-muted/10')}>
                        {/* Voucher type */}
                        <td className="px-4 py-2">
                          <div className={cn('text-sm font-medium', vt.color)}>{vt.label}</div>
                        </td>

                        {/* Prefix */}
                        <td className="px-3 py-2">
                          <input
                            value={row.prefix}
                            onChange={e => updateRow(vt.key, 'prefix', e.target.value.toUpperCase())}
                            className="h-7 w-20 rounded border border-input bg-background px-2 text-xs font-mono uppercase focus:outline-none focus:ring-1 focus:ring-ring"
                            placeholder="INV"
                            maxLength={10}
                          />
                        </td>

                        {/* Separator */}
                        <td className="px-3 py-2">
                          <select
                            value={row.separator}
                            onChange={e => updateRow(vt.key, 'separator', e.target.value)}
                            className="h-7 rounded border border-input bg-background px-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                          >
                            {SEPARATORS.map(s => (
                              <option key={s.value} value={s.value}>{s.value === '' ? 'None' : s.value}</option>
                            ))}
                          </select>
                        </td>

                        {/* FY Dependent */}
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={row.fyDependent}
                            onChange={e => updateRow(vt.key, 'fyDependent', e.target.checked)}
                            className="w-4 h-4 rounded"
                          />
                        </td>

                        {/* Suffix */}
                        <td className="px-3 py-2">
                          <input
                            value={row.suffix}
                            onChange={e => updateRow(vt.key, 'suffix', e.target.value.toUpperCase())}
                            className="h-7 w-16 rounded border border-input bg-background px-2 text-xs font-mono uppercase focus:outline-none focus:ring-1 focus:ring-ring"
                            placeholder="—"
                            maxLength={6}
                          />
                        </td>

                        {/* Pad Length */}
                        <td className="px-3 py-2 text-center">
                          <input
                            type="number"
                            min={1}
                            max={8}
                            value={row.padLength}
                            onChange={e => updateRow(vt.key, 'padLength', Number(e.target.value))}
                            className="h-7 w-12 rounded border border-input bg-background px-2 text-xs text-center focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </td>

                        {/* Start Number */}
                        <td className="px-3 py-2 text-center">
                          <input
                            type="number"
                            min={1}
                            value={row.startNumber}
                            onChange={e => updateRow(vt.key, 'startNumber', Number(e.target.value))}
                            disabled={row.currentNumber > 0}
                            className={cn(
                              'h-7 w-20 rounded border border-input bg-background px-2 text-xs text-center focus:outline-none focus:ring-1 focus:ring-ring',
                              row.currentNumber > 0 && 'opacity-50 cursor-not-allowed'
                            )}
                            title={row.currentNumber > 0 ? 'Cannot change — vouchers already created' : ''}
                          />
                        </td>

                        {/* Preview */}
                        <td className="px-3 py-2">
                          <span className="font-mono text-xs text-primary bg-primary/5 px-2 py-1 rounded">
                            {preview}
                          </span>
                          {row.currentNumber > 0 && (
                            <span className="text-[10px] text-muted-foreground ml-2">
                              Last: #{row.currentNumber}
                            </span>
                          )}
                        </td>

                        {/* Save button */}
                        <td className="px-3 py-2">
                          <Button
                            size="icon-sm"
                            variant={isSaved ? 'default' : 'outline'}
                            onClick={() => saveSeries(vt.key)}
                            loading={isSaving}
                            title="Save this series"
                            className={isSaved ? 'bg-success border-success text-white' : ''}
                          >
                            {isSaved ? <Check size={12} /> : <Save size={12} />}
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* Info */}
      <div className="mt-4 bg-muted/30 border border-border rounded-lg px-4 py-3 text-xs text-muted-foreground space-y-1">
        <p><strong>FY-wise:</strong> ✓ means number resets every financial year (e.g. INV-25-26-0001, INV-26-27-0001)</p>
        <p><strong>Pad:</strong> Number of digits — 4 means 0001, 0002... · 3 means 001, 002...</p>
        <p><strong>Start No:</strong> First number to use. Cannot be changed once vouchers are created.</p>
        <p><strong>Preview</strong> shows exact format for FY {activeFY || '25-26'}</p>
      </div>
    </div>
  )
}
