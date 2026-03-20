import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { User, Lock, Check, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { useAuthStore } from '../../stores/auth.store'
import { useChangePassword } from '../../hooks/api.hooks'
import { Button, Input, PageHeader, Badge } from '../../components/ui'
import { extractError } from '../../lib/api'

const pwSchema = z.object({
  currentPassword: z.string().min(1, 'Current password required'),
  newPassword: z.string().min(8, 'Minimum 8 characters'),
  confirmPassword: z.string(),
}).refine(d => d.newPassword === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

type PwForm = z.infer<typeof pwSchema>

export default function UserProfilePage() {
  const { user, activeCompany, companies } = useAuthStore()
  const changePw = useChangePassword()
  const [showPw, setShowPw] = useState({ current: false, new: false, confirm: false })
  const [pwMsg, setPwMsg] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)

  const form = useForm<PwForm>({
    resolver: zodResolver(pwSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })

  const onChangePw = async (data: PwForm) => {
    setPwMsg('')
    setPwSuccess(false)
    try {
      await changePw.mutateAsync({ currentPassword: data.currentPassword, newPassword: data.newPassword })
      setPwSuccess(true)
      setPwMsg('Password changed successfully. Please login again on other devices.')
      form.reset()
    } catch (e) {
      setPwMsg(extractError(e))
    }
  }

  const ROLE_LABEL: Record<string, string> = {
    COMPANY_ADMIN: 'Company Admin', MANAGER: 'Manager',
    ACCOUNTANT: 'Accountant', BILLING_OPERATOR: 'Billing Operator',
    VIEWER: 'Viewer', SUPER_ADMIN: 'Super Admin',
  }

  return (
    <div>
      <PageHeader title="My Profile"
        breadcrumbs={[{ label: 'Profile' }]}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
        {/* Profile info */}
        <div className="form-section">
          <h3 className="form-section-title flex items-center gap-2">
            <User size={14} /> Account Information
          </h3>
          <div className="space-y-3">
            {[
              { label: 'Full Name', value: user?.name },
              { label: 'Email', value: user?.email },
            ].map(f => (
              <div key={f.label}>
                <p className="text-xs text-muted-foreground">{f.label}</p>
                <p className="text-sm font-medium mt-0.5">{f.value}</p>
              </div>
            ))}
            {user?.isSuperAdmin && (
              <div>
                <p className="text-xs text-muted-foreground">Role</p>
                <Badge variant="destructive" className="text-xs mt-0.5">Super Admin</Badge>
              </div>
            )}
          </div>

          {/* Companies */}
          {companies.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground mb-2">Company Access</p>
              <div className="space-y-2">
                {companies.map(co => (
                  <div key={co.companyId} className={`flex items-center justify-between py-1.5 px-2 rounded-md text-sm ${activeCompany?.companyId === co.companyId ? 'bg-primary/5 border border-primary/20' : ''}`}>
                    <span className={activeCompany?.companyId === co.companyId ? 'font-medium text-primary' : ''}>{co.companyName}</span>
                    <Badge variant="secondary" className="text-[10px]">{ROLE_LABEL[co.role] || co.role}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Change password */}
        <div className="form-section">
          <h3 className="form-section-title flex items-center gap-2">
            <Lock size={14} /> Change Password
          </h3>

          <form onSubmit={form.handleSubmit(onChangePw)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Current Password</label>
              <div className="relative">
                <input type={showPw.current ? 'text' : 'password'}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  {...form.register('currentPassword')} />
                <button type="button" onClick={() => setShowPw(s => ({ ...s, current: !s.current }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showPw.current ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {form.formState.errors.currentPassword && (
                <p className="text-xs text-destructive">{form.formState.errors.currentPassword.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">New Password</label>
              <div className="relative">
                <input type={showPw.new ? 'text' : 'password'}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  {...form.register('newPassword')} />
                <button type="button" onClick={() => setShowPw(s => ({ ...s, new: !s.new }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showPw.new ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {form.formState.errors.newPassword && (
                <p className="text-xs text-destructive">{form.formState.errors.newPassword.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Confirm New Password</label>
              <div className="relative">
                <input type={showPw.confirm ? 'text' : 'password'}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  {...form.register('confirmPassword')} />
                <button type="button" onClick={() => setShowPw(s => ({ ...s, confirm: !s.confirm }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showPw.confirm ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {form.formState.errors.confirmPassword && (
                <p className="text-xs text-destructive">{form.formState.errors.confirmPassword.message}</p>
              )}
            </div>

            {pwMsg && (
              <div className={`flex items-center gap-2 rounded-md px-3 py-2.5 text-sm border ${pwSuccess ? 'bg-success-muted border-success/20 text-success' : 'bg-destructive/10 border-destructive/20 text-destructive'}`}>
                {pwSuccess ? <Check size={14} /> : <AlertCircle size={14} />} {pwMsg}
              </div>
            )}

            <Button type="submit" loading={changePw.isPending} className="w-full">
              <Lock size={14} /> Update Password
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
