import { useState, useEffect, useRef } from 'react'
import { Link, useLocation, Outlet, Navigate } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingCart, Package, BookOpen,
  FileText, Users, Settings, ChevronDown,
  Building2, BarChart3, CreditCard, Receipt, Wallet,
  ClipboardList, UserCheck, Menu, LogOut, X,
  Building, ChevronRight, TrendingUp, TrendingDown, User, RefreshCcw, Printer, Plus, Trash2,
  PanelLeftClose, PanelLeftOpen, Ruler,
} from 'lucide-react'
import { cn } from '../ui/utils'
import { useAuthStore } from '../../stores/auth.store'

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
      { label: 'Units', icon: Ruler, href: '/masters/units' },
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
      { label: 'Customer Receipt', icon: Wallet, href: '/accounting/customer-receipt' },
      { label: 'Vendor Payment', icon: CreditCard, href: '/accounting/vendor-payment' },
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
      { label: 'Cash Book', icon: BookOpen, href: '/reports/cash-book' },
      { label: 'Bank Book', icon: CreditCard, href: '/reports/bank-book' },
      { label: 'Sale Register', icon: FileText, href: '/reports/sale-register' },
      { label: 'Purchase Register', icon: FileText, href: '/reports/purchase-register' },
      { label: 'Journal Register', icon: FileText, href: '/reports/journal-register' },
      { label: 'Sale/Purchase Report', icon: BarChart3, href: '/reports/sale-purchase' },
      { label: 'Outstanding', icon: FileText, href: '/reports/outstanding' },
      { label: 'Overdue', icon: FileText, href: '/reports/overdue' },
    ],
  },
  {
    label: 'Payroll', icon: UserCheck,
    children: [
      { label: 'Employees', icon: Users, href: '/payroll/employees' },
      { label: 'Salary Structure', icon: Settings, href: '/payroll/salary-structures' },
      { label: 'Attendance', icon: ClipboardList, href: '/payroll/attendance' },
      { label: 'Leave', icon: ClipboardList, href: '/payroll/leave' },
      { label: 'Process Payroll', icon: Wallet, href: '/payroll/process' },
      { label: 'Payslip', icon: FileText, href: '/payroll/payslip' },
      { label: 'Compliance (PF/ESIC)', icon: Receipt, href: '/payroll/compliance' },
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
      { label: 'Data Management', icon: Trash2, href: '/settings/data-management' },
      { label: 'Tally Import/Export', icon: FileText, href: '/settings/tally' },
    ],
  },
]

// ─── Collapsed icon with flyout submenu on hover ──────────────────────────────

function CollapsedNavItem({ item, onExpand }: { item: NavItem; onExpand: () => void }) {
  const location = useLocation()
  const [hovering, setHovering] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hasChildren = !!item.children?.length
  const isParentActive = hasChildren
    ? item.children!.some(c => c.href && location.pathname.startsWith(c.href))
    : item.href && location.pathname.startsWith(item.href)

  const handleMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setHovering(true)
  }
  const handleMouseLeave = () => {
    timerRef.current = setTimeout(() => setHovering(false), 120)
  }

  return (
    <div className="relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {/* Icon button */}
      {item.href && !hasChildren ? (
        <Link
          to={item.href}
          title={item.label}
          className={cn(
            'flex items-center justify-center w-10 h-10 rounded-lg transition-colors mx-auto',
            isParentActive
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          )}
        >
          <item.icon size={18} />
        </Link>
      ) : (
        <button
          title={item.label}
          className={cn(
            'flex items-center justify-center w-10 h-10 rounded-lg transition-colors mx-auto',
            isParentActive
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          )}
        >
          <item.icon size={18} />
        </button>
      )}

      {/* Flyout panel */}
      {hovering && (
        <div
          className="absolute left-full top-0 ml-2 z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[180px]"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Section header — clicking expands the sidebar */}
          <div
            className="flex items-center justify-between px-3 py-1.5 border-b border-border mb-1 cursor-pointer group"
            onClick={onExpand}
          >
            <span className="text-xs font-semibold text-foreground">{item.label}</span>
            <PanelLeftOpen size={12} className="text-muted-foreground group-hover:text-primary transition-colors" />
          </div>

          {hasChildren ? (
            item.children!.map(child => (
              <Link
                key={child.href || child.label}
                to={child.href!}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 text-xs transition-colors',
                  child.href && location.pathname === child.href
                    ? 'text-primary font-medium bg-primary/5'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                <child.icon size={13} className="shrink-0" />
                <span>{child.label}</span>
              </Link>
            ))
          ) : (
            item.href && (
              <Link
                to={item.href}
                className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50"
              >
                <item.icon size={13} className="shrink-0" />
                <span>{item.label}</span>
              </Link>
            )
          )}
        </div>
      )}
    </div>
  )
}

// ─── Expanded Nav Item ────────────────────────────────────────────────────────

function NavItemComp({ item, depth = 0, onNavigate }: { item: NavItem; depth?: number; onNavigate?: () => void }) {
  const location = useLocation()
  const isActive = item.href
    ? location.pathname === item.href || location.pathname.startsWith(item.href + '/')
    : false
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
          <span className="flex-1 text-left truncate">{item.label}</span>
          <ChevronDown size={14} className={cn('transition-transform duration-200 shrink-0', open && 'rotate-180')} />
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

// ─── Sidebar Content (expanded) ───────────────────────────────────────────────

function SidebarContent({ onNavigate, onCollapse }: { onNavigate?: () => void; onCollapse?: () => void }) {
  const { activeCompany, activeFY, user } = useAuthStore()
  const logoutFn = useAuthStore(s => s.logout)
  const companyName = activeCompany?.companyName || 'ERP India'
  const initial = companyName.charAt(0).toUpperCase()

  return (
    <div className="flex flex-col h-full">
      {/* Company header */}
      <div className="px-3 py-3 border-b border-border">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-sm shrink-0">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm leading-tight truncate" title={companyName}>
              {companyName}
            </p>
            <p className="text-xs text-muted-foreground">{activeFY ? `FY ${activeFY}` : 'Select FY'}</p>
          </div>
          {/* Collapse button — only shown when inside expanded sidebar */}
          {onCollapse && (
            <button
              onClick={onCollapse}
              title="Collapse sidebar"
              className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <PanelLeftClose size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {NAV.map(item => (
          <NavItemComp key={item.href || item.label} item={item} onNavigate={onNavigate} />
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-2 space-y-0.5">
        <Link to="/profile" onClick={onNavigate}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
          <User size={14} className="shrink-0" />
          <span className="truncate text-xs font-medium">{user?.name || user?.email || 'Profile'}</span>
        </Link>
        <Link to="/select-company" onClick={onNavigate}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
          <RefreshCcw size={14} className="shrink-0" />
          <span>Switch Company</span>
        </Link>
        <button onClick={() => { logoutFn(); window.location.href = '/login' }}
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
          /* ── Collapsed state ── */
          <div className="flex flex-col h-full">
            {/* Company initial + expand button */}
            <div className="flex flex-col items-center py-3 gap-1 border-b border-border">
              <div
                className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-sm cursor-pointer"
                title={activeCompany?.companyName}
                onClick={() => setDesktopCollapsed(false)}
              >
                {activeCompany?.companyName?.charAt(0)?.toUpperCase() || 'E'}
              </div>
              <button
                onClick={() => setDesktopCollapsed(false)}
                title="Expand sidebar"
                className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-muted/50 transition-colors"
              >
                <PanelLeftOpen size={14} />
              </button>
            </div>

            {/* Nav icons with flyout */}
            <div className="flex-1 flex flex-col items-center py-2 gap-0.5 overflow-y-auto px-1">
              {NAV.map(item => (
                <CollapsedNavItem
                  key={item.href || item.label}
                  item={item}
                  onExpand={() => setDesktopCollapsed(false)}
                />
              ))}
            </div>

            {/* Footer icons */}
            <div className="border-t border-border py-2 flex flex-col items-center gap-0.5">
              <Link to="/profile" title="Profile"
                className="flex items-center justify-center w-10 h-10 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors mx-auto">
                <User size={16} />
              </Link>
              <Link to="/select-company" title="Switch Company"
                className="flex items-center justify-center w-10 h-10 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors mx-auto">
                <RefreshCcw size={16} />
              </Link>
              <button
                onClick={() => { useAuthStore.getState().logout(); window.location.href = '/login' }}
                title="Logout"
                className="flex items-center justify-center w-10 h-10 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors mx-auto">
                <LogOut size={16} />
              </button>
            </div>
          </div>
        ) : (
          /* ── Expanded state ── */
          <SidebarContent onCollapse={() => setDesktopCollapsed(true)} />
        )}
      </aside>

      {/* ── Mobile Sidebar (overlay) ─────────────────────────────────────── */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border shadow-2xl lg:hidden flex flex-col">
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

        {/* Top bar — mobile only */}
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
