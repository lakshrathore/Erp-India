import { useState } from 'react'
import { Plus, X, Check, Lock, Info, Ruler } from 'lucide-react'
import { useUnits, useCreateUnit, useDeleteUnit } from '../../hooks/api.hooks'
import { Button, Input, Badge, PageHeader, Spinner } from '../../components/ui'
import { SafeDeleteButton } from '../../components/ui/SafeDeleteButton'
import { extractError } from '../../lib/api'

interface Unit {
  id: string
  name: string
  symbol: string
  isSystem: boolean
  isActive: boolean
}

export default function UnitsPage() {
  const { data: units = [], isLoading } = useUnits()
  const createMut = useCreateUnit()
  const deleteMut = useDeleteUnit()

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [err, setErr] = useState('')

  const handleSave = async () => {
    setErr('')
    if (!name.trim()) return setErr('Unit name is required')
    if (!symbol.trim()) return setErr('Symbol is required')
    try {
      await createMut.mutateAsync({ name: name.toUpperCase().trim(), symbol: symbol.trim() })
      setName(''); setSymbol(''); setShowForm(false)
    } catch (e) { setErr(extractError(e)) }
  }

  const systemUnits = (units as Unit[]).filter(u => u.isSystem)
  const customUnits = (units as Unit[]).filter(u => !u.isSystem)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Units of Measurement"
        subtitle="Manage units used in items (PCS, KG, LTR, MTR...)"
        action={
          <Button size="sm" onClick={() => { setShowForm(s => !s); setErr('') }}>
            <Plus size={14} className="mr-1.5" /> New Unit
          </Button>
        }
      />

      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs">
        <Info size={14} className="shrink-0 mt-0.5" />
        <span>
          System units are pre-defined and cannot be deleted. You can add custom units specific to your business.
        </span>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h3 className="font-semibold text-sm mb-3">Add New Unit</h3>
          {err && (
            <div className="mb-3 p-2 rounded-lg bg-destructive/10 text-destructive text-xs border border-destructive/20">{err}</div>
          )}
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium mb-1">Unit Name *</label>
              <Input
                value={name}
                onChange={e => setName(e.target.value.toUpperCase())}
                placeholder="e.g. BOTTLE"
                className="font-mono"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
              <p className="text-xs text-muted-foreground mt-0.5">Auto-converted to uppercase</p>
            </div>
            <div className="w-36">
              <label className="block text-xs font-medium mb-1">Symbol *</label>
              <Input
                value={symbol}
                onChange={e => setSymbol(e.target.value)}
                placeholder="e.g. Btl"
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
            </div>
            <div className="flex gap-2 pb-0.5">
              <Button onClick={handleSave} disabled={createMut.isPending}>
                {createMut.isPending ? <Spinner className="h-4 w-4 mr-1" /> : <Check size={14} className="mr-1" />}
                Save
              </Button>
              <Button variant="outline" onClick={() => { setShowForm(false); setErr('') }}>
                <X size={14} />
              </Button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner className="h-6 w-6" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* System Units */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
              <Lock size={13} className="text-muted-foreground" />
              <span className="text-sm font-medium">System Units</span>
              <Badge variant="secondary" className="ml-auto text-xs">{systemUnits.length}</Badge>
            </div>
            <div className="divide-y divide-border/50">
              {systemUnits.map((u: Unit) => (
                <div key={u.id} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-semibold text-sm w-16">{u.name}</span>
                    <span className="text-xs text-muted-foreground">{u.symbol}</span>
                  </div>
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    <Lock size={10} className="mr-1" /> System
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          {/* Custom Units */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
              <Ruler size={13} className="text-muted-foreground" />
              <span className="text-sm font-medium">Custom Units</span>
              <Badge variant="secondary" className="ml-auto text-xs">{customUnits.length}</Badge>
            </div>
            {customUnits.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-xs">
                <p>No custom units yet.</p>
                <button
                  onClick={() => setShowForm(true)}
                  className="mt-1 text-primary hover:underline"
                >
                  Add your first custom unit →
                </button>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {customUnits.map((u: Unit) => (
                  <div key={u.id} className="flex items-center justify-between px-4 py-2.5 group">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-semibold text-sm w-16">{u.name}</span>
                      <span className="text-xs text-muted-foreground">{u.symbol}</span>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <SafeDeleteButton
                        onDelete={() => deleteMut.mutate(u.id)}
                        itemName={u.name}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
