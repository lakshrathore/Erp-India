import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, Save, ArrowLeft, Check, GripVertical } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api, extractError } from '../../lib/api'
import { Button, Input, Select, PageHeader, Card, CardContent, CardHeader, CardTitle, EmptyState, Spinner, Badge } from '../../components/ui'
import { useSalaryStructures, useCreateSalaryStructure } from '../../hooks/api.hooks'

interface Component {
  name: string
  label: string
  type: 'EARNING' | 'DEDUCTION'
  calcType: 'FIXED' | 'PERCENTAGE'
  value: number
  onComponent: string
  taxExempt: boolean
  statutory: boolean
}

const DEFAULT_COMPONENTS: Component[] = [
  { name: 'Basic', label: 'Basic Salary', type: 'EARNING', calcType: 'PERCENTAGE', value: 40, onComponent: '', taxExempt: false, statutory: false },
  { name: 'HRA', label: 'House Rent Allowance', type: 'EARNING', calcType: 'PERCENTAGE', value: 50, onComponent: 'Basic', taxExempt: true, statutory: false },
  { name: 'Special Allowance', label: 'Special Allowance', type: 'EARNING', calcType: 'PERCENTAGE', value: 10, onComponent: '', taxExempt: false, statutory: false },
  { name: 'LTA', label: 'Leave Travel Allowance', type: 'EARNING', calcType: 'FIXED', value: 1000, onComponent: '', taxExempt: true, statutory: false },
]

const PRESET_STRUCTURES = [
  { name: 'Standard Staff (CTC-based)', components: DEFAULT_COMPONENTS },
  {
    name: 'Manager Grade',
    components: [
      { name: 'Basic', label: 'Basic Salary', type: 'EARNING', calcType: 'PERCENTAGE', value: 45, onComponent: '', taxExempt: false, statutory: false },
      { name: 'HRA', label: 'HRA', type: 'EARNING', calcType: 'PERCENTAGE', value: 50, onComponent: 'Basic', taxExempt: true, statutory: false },
      { name: 'Special Allowance', label: 'Special Allowance', type: 'EARNING', calcType: 'PERCENTAGE', value: 5, onComponent: '', taxExempt: false, statutory: false },
      { name: 'Performance Allowance', label: 'Performance Allowance', type: 'EARNING', calcType: 'FIXED', value: 5000, onComponent: '', taxExempt: false, statutory: false },
    ],
  },
  {
    name: 'Fixed Monthly (no % calc)',
    components: [
      { name: 'Basic', label: 'Basic Salary', type: 'EARNING', calcType: 'FIXED', value: 25000, onComponent: '', taxExempt: false, statutory: false },
      { name: 'HRA', label: 'HRA', type: 'EARNING', calcType: 'FIXED', value: 10000, onComponent: '', taxExempt: true, statutory: false },
      { name: 'Conveyance', label: 'Conveyance', type: 'EARNING', calcType: 'FIXED', value: 1600, onComponent: '', taxExempt: true, statutory: false },
      { name: 'Special Allowance', label: 'Special Allowance', type: 'EARNING', calcType: 'FIXED', value: 5000, onComponent: '', taxExempt: false, statutory: false },
    ],
  },
]

export default function SalaryStructurePage() {
  const navigate = useNavigate()
  const { data: structures = [], isLoading } = useSalaryStructures()
  const createStructure = useCreateSalaryStructure()

  const [showForm, setShowForm] = useState(false)
  const [structureName, setStructureName] = useState('')
  const [components, setComponents] = useState<Component[]>(DEFAULT_COMPONENTS)
  const [saveError, setSaveError] = useState('')

  // Existing component names for "based on" dropdown
  const earningNames = components.filter(c => c.type === 'EARNING').map(c => c.name)

  const addComponent = () => {
    setComponents(prev => [...prev, {
      name: `comp${prev.length + 1}`, label: `Component ${prev.length + 1}`,
      type: 'EARNING', calcType: 'FIXED', value: 0, onComponent: '', taxExempt: false, statutory: false,
    }])
  }

  const updateComponent = (i: number, updates: Partial<Component>) => {
    setComponents(prev => prev.map((c, idx) => idx === i ? { ...c, ...updates } : c))
  }

  const deleteComponent = (i: number) => setComponents(prev => prev.filter((_, idx) => idx !== i))

  const applyPreset = (preset: typeof PRESET_STRUCTURES[0]) => {
    setStructureName(preset.name)
    setComponents(preset.components as Component[])
  }

  const handleSave = async () => {
    setSaveError('')
    if (!structureName.trim()) { setSaveError('Structure name required'); return }
    if (components.length === 0) { setSaveError('Add at least one component'); return }
    try {
      await createStructure.mutateAsync({ name: structureName, components })
      setShowForm(false)
      setStructureName('')
      setComponents(DEFAULT_COMPONENTS)
    } catch (e) {
      setSaveError(extractError(e))
    }
  }

  // Preview gross for a given CTC
  const previewCTC = 600000
  const previewMonthly = previewCTC / 12
  const preview = components.reduce((acc, c) => {
    if (c.type !== 'EARNING') return acc
    if (c.calcType === 'FIXED') acc[c.name] = c.value
    else if (c.calcType === 'PERCENTAGE' && !c.onComponent) acc[c.name] = (previewMonthly * c.value) / 100
    else if (c.calcType === 'PERCENTAGE' && c.onComponent) acc[c.name] = ((acc[c.onComponent] || 0) * c.value) / 100
    return acc
  }, {} as Record<string, number>)
  const previewGross = Object.values(preview).reduce((s, v) => s + v, 0)

  return (
    <div>
      <PageHeader title="Salary Structures"
        subtitle="Define CTC components for payroll processing"
        breadcrumbs={[{ label: 'Payroll' }, { label: 'Salary Structures' }]}
        actions={<Button onClick={() => setShowForm(s => !s)}><Plus size={15} /> New Structure</Button>}
      />

      {/* New structure form */}
      {showForm && (
        <div className="form-section mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">New Salary Structure</h3>
            <div className="flex gap-2">
              <span className="text-xs text-muted-foreground">Presets:</span>
              {PRESET_STRUCTURES.map(p => (
                <button key={p.name} onClick={() => applyPreset(p)}
                  className="text-xs px-2 py-1 rounded border border-border hover:border-primary hover:text-primary transition-colors">
                  {p.name.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          <Input label="Structure Name" required placeholder="e.g. Standard Staff Grade A"
            value={structureName} onChange={e => setStructureName(e.target.value)} className="mb-4" />

          {/* Components table */}
          <div className="border border-border rounded-lg overflow-hidden mb-4">
            <div className="bg-muted px-4 py-2 grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <div className="col-span-1"></div>
              <div className="col-span-2">Field Name</div>
              <div className="col-span-2">Display Label</div>
              <div className="col-span-1">Type</div>
              <div className="col-span-1">Calc</div>
              <div className="col-span-1">Value</div>
              <div className="col-span-2">Based On</div>
              <div className="col-span-1">Exempt</div>
              <div className="col-span-1"></div>
            </div>

            {components.map((c, i) => (
              <div key={i} className={`grid grid-cols-12 gap-2 px-4 py-2 items-center border-t border-border/30 ${c.type === 'DEDUCTION' ? 'bg-destructive/5' : ''}`}>
                <div className="col-span-1 text-muted-foreground flex items-center">
                  <GripVertical size={14} />
                </div>
                <div className="col-span-2">
                  <input value={c.name}
                    onChange={e => updateComponent(i, { name: e.target.value.replace(/\s/g, '_') })}
                    className="h-7 w-full rounded border border-input bg-background px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div className="col-span-2">
                  <input value={c.label}
                    onChange={e => updateComponent(i, { label: e.target.value })}
                    className="h-7 w-full rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div className="col-span-1">
                  <select value={c.type} onChange={e => updateComponent(i, { type: e.target.value as any })}
                    className="h-7 w-full rounded border border-input bg-background px-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="EARNING">+Earn</option>
                    <option value="DEDUCTION">-Dedn</option>
                  </select>
                </div>
                <div className="col-span-1">
                  <select value={c.calcType} onChange={e => updateComponent(i, { calcType: e.target.value as any })}
                    className="h-7 w-full rounded border border-input bg-background px-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="FIXED">Fixed</option>
                    <option value="PERCENTAGE">%</option>
                  </select>
                </div>
                <div className="col-span-1">
                  <input type="number" value={c.value} step="0.01"
                    onChange={e => updateComponent(i, { value: Number(e.target.value) })}
                    className="h-7 w-full rounded border border-input bg-background px-2 text-xs text-right font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div className="col-span-2">
                  {c.calcType === 'PERCENTAGE' ? (
                    <select value={c.onComponent} onChange={e => updateComponent(i, { onComponent: e.target.value })}
                      className="h-7 w-full rounded border border-input bg-background px-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring">
                      <option value="">% of CTC/12</option>
                      {earningNames.filter(n => n !== c.name).map(n => (
                        <option key={n} value={n}>% of {n}</option>
                      ))}
                    </select>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </div>
                <div className="col-span-1 flex items-center justify-center">
                  <input type="checkbox" checked={c.taxExempt}
                    onChange={e => updateComponent(i, { taxExempt: e.target.checked })}
                    className="w-3.5 h-3.5" title="Tax Exempt" />
                </div>
                <div className="col-span-1 flex justify-center">
                  <button onClick={() => deleteComponent(i)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}

            <div className="px-4 py-2 border-t border-border/30">
              <button onClick={addComponent} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
                <Plus size={12} /> Add Component
              </button>
            </div>
          </div>

          {/* Preview */}
          <div className="bg-muted/30 rounded-lg px-4 py-3 mb-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">Preview for CTC ₹6,00,000/year (₹{(previewCTC / 12).toLocaleString('en-IN')}/month)</p>
            <div className="flex flex-wrap gap-3">
              {Object.entries(preview).map(([name, amt]) => (
                <span key={name} className="text-xs bg-card border border-border rounded px-2 py-1">
                  {name}: <strong>₹{Math.round(amt).toLocaleString('en-IN')}</strong>
                </span>
              ))}
              <span className="text-xs bg-primary/10 text-primary border border-primary/20 rounded px-2 py-1 font-semibold">
                Gross: ₹{Math.round(previewGross).toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {saveError && <p className="text-sm text-destructive mb-3">{saveError}</p>}

          <div className="flex gap-2">
            <Button onClick={handleSave} loading={createStructure.isPending}><Check size={14} /> Save Structure</Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setSaveError('') }}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Existing structures */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : (structures as any[]).length === 0 && !showForm ? (
        <EmptyState title="No salary structures" description="Create structures to process payroll"
          action={<Button onClick={() => setShowForm(true)}><Plus size={15} /> Create Structure</Button>} />
      ) : (
        <div className="space-y-3">
          {(structures as any[]).map((s: any) => {
            const comps = (s.components || []) as Component[]
            const earnings = comps.filter(c => c.type === 'EARNING')
            const deductions = comps.filter(c => c.type === 'DEDUCTION')
            return (
              <Card key={s.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{s.name}</CardTitle>
                    <Badge variant="secondary" className="text-[10px]">{s._count?.employees || 0} employees</Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-success mb-1.5">Earnings ({earnings.length})</p>
                      <div className="space-y-1">
                        {earnings.map(e => (
                          <div key={e.name} className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{e.label}</span>
                            <span className="font-mono">
                              {e.calcType === 'FIXED' ? `₹${e.value.toLocaleString('en-IN')}` : `${e.value}%${e.onComponent ? ` of ${e.onComponent}` : ' of CTC'}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {deductions.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-destructive mb-1.5">Deductions ({deductions.length})</p>
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
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
