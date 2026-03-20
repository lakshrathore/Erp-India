import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuthStore } from '../../stores/auth.store'
import { StatCard, Card, CardHeader, CardTitle, CardContent, Badge, Button, Spinner } from '../../components/ui'
import { formatINR, formatDate, getFYLabel } from '../../lib/india'
import {
  TrendingUp, TrendingDown, IndianRupee, Package, Users,
  FileText, ArrowUpRight, AlertTriangle,
} from 'lucide-react'
import dayjs from 'dayjs'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const V_BADGE: Record<string, any> = {
  SALE: 'info', PURCHASE: 'warning', RECEIPT: 'success',
  PAYMENT: 'destructive', JOURNAL: 'default', CONTRA: 'secondary',
}

export default function DashboardPage() {
  const { user, activeCompany, activeFY } = useAuthStore()
  const today = dayjs()

  const { data: todayVouchers = [] } = useQuery({
    queryKey: ['dash-today', activeCompany?.companyId],
    queryFn: async () => {
      const d = today.format('YYYY-MM-DD')
      const { data } = await api.get('/billing/vouchers', { params: { from: d, to: d, limit: 100, status: 'POSTED' } })
      return data.data || []
    },
    enabled: !!activeCompany?.companyId,
    refetchInterval: 60_000,
  })

  const { data: monthData } = useQuery({
    queryKey: ['dash-month'],
    queryFn: async () => {
      const from = today.startOf('month').format('YYYY-MM-DD')
      const to = today.format('YYYY-MM-DD')
      const [s, p] = await Promise.all([
        api.get('/billing/vouchers', { params: { voucherType: 'SALE', from, to, limit: 500, status: 'POSTED' } }),
        api.get('/billing/vouchers', { params: { voucherType: 'PURCHASE', from, to, limit: 500, status: 'POSTED' } }),
      ])
      return { sales: s.data.data || [], purchases: p.data.data || [] }
    },
    refetchInterval: 5 * 60_000,
    enabled: !!activeCompany?.companyId,
  })

  const { data: outstanding } = useQuery({
    queryKey: ['dash-outstanding'],
    queryFn: async () => {
      const [r, p] = await Promise.all([
        api.get('/billing/outstanding', { params: { type: 'receivable' } }),
        api.get('/billing/outstanding', { params: { type: 'payable' } }),
      ])
      return { receivable: r.data.data?.totalOutstanding || 0, payable: p.data.data?.totalOutstanding || 0 }
    },
    refetchInterval: 5 * 60_000,
    enabled: !!activeCompany?.companyId,
  })

  const { data: empCount = 0 } = useQuery({
    queryKey: ['dash-employees'],
    queryFn: async () => {
      const { data } = await api.get('/payroll/employees', { params: { status: 'ACTIVE', limit: 1 } })
      return data.pagination?.total || 0
    },
    staleTime: 30 * 60_000,
    enabled: !!activeCompany?.companyId,
  })

  const { data: lowStockCount = 0 } = useQuery({
    queryKey: ['dash-stock'],
    queryFn: async () => {
      const { data } = await api.get('/inventory/stock')
      return (data.data || []).filter((s: any) => Number(s.reorderLevel) > 0 && Number(s.totalQty) <= Number(s.reorderLevel)).length
    },
    staleTime: 15 * 60_000,
    enabled: !!activeCompany?.companyId,
  })

  const { data: trendData = [] } = useQuery({
    queryKey: ['dash-trend'],
    queryFn: async () => {
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) => today.subtract(5 - i, 'month')).map(async d => {
          const from = d.startOf('month').format('YYYY-MM-DD')
          const to = d.endOf('month').format('YYYY-MM-DD')
          const [s, p] = await Promise.all([
            api.get('/billing/vouchers', { params: { voucherType: 'SALE', from, to, limit: 500, status: 'POSTED' } }),
            api.get('/billing/vouchers', { params: { voucherType: 'PURCHASE', from, to, limit: 500, status: 'POSTED' } }),
          ])
          return {
            name: d.format('MMM'),
            Sale: Math.round((s.data.data || []).reduce((sum: number, v: any) => sum + Number(v.grandTotal), 0) / 1000),
            Purchase: Math.round((p.data.data || []).reduce((sum: number, v: any) => sum + Number(v.grandTotal), 0) / 1000),
          }
        })
      )
      return results
    },
    staleTime: 10 * 60_000,
    enabled: !!activeCompany?.companyId,
  })

  const todaySale = (todayVouchers as any[]).filter((v: any) => v.voucherType === 'SALE').reduce((s: number, v: any) => s + Number(v.grandTotal), 0)
  const monthSale = (monthData?.sales || []).reduce((s: number, v: any) => s + Number(v.grandTotal), 0)
  const recentVouchers = [...(monthData?.sales || []), ...(monthData?.purchases || [])]
    .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8)

  const greeting = today.hour() < 12 ? 'Good morning' : today.hour() < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-semibold">{greeting}, {user?.name?.split(' ')[0]} 👋</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {activeCompany?.companyName} · {activeFY ? getFYLabel(activeFY) : '—'} · {today.format('dddd, D MMMM YYYY')}
          </p>
        </div>
        <Link to="/billing/sale/new">
          <Button size="sm"><FileText size={13} /> New Invoice</Button>
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Sale Today" value={formatINR(todaySale)} icon={<TrendingUp size={15} />}
          change={`${(todayVouchers as any[]).filter((v: any) => v.voucherType === 'SALE').length} invoices`} changeType="neutral" />
        <StatCard label={`Sale — ${today.format('MMM')}`} value={formatINR(monthSale)} icon={<IndianRupee size={15} />}
          change={`${monthData?.sales?.length || 0} invoices`} changeType="neutral" />
        <StatCard label="Receivable" value={formatINR(outstanding?.receivable || 0)} icon={<TrendingUp size={15} />}
          change="Due from customers" changeType="neutral" className="[&_.stat-value]:text-debit" />
        <StatCard label="Payable" value={formatINR(outstanding?.payable || 0)} icon={<TrendingDown size={15} />}
          change="Due to vendors" changeType="neutral" className="[&_.stat-value]:text-credit" />
        <StatCard label="Employees" value={empCount} icon={<Users size={15} />} change="Active" changeType="neutral" />
        <StatCard label="Low Stock" value={lowStockCount} icon={<Package size={15} />}
          change={lowStockCount ? 'Below reorder' : 'All OK'} changeType={lowStockCount ? 'down' : 'neutral'}
          className={lowStockCount ? '[&_.stat-value]:text-warning' : ''} />
      </div>

      {/* Alerts */}
      {lowStockCount > 0 && (
        <div className="flex gap-3 flex-wrap">
          <Link to="/inventory/stock">
            <div className="flex items-center gap-2 bg-warning-muted border border-warning/30 rounded-lg px-4 py-2.5 text-sm text-warning hover:opacity-80 transition-opacity cursor-pointer">
              <AlertTriangle size={14} /> {lowStockCount} items below reorder level — click to view
            </div>
          </Link>
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Sale vs Purchase — Last 6 Months</CardTitle>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-primary inline-block" /> Sale</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-warning inline-block" /> Purchase</span>
                  <span className="text-[10px]">(₹ thousands)</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {trendData.length === 0 ? (
                <div className="flex justify-center py-8"><Spinner /></div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={trendData} margin={{ left: -10, right: 5, top: 5 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      formatter={(v: number) => [formatINR(v * 1000), '']}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                    <Bar dataKey="Sale" fill="hsl(222, 83%, 54%)" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Purchase" fill="hsl(38, 92%, 50%)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick actions */}
        <Card>
          <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {[
              { label: 'New Sale Invoice', href: '/billing/sale/new', icon: FileText, color: 'text-info' },
              { label: 'New Purchase', href: '/billing/purchase/new', icon: FileText, color: 'text-warning' },
              { label: 'Record Receipt', href: '/accounting/receipt/new', icon: TrendingUp, color: 'text-success' },
              { label: 'Record Payment', href: '/accounting/payment/new', icon: TrendingDown, color: 'text-destructive' },
              { label: 'Process Payroll', href: '/payroll/process', icon: Users, color: 'text-primary' },
              { label: 'GSTR-1 Filing', href: '/gst/gstr1', icon: FileText, color: 'text-accent' },
            ].map(a => (
              <Link key={a.href} to={a.href}>
                <button className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-muted/50 transition-colors group">
                  <a.icon size={14} className={a.color} />
                  <span className="text-sm group-hover:text-primary transition-colors">{a.label}</span>
                  <ArrowUpRight size={12} className="ml-auto text-muted-foreground group-hover:text-primary" />
                </button>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Recent vouchers */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Transactions — {today.format('MMMM YYYY')}</CardTitle>
            <Link to="/reports/day-book">
              <Button variant="ghost" size="sm" className="text-xs">Day Book <ArrowUpRight size={11} /></Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!monthData ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : recentVouchers.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">No vouchers this month yet</div>
          ) : (
            <table className="erp-table">
              <thead>
                <tr><th>Voucher No</th><th>Date</th><th>Party</th><th className="text-right">Amount</th><th>Status</th></tr>
              </thead>
              <tbody>
                {recentVouchers.map((v: any) => (
                  <tr key={v.id}>
                    <td>
                      <Badge variant={V_BADGE[v.voucherType] || 'default'} className="text-[10px] mb-1 block w-fit">{v.voucherType}</Badge>
                      <span className="font-mono text-xs text-muted-foreground">{v.voucherNumber}</span>
                    </td>
                    <td className="text-sm whitespace-nowrap">{formatDate(v.date)}</td>
                    <td className="text-sm truncate max-w-[160px]">{v.party?.name || '—'}</td>
                    <td className="amount-col font-medium text-sm">{formatINR(v.grandTotal)}</td>
                    <td><Badge variant={v.status === 'POSTED' ? 'success' : 'outline'} className="text-[10px]">{v.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
