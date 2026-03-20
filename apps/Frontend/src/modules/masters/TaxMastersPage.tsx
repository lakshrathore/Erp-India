import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Edit, X, Check, Info, Percent } from 'lucide-react'
import { useTaxMasters, useCreateTaxMaster, useUpdateTaxMaster, useDeleteTaxMaster } from '../../hooks/api.hooks'
import { Button, Input, Badge, PageHeader, Spinner } from '../../components/ui'
import { SafeDeleteButton } from '../../components/ui/SafeDeleteButton'
import { extractError } from '../../lib/api'
import { cn } from '../../components/ui/utils'

interface TaxMaster {
  id: string
  name: string
  gstRate: number
  cgstRate: number
  sgstRate: number
  igstRate: number
  cessRate: number
  isActive: boolean
}

interface TaxForm {
  name: string
  gstRate: string
  cgstRate: string
  sgstRate: string
  igstRate: string
  cessRate: string
}

function blankForm(gstRate = ''): TaxForm {
  return { name: '', gstRate, cgstRate: '', sgstRate: '', igstRate: '', cessRate: '0' }
}

function autoFill(gstRateStr: string, cessRateStr: string): Partial<TaxForm> {
  const gst = parseFloat(gstRateStr) || 0
  const half = +(gst / 2).toFixed(3)
  const name = gst === 0 ? 'GST 0%' :
    cessRateStr && parseFloat(cessRateStr) > 0
      ? `GST ${gst}% + Cess ${cessRateStr}%`
      : `GST ${gst}%`
  return {
    name,
    cgstRate: String(half),
    sgstRate: String(half),
    igstRate: String(gst),
  }
}

export default function TaxMastersPage() {
  const { data: taxes = [], isLoading } = useTaxMasters()
  const createMut = useCreateTaxMaster()
  const deleteMut = useDeleteTaxMaster()

  const [editing, setEditing] = useState<TaxMaster | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<TaxForm>(blankForm())
  const [err, setErr] = useState('')

  const updateMut = useUpdateTaxMaster(editing?.id || '')

  const set = (patch: Partial<TaxForm>) => setForm(f => ({ ...f, ...patch }))

  const openCreate = () => {
    setEditing(null)
    setForm(blankForm())
    setErr('')
    setShowForm(true)
  }

  const openEdit = (t: TaxMaster) => {
    setEditing(t)
    setForm({
      name: t.name,
      gstRate: String(t.gstRate),
      cgstRate: String(t.cgstRate),
      sgstRate: String(t.sgstRate),
      igstRate: String(t.igstRate),
      cessRate: String(t.cessRate),
    })
    setErr('')
    setShowForm(true)
  }

  const handleGstRateChange = (val: string) => {
    const auto = autoFill(val, form.cessRate)
    set({ gstRate: val, ...auto })
  }

  const handleCessChange = (val: string) => {
    const auto = autoFill(form.gstRate, val)
    set({ cessRate: val, name: auto.name || form.name })
  }

  const handleSave = async () => {
    setErr('')
    const payload = {
      name: form.name.trim(),
      gstRate: parseFloat(form.gstRate) || 0,
      cgstRate: parseFloat(form.cgstRate) || 0,
      sgstRate: parseFloat(form.sgstRate) || 0,
      igstRate: parseFloat(form.igstRate) || 0,
      cessRate: parseFloat(form.cessRate) || 0,
    }
    if (!payload.name) return setErr('Name is required')
    try {
      if (editing) {
        await updateMut.mutateAsync(payload)
      } else {
        await createMut.mutateAsync(payload)
      }
      setShowForm(false)
      setEditing(null)
    } catch (e) { setErr(extractError(e)) }
  }

  const saving = createMut.isPending || updateMut.isPending

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tax Masters"
        subtitle="GST rate configurations — CGST/SGST for intra-state, IGST for inter-state"
        action={
          <Button size="sm" onClick={openCreate}>
            <Plus size={14} className="mr-1.5" /> New Tax Rate
          </Button>
        }
      />

      {/* Info */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs">
        <Info size={14} className="shrink-0 mt-0.5" />
        <span>
          GST Rate = CGST + SGST (intra-state), or IGST (inter-state). Enter GST % and rates auto-fill.
          Default rates are seeded automatically. You can add custom rates (e.g. with Cess).
        </span>
      </div>

      {/* Form panel */}
      {showForm && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h3 className="font-semibold text-sm mb-4">
            {editing ? `Edit: ${editing.name}` : 'New Tax Rate'}
          </h3>
          {err && (
            <div className="mb-3 p-2 rounded-lg bg-destructive/10 text-destructive text-xs border border-destructive/20">{err}</div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">GST Rate % *</label>
              <Input
                type="number" step="0.01" min="0" max="100"
                value={form.gstRate}
                onChange={e => handleGstRateChange(e.target.value)}
                placeholder="e.g. 18"
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-0.5">Auto-fills CGST/SGST/IGST</p>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Cess %</label>
              <Input
                type="number" step="0.01" min="0"
                value={form.cessRate}
                onChange={e => handleCessChange(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs font-medium mb-1">Display Name *</label>
              <Input
                value={form.name}
                onChange={e => set({ name: e.target.value })}
                placeholder="e.g. GST 18%"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-3">
            <div>
              <label className="block text-xs font-medium mb-1 text-blue-700">CGST %</label>
              <Input
                type="number" step="0.001"
                value={form.cgstRate}
                onChange={e => set({ cgstRate: e.target.value })}
                className="bg-blue-50/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-blue-700">SGST %</label>
              <Input
                type="number" step="0.001"
                value={form.sgstRate}
                onChange={e => set({ sgstRate: e.target.value })}
                className="bg-blue-50/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-orange-700">IGST %</label>
              <Input
                type="number" step="0.001"
                value={form.igstRate}
                onChange={e => set({ igstRate: e.target.value })}
                className="bg-orange-50/50"
              />
            </div>
          </div>

          <div className="flex gap-2 mt-4 pt-3 border-t border-border">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Spinner className="h-4 w-4 mr-1" /> : <Check size={14} className="mr-1" />}
              Save
            </Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditing(null) }}>
              <X size={14} className="mr-1" /> Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner className="h-6 w-6" /></div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Name</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">GST %</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-blue-600">CGST %</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-blue-600">SGST %</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-orange-600">IGST %</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Cess %</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {taxes.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">
                  No tax masters found. They will be auto-created on page reload.
                </td></tr>
              ) : taxes.map((t: TaxMaster) => (
                <tr key={t.id} className="hover:bg-muted/30 transition-colors group">
                  <td className="px-4 py-2.5 font-medium">{t.name}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="font-semibold">{t.gstRate}%</span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-blue-700">{t.cgstRate}%</td>
                  <td className="px-3 py-2.5 text-right text-blue-700">{t.sgstRate}%</td>
                  <td className="px-3 py-2.5 text-right text-orange-700">{t.igstRate}%</td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground">
                    {t.cessRate > 0 ? <span className="text-red-600">{t.cessRate}%</span> : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(t)}>
                        <Edit size={13} />
                      </Button>
                      <SafeDeleteButton
                        onDelete={() => deleteMut.mutate(t.id)}
                        itemName={t.name}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
