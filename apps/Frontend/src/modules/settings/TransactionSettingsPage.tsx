import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, extractError } from '../../lib/api'
import { useAuthStore } from '../../stores/auth.store'
import { Button, PageHeader, Badge } from '../../components/ui'
import { Save, Check } from 'lucide-react'

interface TxnSettings {
  // Global
  requireBillingAddress: boolean
  requireShippingAddress: boolean
  allowBackdatedEntry: boolean
  warnBackdatedDays: number
  autoPostOnSave: boolean
  showLowStockWarning: boolean
  allowNegativeStock: boolean
  enableBatchTracking: boolean
  enableSerialTracking: boolean
  // Sale specific
  saleRequireParty: boolean
  saleAllowCreditLimit: boolean
  defaultSaleType: string
  showMRPOnInvoice: boolean
  showPTROnInvoice: boolean
  // Purchase specific
  purchaseRequireParty: boolean
  purchaseAutoReceive: boolean
  // Discount
  enableDiscount1: boolean
  enableDiscount2: boolean
  enableDiscount3: boolean
  discount1Label: string
  discount2Label: string
  discount3Label: string
  maxDiscount1Pct: number
  maxDiscount2Pct: number
  maxDiscount3Pct: number
  // POS
  posRequireCustomer: boolean
  posDefaultPaymentMode: string
  posShowStockQty: boolean
}

const DEFAULTS: TxnSettings = {
  requireBillingAddress: false,
  requireShippingAddress: false,
  allowBackdatedEntry: true,
  warnBackdatedDays: 7,
  autoPostOnSave: false,
  showLowStockWarning: true,
  allowNegativeStock: false,
  enableBatchTracking: false,
  enableSerialTracking: false,
  saleRequireParty: false,
  saleAllowCreditLimit: false,
  defaultSaleType: 'REGULAR',
  showMRPOnInvoice: true,
  showPTROnInvoice: false,
  purchaseRequireParty: true,
  purchaseAutoReceive: false,
  enableDiscount1: true,
  enableDiscount2: true,
  enableDiscount3: true,
  discount1Label: 'Trade Discount',
  discount2Label: 'Cash/Scheme Discount',
  discount3Label: 'Special Discount',
  maxDiscount1Pct: 100,
  maxDiscount2Pct: 100,
  maxDiscount3Pct: 100,
  posRequireCustomer: false,
  posDefaultPaymentMode: 'CASH',
  posShowStockQty: true,
}

export default function TransactionSettingsPage() {
  const { activeCompany } = useAuthStore()
  const qc = useQueryClient()
  const companyId = activeCompany?.companyId || ''
  const [settings, setSettings] = useState<TxnSettings>(DEFAULTS)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const { data: company } = useQuery({
    queryKey: ['company', companyId],
    queryFn: async () => { const { data } = await api.get(`/companies/${companyId}`); return data.data },
    enabled: !!companyId,
  })

  useEffect(() => {
    if (company?.txnSettings) {
      try { setSettings({ ...DEFAULTS, ...JSON.parse(company.txnSettings) }) } catch {}
    }
  }, [company])

  const save = async () => {
    setError(''); setSaved(false)
    try {
      await api.put(`/companies/${companyId}`, { txnSettings: JSON.stringify(settings) })
      qc.invalidateQueries({ queryKey: ['company', companyId] })
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch (e) { setError(extractError(e)) }
  }

  const set = (k: keyof TxnSettings, v: any) => setSettings(s => ({ ...s, [k]: v }))
  const toggle = (k: keyof TxnSettings) => setSettings(s => ({ ...s, [k]: !s[k] }))

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="form-section">
      <h3 className="form-section-title">{title}</h3>
      {children}
    </div>
  )

  const Toggle = ({ label, k, helperText }: { label: string; k: keyof TxnSettings; helperText?: string }) => (
    <label className="flex items-start gap-3 py-2 cursor-pointer hover:bg-muted/20 rounded px-2 -mx-2">
      <div className="relative mt-0.5 shrink-0">
        <input type="checkbox" checked={!!settings[k]} onChange={() => toggle(k)} className="sr-only" />
        <div className={`w-9 h-5 rounded-full transition-colors ${settings[k] ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
          <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${settings[k] ? 'translate-x-4' : ''}`} />
        </div>
      </div>
      <div>
        <p className="text-sm font-medium leading-none">{label}</p>
        {helperText && <p className="text-xs text-muted-foreground mt-1">{helperText}</p>}
      </div>
    </label>
  )

  const NumInput = ({ label, k, min = 0, max = 100 }: { label: string; k: keyof TxnSettings; min?: number; max?: number }) => (
    <div className="flex items-center justify-between py-2">
      <label className="text-sm">{label}</label>
      <input type="number" min={min} max={max} value={settings[k] as number}
        onChange={e => set(k, Number(e.target.value))}
        className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-ring" />
    </div>
  )

  const TextInput = ({ label, k, placeholder }: { label: string; k: keyof TxnSettings; placeholder?: string }) => (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input value={settings[k] as string} onChange={e => set(k, e.target.value)}
        placeholder={placeholder}
        className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
    </div>
  )

  return (
    <div>
      <PageHeader title="Transaction Settings"
        subtitle="Configure behaviour for all voucher types"
        breadcrumbs={[{ label: 'Settings' }, { label: 'Transaction Settings' }]}
        actions={<Button onClick={save}><Save size={14} /> {saved ? 'Saved!' : 'Save'}</Button>}
      />

      {error && <div className="mb-4 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded px-4 py-3">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl">

        <Section title="General">
          <Toggle label="Allow Backdated Entry" k="allowBackdatedEntry" helperText="Allow entering vouchers with past dates" />
          <NumInput label="Warn if backdated by (days)" k="warnBackdatedDays" min={0} max={365} />
          <Toggle label="Auto-Post on Save" k="autoPostOnSave" helperText="Skip Draft — directly post when saved" />
          <Toggle label="Show Low Stock Warning" k="showLowStockWarning" helperText="Alert when item stock falls below reorder level" />
          <Toggle label="Allow Negative Stock" k="allowNegativeStock" helperText="Allow selling even if stock is zero" />
        </Section>

        <Section title="Address">
          <Toggle label="Billing Address Mandatory" k="requireBillingAddress" helperText="Party must have a billing address saved" />
          <Toggle label="Shipping Address Mandatory" k="requireShippingAddress" helperText="Separate shipping/delivery address required" />
        </Section>

        <Section title="Inventory Tracking">
          <Toggle label="Enable Batch / Lot Tracking" k="enableBatchTracking" helperText="Track items by batch number, mfg date, expiry" />
          <Toggle label="Enable Serial Number Tracking" k="enableSerialTracking" helperText="Track items by individual serial numbers" />
        </Section>

        <Section title="Sale Invoice">
          <Toggle label="Customer Required on Sale" k="saleRequireParty" helperText="Cannot save sale without selecting a customer" />
          <Toggle label="Show MRP on Invoice" k="showMRPOnInvoice" />
          <Toggle label="Show PTR on Invoice" k="showPTROnInvoice" helperText="Print Price to Retailer on invoice" />
          <div className="mt-2">
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Default Sale Type</label>
            <select value={settings.defaultSaleType} onChange={e => set('defaultSaleType', e.target.value)}
              className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="REGULAR">Regular (B2B/B2C)</option>
              <option value="EXPORT_WITH_LUT">Export with LUT</option>
              <option value="EXPORT_WITHOUT_LUT">Export without LUT</option>
              <option value="SEZ_WITH_PAYMENT">SEZ with Payment</option>
              <option value="SEZ_WITHOUT_PAYMENT">SEZ without Payment</option>
            </select>
          </div>
        </Section>

        <Section title="Purchase">
          <Toggle label="Vendor Required on Purchase" k="purchaseRequireParty" />
          <Toggle label="Auto-receive on Purchase Post" k="purchaseAutoReceive" helperText="Automatically add GRN when purchase is posted" />
        </Section>

        <Section title="Discount Columns">
          <p className="text-xs text-muted-foreground mb-3">Configure which discount columns appear on vouchers</p>
          <Toggle label="Enable Discount 1" k="enableDiscount1" />
          {settings.enableDiscount1 && (
            <div className="ml-8 space-y-2">
              <TextInput label="Label" k="discount1Label" placeholder="Trade Discount" />
              <NumInput label="Max %" k="maxDiscount1Pct" />
            </div>
          )}
          <Toggle label="Enable Discount 2" k="enableDiscount2" />
          {settings.enableDiscount2 && (
            <div className="ml-8 space-y-2">
              <TextInput label="Label" k="discount2Label" placeholder="Cash/Scheme Discount" />
              <NumInput label="Max %" k="maxDiscount2Pct" />
            </div>
          )}
          <Toggle label="Enable Discount 3" k="enableDiscount3" />
          {settings.enableDiscount3 && (
            <div className="ml-8 space-y-2">
              <TextInput label="Label" k="discount3Label" placeholder="Special Discount" />
              <NumInput label="Max %" k="maxDiscount3Pct" />
            </div>
          )}
        </Section>

        <Section title="POS Settings">
          <Toggle label="Customer Required on POS" k="posRequireCustomer" helperText="Must select customer before checkout" />
          <Toggle label="Show Stock Qty on POS" k="posShowStockQty" helperText="Display available stock on item cards" />
          <div className="mt-2">
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Default Payment Mode</label>
            <select value={settings.posDefaultPaymentMode} onChange={e => set('posDefaultPaymentMode', e.target.value)}
              className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="CARD">Card</option>
            </select>
          </div>
        </Section>
      </div>
    </div>
  )
}
