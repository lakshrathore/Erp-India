import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, extractError } from '../../lib/api'
import { Button, Badge, PageHeader, Spinner, Select, EmptyState } from '../../components/ui'
import { Save, Upload, CheckCircle2, AlertCircle, Users } from 'lucide-react'
import dayjs from 'dayjs'

type AttStatus = 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LEAVE' | 'HOLIDAY' | 'WEEKLY_OFF'

const STATUS_CONFIG: Record<AttStatus, { label: string; short: string; color: string; bg: string }> = {
  PRESENT:    { label: 'Present',    short: 'P',  color: 'text-success',     bg: 'bg-success-muted' },
  ABSENT:     { label: 'Absent',     short: 'A',  color: 'text-destructive', bg: 'bg-destructive/10' },
  HALF_DAY:   { label: 'Half Day',   short: 'H',  color: 'text-warning',     bg: 'bg-warning-muted' },
  LEAVE:      { label: 'Leave',      short: 'L',  color: 'text-info',        bg: 'bg-info-muted' },
  HOLIDAY:    { label: 'Holiday',    short: 'HO', color: 'text-purple-500',  bg: 'bg-purple-50' },
  WEEKLY_OFF: { label: 'Week Off',   short: 'WO', color: 'text-muted-foreground', bg: 'bg-muted' },
}

const STATUS_CYCLE: AttStatus[] = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'WEEKLY_OFF']

export default function AttendancePage() {
  const qc = useQueryClient()
  const today = dayjs()
  const [month, setMonth] = useState(today.month() + 1)
  const [year, setYear] = useState(today.year())
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // Local grid state: { [empId]: { [day]: status } }
  const [grid, setGrid] = useState<Record<string, Record<number, AttStatus>>>({})
  const [initialized, setInitialized] = useState(false)

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const daysInMonth = dayjs(`${year}-${month}-01`).daysInMonth()
  const daysArr = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  // Get employees
  const { data: empData, isLoading: empLoading } = useQuery({
    queryKey: ['employees', 'ACTIVE'],
    queryFn: async () => { const { data } = await api.get('/payroll/employees', { params: { status: 'ACTIVE', limit: 200 } }); return data.data },
    enabled: !!JSON.parse(localStorage.getItem('erp-auth') || '{}')?.state?.activeCompany?.companyId,
  })
  const employees: any[] = empData || []

  // Get existing attendance
  const { data: attData, isLoading: attLoading } = useQuery({
    queryKey: ['attendance', month, year],
    queryFn: async () => { const { data } = await api.get('/payroll/attendance', { params: { month, year } }); return data.data },
    onSuccess: (records: any[]) => {
      if (!initialized) {
        const newGrid: Record<string, Record<number, AttStatus>> = {}
        for (const rec of records) {
          if (!newGrid[rec.employeeId]) newGrid[rec.employeeId] = {}
          newGrid[rec.employeeId][dayjs(rec.date).date()] = rec.status
        }
        setGrid(newGrid)
        setInitialized(true)
      }
    },
    enabled: !!JSON.parse(localStorage.getItem('erp-auth') || '{}')?.state?.activeCompany?.companyId,
  } as any)

  const getStatus = (empId: string, day: number): AttStatus => {
    const status = grid[empId]?.[day]
    if (status) return status
    // Default: Sunday = WEEKLY_OFF
    const dow = dayjs(`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`).day()
    return dow === 0 ? 'WEEKLY_OFF' : 'PRESENT'
  }

  const toggleStatus = (empId: string, day: number) => {
    const current = getStatus(empId, day)
    const idx = STATUS_CYCLE.indexOf(current)
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    setGrid(prev => ({
      ...prev,
      [empId]: { ...prev[empId], [day]: next },
    }))
  }

  const markAll = (empId: string, status: AttStatus) => {
    const newDays: Record<number, AttStatus> = {}
    daysArr.forEach(d => { newDays[d] = status })
    setGrid(prev => ({ ...prev, [empId]: newDays }))
  }

  const handleSave = async () => {
    setSaving(true); setSaveMsg('')
    try {
      const records: any[] = []
      for (const emp of employees) {
        for (const day of daysArr) {
          const status = getStatus(emp.id, day)
          records.push({
            employeeId: emp.id,
            date: `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,
            status,
          })
        }
      }
      await api.post('/payroll/attendance/bulk', { records })
      setSaveMsg('Attendance saved successfully')
      qc.invalidateQueries({ queryKey: ['attendance', month, year] })
      setTimeout(() => setSaveMsg(''), 3000)
    } catch (e) {
      setSaveMsg(extractError(e))
    } finally {
      setSaving(false)
    }
  }

  // Summary per employee
  const getSummary = (empId: string) => {
    let present = 0, absent = 0, half = 0, leave = 0
    for (const day of daysArr) {
      const s = getStatus(empId, day)
      if (s === 'PRESENT') present++
      else if (s === 'ABSENT') absent++
      else if (s === 'HALF_DAY') half += 0.5
      else if (s === 'LEAVE') leave++
    }
    return { present: present + half, absent, leave }
  }

  if (empLoading) return <div className="flex justify-center py-16"><Spinner /></div>

  return (
    <div>
      <PageHeader title="Attendance"
        subtitle="Monthly attendance register"
        breadcrumbs={[{ label: 'Payroll' }, { label: 'Attendance' }]}
        actions={
          <div className="flex gap-2 items-end">
            <select value={month} onChange={e => { setMonth(Number(e.target.value)); setInitialized(false) }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              {MONTHS.map((m, i) => <option key={m} value={i+1}>{m}</option>)}
            </select>
            <input type="number" value={year} onChange={e => { setYear(Number(e.target.value)); setInitialized(false) }}
              className="h-9 w-20 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <Button onClick={handleSave} loading={saving}><Save size={15} /> Save Attendance</Button>
          </div>
        }
      />

      {saveMsg && (
        <div className={`mb-4 flex items-center gap-2 rounded-md px-4 py-3 text-sm border ${saveMsg.includes('success') ? 'bg-success-muted border-success/20 text-success' : 'bg-destructive/10 border-destructive/20 text-destructive'}`}>
          {saveMsg.includes('success') ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {saveMsg}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="text-xs text-muted-foreground">Click cell to toggle:</span>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <span key={key} className={`text-xs px-2 py-0.5 rounded ${cfg.bg} ${cfg.color} font-medium`}>
            {cfg.short} = {cfg.label}
          </span>
        ))}
      </div>

      {employees.length === 0 ? (
        <EmptyState icon={<Users size={40} />} title="No active employees" description="Add employees in the Employees section first" />
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted">
                  <th className="px-3 py-2.5 text-left font-medium sticky left-0 bg-muted z-10 min-w-[160px]">Employee</th>
                  {daysArr.map(d => {
                    const dow = dayjs(`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`).day()
                    return (
                      <th key={d} className={`px-1 py-2.5 text-center font-medium w-8 ${dow === 0 ? 'text-destructive' : dow === 6 ? 'text-warning' : 'text-muted-foreground'}`}>
                        <div>{d}</div>
                        <div className="text-[8px]">{['Su','Mo','Tu','We','Th','Fr','Sa'][dow]}</div>
                      </th>
                    )
                  })}
                  <th className="px-2 py-2.5 text-center font-medium text-success">P</th>
                  <th className="px-2 py-2.5 text-center font-medium text-destructive">A</th>
                  <th className="px-2 py-2.5 text-center font-medium text-info">L</th>
                  <th className="px-2 py-2.5 text-left font-medium min-w-[80px]">All</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp, ei) => {
                  const summary = getSummary(emp.id)
                  return (
                    <tr key={emp.id} className={`border-t border-border/30 ${ei % 2 === 0 ? '' : 'bg-muted/20'}`}>
                      <td className="px-3 py-1.5 sticky left-0 bg-card z-10 border-r border-border/30">
                        <div className="font-medium truncate max-w-[150px]">{emp.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{emp.empCode}</div>
                      </td>
                      {daysArr.map(d => {
                        const status = getStatus(emp.id, d)
                        const cfg = STATUS_CONFIG[status]
                        return (
                          <td key={d} className="p-0.5 text-center">
                            <button
                              onClick={() => toggleStatus(emp.id, d)}
                              className={`w-7 h-7 rounded text-[10px] font-bold transition-colors hover:opacity-80 ${cfg.bg} ${cfg.color}`}
                              title={cfg.label}
                            >
                              {cfg.short}
                            </button>
                          </td>
                        )
                      })}
                      <td className="px-2 py-1.5 text-center font-medium text-success">{summary.present}</td>
                      <td className="px-2 py-1.5 text-center font-medium text-destructive">{summary.absent}</td>
                      <td className="px-2 py-1.5 text-center font-medium text-info">{summary.leave}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex gap-1">
                          <button onClick={() => markAll(emp.id, 'PRESENT')}
                            className="text-[9px] px-1 py-0.5 rounded bg-success-muted text-success hover:opacity-80">All P</button>
                          <button onClick={() => markAll(emp.id, 'ABSENT')}
                            className="text-[9px] px-1 py-0.5 rounded bg-destructive/10 text-destructive hover:opacity-80">All A</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
