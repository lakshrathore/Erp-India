import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, Trash2, RefreshCw, Check, X,
  ChevronDown, ChevronRight, Shield, AlertCircle,
  Package, Users, BookOpen, FileText, DollarSign, Clock
} from 'lucide-react'
import { api, extractError } from '../../lib/api'
import { useAuthStore } from '../../stores/auth.store'
import { Button, PageHeader, Badge, Spinner } from '../../components/ui'
import { formatINR } from '../../lib/india'
import { cn } from '../../components/ui/utils'

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

function ConfirmModal({
  title, description, danger = true,
  onConfirm, onClose, loading, extra
}: {
  title: string
  description: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
  loading: boolean
  extra?: React.ReactNode
}) {
  const [typed, setTyped] = useState('')
  const CONFIRM_WORD = 'DELETE'
  const needsTyping = danger

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
      <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
            danger ? 'bg-destructive/15' : 'bg-warning/15'
          )}>
            <AlertTriangle size={20} className={danger ? 'text-destructive' : 'text-warning'} />
          </div>
          <div>
            <h3 className="font-bold text-base">{title}</h3>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{description}</p>
          </div>
        </div>

        {extra}

        {danger && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 mb-4 text-xs text-destructive space-y-1">
            <p className="font-semibold">⚠️ This action is IRREVERSIBLE</p>
            <p>• Data permanently deleted from database</p>
            <p>• Cannot be recovered without a backup</p>
          </div>
        )}

        {needsTyping && (
          <div className="mb-4">
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              Type <span className="font-bold text-destructive">{CONFIRM_WORD}</span> to confirm
            </label>
            <input
              value={typed}
              onChange={e => setTyped(e.target.value.toUpperCase())}
              placeholder={CONFIRM_WORD}
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-destructive"
              autoFocus
            />
          </div>
        )}

        <div className="flex gap-2">
          <Button
            variant={danger ? 'destructive' : 'default'}
            className="flex-1"
            loading={loading}
            disabled={needsTyping && typed !== CONFIRM_WORD}
            onClick={onConfirm}
          >
            <Trash2 size={14} /> Confirm Delete
          </Button>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({ icon: Icon, title, subtitle, color, children }: {
  icon: React.ElementType
  title: string
  subtitle: string
  color: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(s => !s)}
      >
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', color)}>
          <Icon size={18} className="text-white" />
        </div>
        <div className="flex-1 text-left">
          <p className="font-semibold text-sm">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {open ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
      </button>
      {open && (
        <div className="border-t border-border px-5 py-4 space-y-3">
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function DataManagementPage() {
  const { activeCompany, activeFY } = useAuthStore()
  const qc = useQueryClient()
  const companyId = activeCompany?.companyId || ''

  const [modal, setModal] = useState<any>(null)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedFY, setSelectedFY] = useState(activeFY || '')
  const [resetNumberSeries, setResetNumberSeries] = useState(true)
  const [openingScope, setOpeningScope] = useState<'ALL' | 'LEDGERS' | 'PARTIES'>('ALL')

  // Load preview data
  const { data: preview, isLoading: previewLoading, refetch: refetchPreview } = useQuery({
    queryKey: ['reset-preview', companyId],
    queryFn: async () => {
      const { data } = await api.get('/reset/preview')
      return data.data
    },
    enabled: !!companyId,
  })

  const fys: string[] = preview?.financialYears || []

  useEffect(() => {
    if (fys.length > 0 && !selectedFY) {
      setSelectedFY(fys[0])
    }
  }, [fys])

  const execute = async (endpoint: string, body: any) => {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const { data } = await api.post(`/reset/${endpoint}`, { ...body, confirm: true })
      setResult(data)
      setModal(null)
      refetchPreview()
      qc.invalidateQueries()
    } catch (e) {
      setError(extractError(e))
    } finally {
      setLoading(false)
    }
  }

  // FY counts for display
  const fyCount = selectedFY ? preview?.byFY?.[selectedFY] : null
  const allFYTotal = fys.reduce((s: number, fy: string) => {
    const c = preview?.byFY?.[fy]
    return s + (c?.vouchers || 0)
  }, 0)

  return (
    <div>
      <PageHeader
        title="Data Management"
        subtitle="Reset or delete specific data — transactions, masters, opening balances"
        breadcrumbs={[{ label: 'Settings' }, { label: 'Data Management' }]}
      />

      {/* Warning banner */}
      <div className="mb-5 flex items-start gap-3 bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3.5">
        <Shield size={18} className="text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-destructive">Caution — Irreversible Actions</p>
          <p className="text-xs text-destructive/80 mt-0.5">
            Take a database backup before performing any delete operation.
            Deleted data cannot be recovered.
          </p>
        </div>
      </div>

      {previewLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <div className="space-y-4 max-w-2xl">

          {/* ── 1. Transactions (FY-wise) ──────────────────────────────────── */}
          <SectionCard
            icon={FileText}
            title="Transactions (Vouchers)"
            subtitle="Delete vouchers, journal entries, stock movements — FY-wise"
            color="bg-destructive"
          >
            {/* FY selector */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-2">
                Select Financial Year to Delete
              </label>
              <div className="flex flex-wrap gap-2 mb-3">
                {fys.map((fy: string) => {
                  const c = preview?.byFY?.[fy]
                  return (
                    <button
                      key={fy}
                      onClick={() => setSelectedFY(fy)}
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all',
                        selectedFY === fy
                          ? 'border-destructive bg-destructive/10 text-destructive'
                          : 'border-border hover:border-destructive/50 text-muted-foreground'
                      )}
                    >
                      <Clock size={11} />
                      FY {fy}
                      {c && <Badge variant={c.vouchers > 0 ? 'destructive' : 'secondary'} className="text-[9px] px-1">
                        {c.vouchers} vouchers
                      </Badge>}
                    </button>
                  )
                })}
              </div>

              {fyCount && (
                <div className="bg-muted/30 rounded-lg p-3 mb-3 text-xs space-y-1">
                  <p className="font-semibold text-sm mb-2">FY {selectedFY} — Will Delete:</p>
                  {[
                    { label: 'Vouchers', val: fyCount.vouchers },
                    { label: 'Journal Entries', val: fyCount.journalEntries },
                    { label: 'Stock Movements', val: fyCount.stockMovements },
                    { label: 'GST Entries', val: fyCount.gstEntries },
                  ].map(r => (
                    <div key={r.label} className="flex justify-between text-muted-foreground">
                      <span>{r.label}</span>
                      <span className={cn('font-mono font-semibold', r.val > 0 ? 'text-destructive' : 'text-muted-foreground')}>
                        {r.val}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <label className="flex items-center gap-2 text-xs cursor-pointer mb-3">
                <input type="checkbox" checked={resetNumberSeries} onChange={e => setResetNumberSeries(e.target.checked)} className="w-3.5 h-3.5" />
                Reset number series counter to 0 for this FY
              </label>

              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={!selectedFY || !fyCount?.vouchers}
                  onClick={() => setModal({
                    type: 'transactions-fy',
                    title: `Delete Transactions — FY ${selectedFY}`,
                    description: `Delete all ${fyCount?.vouchers || 0} vouchers for FY ${selectedFY}. Stock and ledger entries will also be removed.`,
                  })}
                >
                  <Trash2 size={13} /> Delete FY {selectedFY} Transactions
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive border-destructive/30"
                  disabled={allFYTotal === 0}
                  onClick={() => setModal({
                    type: 'transactions-all',
                    title: 'Delete ALL Transactions — All FYs',
                    description: `Delete all ${allFYTotal} vouchers across ${fys.length} financial years. Processed oldest FY first.`,
                  })}
                >
                  <Trash2 size={13} /> Delete All FYs ({allFYTotal} total)
                </Button>
              </div>
            </div>
          </SectionCard>

          {/* ── 2. Opening Balances ────────────────────────────────────────── */}
          <SectionCard
            icon={DollarSign}
            title="Opening Balances"
            subtitle="Reset opening balance to zero for ledgers and/or parties"
            color="bg-warning"
          >
            <div>
              <p className="text-xs text-muted-foreground mb-3">
                Currently <strong>{preview?.masters?.openingBalances || 0}</strong> ledgers have non-zero opening balance.
              </p>
              <div className="flex gap-2 mb-3">
                {(['ALL', 'LEDGERS', 'PARTIES'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setOpeningScope(s)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg border text-xs font-medium transition-all',
                      openingScope === s
                        ? 'border-warning bg-warning/10 text-warning'
                        : 'border-border text-muted-foreground hover:border-warning/50'
                    )}
                  >
                    {s === 'ALL' ? 'All (Ledgers + Parties)' : s === 'LEDGERS' ? 'Ledgers Only' : 'Parties Only'}
                  </button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-warning border-warning/30"
                onClick={() => setModal({
                  type: 'opening-balances',
                  title: 'Reset Opening Balances',
                  description: `Reset opening balance to zero for: ${openingScope === 'ALL' ? 'all ledgers and parties' : openingScope.toLowerCase()}.`,
                  danger: false,
                })}
              >
                <RefreshCw size={13} /> Reset Opening Balances
              </Button>
            </div>
          </SectionCard>

          {/* ── 3. Item Categories ────────────────────────────────────────── */}
          <SectionCard
            icon={Package}
            title="Item Categories"
            subtitle="Delete all item categories and their attribute definitions"
            color="bg-orange-500"
          >
            <div>
              <p className="text-xs text-muted-foreground mb-3">
                <strong>{preview?.masters?.categories || 0}</strong> categories will be deleted.
                Items will have their category cleared.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/30"
                disabled={!preview?.masters?.categories}
                onClick={() => setModal({
                  type: 'categories',
                  title: 'Delete All Item Categories',
                  description: `Delete all ${preview?.masters?.categories} categories. Items will lose their category assignment but will NOT be deleted.`,
                })}
              >
                <Trash2 size={13} /> Delete All Categories
              </Button>
            </div>
          </SectionCard>

          {/* ── 4. Items ──────────────────────────────────────────────────── */}
          <SectionCard
            icon={Package}
            title="Items & Variants"
            subtitle="Delete all items, variants, and inventory records"
            color="bg-primary"
          >
            <div>
              <p className="text-xs text-muted-foreground mb-3">
                <strong>{preview?.masters?.items || 0}</strong> items will be deleted.
                {preview?.masters?.items > 0 && ' You must delete transactions first (or force delete).'}
              </p>
              <div className="bg-warning-muted border border-warning/20 rounded-lg px-3 py-2.5 mb-3 text-xs text-warning">
                ⚠️ Items with transactions cannot be deleted unless you delete transactions first.
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/30"
                disabled={!preview?.masters?.items}
                onClick={() => setModal({
                  type: 'items',
                  title: 'Delete All Items',
                  description: `Delete all ${preview?.masters?.items} items and their variants. Transactions must be deleted first.`,
                })}
              >
                <Trash2 size={13} /> Delete All Items
              </Button>
            </div>
          </SectionCard>

        </div>
      )}

      {/* Result banner */}
      {result && (
        <div className="fixed bottom-4 right-4 z-50 bg-success text-white rounded-xl px-4 py-3 shadow-2xl flex items-center gap-3 max-w-sm">
          <Check size={18} />
          <div>
            <p className="font-semibold text-sm">{result.message || 'Done!'}</p>
            {result.data?.deletedVouchers !== undefined && (
              <p className="text-xs opacity-90">{result.data.deletedVouchers} vouchers deleted</p>
            )}
          </div>
          <button onClick={() => setResult(null)} className="ml-2 opacity-70 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="fixed bottom-4 right-4 z-50 bg-destructive text-white rounded-xl px-4 py-3 shadow-2xl flex items-center gap-3 max-w-sm">
          <AlertCircle size={18} />
          <p className="text-sm flex-1">{error}</p>
          <button onClick={() => setError('')} className="opacity-70 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Confirm Modal */}
      {modal && (
        <ConfirmModal
          title={modal.title}
          description={modal.description}
          danger={modal.danger !== false}
          loading={loading}
          onClose={() => { setModal(null); setError('') }}
          onConfirm={() => {
            if (modal.type === 'transactions-fy') {
              execute('transactions', { financialYear: selectedFY, resetNumberSeries })
            } else if (modal.type === 'transactions-all') {
              execute('all-transactions', { resetNumberSeries })
            } else if (modal.type === 'opening-balances') {
              execute('opening-balances', { scope: openingScope })
            } else if (modal.type === 'categories') {
              execute('categories', { resetItemCategories: true })
            } else if (modal.type === 'items') {
              execute('items', { forceDelete: false })
            }
          }}
          extra={
            modal.type === 'transactions-fy' && (
              <div className="bg-muted/30 rounded-lg p-3 mb-3 text-xs">
                <p className="font-medium mb-1">FY Processing Order:</p>
                {fys.map((fy: string, i: number) => (
                  <div key={fy} className="flex items-center gap-2">
                    <span className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      fy === selectedFY ? 'bg-destructive' : 'bg-muted-foreground'
                    )} />
                    <span className={cn('text-muted-foreground', fy === selectedFY && 'text-destructive font-semibold')}>
                      FY {fy} {fy === selectedFY && '← will be deleted'}
                    </span>
                  </div>
                ))}
              </div>
            )
          }
        />
      )}
    </div>
  )
}
