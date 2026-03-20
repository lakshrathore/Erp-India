import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, extractError } from '../../lib/api'
import { formatINR, formatDate } from '../../lib/india'
import { Button, Badge, PageHeader, Select, Spinner, EmptyState } from '../../components/ui'
import { Link2, CheckCircle2, AlertCircle } from 'lucide-react'
import { useParties } from '../../hooks/api.hooks'
import dayjs from 'dayjs'

export default function VoucherSettlementPage() {
  const qc = useQueryClient()
  const [partyId, setPartyId] = useState('')
  const [type, setType] = useState<'receivable' | 'payable'>('receivable')
  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null)
  const [selectedInvoices, setSelectedInvoices] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const { data: partiesData } = useParties({ type: type === 'receivable' ? 'CUSTOMER' : 'VENDOR', limit: 500 })
  const parties = partiesData?.data || []
  const partyOptions = [
    { value: '', label: 'Select party...' },
    ...(parties as any[]).map((p: any) => ({ value: p.id, label: p.name })),
  ]

  // Outstanding invoices for party
  const { data: outstandingData, isLoading: loadingOut } = useQuery({
    queryKey: ['outstanding-party', partyId, type],
    queryFn: async () => {
      const { data } = await api.get('/billing/outstanding', { params: { type, partyId } })
      return data.data
    },
    enabled: !!partyId,
  })

  // Unposted receipts/payments for party
  const { data: receiptsData, isLoading: loadingRec } = useQuery({
    queryKey: ['receipts-party', partyId, type],
    queryFn: async () => {
      const vType = type === 'receivable' ? 'RECEIPT' : 'PAYMENT'
      const { data } = await api.get('/billing/vouchers', {
        params: { voucherType: vType, partyId, status: 'POSTED', limit: 50 },
      })
      return data.data
    },
    enabled: !!partyId,
  })

  const vouchers: any[] = outstandingData?.vouchers || []
  const receipts: any[] = receiptsData || []

  const selectedReceipts = receipts.filter(r => r.id === selectedReceipt)
  const receiptAmount = selectedReceipts[0] ? Number(selectedReceipts[0].grandTotal) : 0
  const totalAllocated = Object.values(selectedInvoices).reduce((s, v) => s + v, 0)
  const unallocated = receiptAmount - totalAllocated

  const handleSettle = async () => {
    if (!selectedReceipt || Object.keys(selectedInvoices).length === 0) return
    setSaving(true); setSaveMsg('')
    try {
      for (const [voucherId, amount] of Object.entries(selectedInvoices)) {
        if (amount <= 0) continue
        await api.post('/billing/vouchers/settle', {
          fromVoucherId: selectedReceipt,
          againstVoucherId: voucherId,
          amount,
          date: dayjs().format('YYYY-MM-DD'),
        })
      }
      setSaveMsg('Settlement saved successfully')
      qc.invalidateQueries({ queryKey: ['outstanding-party'] })
      setSelectedInvoices({})
      setSelectedReceipt(null)
      setTimeout(() => setSaveMsg(''), 3000)
    } catch (e) {
      setSaveMsg(extractError(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader title="Voucher Settlements"
        subtitle="Bill-by-bill payment allocation"
        breadcrumbs={[{ label: 'Accounting' }, { label: 'Voucher Settlements' }]}
      />

      <div className="flex gap-3 mb-4">
        <div className="flex gap-2">
          <Button variant={type === 'receivable' ? 'default' : 'outline'} size="sm" onClick={() => { setType('receivable'); setPartyId(''); setSelectedReceipt(null); setSelectedInvoices({}) }}>
            Receivable
          </Button>
          <Button variant={type === 'payable' ? 'default' : 'outline'} size="sm" onClick={() => { setType('payable'); setPartyId(''); setSelectedReceipt(null); setSelectedInvoices({}) }}>
            Payable
          </Button>
        </div>
        <Select options={partyOptions} value={partyId} onChange={e => { setPartyId(e.target.value); setSelectedReceipt(null); setSelectedInvoices({}) }} className="w-64" />
      </div>

      {saveMsg && (
        <div className={`mb-4 flex items-center gap-2 rounded-md px-4 py-3 text-sm border ${saveMsg.includes('success') ? 'bg-success-muted border-success/20 text-success' : 'bg-destructive/10 border-destructive/20 text-destructive'}`}>
          {saveMsg.includes('success') ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {saveMsg}
        </div>
      )}

      {!partyId ? (
        <EmptyState icon={<Link2 size={40} />} title="Select a party" description="Choose a customer or vendor to settle their bills" />
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {/* Left: Receipts/Payments */}
          <div>
            <h3 className="text-sm font-semibold mb-2">
              {type === 'receivable' ? 'Receipts' : 'Payments'} (Unallocated)
            </h3>
            {loadingRec ? <Spinner /> : receipts.length === 0 ? (
              <div className="bg-card border border-border rounded-lg p-6 text-center text-sm text-muted-foreground">
                No {type === 'receivable' ? 'receipts' : 'payments'} found
              </div>
            ) : (
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                {receipts.map((r: any) => (
                  <div key={r.id}
                    className={`flex items-center justify-between px-4 py-3 border-b border-border/50 cursor-pointer hover:bg-muted/30 ${selectedReceipt === r.id ? 'bg-primary/10 border-l-2 border-primary' : ''}`}
                    onClick={() => { setSelectedReceipt(selectedReceipt === r.id ? null : r.id); setSelectedInvoices({}) }}>
                    <div>
                      <div className="font-mono text-xs font-medium">{r.voucherNumber}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(r.date)}</div>
                    </div>
                    <span className="font-mono font-medium text-sm">{formatINR(r.grandTotal)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Outstanding invoices */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Outstanding {type === 'receivable' ? 'Invoices' : 'Bills'}</h3>
            {loadingOut ? <Spinner /> : vouchers.length === 0 ? (
              <div className="bg-card border border-border rounded-lg p-6 text-center text-sm text-muted-foreground">
                No outstanding {type === 'receivable' ? 'invoices' : 'bills'}
              </div>
            ) : (
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                {vouchers.map((v: any) => {
                  const alloc = selectedInvoices[v.id] || 0
                  return (
                    <div key={v.id} className="px-4 py-3 border-b border-border/50">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="font-mono text-xs font-medium">{v.voucherNumber}</span>
                          <span className="text-xs text-muted-foreground ml-2">{formatDate(v.date)}</span>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">Balance Due</div>
                          <div className="font-mono font-medium text-sm amount-debit">{formatINR(v.balanceDue)}</div>
                        </div>
                      </div>
                      {selectedReceipt && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Allocate:</span>
                          <input type="number" min={0} max={v.balanceDue} step={0.01}
                            value={alloc || ''}
                            onChange={e => setSelectedInvoices(prev => ({ ...prev, [v.id]: Number(e.target.value) }))}
                            placeholder="0.00"
                            className="h-7 w-28 rounded border border-input bg-background px-2 text-xs text-right font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
                          <Button size="sm" variant="ghost" className="text-xs h-7"
                            onClick={() => setSelectedInvoices(prev => ({
                              ...prev,
                              [v.id]: Math.min(Number(v.balanceDue), unallocated + alloc),
                            }))}>
                            Full
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Allocation summary + save */}
      {selectedReceipt && (
        <div className="mt-4 bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6 text-sm">
            <div>Receipt Amount: <strong className="font-mono">{formatINR(receiptAmount)}</strong></div>
            <div>Allocated: <strong className="font-mono text-success">{formatINR(totalAllocated)}</strong></div>
            <div className={unallocated < 0 ? 'text-destructive' : ''}>
              Unallocated: <strong className="font-mono">{formatINR(unallocated)}</strong>
            </div>
          </div>
          <Button onClick={handleSettle} loading={saving}
            disabled={totalAllocated <= 0 || unallocated < 0}>
            <CheckCircle2 size={14} /> Save Settlement
          </Button>
        </div>
      )}
    </div>
  )
}
