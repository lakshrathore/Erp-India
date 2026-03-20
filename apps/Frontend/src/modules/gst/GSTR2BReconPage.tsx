import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, extractError } from '../../lib/api'
import { formatINR, formatDate, getGSTRPeriodLabel } from '../../lib/india'
import { Button, Badge, PageHeader, Spinner, EmptyState } from '../../components/ui'
import { Upload, CheckCircle2, AlertTriangle, XCircle, FileText } from 'lucide-react'
import dayjs from 'dayjs'

type ReconTab = 'matched' | 'portal_only' | 'books_only'

export default function GSTR2BReconPage() {
  const defaultPeriod = dayjs().subtract(1, 'month').format('MMYYYY')
  const [period, setPeriod] = useState(defaultPeriod)
  const [activeTab, setActiveTab] = useState<ReconTab>('portal_only')
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['gstr2b-recon', period],
    queryFn: async () => {
      const { data } = await api.get('/gst/recon/2b', { params: { period } })
      return data.data
    },
    enabled: period.length === 6,
  })

  const uploadMutation = useMutation({
    mutationFn: async (entries: any[]) => {
      await api.post('/gst/recon/2b/upload', { period, entries })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gstr2b-recon', period] })
      setUploadError('')
    },
    onError: (e) => setUploadError(extractError(e)),
  })

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      // GSTN 2B JSON structure: data.docdata.b2b[].inv[]
      const entries: any[] = []
      const b2b = json?.data?.docdata?.b2b || json?.b2b || []
      for (const supplier of b2b) {
        const gstin = supplier.ctin || supplier.gstin || ''
        const name = supplier.trdnm || supplier.name || ''
        for (const inv of supplier.inv || []) {
          entries.push({
            supplierGstin: gstin, supplierName: name,
            invoiceNumber: inv.inum || inv.invoiceNumber || '',
            invoiceDate: inv.idt || inv.invoiceDate || '',
            invoiceType: 'B2B',
            placeOfSupply: inv.pos || '',
            reverseCharge: inv.rchrg === 'Y',
            taxableValue: inv.val || 0,
            igstAmount: inv.itms?.[0]?.itm_det?.igst || 0,
            cgstAmount: inv.itms?.[0]?.itm_det?.camt || 0,
            sgstAmount: inv.itms?.[0]?.itm_det?.samt || 0,
            cessAmount: inv.itms?.[0]?.itm_det?.csamt || 0,
            itcAvailable: true,
          })
        }
      }
      await uploadMutation.mutateAsync(entries)
    } catch {
      setUploadError('Invalid JSON file. Upload GSTN portal 2B JSON.')
    }
  }

  const TABS: { key: ReconTab; label: string; icon: React.ReactNode; count?: number; color: string }[] = [
    { key: 'matched', label: 'Matched', icon: <CheckCircle2 size={14} />, count: data?.summary?.matched, color: 'text-success' },
    { key: 'portal_only', label: 'In 2B, not in books', icon: <AlertTriangle size={14} />, count: data?.summary?.inPortalNotBooks, color: 'text-warning' },
    { key: 'books_only', label: 'In books, not in 2B', icon: <XCircle size={14} />, count: data?.summary?.inBooksNotPortal, color: 'text-destructive' },
  ]

  return (
    <div>
      <PageHeader
        title="GSTR-2B Reconciliation"
        subtitle="Match purchase register with GSTN portal 2B"
        breadcrumbs={[{ label: 'GST' }, { label: '2B Reconciliation' }]}
        actions={
          <div className="flex gap-2 items-center">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Period</label>
              <input value={period} onChange={e => setPeriod(e.target.value)}
                maxLength={6} placeholder="032025"
                className="h-9 w-28 rounded-md border border-input bg-background px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="mt-5">
              <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFileUpload} />
              <Button variant="outline" onClick={() => fileRef.current?.click()} loading={uploadMutation.isPending}>
                <Upload size={14} /> Upload 2B JSON
              </Button>
            </div>
          </div>
        }
      />

      {uploadError && (
        <div className="mb-4 bg-destructive/10 border border-destructive/20 rounded-md px-4 py-3 text-sm text-destructive">
          {uploadError}
        </div>
      )}

      {period.length === 6 && (
        <div className="mb-4 flex items-center gap-3">
          <Badge variant="info">{getGSTRPeriodLabel(period)}</Badge>
          {data?.summary?.totalITCAtRisk > 0 && (
            <span className="text-sm text-warning font-medium">
              ⚠️ ITC at risk: {formatINR(data.summary.totalITCAtRisk)}
            </span>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !data ? (
        <EmptyState icon={<FileText size={40} />} title="Enter period and upload 2B"
          description="Upload GSTR-2B JSON from GSTN portal to start reconciliation" />
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="stat-card">
              <span className="stat-label">2B Entries</span>
              <span className="stat-value">{data.summary.total2BEntries}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Matched</span>
              <span className="stat-value text-success">{data.summary.matched}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">In 2B Only</span>
              <span className="stat-value text-warning">{data.summary.inPortalNotBooks}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">ITC at Risk</span>
              <span className="stat-value text-destructive">{formatINR(data.summary.totalITCAtRisk)}</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-border mb-4">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                  activeTab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}>
                <span className={t.color}>{t.icon}</span>
                {t.label}
                {t.count !== undefined && (
                  <Badge variant={t.count > 0 ? (t.key === 'matched' ? 'success' : 'warning') : 'outline'} className="text-[10px] px-1.5">{t.count}</Badge>
                )}
              </button>
            ))}
          </div>

          {activeTab === 'matched' && <MatchedTable entries={data.matched || []} />}
          {activeTab === 'portal_only' && <PortalOnlyTable entries={data.inPortalNotBooks || []} />}
          {activeTab === 'books_only' && <BooksOnlyTable entries={data.inBooksNotPortal || []} />}
        </>
      )}
    </div>
  )
}

function MatchedTable({ entries }: { entries: any[] }) {
  if (!entries.length) return <EmptyState title="No matched entries" description="Run reconciliation after uploading 2B" />
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <table className="erp-table">
        <thead>
          <tr>
            <th>Supplier GSTIN</th><th>Supplier</th><th>Invoice No</th><th>Date</th>
            <th className="text-right">Portal Taxable</th><th className="text-right">Books Taxable</th>
            <th className="text-right">Tax Diff</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e: any, i: number) => (
            <tr key={i}>
              <td className="font-mono text-xs">{e.gstin}</td>
              <td className="text-sm truncate max-w-[140px]">{e.supplierName}</td>
              <td className="font-mono text-xs">{e.invoiceNumber}</td>
              <td className="text-sm whitespace-nowrap">{formatDate(e.invoiceDate)}</td>
              <td className="amount-col text-sm">{formatINR(e.portal?.taxable)}</td>
              <td className="amount-col text-sm">{formatINR(e.books?.taxable)}</td>
              <td className="amount-col text-sm">
                {e.taxDifference > 1 ? (
                  <span className="text-warning">{formatINR(e.taxDifference)}</span>
                ) : (
                  <span className="text-success text-xs">NIL</span>
                )}
              </td>
              <td>
                <Badge variant={e.status === 'MATCHED' ? 'success' : 'warning'} className="text-[10px]">
                  {e.status}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PortalOnlyTable({ entries }: { entries: any[] }) {
  if (!entries.length) return <EmptyState title="All 2B entries reconciled" description="No unmatched entries in GSTN portal" />
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-warning-muted border-b border-border text-sm text-warning font-medium">
        ⚠️ These invoices appear in GSTR-2B (portal) but are not booked in your purchases. Book them to claim ITC.
      </div>
      <table className="erp-table">
        <thead>
          <tr>
            <th>Supplier GSTIN</th><th>Supplier</th><th>Invoice No</th><th>Date</th>
            <th className="text-right">Taxable</th><th className="text-right">IGST</th>
            <th className="text-right">CGST</th><th className="text-right">SGST</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e: any, i: number) => (
            <tr key={i} className="bg-warning-muted/30">
              <td className="font-mono text-xs">{e.gstin}</td>
              <td className="text-sm truncate max-w-[140px]">{e.supplierName}</td>
              <td className="font-mono text-xs">{e.invoiceNumber}</td>
              <td className="text-sm whitespace-nowrap">{formatDate(e.invoiceDate)}</td>
              <td className="amount-col text-sm">{formatINR(e.taxableValue)}</td>
              <td className="amount-col text-sm">{e.igst > 0 ? formatINR(e.igst) : '—'}</td>
              <td className="amount-col text-sm">{e.cgst > 0 ? formatINR(e.cgst) : '—'}</td>
              <td className="amount-col text-sm">{e.sgst > 0 ? formatINR(e.sgst) : '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-muted font-semibold">
            <td colSpan={4} className="px-3 py-2 text-sm">ITC at Risk ({entries.length} invoices)</td>
            <td className="amount-col px-3 py-2">{formatINR(entries.reduce((s: number, e: any) => s + e.taxableValue, 0))}</td>
            <td className="amount-col px-3 py-2 text-warning">{formatINR(entries.reduce((s: number, e: any) => s + (e.igst || 0), 0))}</td>
            <td className="amount-col px-3 py-2 text-warning">{formatINR(entries.reduce((s: number, e: any) => s + (e.cgst || 0), 0))}</td>
            <td className="amount-col px-3 py-2 text-warning">{formatINR(entries.reduce((s: number, e: any) => s + (e.sgst || 0), 0))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function BooksOnlyTable({ entries }: { entries: any[] }) {
  if (!entries.length) return <EmptyState title="No unmatched book entries" description="All purchase entries have matching 2B records" />
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-destructive/10 border-b border-border text-sm text-destructive font-medium">
        ⚠️ These invoices are booked in purchases but not in GSTR-2B. Verify with supplier.
      </div>
      <table className="erp-table">
        <thead>
          <tr>
            <th>Voucher No</th><th>Supplier GSTIN</th><th>Invoice No</th><th>Date</th>
            <th className="text-right">Taxable</th><th className="text-right">Total Tax</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e: any, i: number) => (
            <tr key={i}>
              <td className="font-mono text-xs">{e.voucherNumber}</td>
              <td className="font-mono text-xs">{e.partyGstin || '—'}</td>
              <td className="font-mono text-xs">{e.invoiceNumber}</td>
              <td className="text-sm whitespace-nowrap">{formatDate(e.invoiceDate)}</td>
              <td className="amount-col text-sm">{formatINR(e.taxableValue)}</td>
              <td className="amount-col text-sm amount-debit">
                {formatINR(Number(e.igstAmount) + Number(e.cgstAmount) + Number(e.sgstAmount))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
