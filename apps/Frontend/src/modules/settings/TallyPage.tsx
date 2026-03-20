import { useState, useRef } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api, extractError } from '../../lib/api'
import { formatINR, formatDate } from '../../lib/india'
import { Button, Badge, PageHeader, Spinner, Select, Input } from '../../components/ui'
import { Download, Upload, FileText, CheckCircle2, AlertCircle } from 'lucide-react'
import { useAuthStore } from '../../stores/auth.store'
import dayjs from 'dayjs'

export default function TallyImportExportPage() {
  const { activeFY } = useAuthStore()
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export')
  const [from, setFrom] = useState(activeFY ? `20${activeFY.split('-')[0]}-04-01` : dayjs().subtract(1, 'year').format('YYYY-MM-DD'))
  const [to, setTo] = useState(dayjs().format('YYYY-MM-DD'))
  const [exportType, setExportType] = useState('ALL')
  const [exportMsg, setExportMsg] = useState('')
  const [importMsg, setImportMsg] = useState('')
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Export to Tally XML
  const handleExport = async () => {
    setExportMsg('')
    try {
      const params: any = { from, to, limit: 1000, status: 'POSTED' }
      if (exportType !== 'ALL') params.voucherType = exportType

      const { data } = await api.get('/billing/vouchers', { params })
      const vouchers = data.data || []

      if (vouchers.length === 0) {
        setExportMsg('No vouchers found for selected period')
        return
      }

      const xml = generateTallyXML(vouchers)
      const blob = new Blob([xml], { type: 'application/xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Tally_Export_${from}_${to}.xml`
      a.click()
      setExportMsg(`Exported ${vouchers.length} vouchers successfully`)
    } catch (e) {
      setExportMsg(extractError(e))
    }
  }

  // Import from Tally XML
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true); setImportMsg('')
    try {
      const text = await file.text()
      const parser = new DOMParser()
      const xmlDoc = parser.parseFromString(text, 'application/xml')
      const vouchers = xmlDoc.querySelectorAll('VOUCHER')

      let imported = 0
      let skipped = 0

      for (const v of Array.from(vouchers)) {
        const vType = v.querySelector('VOUCHERTYPENAME')?.textContent?.toUpperCase()
        const date = v.querySelector('DATE')?.textContent
        const narration = v.querySelector('NARRATION')?.textContent || ''
        const amount = parseFloat(v.querySelector('AMOUNT')?.textContent || '0')

        if (!vType || !date) { skipped++; continue }

        // Map Tally type to our type
        const typeMap: Record<string, string> = {
          'SALES': 'SALE', 'PURCHASE': 'PURCHASE',
          'RECEIPT': 'RECEIPT', 'PAYMENT': 'PAYMENT',
          'CONTRA': 'CONTRA', 'JOURNAL': 'JOURNAL',
        }
        const ourType = typeMap[vType]
        if (!ourType) { skipped++; continue }

        // Format date from Tally (YYYYMMDD)
        const d = date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')

        try {
          await api.post('/billing/vouchers', {
            voucherType: ourType,
            date: d,
            narration: `[Tally Import] ${narration}`,
            items: [],
            ledgerEntries: [],
          })
          imported++
        } catch { skipped++ }
      }

      setImportMsg(`Import complete: ${imported} vouchers imported, ${skipped} skipped`)
    } catch (e) {
      setImportMsg('Failed to parse XML file. Ensure it is valid Tally export format.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div>
      <PageHeader title="Tally Import / Export"
        subtitle="Transfer data between ERP India and Tally"
        breadcrumbs={[{ label: 'Settings' }, { label: 'Tally' }]}
      />

      <div className="flex gap-1 border-b border-border mb-6">
        {[{ key: 'export', label: 'Export to Tally' }, { key: 'import', label: 'Import from Tally' }].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'export' ? (
        <div className="space-y-4 max-w-lg">
          <div className="form-section">
            <h3 className="form-section-title">Export Settings</h3>
            <div className="grid grid-cols-2 gap-4">
              <Input label="From Date" type="date" value={from} onChange={e => setFrom(e.target.value)} />
              <Input label="To Date" type="date" value={to} onChange={e => setTo(e.target.value)} />
            </div>
            <Select label="Voucher Type"
              options={[
                { value: 'ALL', label: 'All Voucher Types' },
                { value: 'SALE', label: 'Sale Invoices' },
                { value: 'PURCHASE', label: 'Purchase Invoices' },
                { value: 'RECEIPT', label: 'Receipts' },
                { value: 'PAYMENT', label: 'Payments' },
                { value: 'JOURNAL', label: 'Journals' },
              ]}
              value={exportType} onChange={e => setExportType(e.target.value)} />

            {exportMsg && (
              <div className={`flex items-center gap-2 rounded-md px-3 py-2.5 text-sm border ${exportMsg.includes('success') || exportMsg.includes('Exported') ? 'bg-success-muted border-success/20 text-success' : 'bg-destructive/10 border-destructive/20 text-destructive'}`}>
                {exportMsg.includes('success') || exportMsg.includes('Exported') ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                {exportMsg}
              </div>
            )}

            <Button onClick={handleExport}>
              <Download size={15} /> Export XML for Tally
            </Button>
          </div>

          <div className="bg-muted/30 rounded-lg p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-2">How to import in Tally:</p>
            <ol className="list-decimal list-inside space-y-1 text-xs">
              <li>Open Tally Prime → Gateway of Tally</li>
              <li>Press F3 → Data → Import → Vouchers</li>
              <li>Select the downloaded XML file</li>
              <li>Confirm import — vouchers will be created in Tally</li>
            </ol>
          </div>
        </div>
      ) : (
        <div className="space-y-4 max-w-lg">
          <div className="form-section">
            <h3 className="form-section-title">Import from Tally</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Export data from Tally as XML (Gateway → Export → Data → XML format) and upload here.
            </p>

            <input ref={fileRef} type="file" accept=".xml" className="hidden" onChange={handleImport} />

            {importMsg && (
              <div className={`flex items-center gap-2 rounded-md px-3 py-2.5 text-sm border mb-4 ${importMsg.includes('Import complete') ? 'bg-success-muted border-success/20 text-success' : 'bg-destructive/10 border-destructive/20 text-destructive'}`}>
                {importMsg.includes('Import complete') ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                {importMsg}
              </div>
            )}

            <Button onClick={() => fileRef.current?.click()} loading={importing} variant="outline">
              <Upload size={15} /> Choose Tally XML File
            </Button>
          </div>

          <div className="bg-warning-muted border border-warning/30 rounded-lg p-4 text-sm">
            <p className="font-medium text-warning mb-1">⚠️ Before importing</p>
            <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground">
              <li>Ensure parties (customers/vendors) exist in masters</li>
              <li>Ledger names must match between Tally and this system</li>
              <li>Import creates DRAFT vouchers — review and post manually</li>
              <li>Items and ledgers are not auto-created from Tally data</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tally XML Generator ──────────────────────────────────────────────────────

function generateTallyXML(vouchers: any[]): string {
  const formatTallyDate = (date: string) => {
    return dayjs(date).format('YYYYMMDD')
  }

  const voucherXMLs = vouchers.map(v => {
    const typeMap: Record<string, string> = {
      SALE: 'Sales', PURCHASE: 'Purchase',
      RECEIPT: 'Receipt', PAYMENT: 'Payment',
      CONTRA: 'Contra', JOURNAL: 'Journal',
      CREDIT_NOTE: 'Credit Note', DEBIT_NOTE: 'Debit Note',
    }
    const tallyType = typeMap[v.voucherType] || v.voucherType

    const ledgerEntries = (v.ledgerEntries || []).map((le: any) => `
      <LEDGERENTRIES.LIST>
        <LEDGERNAME>${escapeXML(le.ledger?.name || 'Unknown')}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>${Number(le.debit) > 0 ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
        <AMOUNT>${Number(le.debit) > 0 ? -Number(le.debit) : Number(le.credit)}</AMOUNT>
      </LEDGERENTRIES.LIST>`).join('')

    return `  <VOUCHER>
    <DATE>${formatTallyDate(v.date)}</DATE>
    <GUID>ERP-${v.id}</GUID>
    <VOUCHERTYPENAME>${escapeXML(tallyType)}</VOUCHERTYPENAME>
    <VOUCHERNUMBER>${escapeXML(v.voucherNumber)}</VOUCHERNUMBER>
    <PARTYLEDGERNAME>${escapeXML(v.party?.name || '')}</PARTYLEDGERNAME>
    <NARRATION>${escapeXML(v.narration || '')}</NARRATION>
    <AMOUNT>${-Number(v.grandTotal)}</AMOUNT>
    ${ledgerEntries}
  </VOUCHER>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Import</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>Vouchers</ID>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
${voucherXMLs}
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`
}

function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
