import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatINR, formatDate, parseFYDates } from '../../lib/india'
import { Button, Badge, PageHeader, Spinner, EmptyState, Select } from '../../components/ui'
import { Download, Printer } from 'lucide-react'
import dayjs from 'dayjs'
import { useAuthStore } from '../../stores/auth.store'
import { cn } from '../../components/ui/utils'

const TDS_SECTIONS = [
  { section: '194C', description: 'Payment to Contractors / Sub-contractors', threshold: 30000, rate: 1 },
  { section: '194J', description: 'Professional / Technical Services', threshold: 30000, rate: 10 },
  { section: '194I', description: 'Rent of Land, Building or Furniture', threshold: 240000, rate: 10 },
  { section: '194IA', description: 'Rent of Plant, Machinery or Equipment', threshold: 240000, rate: 2 },
  { section: '194A', description: 'Interest (other than securities)', threshold: 40000, rate: 10 },
  { section: '194H', description: 'Commission or Brokerage', threshold: 15000, rate: 5 },
  { section: '194B', description: 'Winnings from Lottery / Game Show', threshold: 10000, rate: 30 },
  { section: '194D', description: 'Insurance Commission', threshold: 15000, rate: 5 },
  { section: '194Q', description: 'Purchase of Goods > ₹50L/year', threshold: 5000000, rate: 0.1 },
  { section: '206C(1H)', description: 'TCS on Sale of Goods > ₹50L/year', threshold: 5000000, rate: 0.1 },
  { section: '194N', description: 'Cash Withdrawal from Bank > ₹1Cr', threshold: 10000000, rate: 2 },
]

const QUARTERS: Record<string, { label: string; months: number[]; offset: number }> = {
  Q1: { label: 'Q1 (Apr–Jun)', months: [4, 5, 6], offset: 0 },
  Q2: { label: 'Q2 (Jul–Sep)', months: [7, 8, 9], offset: 0 },
  Q3: { label: 'Q3 (Oct–Dec)', months: [10, 11, 12], offset: 0 },
  Q4: { label: 'Q4 (Jan–Mar)', months: [1, 2, 3], offset: 1 },
}

function getQuarterDates(quarter: string, fyString: string): { from: string; to: string } {
  const q = QUARTERS[quarter]
  const fy = parseFYDates(fyString)
  const startYear = parseInt(fy.from.substring(0, 4))

  if (quarter === 'Q4') {
    return {
      from: `${startYear + 1}-01-01`,
      to: `${startYear + 1}-03-31`,
    }
  }
  const [startM, endM] = [q.months[0], q.months[q.months.length - 1]]
  return {
    from: `${startYear}-${String(startM).padStart(2, '0')}-01`,
    to: dayjs(`${startYear}-${String(endM).padStart(2, '0')}-01`).endOf('month').format('YYYY-MM-DD'),
  }
}

export default function TDSTCSPage() {
  const { activeFY } = useAuthStore()
  const [quarter, setQuarter] = useState('Q4')
  const [fyStr, setFyStr] = useState(activeFY || '25-26')
  const [activeSection, setActiveSection] = useState<string | null>(null)

  const dates = getQuarterDates(quarter, fyStr)

  // Fetch all posted vouchers with TDS items
  const { data: rawVouchers, isLoading } = useQuery({
    queryKey: ['tds-vouchers', dates.from, dates.to],
    queryFn: async () => {
      const { data } = await api.get('/billing/vouchers', {
        params: { from: dates.from, to: dates.to, limit: 1000, status: 'POSTED' },
      })
      return (data.data || []) as any[]
    },
  })

  // Filter vouchers that have TDS-applicable items
  const purchaseVouchers = (rawVouchers || []).filter((v: any) =>
    ['PURCHASE', 'PAYMENT', 'JOURNAL'].includes(v.voucherType)
  )

  // Group by party for summary
  const partyTotals: Record<string, { name: string; amount: number; tds: number; vouchers: any[] }> = {}
  for (const v of purchaseVouchers) {
    const pid = v.party?.id || 'unknown'
    if (!partyTotals[pid]) {
      partyTotals[pid] = { name: v.party?.name || 'Unknown', amount: 0, tds: 0, vouchers: [] }
    }
    partyTotals[pid].amount += Number(v.grandTotal || 0)
    partyTotals[pid].vouchers.push(v)
  }

  const quarterOptions = Object.entries(QUARTERS).map(([k, v]) => ({ value: k, label: v.label }))

  const totalPurchases = purchaseVouchers.reduce((s: number, v: any) => s + Number(v.grandTotal || 0), 0)

  return (
    <div>
      <PageHeader title="TDS / TCS" subtitle="Tax Deducted / Collected at Source — Section-wise report"
        breadcrumbs={[{ label: 'GST' }, { label: 'TDS/TCS' }]}
        actions={
          <div className="flex gap-2 items-center">
            <input type="text" value={fyStr} onChange={e => setFyStr(e.target.value)} placeholder="25-26"
              className="h-9 w-20 rounded-md border border-input bg-background px-3 text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-ring" />
            <Select
              options={quarterOptions}
              value={quarter}
              onChange={e => setQuarter(e.target.value)}
              className="w-44"
            />
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer size={14} /></Button>
          </div>
        }
      />

      {/* Period info */}
      <div className="mb-4 bg-muted/30 rounded-lg px-4 py-2.5 text-sm text-muted-foreground">
        Period: <strong className="text-foreground">{formatDate(dates.from)}</strong> to <strong className="text-foreground">{formatDate(dates.to)}</strong>
        &nbsp;·&nbsp; Purchases/Payments: <strong className="text-foreground">{purchaseVouchers.length} vouchers</strong>
        &nbsp;·&nbsp; Total: <strong className="text-foreground">{formatINR(totalPurchases)}</strong>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* TDS Sections */}
        <div className="lg:col-span-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 px-1">TDS Sections</h3>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {TDS_SECTIONS.map(s => {
              // Check if any vendor has crossed threshold
              const partyList = Object.values(partyTotals).filter(p => p.amount >= s.threshold)
              const totalDeductible = partyList.reduce((sum, p) => sum + p.amount, 0)
              const estimatedTDS = totalDeductible * (s.rate / 100)
              const isActive = activeSection === s.section
              const hasData = partyList.length > 0

              return (
                <button
                  key={s.section}
                  onClick={() => setActiveSection(isActive ? null : s.section)}
                  className={cn(
                    'w-full text-left px-4 py-3 border-t border-border/50 first:border-0 transition-colors',
                    isActive ? 'bg-primary/5 border-l-4 border-l-primary' : hasData ? 'hover:bg-muted/30' : 'opacity-60 hover:bg-muted/10'
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs font-bold text-primary">{s.section}</span>
                    <span className="text-xs font-medium">{s.rate}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-snug">{s.description}</p>
                  <p className="text-xs text-muted-foreground mt-1">Threshold: {formatINR(s.threshold)}</p>
                  {hasData && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <Badge variant="success" className="text-[10px]">{partyList.length} parties above threshold</Badge>
                      <span className="text-xs font-mono font-medium text-orange-700">TDS: {formatINR(estimatedTDS)}</span>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Right panel */}
        <div className="lg:col-span-2">
          {activeSection ? (
            <SectionDetail
              sectionCode={activeSection}
              section={TDS_SECTIONS.find(s => s.section === activeSection)!}
              partyTotals={partyTotals}
              vouchers={purchaseVouchers}
            />
          ) : (
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Vendor-wise Summary</h3>
              {isLoading ? <div className="flex justify-center py-12"><Spinner /></div> :
                Object.keys(partyTotals).length === 0 ? (
                  <EmptyState title="No purchase data" description="No purchases found for this period" />
                ) : (
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <table className="erp-table">
                      <thead>
                        <tr>
                          <th>Vendor</th>
                          <th className="text-right">Total Payments</th>
                          <th className="text-right">Vouchers</th>
                          <th>TDS Sections (Applicable)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.values(partyTotals)
                          .sort((a, b) => b.amount - a.amount)
                          .map((party: any) => {
                            const applicableSections = TDS_SECTIONS.filter(s => party.amount >= s.threshold)
                            return (
                              <tr key={party.name}>
                                <td className="font-medium text-sm">{party.name}</td>
                                <td className="amount-col text-sm font-mono">{formatINR(party.amount)}</td>
                                <td className="text-center text-muted-foreground text-sm">{party.vouchers.length}</td>
                                <td>
                                  <div className="flex flex-wrap gap-1">
                                    {applicableSections.length === 0 ? (
                                      <span className="text-xs text-muted-foreground">Below threshold</span>
                                    ) : applicableSections.map(s => (
                                      <span key={s.section} className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded font-medium">
                                        {s.section}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                      </tbody>
                    </table>
                  </div>
                )}

              {/* TDS Calculation Summary */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border bg-muted/30 font-semibold text-sm">
                  Estimated TDS Liability (All Sections)
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/10">
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Section</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Rate</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Deductible Amount</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Estimated TDS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TDS_SECTIONS.map(s => {
                      const parties = Object.values(partyTotals).filter(p => p.amount >= s.threshold)
                      const total = parties.reduce((sum, p) => sum + p.amount, 0)
                      const tds = total * (s.rate / 100)
                      if (total === 0) return null
                      return (
                        <tr key={s.section} className="border-t border-border/30">
                          <td className="px-4 py-2">
                            <span className="font-mono text-xs font-bold text-primary">{s.section}</span>
                            <span className="text-xs text-muted-foreground ml-2">{s.description}</span>
                          </td>
                          <td className="px-4 py-2 text-right text-sm">{s.rate}%</td>
                          <td className="px-4 py-2 text-right font-mono text-sm">{formatINR(total)}</td>
                          <td className="px-4 py-2 text-right font-mono text-sm font-medium text-orange-700">{formatINR(tds)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted font-bold">
                      <td colSpan={3} className="px-4 py-2.5">Total Estimated TDS</td>
                      <td className="px-4 py-2.5 text-right font-mono text-orange-700">
                        {formatINR(TDS_SECTIONS.reduce((total, s) => {
                          const parties = Object.values(partyTotals).filter(p => p.amount >= s.threshold)
                          return total + parties.reduce((sum, p) => sum + p.amount, 0) * (s.rate / 100)
                        }, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SectionDetail({ sectionCode, section, partyTotals, vouchers }: {
  sectionCode: string
  section: typeof TDS_SECTIONS[number]
  partyTotals: Record<string, { name: string; amount: number; tds: number; vouchers: any[] }>
  vouchers: any[]
}) {
  const eligibleParties = Object.entries(partyTotals).filter(([, p]) => p.amount >= section.threshold)

  return (
    <div className="space-y-4">
      <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-mono font-bold text-orange-900 text-base">Section {sectionCode}</span>
            <p className="text-sm text-orange-800 mt-0.5">{section.description}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-orange-700">TDS Rate</p>
            <p className="text-2xl font-bold text-orange-900">{section.rate}%</p>
          </div>
        </div>
        <p className="text-xs text-orange-700 mt-2">
          Applicable when payment exceeds: <strong>{formatINR(section.threshold)}</strong> per deductee
        </p>
      </div>

      {eligibleParties.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-6 text-center">
          <p className="text-muted-foreground text-sm">No vendors have crossed the ₹{formatINR(section.threshold)} threshold for {sectionCode} this quarter</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30 text-sm font-semibold">
            Eligible Deductees — {eligibleParties.length} vendor(s)
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/10">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Vendor Name</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Total Payment</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Deductible</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-orange-700">TDS @ {section.rate}%</th>
              </tr>
            </thead>
            <tbody>
              {eligibleParties.map(([id, party]) => {
                const tds = party.amount * (section.rate / 100)
                return (
                  <tr key={id} className="border-t border-border/30 hover:bg-muted/10">
                    <td className="px-4 py-2.5 font-medium">{party.name}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatINR(party.amount)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatINR(party.amount)}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-orange-700">{formatINR(tds)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-orange-50 font-bold">
                <td className="px-4 py-2.5">Total</td>
                <td className="px-4 py-2.5 text-right font-mono">
                  {formatINR(eligibleParties.reduce((s, [, p]) => s + p.amount, 0))}
                </td>
                <td className="px-4 py-2.5 text-right font-mono">
                  {formatINR(eligibleParties.reduce((s, [, p]) => s + p.amount, 0))}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-orange-800">
                  {formatINR(eligibleParties.reduce((s, [, p]) => s + p.amount * (section.rate / 100), 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
