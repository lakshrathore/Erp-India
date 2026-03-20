import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, extractError } from '../../lib/api'
import { formatDate, formatINR } from '../../lib/india'
import { Button, Input, Select, Badge, PageHeader, EmptyState, Spinner } from '../../components/ui'
import { Plus, Search, Edit, UserCheck, Save, ArrowLeft, AlertCircle } from 'lucide-react'
import { useAuthStore } from '../../stores/auth.store'
import dayjs from 'dayjs'

// ─── Employee List ─────────────────────────────────────────────────────────────

export function EmployeeListPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('ACTIVE')

  const { data, isLoading } = useQuery({
    queryKey: ['employees', search, status],
    queryFn: async () => {
      const { data } = await api.get('/payroll/employees', { params: { search, status, limit: 100 } })
      return data
    },
    enabled: !!JSON.parse(localStorage.getItem('erp-auth') || '{}')?.state?.activeCompany?.companyId,
  })

  const employees = data?.data || []

  return (
    <div>
      <PageHeader title="Employees"
        subtitle="Employee master and profile management"
        breadcrumbs={[{ label: 'Payroll' }, { label: 'Employees' }]}
        actions={
          <Button onClick={() => navigate('/payroll/employees/new')}>
            <Plus size={15} /> Add Employee
          </Button>
        }
      />

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Search name, emp code, PAN..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select options={[
          { value: 'ACTIVE', label: 'Active' },
          { value: 'INACTIVE', label: 'Inactive' },
          { value: 'RESIGNED', label: 'Resigned' },
          { value: '', label: 'All' },
        ]} value={status} onChange={e => setStatus(e.target.value)} className="w-32" />
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : employees.length === 0 ? (
          <EmptyState icon={<UserCheck size={40} />} title="No employees found"
            description="Add employees to start processing payroll"
            action={<Button onClick={() => navigate('/payroll/employees/new')}><Plus size={15} /> Add Employee</Button>} />
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Emp Code</th><th>Name</th><th>Department</th><th>Designation</th>
                <th>DOJ</th><th>Phone</th><th className="text-right">Basic (₹)</th>
                <th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp: any) => (
                <tr key={emp.id} className="cursor-pointer" onClick={() => navigate(`/payroll/employees/${emp.id}`)}>
                  <td className="font-mono text-xs font-medium">{emp.empCode}</td>
                  <td>
                    <div className="font-medium text-sm">{emp.name}</div>
                    {emp.pan && <div className="text-xs text-muted-foreground font-mono">{emp.pan}</div>}
                  </td>
                  <td className="text-sm">{emp.department?.name || '—'}</td>
                  <td className="text-sm">{emp.designation?.name || '—'}</td>
                  <td className="text-sm whitespace-nowrap">{formatDate(emp.doj)}</td>
                  <td className="text-sm">{emp.phone || '—'}</td>
                  <td className="amount-col text-sm">{emp.basicSalary ? formatINR(emp.basicSalary) : '—'}</td>
                  <td>
                    <Badge variant={emp.status === 'ACTIVE' ? 'success' : emp.status === 'RESIGNED' ? 'destructive' : 'outline'}
                      className="text-[10px]">{emp.status}</Badge>
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon-sm" onClick={() => navigate(`/payroll/employees/${emp.id}/edit`)}>
                      <Edit size={13} />
                    </Button>
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

// ─── Employee Form ─────────────────────────────────────────────────────────────

const empSchema = z.object({
  name: z.string().min(2, 'Name required'),
  empCode: z.string().optional(),
  fatherName: z.string().optional(),
  dob: z.string().optional(),
  gender: z.enum(['M', 'F', 'O']).optional(),
  doj: z.string().min(1, 'Date of joining required'),
  dol: z.string().optional(),
  departmentId: z.string().optional(),
  designationId: z.string().optional(),
  salaryStructureId: z.string().optional(),
  employmentType: z.string().default('FULL_TIME'),
  taxRegime: z.enum(['OLD', 'NEW']).default('NEW'),
  phone: z.string().optional(),
  email: z.string().optional(),
  pan: z.string().optional(),
  aadhaar: z.string().optional(),
  uan: z.string().optional(),
  esicNo: z.string().optional(),
  ptState: z.string().optional(),
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  ifscCode: z.string().optional(),
  presentAddress: z.string().optional(),
  ctc: z.coerce.number().optional(),
  basicSalary: z.coerce.number().optional(),
})
type EmpForm = z.infer<typeof empSchema>

export function EmployeeFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const isEdit = !!id && id !== 'new'
  const [saveError, setSaveError] = useState('')

  const { data: emp } = useQuery({
    queryKey: ['employee', id],
    queryFn: async () => { const { data } = await api.get(`/payroll/employees/${id}`); return data.data },
    enabled: isEdit,
  })

  const { data: depts = [] } = useQuery({ queryKey: ['departments'], queryFn: async () => { const { data } = await api.get('/payroll/departments'); return data.data }, enabled: !!localStorage.getItem('erp-auth') })
  const { data: desigs = [] } = useQuery({ queryKey: ['designations'], queryFn: async () => { const { data } = await api.get('/payroll/designations'); return data.data }, enabled: !!localStorage.getItem('erp-auth') })
  const { data: structures = [] } = useQuery({ queryKey: ['salary-structures'], queryFn: async () => { const { data } = await api.get('/payroll/salary-structures'); return data.data }, enabled: !!localStorage.getItem('erp-auth') })

  const form = useForm<EmpForm>({
    resolver: zodResolver(empSchema),
    defaultValues: { doj: dayjs().format('YYYY-MM-DD'), employmentType: 'FULL_TIME', taxRegime: 'NEW' },
  })

  useEffect(() => {
    if (emp && isEdit) {
      form.reset({
        name: emp.name, empCode: emp.empCode || '', fatherName: emp.fatherName || '',
        dob: emp.dob?.substring(0, 10) || '', gender: emp.gender,
        doj: emp.doj?.substring(0, 10) || '',
        dol: emp.dol?.substring(0, 10) || '',
        departmentId: emp.departmentId || '', designationId: emp.designationId || '',
        salaryStructureId: emp.salaryStructureId || '',
        employmentType: emp.employmentType || 'FULL_TIME',
        taxRegime: emp.taxRegime || 'NEW',
        phone: emp.phone || '', email: emp.email || '',
        pan: emp.pan || '', aadhaar: emp.aadhaar || '',
        uan: emp.uan || '', esicNo: emp.esicNo || '', ptState: emp.ptState || '',
        bankName: emp.bankName || '', accountNumber: emp.accountNumber || '',
        ifscCode: emp.ifscCode || '', presentAddress: emp.presentAddress || '',
        ctc: emp.ctc ? Number(emp.ctc) : undefined,
        basicSalary: emp.basicSalary ? Number(emp.basicSalary) : undefined,
      })
    }
  }, [emp, isEdit])

  const saveMutation = useMutation({
    mutationFn: async (values: EmpForm) => {
      if (isEdit) { const { data } = await api.put(`/payroll/employees/${id}`, values); return data.data }
      else { const { data } = await api.post('/payroll/employees', values); return data.data }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }); navigate('/payroll/employees') },
    onError: (e) => setSaveError(extractError(e)),
  })

  const deptOptions = [{ value: '', label: '-- Select Department --' }, ...(depts as any[]).map((d: any) => ({ value: d.id, label: d.name }))]
  const desigOptions = [{ value: '', label: '-- Select Designation --' }, ...(desigs as any[]).map((d: any) => ({ value: d.id, label: d.name }))]
  const structureOptions = [{ value: '', label: '-- Select Salary Structure --' }, ...(structures as any[]).map((s: any) => ({ value: s.id, label: s.name }))]

  return (
    <div>
      <PageHeader title={isEdit ? 'Edit Employee' : 'New Employee'}
        breadcrumbs={[{ label: 'Payroll' }, { label: 'Employees', href: '/payroll/employees' }, { label: isEdit ? 'Edit' : 'New' }]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/payroll/employees')}><ArrowLeft size={15} /> Back</Button>
            <Button onClick={form.handleSubmit(v => saveMutation.mutate(v))} loading={saveMutation.isPending}>
              <Save size={15} /> {isEdit ? 'Update' : 'Save'} Employee
            </Button>
          </div>
        }
      />
      {saveError && (
        <div className="mb-4 flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-md px-4 py-3 text-sm text-destructive">
          <AlertCircle size={15} /> {saveError}
        </div>
      )}
      <form onSubmit={form.handleSubmit(v => saveMutation.mutate(v))} className="space-y-4">

        {/* Personal */}
        <div className="form-section">
          <h3 className="form-section-title">Personal Information</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <Input label="Full Name" required error={form.formState.errors.name?.message} {...form.register('name')} />
            </div>
            <Input label="Employee Code" placeholder="Auto-generated if blank" {...form.register('empCode')} />
          </div>
          <div className="grid grid-cols-4 gap-4">
            <Input label="Father's Name" {...form.register('fatherName')} />
            <Input label="Date of Birth" type="date" {...form.register('dob')} />
            <Select label="Gender" options={[{ value: '', label: 'Select' }, { value: 'M', label: 'Male' }, { value: 'F', label: 'Female' }, { value: 'O', label: 'Other' }]}
              {...form.register('gender')} />
            <Select label="Marital Status" options={[{ value: '', label: 'Select' }, { value: 'SINGLE', label: 'Single' }, { value: 'MARRIED', label: 'Married' }]}
              {...form.register('employmentType')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Phone" {...form.register('phone')} />
            <Input label="Email" type="email" {...form.register('email')} />
          </div>
          <Input label="Present Address" {...form.register('presentAddress')} />
        </div>

        {/* Employment */}
        <div className="form-section">
          <h3 className="form-section-title">Employment Details</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Input label="Date of Joining" type="date" required error={form.formState.errors.doj?.message} {...form.register('doj')} />
            <Input label="Date of Leaving" type="date" {...form.register('dol')} helperText="Leave blank if active" />
            <Select label="Department" options={deptOptions} {...form.register('departmentId')} />
            <Select label="Designation" options={desigOptions} {...form.register('designationId')} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Select label="Employment Type" options={[
              { value: 'FULL_TIME', label: 'Full Time' }, { value: 'PART_TIME', label: 'Part Time' },
              { value: 'CONTRACT', label: 'Contract' }, { value: 'INTERN', label: 'Intern' },
            ]} {...form.register('employmentType')} />
            <Select label="Tax Regime" options={[{ value: 'NEW', label: 'New Regime (Default)' }, { value: 'OLD', label: 'Old Regime' }]}
              {...form.register('taxRegime')} />
            <Select label="PT State" options={[
              { value: '', label: 'No PT' }, { value: 'RJ', label: 'Rajasthan (No PT)' },
              { value: 'MH', label: 'Maharashtra' }, { value: 'KA', label: 'Karnataka' },
              { value: 'AP', label: 'Andhra Pradesh' }, { value: 'TN', label: 'Tamil Nadu' },
            ]} {...form.register('ptState')} />
          </div>
        </div>

        {/* Salary */}
        <div className="form-section">
          <h3 className="form-section-title">Salary & Structure</h3>
          <div className="grid grid-cols-3 gap-4">
            <Select label="Salary Structure" options={structureOptions} {...form.register('salaryStructureId')} />
            <Input label="Annual CTC (₹)" type="number" placeholder="600000" {...form.register('ctc')} helperText="Cost to company per year" />
            <Input label="Basic Salary / Month (₹)" type="number" placeholder="25000" {...form.register('basicSalary')} helperText="Used for PF calculation" />
          </div>
        </div>

        {/* Statutory IDs */}
        <div className="form-section">
          <h3 className="form-section-title">Statutory IDs</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Input label="PAN" className="uppercase font-mono" {...form.register('pan', { onChange: e => { e.target.value = e.target.value.toUpperCase() } })} />
            <Input label="Aadhaar (last 4)" maxLength={4} {...form.register('aadhaar')} />
            <Input label="UAN (PF)" {...form.register('uan')} helperText="Universal Account Number" />
            <Input label="ESIC No" {...form.register('esicNo')} />
          </div>
        </div>

        {/* Bank */}
        <div className="form-section">
          <h3 className="form-section-title">Bank Account</h3>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Bank Name" {...form.register('bankName')} />
            <Input label="Account Number" {...form.register('accountNumber')} />
            <Input label="IFSC Code" className="uppercase font-mono" {...form.register('ifscCode', { onChange: e => { e.target.value = e.target.value.toUpperCase() } })} />
          </div>
        </div>
      </form>
    </div>
  )
}
