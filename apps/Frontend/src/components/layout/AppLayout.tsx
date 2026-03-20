import { useState, useEffect } from 'react'
import { Link, useLocation, Outlet, Navigate } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingCart, Package, BookOpen,
  FileText, Users, Settings, ChevronDown, ChevronRight,
  Building2, BarChart3, CreditCard, Receipt, Wallet,
  ClipboardList, UserCheck, Menu, LogOut, Bell, X,
  Building, ChevronLeft, TrendingUp, TrendingDown, User, RefreshCcw, Printer, Plus,
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
      { label: 'Stock Report', icon: Package, href: '/inventory/stock' },
      { label: 'Item Ledger', icon: BookOpen, href: '/inventory/item-ledger' },
      { label: 'Profit Report', icon: TrendingUp, href: '/inventory/profit' },
    ],
  },
  {
    label: 'GST', icon: Receipt,
    children: [
      { label: 'GSTR-1', icon: FileText, href: '/gst/gstr1' },
      { label: 'GSTR-2B Recon', icon: FileText, href: '/gst/gstr2b' },
      { label: 'GSTR-3B', icon: FileText, href: '/gst/gstr3b' },
      { label: 'TDS / TCS', icon: FileText, href: '/gst/tds-tcs' },
    ],
  },
  {
    label: 'Masters', icon: Users,
    children: [
      { label: 'Items', icon: Package, href: '/masters/items' },
      { label: 'Item Categories', icon: Package, href: '/masters/item-categories' },
      { label: 'Parties', icon: Users, href: '/masters/parties' },
      { label: 'Ledgers', icon: BookOpen, href: '/masters/ledgers' },
      { label: 'Godowns', icon: Building, href: '/masters/godowns' },
      { label: 'Tax Masters', icon: Receipt, href: '/masters/tax' },
    ],
  },
  {
    label: 'Fixed Assets', icon: Building2,
    children: [
      { label: 'Asset Register', icon: Package, href: '/assets' },
      { label: 'Add Asset', icon: Plus, href: '/assets/new' },
      { label: 'Run Depreciation', icon: TrendingDown, href: '/assets/depreciation' },
    ],
  },
  {
    label: 'Accounting', icon: BookOpen,
    children: [
      { label: 'Receipt', icon: Wallet, href: '/accounting/receipt' },
      { label: 'Payment', icon: CreditCard, href: '/accounting/payment' },
      { label: 'Contra', icon: Receipt, href: '/accounting/contra' },
      { label: 'Journal', icon: BookOpen, href: '/accounting/journal' },
      { label: 'Balance Sheet', icon: BarChart3, href: '/reports/balance-sheet' },
      { label: 'Profit & Loss', icon: TrendingUp, href: '/reports/profit-loss' },
      { label: 'Trial Balance', icon: BookOpen, href: '/reports/trial-balance' },
      { label: 'Day Book', icon: BookOpen, href: '/reports/day-book' },
      { label: 'Bank Reconciliation', icon: CreditCard, href: '/accounting/bank-recon' },
      { label: 'Voucher Settlement', icon: Receipt, href: '/accounting/settlements' },
    ],
  },
  {
    label: 'Reports', icon: BarChart3,
    children: [
      { label: 'Sale/Purchase Report', icon: BarChart3, href: '/reports/sale-purchase' },
      { label: 'Sale Register', icon: FileText, href: '/reports/register' },
      { label: 'Overdue / Outstanding', icon: FileText, href: '/reports/overdue' },
    ],
  },
  {
    label: 'Payroll', icon: UserCheck,
    children: [
      { label: 'Employees', icon: Users, href: '/payroll/employees' },
      { label: 'Attendance', icon: ClipboardList, href: '/payroll/attendance' },
      { label: 'Process Payroll', icon: Wallet, href: '/payroll/process' },
      { label: 'Payslip', icon: FileText, href: '/payroll/payslip' },
      { label: 'Leave', icon: ClipboardList, href: '/payroll/leave' },
      { label: 'Compliance', icon: Receipt, href: '/payroll/compliance' },
      { label: 'Form 16', icon: FileText, href: '/payroll/form16' },
    ],
  },
  {
    label: 'Settings', icon: Settings,
    children: [
      { label: 'Company Settings', icon: Building2, href: '/settings/company' },
      { label: 'Branches', icon: Building, href: '/settings/branches' },
      { label: 'Users', icon: Users, href: '/settings/users' },
      { label: 'Financial Years', icon: RefreshCcw, href: '/settings/financial-years' },
      { label: 'Number Series', icon: Settings, href: '/settings/number-series' },
      { label: 'Transaction Settings', icon: Settings, href: '/settings/transaction' },
      { label: 'Ledger Mapping', icon: BookOpen, href: '/settings/ledger-mapping' },
      { label: 'Print Setup', icon: Printer, href: '/settings/print-setup' },
      { label: 'Tally Import/Export', icon: FileText, href: '/settings/tally' },
    ],
  },
]

// ─── Nav Item ─────────────────────────────────────────────────────────────────

function NavItemComp({ item, depth = 0, onNavigate }: { item: NavItem; depth?: number; onNavigate?: () => void }) {
  const location = useLocation()
  const isActive = item.href ? location.pathname === item.href || location.pathname.startsWith(item.href + '/') : false
  const hasChildren = item.children && item.children.length > 0

  const isParentActive = hasChildren && item.children?.some(c =>
    c.href && (location.pathname === c.href || location.pathname.startsWith(c.href + '/'))
  )

  const [open, setOpen] = useState(isParentActive || false)

  if (hasChildren) {
    return (
      <div>
        <button
          onClick={() => setOpen(s => !s)}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
            isParentActive
              ? 'text-primary bg-primary/10 font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          )}
        >
          <item.icon size={16} className="shrink-0" />
          <span className="flex-1 text-left">{item.label}</span>
          <ChevronDown size={14} className={cn('transition-transform duration-200', open && 'rotate-180')} />
        </button>
        {open && (
          <div className="ml-4 mt-0.5 border-l border-border pl-2 space-y-0.5">
            {item.children!.map(child => (
              <NavItemComp key={child.href || child.label} item={child} depth={depth + 1} onNavigate={onNavigate} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <Link
      to={item.href!}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
        isActive
          ? 'text-primary bg-primary/10 font-semibold'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
      )}
    >
      <item.icon size={14} className="shrink-0" />
      <span className="truncate">{item.label}</span>
      {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
    </Link>
  )
}

// ─── Sidebar Content ──────────────────────────────────────────────────────────

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { activeCompany, activeFY, user } = useAuthStore()
  const { logout } = useLogout()

  return (
    <div className="flex flex-col h-full">
      {/* Company header */}
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-base shrink-0">
            {activeCompany?.companyName?.charAt(0) || 'E'}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{activeCompany?.companyName || 'ERP India'}</p>
            <p className="text-xs text-muted-foreground">{activeFY ? `FY ${activeFY}` : 'Select FY'}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {NAV.map(item => (
          <NavItemComp key={item.href || item.label} item={item} onNavigate={onNavigate} />
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3 space-y-1">
        <Link to="/profile" onClick={onNavigate}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
          <User size={14} className="shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">{user?.name || user?.email || 'Profile'}</p>
          </div>
        </Link>
        <Link to="/select-company" onClick={onNavigate}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
          <RefreshCcw size={14} className="shrink-0" />
          <span>Switch Company</span>
        </Link>
        <button onClick={() => logout()}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
          <LogOut size={14} className="shrink-0" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  )
}

// ─── Main AppLayout ───────────────────────────────────────────────────────────

export default function AppLayout() {
  const { user, activeCompany, activeFY } = useAuthStore()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [desktopCollapsed, setDesktopCollapsed] = useState(false)
  const location = useLocation()

  // Close mobile sidebar on route change
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  if (!user) return <Navigate to="/login" replace />
  if (!activeCompany) return <Navigate to="/select-company" replace />

  return (
    <div className="flex h-screen bg-background overflow-hidden">

      {/* ── Desktop Sidebar ─────────────────────────────────────────────── */}
      <aside className={cn(
        'hidden lg:flex flex-col border-r border-border bg-card transition-all duration-200 shrink-0',
        desktopCollapsed ? 'w-14' : 'w-56'
      )}>
        {desktopCollapsed ? (
          /* Collapsed — icons only */
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-center py-4 border-b border-border">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-sm">
                {activeCompany?.companyName?.charAt(0) || 'E'}
              </div>
            </div>
            <div className="flex-1 flex flex-col items-center py-3 gap-1 overflow-y-auto">
              {NAV.map(item => (
                <Link key={item.href || item.label} to={item.href || '#'}
                  title={item.label}
                  className="p-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                  <item.icon size={18} />
                </Link>
              ))}
            </div>
            <button onClick={() => setDesktopCollapsed(false)}
              className="flex items-center justify-center p-3 border-t border-border text-muted-foreground hover:text-foreground transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
        ) : (
          /* Expanded */
          <div className="flex flex-col h-full relative">
            <SidebarContent />
            <button onClick={() => setDesktopCollapsed(true)}
              className="absolute top-4 right-3 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
              <ChevronLeft size={14} />
            </button>
          </div>
        )}
      </aside>

      {/* ── Mobile Sidebar (overlay) ─────────────────────────────────────── */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer */}
          <div className="fixed inset-y-0 left-0 z-50 w-72 bg-card border-r border-border shadow-2xl lg:hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="font-bold text-sm">Menu</span>
              <button onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        </>
      )}

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar — mobile */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
          <button onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg hover:bg-muted transition-colors">
            <Menu size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm truncate">{activeCompany?.companyName}</p>
            <p className="text-xs text-muted-foreground">{activeFY ? `FY ${activeFY}` : ''}</p>
          </div>
          <Link to="/profile" className="p-2 rounded-lg hover:bg-muted transition-colors">
            <User size={18} />
          </Link>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 md:p-6 max-w-screen-2xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
