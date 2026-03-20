import { useState } from 'react'
import { Link, useLocation, Outlet, Navigate } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingCart, Package, BookOpen,
  FileText, Users, Settings, ChevronDown, ChevronRight,
  Building2, BarChart3, CreditCard, Receipt, Wallet,
  ClipboardList, UserCheck, Menu, LogOut, Bell,
  Building, ChevronLeft, TrendingUp, User, RefreshCcw, Printer,
} from 'lucide-react'
import { cn } from '../ui/utils'
import { useAuthStore } from '../../stores/auth.store'
import { useLogout } from '../../hooks/api.hooks'
import { Button } from '../ui'

interface NavItem {
  label: string
  icon: React.ElementType
  href?: string
  children?: NavItem[]
}

const NAV: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
  {
    label: 'Billing', icon: ShoppingCart,
    children: [
      { label: '⚡ POS — Point of Sale', icon: ShoppingCart, href: '/pos' },
      { label: 'Sale Invoice', icon: FileText, href: '/billing/sale' },
      { label: 'Purchase Invoice', icon: FileText, href: '/billing/purchase' },
      { label: 'Credit Note', icon: FileText, href: '/billing/credit-note' },
      { label: 'Debit Note', icon: FileText, href: '/billing/debit-note' },
      { label: 'Sale Challan', icon: ClipboardList, href: '/billing/sale-challan' },
      { label: 'Purchase Order', icon: ClipboardList, href: '/billing/purchase-order' },
      { label: 'Purchase Challan', icon: ClipboardList, href: '/billing/purchase-challan' },
      { label: 'Production', icon: Package, href: '/billing/production' },
    ],
  },
  {
    label: 'Inventory', icon: Package,
    children: [
      { label: 'Stock Report', icon: BarChart3, href: '/inventory/stock' },
      { label: 'Item Ledger (FIFO)', icon: BookOpen, href: '/inventory/item-ledger' },
      { label: 'Profit Report', icon: TrendingUp, href: '/inventory/profit' },
    ],
  },
  {
    label: 'Accounting', icon: BookOpen,
    children: [
      { label: 'Receipt', icon: CreditCard, href: '/accounting/receipt' },
      { label: 'Payment', icon: Wallet, href: '/accounting/payment' },
      { label: 'Contra', icon: Receipt, href: '/accounting/contra' },
      { label: 'Journal', icon: BookOpen, href: '/accounting/journal' },
      { label: 'Party Statement', icon: Users, href: '/accounting/party-statement' },
      { label: 'Ledger Statement', icon: BookOpen, href: '/accounting/ledger-statement' },
      { label: 'Bank Reconciliation', icon: Building, href: '/accounting/bank-recon' },
      { label: 'Voucher Settlements', icon: Receipt, href: '/accounting/settlements' },
    ],
  },
  {
    label: 'GST', icon: FileText,
    children: [
      { label: 'GSTR-1', icon: FileText, href: '/gst/gstr1' },
      { label: 'GSTR-3B', icon: FileText, href: '/gst/gstr3b' },
      { label: '2B Reconciliation', icon: FileText, href: '/gst/recon' },
      { label: 'TDS / TCS', icon: FileText, href: '/gst/tds' },
    ],
  },
  {
    label: 'Reports', icon: BarChart3,
    children: [
      { label: 'Balance Sheet', icon: BarChart3, href: '/reports/balance-sheet' },
      { label: 'Profit & Loss', icon: TrendingUp, href: '/reports/profit-loss' },
      { label: 'Trial Balance', icon: BarChart3, href: '/reports/trial-balance' },
      { label: 'Outstanding', icon: CreditCard, href: '/reports/outstanding' },
      { label: 'Overdue (Bill-wise)', icon: Receipt, href: '/reports/overdue' },
      { label: 'Sale Report', icon: BarChart3, href: '/reports/sale' },
      { label: 'Purchase Report', icon: BarChart3, href: '/reports/purchase' },
      { label: 'Sale Register', icon: ClipboardList, href: '/reports/sale-register' },
      { label: 'Purchase Register', icon: ClipboardList, href: '/reports/purchase-register' },
      { label: 'Journal Register', icon: ClipboardList, href: '/reports/journal-register' },
      { label: 'Cash Book', icon: Wallet, href: '/reports/cash-book' },
      { label: 'Bank Book', icon: Building, href: '/reports/bank-book' },
      { label: 'Day Book', icon: BookOpen, href: '/reports/day-book' },
    ],
  },
  {
    label: 'Payroll', icon: UserCheck,
    children: [
      { label: 'Employees', icon: Users, href: '/payroll/employees' },
      { label: 'Salary Structures', icon: Settings, href: '/payroll/salary-structures' },
      { label: 'Attendance', icon: ClipboardList, href: '/payroll/attendance' },
      { label: 'Leave Management', icon: ClipboardList, href: '/payroll/leave' },
      { label: 'Process Payroll', icon: CreditCard, href: '/payroll/process' },
      { label: 'Payslips', icon: FileText, href: '/payroll/payslips' },
      { label: 'PF / ESI Compliance', icon: FileText, href: '/payroll/compliance' },
      { label: 'Form 16', icon: FileText, href: '/payroll/form16' },
    ],
  },
  {
    label: 'Masters', icon: Settings,
    children: [
      { label: 'Parties', icon: Users, href: '/masters/parties' },
      { label: 'Items', icon: Package, href: '/masters/items' },
      { label: 'Item Categories', icon: Package, href: '/masters/item-categories' },
      { label: 'Ledgers', icon: BookOpen, href: '/masters/ledgers' },
      { label: 'Godowns', icon: Building, href: '/masters/godowns' },
    ],
  },
  {
    label: 'Settings', icon: Settings,
    children: [
      { label: 'Company Settings', icon: Building2, href: '/settings/company' },
      { label: 'Branches', icon: Building, href: '/settings/branches' },
      { label: 'Users & Access', icon: Users, href: '/settings/users' },
      { label: 'Financial Years', icon: ClipboardList, href: '/settings/financial-years' },
      { label: 'Number Series', icon: Settings, href: '/settings/number-series' },
      { label: 'Transaction Settings', icon: Settings, href: '/settings/transaction' },
      { label: 'Ledger Mapping', icon: BookOpen, href: '/settings/ledger-mapping' },
      { label: 'Print Setup', icon: Printer, href: '/settings/print-setup' },
      { label: 'Tally Import/Export', icon: FileText, href: '/settings/tally' },
    ],
  },
]

function NavGroup({ item, depth = 0 }: { item: NavItem; depth?: number }) {
  const location = useLocation()
  const [open, setOpen] = useState(() =>
    item.children?.some(c => location.pathname.startsWith(c.href || '/__'))
  )

  if (item.href) {
    const active = location.pathname === item.href || location.pathname.startsWith(item.href + '/')
    return (
      <Link to={item.href}
        className={cn('nav-item', depth > 0 && 'pl-7 text-[13px]', active && 'active')}>
        <item.icon size={14} className="shrink-0" />
        {item.label}
      </Link>
    )
  }

  return (
    <div>
      <button onClick={() => setOpen(o => !o)}
        className={cn('nav-item w-full', depth > 0 && 'pl-7', open && 'text-sidebar-foreground')}>
        <item.icon size={14} className="shrink-0" />
        <span className="flex-1 text-left">{item.label}</span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && (
        <div className="ml-2 border-l border-sidebar-border pl-1 mt-0.5 space-y-0.5">
          {item.children?.map(child => (
            <NavGroup key={child.href || child.label} item={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function AppLayout() {
  const { user, activeCompany, activeFY } = useAuthStore()
  const logout = useLogout()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showUserMenu, setShowUserMenu] = useState(false)

  if (!user) return <Navigate to="/login" replace />
  if (!activeCompany) return <Navigate to="/select-company" replace />

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className={cn(
        'flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-200 shrink-0',
        sidebarOpen ? 'w-56' : 'w-0 overflow-hidden'
      )}>
        {/* Logo + company */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-sidebar-border">
          <div className="w-7 h-7 bg-accent rounded-md flex items-center justify-center shrink-0">
            <span className="text-white font-display font-bold text-sm">E</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sidebar-foreground font-display font-semibold text-sm leading-none truncate">ERP India</p>
            <p className="text-sidebar-foreground/40 text-[10px] truncate mt-0.5">{activeCompany.companyName}</p>
          </div>
          <Link to="/select-company" title="Switch company" className="text-sidebar-foreground/40 hover:text-sidebar-foreground/80 transition-colors">
            <RefreshCcw size={12} />
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV.map(item => <NavGroup key={item.label} item={item} />)}
        </nav>

        {/* User footer */}
        <div className="p-3 border-t border-sidebar-border relative">
          <button
            onClick={() => setShowUserMenu(s => !s)}
            className="flex items-center gap-2.5 px-2 py-1.5 w-full rounded-md hover:bg-sidebar-accent transition-colors">
            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <span className="text-primary text-xs font-semibold">{user.name.charAt(0).toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sidebar-foreground text-xs font-medium truncate">{user.name}</p>
              <p className="text-sidebar-foreground/40 text-[10px] truncate">{activeFY ? `FY ${activeFY}` : user.email}</p>
            </div>
            <ChevronDown size={11} className="text-sidebar-foreground/40 shrink-0" />
          </button>

          {showUserMenu && (
            <div className="absolute bottom-full left-2 right-2 mb-1 bg-card border border-border rounded-lg shadow-lg py-1 z-50">
              <Link to="/profile" onClick={() => setShowUserMenu(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 transition-colors">
                <User size={13} /> My Profile
              </Link>
              <Link to="/select-company" onClick={() => setShowUserMenu(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 transition-colors">
                <RefreshCcw size={13} /> Switch Company
              </Link>
              <div className="border-t border-border my-1" />
              <button
                onClick={() => { logout.mutate(); setShowUserMenu(false) }}
                className="flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors w-full">
                <LogOut size={13} /> Sign Out
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-12 border-b border-border bg-card flex items-center gap-3 px-4 shrink-0">
          <Button variant="ghost" size="icon-sm" onClick={() => setSidebarOpen(s => !s)}>
            {sidebarOpen ? <ChevronLeft size={16} /> : <Menu size={16} />}
          </Button>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Building2 size={13} />
            <span className="font-medium text-foreground">{activeCompany.companyName}</span>
            {activeFY && <><span>·</span><span>FY {activeFY}</span></>}
          </div>
          <div className="flex-1" />
          <Link to="/profile">
            <Button variant="ghost" size="icon-sm" title="Profile">
              <User size={15} />
            </Button>
          </Link>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-5">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
