import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, extractError } from '../../lib/api'
import { useAuthStore } from '../../stores/auth.store'
import { Button, Select, PageHeader, Spinner, Badge } from '../../components/ui'
import { Save, Info } from 'lucide-react'

const MAPPING_DEFINITIONS = [
  {
    group: 'Sales',
    items: [
      { key: 'sale_sales_ledger', label: 'Sales Ledger (Goods)', desc: 'Default sales account for goods sale invoices', defaultName: 'Sales' },
      { key: 'sale_party_ledger', label: 'Party (Debtors) Group', desc: 'Ledger group for customer receivables', defaultName: 'Sundry Debtors' },
      { key: 'sale_discount_ledger', label: 'Discount Allowed', desc: 'Discount given to customers', defaultName: 'Discount Allowed' },
      { key: 'sale_roundoff_ledger', label: 'Round Off', desc: 'Sale invoice round off account', defaultName: 'Round Off' },
    ],
  },
  {
    group: 'Purchase',
    items: [
      { key: 'purchase_purchase_ledger', label: 'Purchase Ledger (Goods)', desc: 'Default purchase account for goods purchase invoices', defaultName: 'Purchase' },
      { key: 'purchase_party_ledger', label: 'Party (Creditors) Group', desc: 'Ledger group for vendor payables', defaultName: 'Sundry Creditors' },
      { key: 'purchase_discount_ledger', label: 'Discount Received', desc: 'Discount received from vendors', defaultName: 'Discount Received' },
    ],
  },
  {
    group: 'Service Sales & Purchase (Default)',
    items: [
      { key: 'service_income_ledger', label: 'Service Income (Default)', desc: 'Default income ledger when a service item is sold. Can be overridden per item in Item Master.', defaultName: 'Service Income' },
      { key: 'service_expense_ledger', label: 'Service Expense (Default)', desc: 'Default expense ledger when a service item is purchased. Can be overridden per item in Item Master.', defaultName: 'Service Charges' },
    ],
  },
  {
    group: 'GST',
    items: [
      { key: 'gst_cgst_output', label: 'CGST Output', desc: 'CGST collected on sales', defaultName: 'CGST Payable' },
      { key: 'gst_sgst_output', label: 'SGST Output', desc: 'SGST collected on sales', defaultName: 'SGST Payable' },
      { key: 'gst_igst_output', label: 'IGST Output', desc: 'IGST collected on sales', defaultName: 'IGST Payable' },
      { key: 'gst_cgst_input', label: 'CGST Input', desc: 'CGST paid on purchases (ITC)', defaultName: 'CGST Input Credit' },
      { key: 'gst_sgst_input', label: 'SGST Input', desc: 'SGST paid on purchases (ITC)', defaultName: 'SGST Input Credit' },
      { key: 'gst_igst_input', label: 'IGST Input', desc: 'IGST paid on purchases (ITC)', defaultName: 'IGST Input Credit' },
    ],
  },
  {
    group: 'Payments & Receipts',
    items: [
      { key: 'default_cash_ledger', label: 'Cash Account', desc: 'Default cash ledger for cash transactions', defaultName: 'Cash' },
      { key: 'default_bank_ledger', label: 'Bank Account', desc: 'Default bank ledger for bank transactions', defaultName: '' },
    ],
  },
  {
    group: 'Payroll',
    items: [
      { key: 'payroll_salary_ledger', label: 'Salary & Wages', desc: 'Expense ledger for salary payment', defaultName: 'Salary & Wages' },
      { key: 'payroll_pf_payable', label: 'PF Payable', desc: 'PF liability ledger', defaultName: 'PF Payable' },
      { key: 'payroll_esic_payable', label: 'ESIC Payable', desc: 'ESIC liability ledger', defaultName: 'ESIC Payable' },
      { key: 'payroll_tds_payable', label: 'TDS Payable', desc: 'TDS on salary liability', defaultName: 'TDS Payable' },
      { key: 'payroll_pf_expense', label: 'PF Employer Expense', desc: "Employer's PF contribution expense", defaultName: 'PF Employer Contribution' },
      { key: 'payroll_esic_expense', label: 'ESIC Employer Expense', desc: "Employer's ESIC contribution expense", defaultName: 'ESIC Employer Contribution' },
    ],
  },
]

export default function LedgerMappingPage() {
  const { activeCompany } = useAuthStore()
  const qc = useQueryClient()
  const companyId = activeCompany?.companyId || ''
  const [mappings, setMappings] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const { data: ledgers = [], isLoading: loadingLedgers } = useQuery({
    queryKey: ['ledgers', companyId],
    queryFn: async () => {
      const { data } = await api.get('/masters/ledgers')
      return data.data as any[]
    },
    enabled: !!companyId,
  })

  const { data: company } = useQuery({
    queryKey: ['company', companyId],
    queryFn: async () => { const { data } = await api.get(`/companies/${companyId}`); return data.data },
    enabled: !!companyId,
  })

  useEffect(() => {
    if (company?.ledgerMappings) {
      try { setMappings(JSON.parse(company.ledgerMappings)) } catch {}
    }
  }, [company])

  // Auto-match defaults on first load
  useEffect(() => {
    if (ledgers.length > 0 && Object.keys(mappings).length === 0) {
      const autoMap: Record<string, string> = {}
      for (const group of MAPPING_DEFINITIONS) {
        for (const item of group.items) {
          if (item.defaultName) {
            const match = (ledgers as any[]).find((l: any) =>
              l.name.toLowerCase() === item.defaultName.toLowerCase()
            )
            if (match) autoMap[item.key] = match.id
          }
        }
      }
      setMappings(autoMap)
    }
  }, [ledgers])

  const save = async () => {
    setError(''); setSaved(false)
    try {
      await api.put(`/companies/${companyId}`, { ledgerMappings: JSON.stringify(mappings) })
      qc.invalidateQueries({ queryKey: ['company', companyId] })
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch (e) { setError(extractError(e)) }
  }

  const ledgerOptions = [
    { value: '', label: '-- Select Ledger --' },
    ...(ledgers as any[]).map((l: any) => ({
      value: l.id,
      label: `${l.name}${l.group?.name ? ` (${l.group.name})` : ''}`,
    })),
  ]

  if (loadingLedgers) return <div className="flex justify-center py-16"><Spinner /></div>

  return (
    <div>
      <PageHeader title="Default Ledger Mapping"
        subtitle="Map which ledger to use for each transaction type automatically"
        breadcrumbs={[{ label: 'Settings' }, { label: 'Ledger Mapping' }]}
        actions={<Button onClick={save}><Save size={14} /> {saved ? 'Saved!' : 'Save Mapping'}</Button>}
      />

      <div className="mb-4 flex items-start gap-2 bg-info-muted border border-info/20 rounded-lg px-4 py-3 text-sm text-info max-w-2xl">
        <Info size={15} className="mt-0.5 shrink-0" />
        <p>These mappings are used when vouchers are posted to auto-create accounting entries. System has auto-matched common ledgers — verify and save.</p>
      </div>

      {error && <div className="mb-4 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded px-4 py-3">{error}</div>}

      <div className="space-y-5 max-w-2xl">
        {MAPPING_DEFINITIONS.map(group => (
          <div key={group.group} className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="bg-muted/40 px-4 py-2.5 border-b border-border">
              <h3 className="text-sm font-semibold">{group.group}</h3>
            </div>
            <div className="divide-y divide-border">
              {group.items.map(item => {
                const mapped = (ledgers as any[]).find((l: any) => l.id === mappings[item.key])
                return (
                  <div key={item.key} className="px-4 py-3 flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                      {item.defaultName && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">Default: <span className="font-mono">{item.defaultName}</span></p>
                      )}
                    </div>
                    <div className="w-56 shrink-0">
                      <select
                        value={mappings[item.key] || ''}
                        onChange={e => setMappings(prev => ({ ...prev, [item.key]: e.target.value }))}
                        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        {ledgerOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      {mapped && (
                        <p className="text-[10px] text-success mt-0.5 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-success inline-block" />
                          {mapped.name}
                        </p>
                      )}
                      {!mappings[item.key] && (
                        <p className="text-[10px] text-warning mt-0.5">Not mapped</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
