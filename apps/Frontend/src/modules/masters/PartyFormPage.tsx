import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Save, ArrowLeft, AlertCircle } from 'lucide-react'
import { useParty, useCreateParty, useUpdateParty } from '../../hooks/api.hooks'
import {
  Button, Input, Select, Textarea, PageHeader, Badge, Separator
} from '../../components/ui'
import { INDIAN_STATES, isValidGSTIN, isValidPAN } from '../../lib/india'
import { extractError } from '../../lib/api'
import { useState } from 'react'

const partySchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  code: z.string().optional(),
  type: z.enum(['CUSTOMER', 'VENDOR', 'BOTH']),
  gstin: z.string().optional().refine((v) => !v || isValidGSTIN(v), 'Invalid GSTIN format'),
  gstType: z.enum(['REGULAR', 'COMPOSITION', 'UNREGISTERED', 'SEZ', 'DEEMED_EXPORT', 'EXPORT']),
  pan: z.string().optional().refine((v) => !v || isValidPAN(v), 'Invalid PAN format'),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  stateCode: z.string().optional(),
  pincode: z.string().optional(),
  creditLimit: z.coerce.number().min(0).default(0),
  creditDays: z.coerce.number().int().min(0).default(0),
  openingBalance: z.coerce.number().default(0),
  openingType: z.enum(['Dr', 'Cr']),
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  ifscCode: z.string().optional(),
})

type PartyForm = z.infer<typeof partySchema>

const TYPE_OPTS = [
  { value: 'CUSTOMER', label: 'Customer' },
  { value: 'VENDOR', label: 'Vendor' },
  { value: 'BOTH', label: 'Both (Customer & Vendor)' },
]

const GST_TYPE_OPTS = [
  { value: 'REGULAR', label: 'Regular' },
  { value: 'COMPOSITION', label: 'Composition' },
  { value: 'UNREGISTERED', label: 'Unregistered' },
  { value: 'SEZ', label: 'SEZ' },
  { value: 'DEEMED_EXPORT', label: 'Deemed Export' },
  { value: 'EXPORT', label: 'Export' },
]

const STATE_OPTS = INDIAN_STATES.map((s) => ({ value: s.code, label: `${s.code} - ${s.name}` }))

export default function PartyFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id && id !== 'new'
  const [saveError, setSaveError] = useState('')

  const { data: party, isLoading } = useParty(isEdit ? id : '')
  const createParty = useCreateParty()
  const updateParty = useUpdateParty(id || '')

  const form = useForm<PartyForm>({
    resolver: zodResolver(partySchema),
    defaultValues: {
      type: 'CUSTOMER',
      gstType: 'REGULAR',
      openingType: 'Dr',
      creditLimit: 0,
      creditDays: 0,
      openingBalance: 0,
    },
  })

  useEffect(() => {
    if (party && isEdit) {
      form.reset({
        name: party.name,
        code: party.code || '',
        type: party.type,
        gstin: party.gstin || '',
        gstType: party.gstType,
        pan: party.pan || '',
        contactPerson: party.contactPerson || '',
        phone: party.phone || '',
        email: party.email || '',
        addressLine1: party.addressLine1 || '',
        addressLine2: party.addressLine2 || '',
        city: party.city || '',
        state: party.state || '',
        stateCode: party.stateCode || '',
        pincode: party.pincode || '',
        creditLimit: Number(party.creditLimit),
        creditDays: party.creditDays,
        openingBalance: Number(party.openingBalance),
        openingType: party.openingType,
        bankName: party.bankName || '',
        accountNumber: party.accountNumber || '',
        ifscCode: party.ifscCode || '',
      })
    }
  }, [party, isEdit])

  // Auto-fill state from GSTIN
  const gstinValue = form.watch('gstin')
  useEffect(() => {
    if (gstinValue && gstinValue.length >= 2) {
      const stateCode = gstinValue.substring(0, 2)
      const state = INDIAN_STATES.find((s) => s.code === stateCode)
      if (state) {
        form.setValue('stateCode', stateCode)
        form.setValue('state', state.name)
      }
    }
  }, [gstinValue])

  // Auto-fill stateCode from select
  const stateCode = form.watch('stateCode')
  useEffect(() => {
    if (stateCode) {
      const state = INDIAN_STATES.find((s) => s.code === stateCode)
      if (state) form.setValue('state', state.name)
    }
  }, [stateCode])

  const onSubmit = async (data: PartyForm) => {
    setSaveError('')
    try {
      if (isEdit) {
        await updateParty.mutateAsync(data)
      } else {
        await createParty.mutateAsync(data)
      }
      navigate('/masters/parties')
    } catch (e) {
      setSaveError(extractError(e))
    }
  }

  const isSaving = createParty.isPending || updateParty.isPending

  if (isLoading && isEdit) {
    return <div className="flex justify-center py-20"><div className="skeleton w-full h-96 rounded-lg" /></div>
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Edit Party' : 'New Party'}
        breadcrumbs={[
          { label: 'Masters' },
          { label: 'Parties', href: '/masters/parties' },
          { label: isEdit ? 'Edit' : 'New' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate('/masters/parties')}>
              <ArrowLeft size={15} /> Back
            </Button>
            <Button onClick={form.handleSubmit(onSubmit)} loading={isSaving}>
              <Save size={15} /> {isEdit ? 'Update' : 'Save'} Party
            </Button>
          </div>
        }
      />

      {saveError && (
        <div className="mb-4 flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          <AlertCircle size={15} /> {saveError}
        </div>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Basic Info */}
        <div className="form-section">
          <h3 className="form-section-title">Basic Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Input
                label="Party Name"
                required
                placeholder="Enter full party name"
                error={form.formState.errors.name?.message}
                {...form.register('name')}
              />
            </div>
            <Input
              label="Party Code"
              placeholder="Auto or manual code"
              {...form.register('code')}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Party Type"
              required
              options={TYPE_OPTS}
              error={form.formState.errors.type?.message}
              {...form.register('type')}
            />
            <Input
              label="Contact Person"
              placeholder="Contact name"
              {...form.register('contactPerson')}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Phone" placeholder="+91 98765 43210" {...form.register('phone')} />
            <Input label="Email" type="email" placeholder="party@company.com" {...form.register('email')} />
          </div>
        </div>

        {/* GST Information */}
        <div className="form-section">
          <h3 className="form-section-title">GST Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Input
                label="GSTIN"
                placeholder="22AAAAA0000A1Z5"
                className="uppercase font-mono"
                error={form.formState.errors.gstin?.message}
                {...form.register('gstin', {
                  onChange: (e) => {
                    e.target.value = e.target.value.toUpperCase()
                  },
                })}
                helperText="15-digit GST Identification Number"
              />
            </div>
            <Select
              label="GST Type"
              options={GST_TYPE_OPTS}
              {...form.register('gstType')}
            />
            <Input
              label="PAN Number"
              placeholder="ABCDE1234F"
              className="uppercase font-mono"
              error={form.formState.errors.pan?.message}
              {...form.register('pan', {
                onChange: (e) => { e.target.value = e.target.value.toUpperCase() },
              })}
            />
          </div>
        </div>

        {/* Address */}
        <div className="form-section">
          <h3 className="form-section-title">Address</h3>
          <div className="grid grid-cols-1 gap-4">
            <Input label="Address Line 1" placeholder="Street, area" {...form.register('addressLine1')} />
            <Input label="Address Line 2" placeholder="Landmark, locality (optional)" {...form.register('addressLine2')} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Input label="City" placeholder="City" {...form.register('city')} />
            <Select
              label="State"
              options={[{ value: '', label: 'Select state' }, ...STATE_OPTS]}
              {...form.register('stateCode')}
            />
            <Input label="Pincode" placeholder="000000" maxLength={6} {...form.register('pincode')} />
          </div>
        </div>

        {/* Credit Terms */}
        <div className="form-section">
          <h3 className="form-section-title">Credit Terms & Opening Balance</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Input
              label="Credit Limit (₹)"
              type="number"
              placeholder="0"
              {...form.register('creditLimit')}
              helperText="0 = no limit"
            />
            <Input
              label="Credit Days"
              type="number"
              placeholder="30"
              {...form.register('creditDays')}
              helperText="Payment due period"
            />
            <Input
              label="Opening Balance (₹)"
              type="number"
              placeholder="0"
              {...form.register('openingBalance')}
            />
            <Select
              label="Dr / Cr"
              options={[
                { value: 'Dr', label: 'Debit (Amount receivable)' },
                { value: 'Cr', label: 'Credit (Amount payable)' },
              ]}
              {...form.register('openingType')}
            />
          </div>
        </div>

        {/* Bank Details */}
        <div className="form-section">
          <h3 className="form-section-title">Bank Details (for vendor payments)</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Input label="Bank Name" placeholder="HDFC Bank" {...form.register('bankName')} />
            <Input label="Account Number" placeholder="Account number" {...form.register('accountNumber')} />
            <Input
              label="IFSC Code"
              placeholder="HDFC0001234"
              className="uppercase font-mono"
              {...form.register('ifscCode', {
                onChange: (e) => { e.target.value = e.target.value.toUpperCase() },
              })}
            />
          </div>
        </div>
      </form>
    </div>
  )
}
