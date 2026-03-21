import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, extractError } from '../../lib/api'
import { formatDate } from '../../lib/india'
import { Button, Badge, Input, Select, PageHeader, Spinner, EmptyState } from '../../components/ui'
import { Plus, Check, X, Calendar } from 'lucide-react'
import dayjs from 'dayjs'

const LEAVE_TYPES = [
  { value: 'EARNED', label: 'Earned Leave (EL)' },
  { value: 'CASUAL', label: 'Casual Leave (CL)' },
  { value: 'SICK', label: 'Sick Leave (SL)' },
  { value: 'MATERNITY', label: 'Maternity Leave' },
  { value: 'PATERNITY', label: 'Paternity Leave' },
  { value: 'COMPENSATORY', label: 'Compensatory Off' },
  { value: 'OPTIONAL', label: 'Optional Holiday' },
  { value: 'LOSS_OF_PAY', label: 'Loss of Pay (LOP)' },
]

const STATUS_BADGE: Record<string, any> = {
  PENDING: 'warning', APPROVED: 'success', REJECTED: 'destructive',
}

export default function LeaveManagementPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [empId, setEmpId] = useState('')
  const [leaveType, setLeaveType] = useState('CASUAL')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [reason, setReason] = useState('')
  const [saveError, setSaveError] = useState('')
  const [viewEmpId, setViewEmpId] = useState('')

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-leave'],
    queryFn: async () => { const { data } = await api.get('/payroll/employees', { params: { status: 'ACTIVE', limit: 200 } }); return data.data },
    staleTime: 30_000,
  })

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ['leave-applications', viewEmpId],
    queryFn: async () => {
      const params: any = { limit: 100 }
      if (viewEmpId) params.employeeId = viewEmpId
      const { data } = await api.get('/payroll/leave-applications', { params })
      return data.data || []
    },
    staleTime: 30_000,
  })

  const applyMutation = useMutation({
    mutationFn: async () => {
      const from = dayjs(fromDate)
      const to = dayjs(toDate)
      const days = to.diff(from, 'day') + 1
      await api.post('/payroll/leave-applications', {
        employeeId: empId, leaveType, fromDate, toDate, days, reason,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-applications'] })
      setShowForm(false); setEmpId(''); setFromDate(''); setToDate(''); setReason(''); setSaveError('')
    },
    onError: (e) => setSaveError(extractError(e)),
  })

  const approveMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'APPROVED' | 'REJECTED' }) => {
      await api.put(`/payroll/leave-applications/${id}`, { status: action })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave-applications'] }),
  })

  const empOptions = [
    { value: '', label: 'All Employees' },
    ...(employees as any[]).map((e: any) => ({ value: e.id, label: `${e.empCode} — ${e.name}` })),
  ]

  const calcDays = () => {
    if (!fromDate || !toDate) return 0
    return dayjs(toDate).diff(dayjs(fromDate), 'day') + 1
  }

  return (
    <div>
      <PageHeader title="Leave Management"
        subtitle="Apply, approve, and track employee leaves"
        breadcrumbs={[{ label: 'Payroll' }, { label: 'Leave Management' }]}
        actions={<Button onClick={() => setShowForm(s => !s)}><Plus size={15} /> Apply Leave</Button>}
      />

      {/* Apply form */}
      {showForm && (
        <div className="form-section mb-4">
          <h3 className="form-section-title">New Leave Application</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Select label="Employee" required
              options={[{ value: '', label: 'Select employee...' }, ...(employees as any[]).map((e: any) => ({ value: e.id, label: `${e.empCode} — ${e.name}` }))]}
              value={empId} onChange={e => setEmpId(e.target.value)} />
            <Select label="Leave Type" options={LEAVE_TYPES}
              value={leaveType} onChange={e => setLeaveType(e.target.value)} />
            <Input label="From Date" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
            <Input label="To Date" type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              helperText={calcDays() > 0 ? `${calcDays()} day(s)` : ''} />
          </div>
          <Input label="Reason" placeholder="Reason for leave (optional)" value={reason} onChange={e => setReason(e.target.value)} />
          {saveError && <p className="text-sm text-destructive mt-2">{saveError}</p>}
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={() => applyMutation.mutate()} loading={applyMutation.isPending}
              disabled={!empId || !fromDate || !toDate}>
              <Check size={13} /> Submit Application
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setSaveError('') }}>
              <X size={13} /> Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-3 mb-4">
        <Select options={empOptions} value={viewEmpId} onChange={e => setViewEmpId(e.target.value)} className="w-64" />
      </div>

      {/* Applications */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : (applications as any[]).length === 0 ? (
        <EmptyState icon={<Calendar size={40} />} title="No leave applications"
          description="No leave applications found for the selected period" />
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Employee</th><th>Leave Type</th><th>From</th><th>To</th>
                <th className="text-center">Days</th><th>Reason</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(applications as any[]).map((app: any) => (
                <tr key={app.id}>
                  <td>
                    <div className="font-medium text-sm">{app.employee?.name || '—'}</div>
                    <div className="text-xs text-muted-foreground font-mono">{app.employee?.empCode}</div>
                  </td>
                  <td>
                    <Badge variant="info" className="text-[10px]">
                      {LEAVE_TYPES.find(l => l.value === app.leaveType)?.label || app.leaveType}
                    </Badge>
                  </td>
                  <td className="text-sm whitespace-nowrap">{formatDate(app.fromDate)}</td>
                  <td className="text-sm whitespace-nowrap">{formatDate(app.toDate)}</td>
                  <td className="text-center text-sm font-medium">{Number(app.days)}</td>
                  <td className="text-xs text-muted-foreground max-w-[160px] truncate">{app.reason || '—'}</td>
                  <td>
                    <Badge variant={STATUS_BADGE[app.status] || 'default'} className="text-[10px]">
                      {app.status}
                    </Badge>
                  </td>
                  <td>
                    {app.status === 'PENDING' && (
                      <div className="flex gap-1">
                        <Button size="icon-sm" variant="ghost"
                          className="text-success hover:text-success"
                          onClick={() => approveMutation.mutate({ id: app.id, action: 'APPROVED' })}
                          title="Approve">
                          <Check size={13} />
                        </Button>
                        <Button size="icon-sm" variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => approveMutation.mutate({ id: app.id, action: 'REJECTED' })}
                          title="Reject">
                          <X size={13} />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Leave balance summary */}
      {viewEmpId && <LeaveBalanceSummary empId={viewEmpId} />}
    </div>
  )
}

function LeaveBalanceSummary({ empId }: { empId: string }) {
  const { data: emp } = useQuery({
    queryKey: ['employee-leave-balance', empId],
    queryFn: async () => { const { data } = await api.get(`/payroll/employees/${empId}`); return data.data },
    enabled: !!empId,
  })

  if (!emp?.leaveBalances?.length) return null

  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold mb-3">Leave Balance — {emp.name}</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {emp.leaveBalances.map((lb: any) => (
          <div key={lb.id} className="stat-card">
            <span className="stat-label">{LEAVE_TYPES.find(l => l.value === lb.leaveType)?.label || lb.leaveType}</span>
            <div className="flex items-end gap-2 mt-1">
              <span className="text-xl font-bold text-foreground">{Number(lb.balance)}</span>
              <span className="text-xs text-muted-foreground mb-0.5">/ {Number(lb.allocated)} days</span>
            </div>
            <div className="w-full bg-muted rounded-full h-1 mt-2">
              <div className="bg-primary h-1 rounded-full" style={{ width: `${Math.min(100, (Number(lb.used) / Number(lb.allocated)) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
