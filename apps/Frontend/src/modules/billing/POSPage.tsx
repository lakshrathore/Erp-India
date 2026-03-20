import { useState, useRef, useEffect } from 'react'
import {
  Search, Plus, Minus, Trash2, ShoppingCart, CreditCard,
  Banknote, Smartphone, Check, X, RotateCcw, Printer, ChevronRight, Package
} from 'lucide-react'
import { api, extractError } from '../../lib/api'
import { useAuthStore } from '../../stores/auth.store'
import { formatINR, amountInWords, calculateLineGST, roundOff } from '../../lib/india'
import { Badge, Spinner } from '../../components/ui'
import { cn } from '../../components/ui/utils'

interface CartItem {
  itemId: string
  variantId: string | null
  name: string
  variantLabel: string
  unit: string
  rate: number
  qty: number
  gstRate: number
  taxType: string
}

const PAYMENT_MODES = [
  { value: 'CASH', label: 'Cash', icon: Banknote, color: 'text-green-600' },
  { value: 'UPI', label: 'UPI', icon: Smartphone, color: 'text-blue-600' },
  { value: 'CARD', label: 'Card', icon: CreditCard, color: 'text-purple-600' },
]

function calcCart(items: CartItem[], inclusive = false) {
  let subtotal = 0, cgst = 0, sgst = 0, igst = 0, taxable = 0, lineTotalSum = 0
  for (const item of items) {
    const c = calculateLineGST(item.qty, item.rate, 0, item.gstRate, item.taxType as any, 0, inclusive)
    subtotal += item.qty * item.rate
    taxable += c.taxableAmount
    cgst += c.cgstAmount; sgst += c.sgstAmount; igst += c.igstAmount
    lineTotalSum += c.lineTotal
  }
  // Inclusive: grand = lineTotals (rate already has GST inside)
  // Exclusive: grand = taxable + taxes
  const beforeRound = inclusive ? lineTotalSum : (taxable + cgst + sgst + igst)
  const ro = roundOff(beforeRound)
  return { subtotal, taxable, cgst, sgst, igst, roundOff: ro, grand: Math.round(beforeRound) }
}

// ─── Variant Picker Modal ─────────────────────────────────────────────────────

function VariantPicker({ item, onSelect, onClose }: { item: any; onSelect: (variant: any | null) => void; onClose: () => void }) {
  const isPharma = item.variants?.some((v: any) => v.attributeValues?.batch_no || v.attributeValues?.exp_date)
  const activeVariants = (item.variants || []).filter((v: any) => v.isActive)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="font-bold">{item.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{activeVariants.length} variants available</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
          {/* No variant option */}
          <button onClick={() => onSelect(null)}
            className="w-full text-left border border-dashed border-border rounded-xl p-3 hover:border-primary hover:bg-primary/5 transition-all">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-muted-foreground">No variant (base rate)</p>
              </div>
              <p className="font-bold font-mono text-sm">{formatINR(Number(item.saleRate))}</p>
            </div>
          </button>

          {activeVariants.map((v: any) => {
            const attrs = Object.entries(v.attributeValues || {}).filter(([, val]) => val != null && val !== '')
            const rate = Number(v.saleRate)
            return (
              <button key={v.id} onClick={() => onSelect(v)}
                className="w-full text-left border-2 border-border rounded-xl p-3 hover:border-primary hover:bg-primary/5 transition-all">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {v.code && <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded font-bold">{v.code}</span>}
                      {attrs.map(([k, val]) => (
                        <span key={k} className="text-sm font-semibold">{String(val)}</span>
                      ))}
                    </div>
                    {v.barcode && <p className="text-xs text-muted-foreground font-mono mt-0.5">{v.barcode}</p>}
                  </div>
                  <p className="font-bold font-mono text-primary">{formatINR(rate)}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Main POS ─────────────────────────────────────────────────────────────────

export default function POSPage() {
  const { activeCompany } = useAuthStore()
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<any[]>([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [cart, setCart] = useState<CartItem[]>([])
  const [payMode, setPayMode] = useState('CASH')
  const [cashGiven, setCashGiven] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedBill, setSavedBill] = useState<any>(null)
  const [error, setError] = useState('')
  const [variantPickerItem, setVariantPickerItem] = useState<any>(null)
  const [isInclusive, setIsInclusive] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => { searchRef.current?.focus() }, [])

  // Search items
  useEffect(() => {
    setLoadingItems(true)
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get('/masters/items', { params: { search, limit: 40, isActive: 'true' } })
        setItems(data.data || [])
      } catch { setItems([]) }
      finally { setLoadingItems(false) }
    }, 200)
    return () => clearTimeout(t)
  }, [search])

  const t = calcCart(cart, isInclusive)

  const handleItemClick = async (item: any) => {
    // Fetch full item to check variants
    try {
      const { data } = await api.get(`/masters/items/${item.id}`)
      const full = data.data
      const activeVariants = (full.variants || []).filter((v: any) => v.isActive)

      if (activeVariants.length > 0) {
        // Show variant picker
        setVariantPickerItem(full)
      } else {
        addToCart(full, null)
      }
    } catch {
      addToCart(item, null)
    }
  }

  const addToCart = (item: any, variant: any | null) => {
    const rate = variant ? Number(variant.saleRate) : Number(item.saleRate)
    const variantLabel = variant
      ? Object.values(variant.attributeValues || {}).filter(Boolean).join(' · ')
      : ''
    const key = `${item.id}__${variant?.id || 'base'}`

    setCart(prev => {
      const existing = prev.findIndex(c => `${c.itemId}__${c.variantId || 'base'}` === key)
      if (existing >= 0) {
        return prev.map((c, i) => i === existing ? { ...c, qty: c.qty + 1 } : c)
      }
      return [...prev, {
        itemId: item.id,
        variantId: variant?.id || null,
        name: item.name,
        variantLabel,
        unit: item.unit,
        rate,
        qty: 1,
        gstRate: Number(item.gstRate),
        taxType: item.taxType || 'CGST_SGST',
      }]
    })
    setSearch('')
    setVariantPickerItem(null)
    searchRef.current?.focus()
  }

  const updateQty = (idx: number, delta: number) => {
    setCart(prev => {
      const updated = prev.map((c, i) => i === idx ? { ...c, qty: Math.max(0, c.qty + delta) } : c)
      return updated.filter(c => c.qty > 0)
    })
  }

  const removeItem = (idx: number) => setCart(prev => prev.filter((_, i) => i !== idx))
  const clearCart = () => { setCart([]); setSavedBill(null); setError(''); setCashGiven('') }
  const change = cashGiven ? Math.max(0, Number(cashGiven) - t.grand) : 0

  const checkout = async () => {
    if (cart.length === 0) return
    setSaving(true); setError('')
    try {
      const payload = {
        voucherType: 'SALE',
        date: new Date().toISOString().split('T')[0],
        saleType: 'REGULAR',
        isInclusive,
        placeOfSupply: '08',
        paymentMode: payMode,
        narration: `POS Sale — ${payMode}`,
        items: cart.map(c => ({
          itemId: c.itemId,
          variantId: c.variantId,
          unit: c.unit, qty: c.qty, freeQty: 0, rate: c.rate,
          discountPct: 0, discount2Pct: 0, discount3Pct: 0,
          gstRate: c.gstRate, taxType: c.taxType,
        })),
        ledgerEntries: [],
      }
      const { data: res } = await api.post('/billing/vouchers', payload)
      const voucherId = res.data.id
      await api.post(`/billing/vouchers/${voucherId}/post`)
      setSavedBill({ ...res.data, cartItems: cart, totals: t, payMode, cashGiven: Number(cashGiven), change })
    } catch (e) { setError(extractError(e)) }
    finally { setSaving(false) }
  }

  const quickAmounts = [50, 100, 200, 500, 1000, 2000].filter(a => a >= t.grand - 100)

  // ── Success screen ──────────────────────────────────────────────────────────
  if (savedBill) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center z-50">
        <div className="bg-card border border-border rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check size={32} className="text-green-600" />
          </div>
          <h2 className="text-xl font-bold mb-1">Payment Received!</h2>
          <p className="text-muted-foreground text-sm mb-4">{savedBill.voucherNumber}</p>
          <div className="bg-muted/30 rounded-xl p-4 mb-4 text-sm space-y-1.5 text-left">
            <div className="flex justify-between"><span>Total</span><span className="font-bold font-mono">{formatINR(savedBill.totals.grand)}</span></div>
            <div className="flex justify-between"><span>{savedBill.payMode}</span><span className="font-mono">{formatINR(Number(savedBill.cashGiven) || savedBill.totals.grand)}</span></div>
            {savedBill.change > 0 && (
              <div className="flex justify-between text-green-600 font-semibold">
                <span>Return Change</span><span className="font-mono">{formatINR(savedBill.change)}</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => window.print()}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm hover:bg-muted transition-colors">
              <Printer size={15} /> Print
            </button>
            <button onClick={clearCart}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-white text-sm hover:bg-primary/90 transition-colors">
              <RotateCcw size={15} /> New Bill
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex overflow-hidden bg-background">

      {/* ── LEFT: Item search + grid ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-border">

        {/* Search + Inclusive toggle */}
        <div className="p-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3 mb-2">
            <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-10 w-full rounded-xl border border-input bg-background pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Search item by name or code..."
            />
            </div>
            {/* Inclusive/Exclusive toggle */}
            <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 select-none">
              <div className="relative">
                <input type="checkbox" checked={isInclusive} onChange={e => setIsInclusive(e.target.checked)} className="sr-only peer" />
                <div className="w-9 h-5 bg-muted-foreground/30 rounded-full peer-checked:bg-primary transition-colors" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
              </div>
              <span className="text-xs font-medium">{isInclusive ? 'GST Incl.' : 'GST Excl.'}</span>
            </label>
          </div>
        </div>

        {/* Item grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {loadingItems ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2">
              {items.map((item: any) => {
                const inCart = cart.filter(c => c.itemId === item.id)
                const cartQty = inCart.reduce((s, c) => s + c.qty, 0)
                const variantCount = item._count?.variants || 0

                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className={cn(
                      'relative p-3 rounded-xl border text-left transition-all hover:border-primary/60 hover:bg-primary/5',
                      cartQty > 0 ? 'border-primary bg-primary/5' : 'border-border bg-card'
                    )}
                  >
                    {cartQty > 0 && (
                      <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center text-[10px] text-white font-bold">
                        {cartQty}
                      </div>
                    )}
                    <div className="text-sm font-medium leading-snug mb-1.5 pr-4 line-clamp-2">{item.name}</div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs text-muted-foreground">{item.unit}</span>
                      <span className="text-sm font-bold text-primary font-mono">{formatINR(Number(item.saleRate))}</span>
                    </div>
                    {variantCount > 0 && (
                      <div className="flex items-center gap-0.5 mt-1">
                        <Badge variant="warning" className="text-[9px] px-1">{variantCount} var</Badge>
                      </div>
                    )}
                    {Number(item.gstRate) > 0 && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">GST {item.gstRate}%</div>
                    )}
                  </button>
                )
              })}
              {items.length === 0 && !loadingItems && (
                <div className="col-span-full flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Package size={36} className="mb-2 opacity-30" />
                  <p className="text-sm">{search ? `No items found for "${search}"` : 'Start typing to search'}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: Cart ─────────────────────────────────────────────────── */}
      <div className="w-80 flex flex-col bg-card flex-shrink-0">

        {/* Cart header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingCart size={16} className="text-primary" />
            <span className="font-semibold text-sm">Cart ({cart.length} items)</span>
          </div>
          {cart.length > 0 && (
            <button onClick={clearCart} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors">
              <X size={12} /> Clear
            </button>
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
              <ShoppingCart size={36} className="mb-2 opacity-20" />
              <p className="text-sm">Cart is empty</p>
              <p className="text-xs mt-1 text-center">Search and click items to add</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {cart.map((item, idx) => {
                const lineTotal = item.qty * item.rate
                return (
                  <div key={idx} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        {item.variantLabel && (
                          <p className="text-xs text-primary font-medium">{item.variantLabel}</p>
                        )}
                      </div>
                      <button onClick={() => removeItem(idx)} className="text-muted-foreground hover:text-destructive shrink-0 mt-0.5 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateQty(idx, -1)}
                          className="w-6 h-6 rounded-md border border-border flex items-center justify-center hover:bg-muted transition-colors">
                          <Minus size={11} />
                        </button>
                        <span className="w-8 text-center text-sm font-semibold">{item.qty}</span>
                        <button onClick={() => updateQty(idx, 1)}
                          className="w-6 h-6 rounded-md border border-border flex items-center justify-center hover:bg-muted transition-colors">
                          <Plus size={11} />
                        </button>
                        <span className="text-xs text-muted-foreground ml-1">{item.unit}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold font-mono">{formatINR(lineTotal)}</div>
                        <div className="text-[10px] text-muted-foreground">@ {formatINR(item.rate)}</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Totals */}
        {cart.length > 0 && (
          <div className="border-t border-border px-4 py-3 space-y-1.5 text-sm flex-shrink-0">
            {t.subtotal !== t.taxable && (
              <div className="flex justify-between text-muted-foreground text-xs">
                <span>Subtotal</span><span className="font-mono">{formatINR(t.subtotal)}</span>
              </div>
            )}
            {t.cgst > 0 && <div className="flex justify-between text-muted-foreground text-xs"><span>CGST</span><span className="font-mono">{formatINR(t.cgst)}</span></div>}
            {t.sgst > 0 && <div className="flex justify-between text-muted-foreground text-xs"><span>SGST</span><span className="font-mono">{formatINR(t.sgst)}</span></div>}
            {t.igst > 0 && <div className="flex justify-between text-muted-foreground text-xs"><span>IGST</span><span className="font-mono">{formatINR(t.igst)}</span></div>}
            <div className="flex justify-between font-bold text-lg border-t border-border pt-1.5">
              <span>Total</span>
              <span className="font-mono text-primary">{formatINR(t.grand)}</span>
            </div>
          </div>
        )}

        {/* Payment */}
        {cart.length > 0 && (
          <div className="border-t border-border px-4 py-3 space-y-3 flex-shrink-0">
            {/* Payment mode */}
            <div className="grid grid-cols-3 gap-1.5">
              {PAYMENT_MODES.map(pm => {
                const Icon = pm.icon
                return (
                  <button key={pm.value} onClick={() => setPayMode(pm.value)}
                    className={cn(
                      'flex flex-col items-center gap-1 py-2 rounded-xl border text-xs font-medium transition-all',
                      payMode === pm.value ? 'border-primary bg-primary text-white' : 'border-border hover:border-primary/50'
                    )}>
                    <Icon size={16} className={payMode === pm.value ? 'text-white' : pm.color} />
                    {pm.label}
                  </button>
                )
              })}
            </div>

            {/* Cash amount */}
            {payMode === 'CASH' && (
              <div>
                <div className="relative mb-2">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">₹</span>
                  <input
                    type="number"
                    value={cashGiven}
                    onChange={e => setCashGiven(e.target.value)}
                    placeholder={String(t.grand)}
                    className="h-9 w-full rounded-lg border border-input bg-background pl-7 pr-3 text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {quickAmounts.slice(0, 4).map(a => (
                    <button key={a} onClick={() => setCashGiven(String(a))}
                      className="px-2 py-1 text-xs rounded-lg border border-border hover:border-primary hover:text-primary transition-colors">
                      ₹{a}
                    </button>
                  ))}
                  <button onClick={() => setCashGiven(String(t.grand))}
                    className="px-2 py-1 text-xs rounded-lg border border-primary text-primary font-medium">
                    Exact
                  </button>
                </div>
                {cashGiven && Number(cashGiven) >= t.grand && (
                  <div className="flex justify-between text-sm font-bold text-green-600 bg-green-50 dark:bg-green-950 rounded-xl px-3 py-2">
                    <span>Return Change</span>
                    <span className="font-mono">{formatINR(change)}</span>
                  </div>
                )}
              </div>
            )}

            {error && <div className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</div>}

            <button
              onClick={checkout}
              disabled={saving || cart.length === 0}
              className={cn(
                'w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2',
                saving ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-white hover:bg-primary/90 active:scale-95'
              )}>
              {saving ? (
                <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing...</span>
              ) : (
                <><Check size={18} /> Charge {formatINR(t.grand)}</>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Variant Picker Modal */}
      {variantPickerItem && (
        <VariantPicker
          item={variantPickerItem}
          onSelect={variant => addToCart(variantPickerItem, variant)}
          onClose={() => setVariantPickerItem(null)}
        />
      )}
    </div>
  )
}
