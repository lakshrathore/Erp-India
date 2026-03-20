import { useState, useRef, useEffect } from 'react'
import { Search, Plus, Minus, Trash2, ShoppingCart, CreditCard, Banknote, Smartphone, Check, X, RotateCcw, Printer } from 'lucide-react'
import { useItems, useParties, useTaxMasters } from '../../hooks/api.hooks'
import { useAuthStore } from '../../stores/auth.store'
import { formatINR, amountInWords, calculateLineGST, roundOff } from '../../lib/india'
import { api, extractError } from '../../lib/api'
import { Badge, Spinner } from '../../components/ui'
import { cn } from '../../components/ui/utils'

interface CartItem {
  itemId: string
  name: string
  unit: string
  rate: number
  qty: number
  gstRate: number
  taxType: string
  hsnCode?: string
}

const PAYMENT_MODES = [
  { value: 'CASH', label: 'Cash', icon: Banknote, color: 'text-success' },
  { value: 'UPI', label: 'UPI', icon: Smartphone, color: 'text-primary' },
  { value: 'CARD', label: 'Card', icon: CreditCard, color: 'text-info' },
]

function calcCart(items: CartItem[]) {
  let subtotal = 0, cgst = 0, sgst = 0, igst = 0, taxable = 0
  for (const item of items) {
    const c = calculateLineGST(item.qty, item.rate, 0, item.gstRate, item.taxType as any)
    subtotal += item.qty * item.rate
    taxable += c.taxableAmount
    cgst += c.cgstAmount; sgst += c.sgstAmount; igst += c.igstAmount
  }
  const beforeRound = taxable + cgst + sgst + igst
  const ro = roundOff(beforeRound)
  return { subtotal, taxable, cgst, sgst, igst, roundOff: ro, grand: Math.round(beforeRound) }
}

export default function POSPage() {
  const { activeCompany, activeFY } = useAuthStore()
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [payMode, setPayMode] = useState('CASH')
  const [cashGiven, setCashGiven] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedBill, setSavedBill] = useState<any>(null)
  const [error, setError] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const { data: itemsData } = useItems({ search, limit: 30 })
  const items = (itemsData as any)?.data || []
  const t = calcCart(cart)

  useEffect(() => { searchRef.current?.focus() }, [])

  const addToCart = (item: any) => {
    setCart(prev => {
      const existing = prev.findIndex(c => c.itemId === item.id)
      if (existing >= 0) {
        return prev.map((c, i) => i === existing ? { ...c, qty: c.qty + 1 } : c)
      }
      return [...prev, {
        itemId: item.id, name: item.name, unit: item.unit,
        rate: Number(item.saleRate), qty: 1,
        gstRate: Number(item.gstRate), taxType: item.taxType, hsnCode: item.hsnCode,
      }]
    })
    setSearch('')
    searchRef.current?.focus()
  }

  const updateQty = (idx: number, delta: number) => {
    setCart(prev => {
      const newCart = prev.map((c, i) => i === idx ? { ...c, qty: Math.max(0, c.qty + delta) } : c)
      return newCart.filter(c => c.qty > 0)
    })
  }

  const updateRate = (idx: number, rate: number) => {
    setCart(prev => prev.map((c, i) => i === idx ? { ...c, rate } : c))
  }

  const clearCart = () => { setCart([]); setSavedBill(null); setError(''); setCashGiven('') }

  const change = cashGiven ? Math.max(0, Number(cashGiven) - t.grand) : 0

  const handleCheckout = async () => {
    if (cart.length === 0) return
    setSaving(true); setError('')
    try {
      const payload = {
        voucherType: 'SALE',
        date: new Date().toISOString().split('T')[0],
        saleType: 'REGULAR',
        placeOfSupply: '08',
        paymentMode: payMode,
        narration: `POS Sale — ${payMode}`,
        items: cart.map(c => ({
          itemId: c.itemId, unit: c.unit, qty: c.qty,
          freeQty: 0, rate: c.rate, discountPct: 0,
          discount2Pct: 0, discount3Pct: 0,
          gstRate: c.gstRate, taxType: c.taxType,
        })),
        ledgerEntries: [],
      }
      const { data: res } = await api.post('/billing/vouchers', payload)
      const voucherId = res.data.id
      await api.post(`/billing/vouchers/${voucherId}/post`)
      setSavedBill({ ...res.data, items: cart, totals: t, payMode, cashGiven: Number(cashGiven), change })
    } catch (e) { setError(extractError(e)) }
    finally { setSaving(false) }
  }

  // Quick amounts for cash
  const quickAmounts = [50, 100, 200, 500, 1000, 2000].filter(a => a >= t.grand - 200)

  if (savedBill) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center z-50">
        <div className="bg-card border border-border rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center">
          <div className="w-16 h-16 bg-success/15 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check size={32} className="text-success" />
          </div>
          <h2 className="text-xl font-bold mb-1">Payment Received!</h2>
          <p className="text-muted-foreground text-sm mb-4">{savedBill.voucherNumber}</p>
          <div className="bg-muted/30 rounded-xl p-4 mb-4 text-sm space-y-1">
            <div className="flex justify-between"><span>Total</span><span className="font-bold">{formatINR(t.grand)}</span></div>
            <div className="flex justify-between"><span>{savedBill.payMode}</span><span>{formatINR(Number(savedBill.cashGiven) || t.grand)}</span></div>
            {savedBill.change > 0 && <div className="flex justify-between text-success font-semibold"><span>Return Change</span><span>{formatINR(savedBill.change)}</span></div>}
          </div>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm hover:bg-muted transition-colors">
              <Printer size={15} /> Print
            </button>
            <button onClick={clearCart} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-white text-sm hover:bg-primary/90 transition-colors">
              <RotateCcw size={15} /> New Bill
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex overflow-hidden bg-background">

      {/* LEFT: Item search + grid */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-border">
        {/* Search bar */}
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
              className="h-10 w-full rounded-xl border border-input bg-background pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Search item by name or code..." />
          </div>
        </div>

        {/* Item grid */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {items.map((item: any) => {
              const inCart = cart.find(c => c.itemId === item.id)
              return (
                <button key={item.id} onClick={() => addToCart(item)}
                  className={cn(
                    'relative p-3 rounded-xl border text-left transition-all hover:border-primary/50 hover:bg-primary/5',
                    inCart ? 'border-primary bg-primary/5' : 'border-border bg-card'
                  )}>
                  {inCart && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center text-[10px] text-white font-bold">
                      {inCart.qty}
                    </div>
                  )}
                  <div className="text-sm font-medium leading-snug mb-1 pr-4">{item.name}</div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{item.unit}</span>
                    <span className="text-sm font-bold text-primary">{formatINR(Number(item.saleRate))}</span>
                  </div>
                  {Number(item.gstRate) > 0 && (
                    <Badge variant="secondary" className="text-[9px] mt-1">GST {item.gstRate}%</Badge>
                  )}
                </button>
              )
            })}
            {search && items.length === 0 && (
              <div className="col-span-full text-center py-12 text-muted-foreground text-sm">No items found for "{search}"</div>
            )}
            {!search && items.length === 0 && (
              <div className="col-span-full text-center py-12 text-muted-foreground text-sm">Start typing to search items</div>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT: Cart + Payment */}
      <div className="w-80 flex flex-col bg-card">

        {/* Cart header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <ShoppingCart size={16} className="text-primary" />
            <span className="font-semibold text-sm">Cart ({cart.length})</span>
          </div>
          {cart.length > 0 && (
            <button onClick={clearCart} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1">
              <X size={12} /> Clear
            </button>
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <ShoppingCart size={40} className="mb-2 opacity-30" />
              <p className="text-sm">Cart is empty</p>
              <p className="text-xs mt-1">Search and add items</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {cart.map((item, idx) => {
                const lineTotal = item.qty * item.rate
                return (
                  <div key={idx} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-sm font-medium leading-snug">{item.name}</span>
                      <button onClick={() => updateQty(idx, -999)} className="text-muted-foreground hover:text-destructive shrink-0 mt-0.5">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateQty(idx, -1)}
                          className="w-6 h-6 rounded-md border border-border flex items-center justify-center hover:bg-muted">
                          <Minus size={11} />
                        </button>
                        <span className="w-8 text-center text-sm font-medium">{item.qty}</span>
                        <button onClick={() => updateQty(idx, 1)}
                          className="w-6 h-6 rounded-md border border-border flex items-center justify-center hover:bg-muted">
                          <Plus size={11} />
                        </button>
                        <span className="text-xs text-muted-foreground ml-1">{item.unit}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold">{formatINR(lineTotal)}</div>
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
          <div className="border-t border-border px-4 py-3 space-y-1 text-sm">
            {t.subtotal !== t.taxable && (
              <div className="flex justify-between text-muted-foreground text-xs">
                <span>Subtotal</span><span>{formatINR(t.subtotal)}</span>
              </div>
            )}
            {t.cgst > 0 && <div className="flex justify-between text-muted-foreground text-xs"><span>CGST</span><span>{formatINR(t.cgst)}</span></div>}
            {t.sgst > 0 && <div className="flex justify-between text-muted-foreground text-xs"><span>SGST</span><span>{formatINR(t.sgst)}</span></div>}
            {t.igst > 0 && <div className="flex justify-between text-muted-foreground text-xs"><span>IGST</span><span>{formatINR(t.igst)}</span></div>}
            {Math.abs(t.roundOff) > 0 && <div className="flex justify-between text-muted-foreground text-xs"><span>Round Off</span><span>{t.roundOff > 0 ? '+' : ''}{formatINR(t.roundOff)}</span></div>}
            <div className="flex justify-between font-bold text-lg pt-1 border-t border-border">
              <span>Total</span><span className="text-primary">{formatINR(t.grand)}</span>
            </div>
          </div>
        )}

        {/* Payment */}
        {cart.length > 0 && (
          <div className="border-t border-border px-4 py-3 space-y-3">
            {/* Payment mode */}
            <div className="grid grid-cols-3 gap-1.5">
              {PAYMENT_MODES.map(pm => {
                const Icon = pm.icon
                return (
                  <button key={pm.value} onClick={() => setPayMode(pm.value)}
                    className={cn('flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-all',
                      payMode === pm.value ? 'border-primary bg-primary text-white' : 'border-border hover:border-primary/50')}>
                    <Icon size={16} className={payMode === pm.value ? 'text-white' : pm.color} />
                    {pm.label}
                  </button>
                )
              })}
            </div>

            {/* Cash given */}
            {payMode === 'CASH' && (
              <div>
                <div className="relative mb-2">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">₹</span>
                  <input type="number" value={cashGiven}
                    onChange={e => setCashGiven(e.target.value)}
                    placeholder={String(t.grand)}
                    className="h-9 w-full rounded-lg border border-input bg-background pl-7 pr-3 text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                {/* Quick amounts */}
                <div className="flex flex-wrap gap-1 mb-2">
                  {quickAmounts.slice(0, 4).map(a => (
                    <button key={a} onClick={() => setCashGiven(String(a))}
                      className="px-2 py-1 text-xs rounded border border-border hover:border-primary hover:text-primary transition-colors">
                      ₹{a}
                    </button>
                  ))}
                  <button onClick={() => setCashGiven(String(t.grand))}
                    className="px-2 py-1 text-xs rounded border border-primary text-primary">
                    Exact
                  </button>
                </div>
                {cashGiven && Number(cashGiven) >= t.grand && (
                  <div className="flex justify-between text-sm font-semibold text-success bg-success/10 rounded-lg px-3 py-2">
                    <span>Return Change</span><span>{formatINR(change)}</span>
                  </div>
                )}
              </div>
            )}

            {error && <div className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</div>}

            <button onClick={handleCheckout} disabled={saving || cart.length === 0}
              className={cn('w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2',
                saving ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-white hover:bg-primary/90 active:scale-95')}>
              {saving ? <Spinner className="h-4 w-4" /> : <Check size={18} />}
              {saving ? 'Processing...' : `Charge ${formatINR(t.grand)}`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
