import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, BookOpen, Edit, ChevronRight } from 'lucide-react'
import { useLedgers, useLedgerGroups, useCreateLedger, useUpdateLedger } from '../../hooks/api.hooks'
import { formatINR } from '../../lib/india'
import { Button, Input, Select, Badge, EmptyState, Spinner, PageHeader } from '../../components/ui'
import { cn } from '../../components/ui/utils'

// Nature colors
const NATURE_BADGE: Record<string, any> = {
  ASSET: 'info', LIABILITY: 'warning', INCOME: 'success', EXPENSE: 'destructive', EQUITY: 'default',
}

export default function LedgersPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [groupId, setGroupId] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  const { data: ledgers = [], isLoading } = useLedgers({ search, groupId })
  const { data: groups = [] } = useLedgerGroups()
  const createLedger = useCreateLedger()

  // Build flat group options
  const groupOptions = [
    { value: '', label: 'All Groups' },
    ...(groups as any[]).map((g: any) => ({ value: g.id, label: g.name })),
  ]

  const filtered = (ledgers as any[]).filter((l: any) => {
    if (search && !l.name.toLowerCase().includes(search.toLowerCase())) return false
    if (groupId && l.groupId !== groupId) return false
    return true
  })

  return (
    <div>
      <PageHeader
        title="Ledgers"
        subtitle="Chart of accounts — all financial ledgers"
        breadcrumbs={[{ label: 'Masters' }, { label: 'Ledgers' }]}
        actions={<Button onClick={() => { setShowForm(true); setEditId(null) }}><Plus size={15} /> Add Ledger</Button>}
      />

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Search ledger name..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select options={groupOptions} value={groupId} onChange={e => setGroupId(e.target.value)} className="w-52" />
      </div>

      {/* Inline create form */}
      {showForm && (
        <LedgerForm groups={groups as any[]} onSave={async (data) => {
          await createLedger.mutateAsync(data)
          setShowForm(false)
        }} onCancel={() => setShowForm(false)} saving={createLedger.isPending} />
      )}

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<BookOpen size={40} />} title="No ledgers found"
            description="Ledgers are auto-created for parties. Add more for expenses, income etc."
            action={<Button onClick={() => setShowForm(true)}><Plus size={15} /> Add Ledger</Button>} />
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Ledger Name</th>
                <th>Group</th>
                <th>Nature</th>
                <th className="text-right">Opening Balance</th>
                <th>GSTIN</th>
                <th>TDS</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(filtered as any[]).map((l: any) => (
                <tr key={l.id}>
                  <td>
                    <div className="font-medium text-sm">{l.name}</div>
                    {l.isSystem && <span className="text-[10px] text-muted-foreground">System</span>}
                  </td>
                  <td className="text-sm text-muted-foreground">{l.group?.name}</td>
                  <td>
                    <Badge variant={NATURE_BADGE[l.group?.nature] || 'default'} className="text-[10px]">
                      {l.group?.nature}
                    </Badge>
                  </td>
                  <td className="amount-col text-sm">
                    {Number(l.openingBalance) !== 0 ? (
                      <span className={l.openingType === 'Dr' ? 'amount-debit' : 'amount-credit'}>
                        {formatINR(l.openingBalance)} {l.openingType}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="font-mono text-xs">{l.gstin || '—'}</td>
                  <td>
                    {l.tdsApplicable ? (
                      <Badge variant="warning" className="text-[10px]">{l.tdsSection} @ {l.tdsRate}%</Badge>
                    ) : '—'}
                  </td>
                  <td>
                    {!l.isSystem && (
                      <Button variant="ghost" size="icon-sm" onClick={() => setEditId(l.id)}>
                        <Edit size={13} />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Inline Ledger Form ───────────────────────────────────────────────────────

function LedgerForm({ groups, onSave, onCancel, saving, initial }: {
  groups: any[]; saving: boolean
  initial?: any
  onSave: (data: any) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    groupId: initial?.groupId || '',
    openingBalance: initial?.openingBalance || 0,
    openingType: initial?.openingType || 'Dr',
    gstin: initial?.gstin || '',
    panNumber: initial?.panNumber || '',
    tdsApplicable: initial?.tdsApplicable || false,
    tdsSection: initial?.tdsSection || '',
    tdsRate: initial?.tdsRate || '',
    bankName: initial?.bankName || '',
    accountNumber: initial?.accountNumber || '',
    ifscCode: initial?.ifscCode || '',
  })
  const [error, setError] = useState('')

  const groupOptions = groups.map((g: any) => ({ value: g.id, label: `${g.name} (${g.nature})` }))

  const handleSave = async () => {
    setError('')
    if (!form.name.trim()) { setError('Name required'); return }
    if (!form.groupId) { setError('Group required'); return }
    try {
      await onSave(form)
    } catch (e: any) {
      setError(e.message || 'Save failed')
    }
  }

  return (
    <div className="form-section mb-4">
      <h3 className="form-section-title">{initial ? 'Edit Ledger' : 'New Ledger'}</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div className="col-span-2">
          <Input label="Ledger Name" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="col-span-2">
          <Select label="Under Group" required options={[{ value: '', label: 'Select group...' }, ...groupOptions]}
            value={form.groupId} onChange={e => setForm(f => ({ ...f, groupId: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3 mb-3">
        <Input label="Opening Balance (₹)" type="number" value={form.openingBalance}
          onChange={e => setForm(f => ({ ...f, openingBalance: Number(e.target.value) }))} />
        <Select label="Dr / Cr" options={[{ value: 'Dr', label: 'Dr (Debit)' }, { value: 'Cr', label: 'Cr (Credit)' }]}
          value={form.openingType} onChange={e => setForm(f => ({ ...f, openingType: e.target.value }))} />
        <Input label="GSTIN" className="font-mono uppercase" value={form.gstin}
          onChange={e => setForm(f => ({ ...f, gstin: e.target.value.toUpperCase() }))} />
        <Input label="PAN" className="font-mono uppercase" value={form.panNumber}
          onChange={e => setForm(f => ({ ...f, panNumber: e.target.value.toUpperCase() }))} />
      </div>

      <div className="flex items-center gap-3 mb-3">
        <input type="checkbox" id="tds" checked={form.tdsApplicable}
          onChange={e => setForm(f => ({ ...f, tdsApplicable: e.target.checked }))} className="w-4 h-4" />
        <label htmlFor="tds" className="text-sm font-medium">TDS Applicable</label>
      </div>

      {form.tdsApplicable && (
        <div className="grid grid-cols-3 gap-3 mb-3">
          <Input label="TDS Section" placeholder="194C / 194J / 194I" value={form.tdsSection}
            onChange={e => setForm(f => ({ ...f, tdsSection: e.target.value }))} />
          <Input label="TDS Rate %" type="number" step="0.01" value={form.tdsRate}
            onChange={e => setForm(f => ({ ...f, tdsRate: e.target.value }))} />
        </div>
      )}

      {error && <div className="text-sm text-destructive mb-3">{error}</div>}

      <div className="flex gap-2">
        <Button onClick={handleSave} loading={saving} size="sm"><Plus size={13} /> Save</Button>
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}
