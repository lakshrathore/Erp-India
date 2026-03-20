import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, extractError } from '../../lib/api'
import { Button, Input, Badge, PageHeader, EmptyState, Spinner } from '../../components/ui'
import { Plus, Building, Check, X } from 'lucide-react'

export default function GodownsPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [saveError, setSaveError] = useState('')

  const { data: godowns = [], isLoading } = useQuery({
    queryKey: ['godowns'],
    queryFn: async () => { const { data } = await api.get('/masters/godowns'); return data.data },
  })

  const createMutation = useMutation({
    mutationFn: async () => { await api.post('/masters/godowns', { name, location }) },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['godowns'] })
      setShowForm(false); setName(''); setLocation(''); setSaveError('')
    },
    onError: (e) => setSaveError(extractError(e)),
  })

  return (
    <div>
      <PageHeader title="Godowns / Warehouses"
        subtitle="Stock locations for inventory management"
        breadcrumbs={[{ label: 'Masters' }, { label: 'Godowns' }]}
        actions={<Button onClick={() => setShowForm(s => !s)}><Plus size={15} /> Add Godown</Button>}
      />

      {showForm && (
        <div className="form-section mb-4">
          <h3 className="form-section-title">New Godown</h3>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Godown Name" required placeholder="e.g. Main Godown - Jaipur"
              value={name} onChange={e => setName(e.target.value)} />
            <Input label="Location / Address" placeholder="Street, city"
              value={location} onChange={e => setLocation(e.target.value)} />
          </div>
          {saveError && <p className="text-sm text-destructive mt-2">{saveError}</p>}
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={() => createMutation.mutate()} loading={createMutation.isPending}
              disabled={!name.trim()}><Check size={13} /> Save</Button>
            <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setSaveError('') }}><X size={13} /> Cancel</Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : (godowns as any[]).length === 0 ? (
        <EmptyState icon={<Building size={40} />} title="No godowns"
          description="Add godowns to track stock location-wise"
          action={<Button onClick={() => setShowForm(true)}><Plus size={15} /> Add Godown</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(godowns as any[]).map((g: any) => (
            <div key={g.id} className="bg-card border border-border rounded-lg p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Building size={16} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{g.name}</p>
                {g.location && <p className="text-xs text-muted-foreground mt-0.5 truncate">{g.location}</p>}
                <Badge variant={g.isActive ? 'success' : 'outline'} className="text-[10px] mt-2">
                  {g.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
