import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Building2, Mail, Lock, ArrowRight, Eye, EyeOff } from 'lucide-react'
import { useAuthStore } from '../../stores/auth.store'
import { useLogin } from '../../hooks/api.hooks'
import { Button, Input } from '../../components/ui'
import { extractError } from '../../lib/api'
import { cn } from '../../components/ui/utils'

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const login = useLogin()
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  if (user) return <Navigate to="/select-company" replace />

  const onSubmit = async (data: LoginForm) => {
    setError('')
    try {
      await login.mutateAsync(data)
      navigate('/select-company')
    } catch (e) {
      setError(extractError(e))
    }
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-[420px] bg-sidebar flex-col p-10 relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-5">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="absolute border border-white/20 rounded-full"
              style={{
                width: `${(i + 1) * 80}px`,
                height: `${(i + 1) * 80}px`,
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
              }}
            />
          ))}
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-2.5 mb-12">
            <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center">
              <span className="text-white font-display font-bold">E</span>
            </div>
            <span className="text-white font-display font-semibold text-lg">ERP India</span>
          </div>

          <div className="space-y-6 mt-auto">
            <h1 className="text-3xl font-display font-bold text-white leading-tight">
              Complete Business
              <br />
              Management
            </h1>
            <p className="text-sidebar-foreground/60 text-sm leading-relaxed">
              GST-compliant billing, inventory with FIFO costing, full accounting, and payroll — built for Indian businesses.
            </p>

            <div className="space-y-3 pt-4">
              {[
                'GST — GSTR-1, 3B, 2B Reconciliation',
                'FIFO Inventory with profit tracking',
                'Complete payroll with PF / ESI / Form 16',
                'Multi-company, multi-branch support',
              ].map((f) => (
                <div key={f} className="flex items-center gap-2.5 text-sm text-sidebar-foreground/70">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                  {f}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="mb-8">
            <h2 className="text-2xl font-display font-semibold text-foreground">Welcome back</h2>
            <p className="text-muted-foreground text-sm mt-1">Sign in to your ERP account</p>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Email address"
              type="email"
              placeholder="you@company.com"
              leftIcon={<Mail size={15} />}
              error={form.formState.errors.email?.message}
              {...form.register('email')}
            />

            <Input
              label="Password"
              type={showPass ? 'text' : 'password'}
              placeholder="••••••••"
              leftIcon={<Lock size={15} />}
              rightIcon={
                <button type="button" onClick={() => setShowPass((s) => !s)} tabIndex={-1}>
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              }
              error={form.formState.errors.password?.message}
              {...form.register('password')}
            />

            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-xs text-destructive">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full mt-2"
              loading={login.isPending}
            >
              Sign in
              <ArrowRight size={15} />
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground mt-8">
            Contact your administrator if you need access.
          </p>
        </div>
      </div>
    </div>
  )
}
