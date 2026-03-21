import { useState } from 'react'
import { Plus, Trash2, Check, GripVertical, Edit, X } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, extractError } from '../../lib/api'
import { Button, Input, PageHeader, EmptyState, Spinner, Badge } from '../../components/ui'
import { cn } from '../../components/ui/utils'

interface Component {
  name: string; label: string; type: 'EARNING' | 'DEDUCTION'
  calcType: 'FIXED' | 'PERCENTAGE'; value: number
  onComponent: string; taxExempt: boolean; statutory: boolean
}

const DEFAULT_COMPONENTS: Component[] = [
  { name: 'Basic', label: 'Basic Salary', type: 'EARNING', calcType: 'PERCENTAGE', value: 40, onComponent: '', taxExempt: false, statutory: false },
  { name: 'HRA', label: 'House Rent Allowance', type: 'EARNING', calcType: 'PERCENTAGE', value: 50, onComponent: 'Basic', taxExempt: true, statutory: false },
  { name: 'Special_Allowance', label: 'Special Allowance', type: 'EARNING', calcType: 'PERCENTAGE', value: 10, onComponent: '', taxExempt: false, statutory: false },
  { name: 'LTA', label: 'Leave Travel Allowance', type: 'EARNING', calcType: 'FIXED', value: 1000, onComponent: '', taxExempt: true, statutory: false },
]

const PRESETS = [
  { name: 'Standard Staff (CTC-based)', components: DEFAULT_COMPONENTS },
  { name: 'Manager Grade', components: [
    { name: 'Basic', label: 'Basic Salary', type: 'EARNING' as const, calcType: 'PERCENTAGE' as const, value: 45, onComponent: '', taxExempt: false, statutory: false },
    { name: 'HRA', label: 'HRA', type: 'EARNING' as const, calcType: 'PERCENTAGE' as const, value: 50, onComponent: 'Basic', taxExempt: true, statutory: false },
    { name: 'Special_Allowance', label: 'Special Allowance', type: 'EARNING' as const, calcType: 'PERCENTAGE' as const, value: 5, onComponent: '', taxExempt: false, statutory: false },
    { name: 'Performance_Allowance', label: 'Performance Allowance', type: 'EARNING' as const, calcType: 'FIXED' as const, value: 5000, onComponent: '', taxExempt: false, statutory: false },
  ] },
  { name: 'Fixed Monthly', components: [
    { name: 'Basic', label: 'Basic Salary', type: 'EARNING' as const, calcType: 'FIXED' as const, value: 25000, onComponent: '', taxExempt: false, statutory: false },
    { name: 'HRA', label: 'HRA', type: 'EARNING' as const, calcType: 'FIXED' as const, value: 10000, onComponent: '', taxExempt: true, statutory: false },
    { name: 'Conveyance', label: 'Conveyance', type: 'EARNING' as const, calcType: 'FIXED' as const, value: 1600, onComponent: '', taxExempt: true, statutory: false },
    { name: 'Special_Allowance', label: 'Special Allowance', type: 'EARNING' as const, calcType: 'FIXED' as const, value: 5000, onComponent: '', taxExempt: false, statutory: false },
  ] },
]

export default function SalaryStructurePage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [structureName, setStructureName] = useState('')
  const [components, setComponents] = useState<Component[]>(DEFAULT_COMPONENTS)
  const [saveError, setSaveError] = useState('')
  const [deleteError, setDeleteError] = useState('')

  const { data: structures = [], isLoading } = useQuery({
    queryKey: ['salary-structures'],
    queryFn: async () => { const { data } = await api.get('/payroll/salary-structures'); return data.data },
  })

  const saveMut = useMutation({
    mutationFn: async () => {
      if (editId) {
        await api.put(`/payroll/salary-structures/${editId}`, { name: structureName, components })
      } else {
        await api.post('/payroll/salary-structures', { name: structureName, components })
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['salary-structures'] }); resetForm() },
    onError: (e) => setSaveError(extractError(e)),
  })

  const deleteMut = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/payroll/salary-structures/${id}`) },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['salary-structures'] }),
    onError: (e) => setDeleteError(extractError(e)),
  })

  const resetForm = () => {
    setShowForm(false); setEditId(null)
    setStructureName(''); setComponents(DEFAULT_COMPONENTS); setSaveError('')
  }

  const openEdit = (s: any) => {
    setEditId(s.id); setStructureName(s.name)
    setComponents((s.components || []) as Component[])
    setShowForm(true); setSaveError('')
  }

  const addComp = () => setComponents(prev => [...prev, {
    name: `comp${prev.length + 1}`, label: `Component ${prev.length + 1}`,
    type: 'EARNING', calcType: 'FIXED', value: 0, onComponent: '', taxExempt: false, statutory: false,
  }])
  const updateComp = (i: number, u: Partial<Component>) =>
    setComponents(prev => prev.map((c, idx) => idx === i ? { ...c, ...u } : c))
  const deleteComp = (i: number) => setComponents(prev => prev.filter((_, idx) => idx !== i))

  const preview = components.reduce((acc, c) => {
    if (c.type !== 'EARNING') return acc
    const monthly = 600000 / 12
    if (c.calcType === 'FIXED') acc[c.name] = c.value
    else if (!c.onComponent) acc[c.name] = (monthly * c.value) / 100
    else acc[c.name] = ((acc[c.onComponent] || 0) * c.value) / 100
    return acc
  }, {} as Record<string, number>)
  const previewGross = Object.values(preview).reduce((s, v) => s + v, 0)
  const earningNames = components.filter(c => c.type === 'EARNING').map(c => c.name)

  return (
    <div>
      <PageHeader
        title="Salary Structures"
        subtitle="Define CTC components for payroll calculation"
        breadcrumbs={[{ label: 'Payroll' }, { label: 'Salary Structures' }]}
        actions={
          <Button onClick={() => { resetForm(); setShowForm(s => !s) }}>
            <Plus size={15} /> New Structure
          </Button>
        }
      />

      {deleteError && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive flex justify-between">
          <span>{deleteError}</span>
          <button onClick={() => setDeleteError('')}><X size={14} /></button>
        </div>
      )}

      {showForm && (
        <div className="form-section mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">{editId ? 'Edit' : 'New'} Salary Structure</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Presets:</span>
              {PRESETS.map(p => (
                <button key={p.name} onClick={() => { setStructureName(p.name); setComponents(p.components as Component[]) }}
                  className="text-xs px-2 py-1 rounded border border-border hover:border-primary hover:text-primary transition-colors">
                  {p.name.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          <Input label="Structure Name *" placeholder="e.g. Standard Staff Grade A"
            value={structureName} onChange={e => setStructureName(e.target.value)} className="mb-4" />

          <div className="border border-border rounded-lg overflow-hidden mb-4">
            <div className="bg-muted px-3 py-2 grid grid-cols-12 gap-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              <div className="col-span-1"/>
              <div className="col-span-2">Name</div><div className="col-span-2">Label</div>
              <div className="col-span-1">Type</div><div className="col-span-1">Calc</div>
              <div className="col-span-1">Value</div><div className="col-span-2">Based On</div>
              <div className="col-span-1 text-center">Exempt</div><div className="col-span-1"/>
            </div>
            {components.map((c, i) => (
              <div key={i} className={cn('grid grid-cols-12 gap-2 px-3 py-2 items-center border-t border-border/30',
                c.type === 'DEDUCTION' && 'bg-red-50/40')}>
                <div className="col-span-1 text-muted-foreground"><GripVertical size={13} /></div>
                <div className="col-span-2">
                  <input value={c.name} onChange={e => updateComp(i, { name: e.target.value.replace(/\s/g, '_') })}
                    className="h-7 w-full rounded border border-input bg-background px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"/>
                </div>
                <div className="col-span-2">
                  <input value={c.label} onChange={e => updateComp(i, { label: e.target.value })}
                    className="h-7 w-full rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"/>
                </div>
                <div className="col-span-1">
                  <select value={c.type} onChange={e => updateComp(i, { type: e.target.value as any })}
                    className="h-7 w-full rounded border border-input bg-background px-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="EARNING">+ Earn</option><option value="DEDUCTION">− Dedn</option>
                  </select>
                </div>
                <div className="col-span-1">
                  <select value={c.calcType} onChange={e => updateComp(i, { calcType: e.target.value as any })}
                    className="h-7 w-full rounded border border-input bg-background px-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="FIXED">Fixed</option><option value="PERCENTAGE">%</option>
                  </select>
                </div>
                <div className="col-span-1">
                  <input type="number" value={c.value} step="0.01" onChange={e => updateComp(i, { value: Number(e.target.value) })}
                    className="h-7 w-full rounded border border-input bg-background px-2 text-xs text-right font-mono focus:outline-none focus:ring-1 focus:ring-ring"/>
                </div>
                <div className="col-span-2">
                  {c.calcType === 'PERCENTAGE' ? (
                    <select value={c.onComponent} onChange={e => updateComp(i, { onComponent: e.target.value })}
                      className="h-7 w-full rounded border border-input bg-background px-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring">
                      <option value="">% of CTC/12</option>
                      {earningNames.filter(n => n !== c.name).map(n => <option key={n} value={n}>% of {n}</option>)}
                    </select>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </div>
                <div className="col-span-1 flex justify-center">
                  <input type="checkbox" checked={c.taxExempt} title="Tax Exempt"
                    onChange={e => updateComp(i, { taxExempt: e.target.checked })} className="w-3.5 h-3.5"/>
                </div>
                <div className="col-span-1 flex justify-center">
                  {!c.statutory && (
                    <button onClick={() => deleteComp(i)} className="text-muted-foreground hover:text-destructive"><Trash2 size={13}/></button>
                  )}
                </div>
              </div>
            ))}
            <div className="px-3 py-2 border-t border-border/30">
              <button onClick={addComp} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
                <Plus size={12}/> Add Component
              </button>
            </div>
          </div>

          <div className="bg-muted/30 rounded-lg px-4 py-3 mb-4 text-xs">
            <p className="font-medium text-muted-foreground mb-2">Preview for ₹6,00,000/year CTC</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(preview).map(([name, amt]) => (
                <span key={name} className="bg-card border border-border rounded px-2 py-1">
                  {name}: <strong>₹{Math.round(amt).toLocaleString('en-IN')}</strong>
                </span>
              ))}
              <span className="bg-primary/10 text-primary border border-primary/20 rounded px-2 py-1 font-semibold">
                Gross: ₹{Math.round(previewGross).toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {saveError && <p className="text-sm text-destructive mb-3">{saveError}</p>}
          <div className="flex gap-2">
            <Button onClick={() => {
              setSaveError('')
              if (!structureName.trim()) { setSaveError('Structure name required'); return }
              if (components.length === 0) { setSaveError('Add at least one component'); return }
              saveMut.mutate()
            }} loading={saveMut.isPending}>
              <Check size={14}/> {editId ? 'Update' : 'Save'} Structure
            </Button>
            <Button variant="outline" onClick={resetForm}>Cancel</Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : (structures as any[]).length === 0 && !showForm ? (
        <EmptyState title="No salary structures" description="Create structures to enable payroll processing"
          action={<Button onClick={() => setShowForm(true)}><Plus size={15}/> Create Structure</Button>} />
      ) : (
        <div className="space-y-3">
          {(structures as any[]).map((s: any) => {
            const comps = (s.components || []) as Component[]
            const earnings = comps.filter(c => c.type === 'EARNING')
            const deductions = comps.filter(c => c.type === 'DEDUCTION')
            const empCount = s._count?.employees || 0
            return (
              <div key={s.id} className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-muted/20">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-sm">{s.name}</h3>
                    <Badge variant="secondary" className="text-[10px]">{empCount} employee{empCount !== 1 ? 's' : ''}</Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => openEdit(s)}><Edit size={13}/></Button>
                    {empCount === 0 && (
                      <Button variant="ghost" size="icon-sm"
                        onClick={() => { if (window.confirm(`Delete "${s.name}"?`)) deleteMut.mutate(s.id) }}
                        className="text-muted-foreground hover:text-destructive">
                        <Trash2 size={13}/>
                      </Button>
                    )}
                  </div>
                </div>
                <div className="p-4 grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">Earnings ({earnings.length})</p>
                    <div className="space-y-1">
                      {earnings.map(e => (
                        <div key={e.name} className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{e.label}{e.taxExempt && <span className="ml-1 text-[9px] text-teal-600 font-medium">Exempt</span>}</span>
                          <span className="font-mono">{e.calcType === 'FIXED' ? `₹${e.value.toLocaleString('en-IN')}` : `${e.value}%${e.onComponent ? ` of ${e.onComponent}` : ' of CTC'}`}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {deductions.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2">Custom Deductions ({deductions.length})</p>
                      <div className="space-y-1">
                        {deductions.map(d => (
                          <div key={d.name} className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{d.label}</span>
                            <span className="font-mono">{d.calcType === 'FIXED' ? `₹${d.value}` : `${d.value}%`}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="px-4 py-2 border-t border-border/30 bg-muted/10 text-xs text-muted-foreground">
                  Auto-added on process: PF (Emp 12%, Employer 12%), ESIC (Emp 0.75%, Employer 3.25%), Professional Tax, TDS
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
