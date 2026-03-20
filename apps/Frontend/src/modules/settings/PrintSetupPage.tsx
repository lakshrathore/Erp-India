import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, extractError } from '../../lib/api'
import { useAuthStore } from '../../stores/auth.store'
import { Button, Input, Select, PageHeader } from '../../components/ui'
import { Save, Eye, Printer } from 'lucide-react'

interface PrintConfig {
  // Paper
  paperSize: string
  orientation: string
  margins: string
  // Header
  showLogo: boolean
  showCompanyName: boolean
  showAddress: boolean
  showGSTIN: boolean
  showPhone: boolean
  showEmail: boolean
  // Invoice header
  invoiceTitle: string
  showInvoiceNumber: boolean
  showDate: boolean
  showDueDate: boolean
  // Party
  showBillTo: boolean
  showShipTo: boolean
  showPartyGSTIN: boolean
  // Items
  showHSN: boolean
  showDiscount: boolean
  showFreeQty: boolean
  showBatch: boolean
  showSrNo: boolean
  // Totals
  showTaxBreakup: boolean
  showAmountInWords: boolean
  showBalanceDue: boolean
  // Footer
  footerText: string
  showSignature: boolean
  showBankDetails: boolean
  bankDetails: string
  showTerms: boolean
  termsText: string
  // Copies
  copies: number
  copyLabels: string  // "Original,Duplicate,Triplicate"
}

const DEFAULTS: PrintConfig = {
  paperSize: 'A4', orientation: 'portrait', margins: 'normal',
  showLogo: true, showCompanyName: true, showAddress: true, showGSTIN: true, showPhone: true, showEmail: false,
  invoiceTitle: 'TAX INVOICE', showInvoiceNumber: true, showDate: true, showDueDate: false,
  showBillTo: true, showShipTo: false, showPartyGSTIN: true,
  showHSN: true, showDiscount: true, showFreeQty: false, showBatch: false, showSrNo: true,
  showTaxBreakup: true, showAmountInWords: true, showBalanceDue: true,
  footerText: '', showSignature: true, showBankDetails: false, bankDetails: '', showTerms: false,
  termsText: 'Goods once sold will not be taken back. Subject to local jurisdiction.',
  copies: 1, copyLabels: 'Original',
}

export default function PrintSetupPage() {
  const { activeCompany } = useAuthStore()
  const qc = useQueryClient()
  const [config, setConfig] = useState<PrintConfig>(DEFAULTS)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const companyId = activeCompany?.companyId || ''

  // Load saved config
  const { data: settings } = useQuery({
    queryKey: ['company-settings', companyId, 'print'],
    queryFn: async () => {
      const { data } = await api.get(`/companies/${companyId}`)
      return data.data
    },
    enabled: !!companyId,
  })

  useEffect(() => {
    if (settings?.printConfig) {
      try {
        const parsed = JSON.parse(settings.printConfig)
        setConfig({ ...DEFAULTS, ...parsed })
      } catch {}
    }
  }, [settings])

  const save = async () => {
    setError(''); setSaved(false)
    try {
      await api.put(`/companies/${companyId}`, { printConfig: JSON.stringify(config) })
      qc.invalidateQueries({ queryKey: ['company-settings', companyId, 'print'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) { setError(extractError(e)) }
  }

  const set = (key: keyof PrintConfig, value: any) => setConfig(c => ({ ...c, [key]: value }))
  const toggle = (key: keyof PrintConfig) => setConfig(c => ({ ...c, [key]: !c[key as keyof PrintConfig] }))

  const CheckRow = ({ label, k, helperText }: { label: string; k: keyof PrintConfig; helperText?: string }) => (
    <label className="flex items-start gap-3 py-2 cursor-pointer hover:bg-muted/30 rounded px-2 -mx-2">
      <input type="checkbox" checked={!!config[k]} onChange={() => toggle(k)} className="w-4 h-4 mt-0.5 rounded shrink-0" />
      <div>
        <span className="text-sm">{label}</span>
        {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}
      </div>
    </label>
  )

  return (
    <div>
      <PageHeader title="Print Setup"
        subtitle="Configure invoice and voucher print layout"
        breadcrumbs={[{ label: 'Settings' }, { label: 'Print Setup' }]}
        actions={
          <Button onClick={save}>
            <Save size={14} /> {saved ? 'Saved!' : 'Save Settings'}
          </Button>
        }
      />

      {error && <div className="mb-4 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded px-4 py-3">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">

        {/* Paper */}
        <div className="form-section">
          <h3 className="form-section-title">Paper & Layout</h3>
          <Select label="Paper Size" options={[
            { value: 'A4', label: 'A4 (210×297mm)' },
            { value: 'A5', label: 'A5 (148×210mm)' },
            { value: 'LETTER', label: 'Letter (8.5×11 in)' },
            { value: 'THERMAL_80', label: 'Thermal 80mm (POS)' },
            { value: 'THERMAL_58', label: 'Thermal 58mm (POS)' },
          ]} value={config.paperSize} onChange={e => set('paperSize', e.target.value)} />
          <Select label="Orientation" options={[
            { value: 'portrait', label: 'Portrait' },
            { value: 'landscape', label: 'Landscape' },
          ]} value={config.orientation} onChange={e => set('orientation', e.target.value)} />
          <Select label="Margins" options={[
            { value: 'tight', label: 'Tight (5mm)' },
            { value: 'normal', label: 'Normal (10mm)' },
            { value: 'wide', label: 'Wide (15mm)' },
          ]} value={config.margins} onChange={e => set('margins', e.target.value)} />
          <div className="mt-3">
            <label className="text-xs font-medium text-foreground block mb-1">Invoice Title</label>
            <input className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={config.invoiceTitle} onChange={e => set('invoiceTitle', e.target.value)}
              placeholder="TAX INVOICE / BILL / INVOICE" />
          </div>
          <div className="mt-3">
            <label className="text-xs font-medium text-foreground block mb-1">Number of Copies</label>
            <div className="grid grid-cols-2 gap-3">
              <input type="number" min={1} max={5} value={config.copies}
                onChange={e => set('copies', Number(e.target.value))}
                className="h-8 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              <input value={config.copyLabels} onChange={e => set('copyLabels', e.target.value)}
                placeholder="Original,Duplicate"
                className="h-8 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Comma separated labels for each copy</p>
          </div>
        </div>

        {/* Company Header */}
        <div className="form-section">
          <h3 className="form-section-title">Company Header</h3>
          <CheckRow label="Show Logo" k="showLogo" />
          <CheckRow label="Show Company Name" k="showCompanyName" />
          <CheckRow label="Show Address" k="showAddress" />
          <CheckRow label="Show GSTIN" k="showGSTIN" />
          <CheckRow label="Show Phone" k="showPhone" />
          <CheckRow label="Show Email" k="showEmail" />
          <div className="border-t border-border pt-3 mt-1">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Invoice Info</h4>
            <CheckRow label="Show Invoice Number" k="showInvoiceNumber" />
            <CheckRow label="Show Date" k="showDate" />
            <CheckRow label="Show Due Date" k="showDueDate" />
          </div>
        </div>

        {/* Party & Items */}
        <div className="form-section">
          <h3 className="form-section-title">Party Details</h3>
          <CheckRow label="Show Bill To" k="showBillTo" />
          <CheckRow label="Show Ship To" k="showShipTo" helperText="Separate delivery address" />
          <CheckRow label="Show Party GSTIN" k="showPartyGSTIN" />
          <div className="border-t border-border pt-3 mt-1">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Item Columns</h4>
            <CheckRow label="Show Sr. No." k="showSrNo" />
            <CheckRow label="Show HSN / SAC Code" k="showHSN" />
            <CheckRow label="Show Discount" k="showDiscount" />
            <CheckRow label="Show Free Qty" k="showFreeQty" />
            <CheckRow label="Show Batch / Lot No" k="showBatch" />
          </div>
        </div>

        {/* Totals */}
        <div className="form-section">
          <h3 className="form-section-title">Totals Section</h3>
          <CheckRow label="Show Tax Breakup (CGST/SGST/IGST)" k="showTaxBreakup" />
          <CheckRow label="Show Amount in Words" k="showAmountInWords" />
          <CheckRow label="Show Balance Due / Paid" k="showBalanceDue" />
        </div>

        {/* Footer */}
        <div className="form-section">
          <h3 className="form-section-title">Footer</h3>
          <CheckRow label="Show Authorised Signature" k="showSignature" />
          <CheckRow label="Show Bank Details" k="showBankDetails" helperText="For payment by bank transfer" />
          {config.showBankDetails && (
            <textarea rows={3} value={config.bankDetails}
              onChange={e => set('bankDetails', e.target.value)}
              placeholder="Bank: HDFC Bank&#10;A/c No: 1234567890&#10;IFSC: HDFC0001234"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs mt-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
          )}
          <CheckRow label="Show Terms & Conditions" k="showTerms" />
          {config.showTerms && (
            <textarea rows={3} value={config.termsText}
              onChange={e => set('termsText', e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs mt-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
          )}
          <div className="mt-3">
            <label className="text-xs font-medium text-foreground block mb-1">Footer Text</label>
            <input value={config.footerText} onChange={e => set('footerText', e.target.value)}
              placeholder="Thank you for your business!"
              className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
        </div>

        {/* Preview */}
        <div className="form-section">
          <h3 className="form-section-title">Preview Summary</h3>
          <div className="bg-muted/30 rounded-lg p-3 text-xs space-y-1 text-muted-foreground">
            <p>📄 {config.paperSize} · {config.orientation} · {config.margins} margins</p>
            <p>📋 {config.invoiceTitle}</p>
            <p>📑 {config.copies} cop{config.copies > 1 ? 'ies' : 'y'}: {config.copyLabels}</p>
            <p>🏢 Header: {[config.showLogo && 'Logo', config.showGSTIN && 'GSTIN', config.showPhone && 'Phone'].filter(Boolean).join(', ')}</p>
            <p>📦 Items: {[config.showSrNo && 'Sr#', config.showHSN && 'HSN', config.showDiscount && 'Disc', config.showFreeQty && 'Free Qty'].filter(Boolean).join(', ')}</p>
            <p>💰 Footer: {[config.showTaxBreakup && 'Tax breakup', config.showAmountInWords && 'Words', config.showSignature && 'Signature', config.showBankDetails && 'Bank'].filter(Boolean).join(', ')}</p>
          </div>
          <div className="mt-3 bg-info-muted border border-info/20 rounded-lg px-3 py-2.5 text-xs text-info">
            ℹ️ Print settings apply to all invoices, challans, receipts and voucher prints.
            Individual invoice print is available from the voucher detail page.
          </div>
        </div>
      </div>
    </div>
  )
}
