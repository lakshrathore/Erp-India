import { useState } from 'react'
import { Trash2, AlertTriangle, Check, X, Loader2 } from 'lucide-react'
import { api, extractError } from '../../lib/api'
import { Button } from './index'
import { cn } from './utils'

interface SafeDeleteButtonProps {
  // What to delete
  entityType: 'item-category' | 'item' | 'party' | 'ledger' | 'godown' | 'tax-master' | 'employee'
  entityId: string
  entityName: string
  // After successful delete
  onDeleted: () => void
  // Optional size
  size?: 'sm' | 'icon-sm'
  // Show as text button
  variant?: 'icon' | 'text'
}

const ENTITY_CONFIG = {
  'item-category': {
    deleteUrl: (id: string) => `/masters/item-categories/${id}`,
    usageUrl: null,
    warnings: ['Items using this category will lose their category assignment'],
    deactivateLabel: 'Delete Category',
    method: 'DELETE',
  },
  'item': {
    deleteUrl: (id: string) => `/masters/items/${id}`,
    usageUrl: (id: string) => `/masters/items/${id}/usage`,
    warnings: [],
    deactivateLabel: 'Deactivate Item',
    method: 'DELETE',
  },
  'party': {
    deleteUrl: (id: string) => `/masters/parties/${id}`,
    usageUrl: (id: string) => `/masters/parties/${id}/usage`,
    warnings: ['Party ledger will also be deactivated'],
    deactivateLabel: 'Deactivate Party',
    method: 'DELETE',
  },
  'ledger': {
    deleteUrl: (id: string) => `/masters/ledgers/${id}`,
    usageUrl: (id: string) => `/masters/ledgers/${id}/usage`,
    warnings: [],
    deactivateLabel: 'Deactivate Ledger',
    method: 'DELETE',
  },
  'godown': {
    deleteUrl: (id: string) => `/masters/godowns/${id}`,
    usageUrl: null,
    warnings: [],
    deactivateLabel: 'Deactivate Godown',
    method: 'DELETE',
  },
  'tax-master': {
    deleteUrl: (id: string) => `/masters/tax-masters/${id}`,
    usageUrl: null,
    warnings: [],
    deactivateLabel: 'Delete Tax Rate',
    method: 'DELETE',
  },
  'employee': {
    deleteUrl: (id: string) => `/payroll/employees/${id}`,
    usageUrl: null,
    warnings: ['Payroll records will be retained'],
    deactivateLabel: 'Deactivate Employee',
    method: 'DELETE',
  },
}

export function SafeDeleteButton({
  entityType, entityId, entityName, onDeleted, size = 'icon-sm', variant = 'icon'
}: SafeDeleteButtonProps) {
  const [state, setState] = useState<'idle' | 'checking' | 'confirm' | 'deleting' | 'error'>('idle')
  const [usage, setUsage] = useState<any>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const config = ENTITY_CONFIG[entityType]

  const handleClick = async () => {
    setState('checking')
    setErrorMsg('')

    // Check usage if URL provided
    if (config.usageUrl) {
      try {
        const { data } = await api.get(config.usageUrl(entityId))
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
      await api.delete(config.deleteUrl(entityId))
      setState('idle')
      onDeleted()
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

  // Idle state — show delete button
  if (state === 'idle') {
    if (variant === 'text') {
      return (
        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleClick}>
          <Trash2 size={14} /> Delete
        </Button>
      )
    }
    return (
      <Button size={size} variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={handleClick} title={`Delete ${entityName}`}>
        <Trash2 size={13} />
      </Button>
    )
  }

  // Checking
  if (state === 'checking') {
    return (
      <Button size={size} variant="ghost" disabled>
        <Loader2 size={13} className="animate-spin" />
      </Button>
    )
  }

  // Confirm dialog (inline)
  if (state === 'confirm' || state === 'deleting' || state === 'error') {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={handleCancel}>
        <div className="bg-card border border-border rounded-xl shadow-2xl max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-destructive/15 flex items-center justify-center shrink-0">
              <AlertTriangle size={20} className="text-destructive" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Delete {entityType.replace('-', ' ')}?</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                <span className="font-medium text-foreground">"{entityName}"</span> will be removed
              </p>
            </div>
          </div>

          {/* Usage info */}
          {usage && (
            <div className={cn(
              'rounded-lg p-3 mb-3 text-xs space-y-1',
              usage.canDelete ? 'bg-success/10 border border-success/20' : 'bg-destructive/10 border border-destructive/20'
            )}>
              {usage.canDelete ? (
                <div className="flex items-center gap-1.5 text-success font-medium">
                  <Check size={13} /> Safe to delete — no active transactions
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-destructive font-medium">
                  <AlertTriangle size={13} /> Cannot delete — usage found
                </div>
              )}
              {usage.voucherCount > 0 && (
                <p className="text-muted-foreground">📄 Used in <strong>{usage.voucherCount}</strong> voucher(s)</p>
              )}
              {usage.stockQty > 0 && (
                <p className="text-muted-foreground">📦 Stock remaining: <strong>{usage.stockQty}</strong> units</p>
              )}
              {usage.outstandingAmount > 0 && (
                <p className="text-muted-foreground">💰 Outstanding balance: <strong>₹{usage.outstandingAmount.toLocaleString('en-IN')}</strong></p>
              )}
              {usage.partyCount > 0 && (
                <p className="text-muted-foreground">👥 Linked to <strong>{usage.partyCount}</strong> party/parties</p>
              )}
              {!usage.canDelete && (
                <p className="text-destructive font-medium mt-1">This record will be <strong>deactivated</strong> (not permanently deleted) to preserve transaction history.</p>
              )}
            </div>
          )}

          {/* Warnings */}
          {config.warnings.length > 0 && (
            <div className="bg-warning-muted border border-warning/20 rounded-lg p-2.5 mb-3">
              {config.warnings.map(w => (
                <p key={w} className="text-xs text-warning">⚠️ {w}</p>
              ))}
            </div>
          )}

          {/* Error */}
          {state === 'error' && errorMsg && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-2.5 mb-3 text-xs text-destructive">
              {errorMsg}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" className="flex-1"
              loading={state === 'deleting'}
              onClick={handleConfirm}
              disabled={state === 'deleting'}>
              <Trash2 size={13} /> {config.deactivateLabel}
            </Button>
            <Button variant="outline" size="sm" onClick={handleCancel} disabled={state === 'deleting'}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
