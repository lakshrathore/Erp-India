import { useState } from 'react'
import { Trash2, AlertTriangle, Check, X, Loader2 } from 'lucide-react'
import { api, extractError } from '../../lib/api'
import { Button } from './index'
import { cn } from './utils'

// ─── Two modes:
// 1. Simple: caller handles delete logic (onDelete callback)
//    Used for: Units, TaxMasters, SalaryStructures — simple, no usage check needed
// 2. Entity: component fetches usage data, then calls backend DELETE
//    Used for: Items, Parties, Ledgers — need usage check before delete

interface SimpleProps {
  // Simple mode
  onDelete: () => void | Promise<void>
  itemName: string
  disabled?: boolean
  disabledReason?: string
  size?: 'sm' | 'icon-sm'
  variant?: 'icon' | 'text'
  // Entity mode props NOT present
  entityType?: never
  entityId?: never
  onDeleted?: never
}

interface EntityProps {
  // Entity mode
  entityType: 'item-category' | 'item' | 'party' | 'ledger' | 'godown' | 'tax-master' | 'employee'
  entityId: string
  entityName?: string
  onDeleted: () => void
  size?: 'sm' | 'icon-sm'
  variant?: 'icon' | 'text'
  // Simple mode props NOT present
  onDelete?: never
  itemName?: string
  disabled?: never
  disabledReason?: never
}

type SafeDeleteButtonProps = SimpleProps | EntityProps

const ENTITY_CONFIG: Record<string, {
  deleteUrl: (id: string) => string
  usageUrl: ((id: string) => string) | null
  warnings: string[]
  label: string
}> = {
  'item-category': {
    deleteUrl: (id) => `/masters/item-categories/${id}`,
    usageUrl: null,
    warnings: ['Items using this category will lose their category assignment'],
    label: 'Delete Category',
  },
  'item': {
    deleteUrl: (id) => `/masters/items/${id}`,
    usageUrl: (id) => `/masters/items/${id}/usage`,
    warnings: [],
    label: 'Deactivate Item',
  },
  'party': {
    deleteUrl: (id) => `/masters/parties/${id}`,
    usageUrl: (id) => `/masters/parties/${id}/usage`,
    warnings: ['Party ledger will also be deactivated'],
    label: 'Deactivate Party',
  },
  'ledger': {
    deleteUrl: (id) => `/masters/ledgers/${id}`,
    usageUrl: (id) => `/masters/ledgers/${id}/usage`,
    warnings: [],
    label: 'Deactivate Ledger',
  },
  'godown': {
    deleteUrl: (id) => `/masters/godowns/${id}`,
    usageUrl: null,
    warnings: [],
    label: 'Deactivate Godown',
  },
  'tax-master': {
    deleteUrl: (id) => `/masters/tax-masters/${id}`,
    usageUrl: null,
    warnings: [],
    label: 'Delete Tax Rate',
  },
  'employee': {
    deleteUrl: (id) => `/payroll/employees/${id}`,
    usageUrl: null,
    warnings: ['Payroll records will be retained'],
    label: 'Deactivate Employee',
  },
}

export function SafeDeleteButton(props: SafeDeleteButtonProps) {
  const [state, setState] = useState<'idle' | 'checking' | 'confirm' | 'deleting' | 'error'>('idle')
  const [usage, setUsage] = useState<any>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const isSimple = 'onDelete' in props && props.onDelete !== undefined
  const name = isSimple ? (props as SimpleProps).itemName : ((props as EntityProps).entityName || 'this item')
  const size = props.size ?? 'icon-sm'
  const variant = props.variant ?? 'icon'

  // Simple mode: disabled check handled by caller
  const isDisabled = isSimple && (props as SimpleProps).disabled
  const disabledReason = isSimple ? (props as SimpleProps).disabledReason : undefined

  const handleClick = async () => {
    if (isDisabled) return

    if (isSimple) {
      // Simple mode: just show confirm dialog, no usage fetch
      setState('confirm')
      return
    }

    // Entity mode: fetch usage first
    const p = props as EntityProps
    const config = ENTITY_CONFIG[p.entityType]
    if (!config) return

    setState('checking')
    setErrorMsg('')

    if (config.usageUrl) {
      try {
        const { data } = await api.get(config.usageUrl(p.entityId))
        setUsage(data.data)
      } catch {
        setUsage(null)
      }
    } else {
      setUsage(null)
    }
    setState('confirm')
  }

  const handleConfirm = async () => {
    setState('deleting')
    try {
      if (isSimple) {
        await (props as SimpleProps).onDelete()
      } else {
        const p = props as EntityProps
        const config = ENTITY_CONFIG[p.entityType]
        await api.delete(config.deleteUrl(p.entityId))
        p.onDeleted()
      }
      setState('idle')
      setUsage(null)
    } catch (e) {
      setErrorMsg(extractError(e))
      setState('error')
    }
  }

  const handleCancel = () => {
    setState('idle')
    setErrorMsg('')
    setUsage(null)
  }

  const config = !isSimple ? ENTITY_CONFIG[(props as EntityProps).entityType] : null
  const label = config?.label || 'Delete'
  const warnings = config?.warnings || []

  // Idle — show button
  if (state === 'idle') {
    const btnClass = isDisabled
      ? 'opacity-40 cursor-not-allowed'
      : 'text-muted-foreground hover:text-destructive'

    if (variant === 'text') {
      return (
        <Button size="sm" variant="ghost"
          className={cn('text-destructive hover:text-destructive hover:bg-destructive/10', isDisabled && 'opacity-40 cursor-not-allowed')}
          onClick={handleClick}
          title={isDisabled ? disabledReason : undefined}
          disabled={!!isDisabled}>
          <Trash2 size={14} /> Delete
        </Button>
      )
    }
    return (
      <Button size={size} variant="ghost" className={btnClass}
        onClick={handleClick}
        title={isDisabled ? disabledReason : `Delete ${name}`}
        disabled={!!isDisabled}>
        <Trash2 size={13} />
      </Button>
    )
  }

  // Checking spinner
  if (state === 'checking') {
    return <Button size={size} variant="ghost" disabled><Loader2 size={13} className="animate-spin" /></Button>
  }

  // Confirm / deleting / error — modal
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={handleCancel}>
      <div className="bg-card border border-border rounded-xl shadow-2xl max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>

        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-destructive/15 flex items-center justify-center shrink-0">
            <AlertTriangle size={20} className="text-destructive" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Delete?</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="font-medium text-foreground">"{name}"</span> will be removed
            </p>
          </div>
        </div>

        {/* Usage info (entity mode) */}
        {usage && (
          <div className={cn(
            'rounded-lg p-3 mb-3 text-xs space-y-1',
            usage.canDelete ? 'bg-green-50 border border-green-200' : 'bg-destructive/10 border border-destructive/20'
          )}>
            {usage.canDelete ? (
              <div className="flex items-center gap-1.5 text-green-700 font-medium">
                <Check size={13} /> Safe to delete — no active transactions
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-destructive font-medium">
                <AlertTriangle size={13} /> Cannot permanently delete — will deactivate instead
              </div>
            )}
            {usage.voucherCount > 0 && <p className="text-muted-foreground">📄 Used in <strong>{usage.voucherCount}</strong> voucher(s)</p>}
            {usage.stockQty > 0 && <p className="text-muted-foreground">📦 Stock: <strong>{usage.stockQty}</strong> units remaining</p>}
            {usage.outstandingAmount > 0 && <p className="text-muted-foreground">💰 Outstanding: <strong>₹{usage.outstandingAmount.toLocaleString('en-IN')}</strong></p>}
          </div>
        )}

        {warnings.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-3">
            {warnings.map(w => <p key={w} className="text-xs text-amber-700">⚠️ {w}</p>)}
          </div>
        )}

        {state === 'error' && errorMsg && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-2.5 mb-3 text-xs text-destructive">
            {errorMsg}
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="destructive" size="sm" className="flex-1"
            loading={state === 'deleting'}
            onClick={handleConfirm}
            disabled={state === 'deleting'}>
            <Trash2 size={13} /> {label}
          </Button>
          <Button variant="outline" size="sm" onClick={handleCancel} disabled={state === 'deleting'}>
            <X size={13} /> Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
