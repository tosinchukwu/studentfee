import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { GraduationCap, Home, Loader2, LogOut, ShieldCheck, Wallet } from 'lucide-react'
import { useNear } from '../lib/near'
import { clsx } from 'clsx'
import { Link } from '../lib/router'
import { STATUS_STYLES } from '../lib/format'
import type { DisplayStatus } from '../lib/types'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white shadow-sm hover:bg-brand-800 disabled:bg-slate-300',
  secondary: 'bg-white text-ink ring-1 ring-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  ghost: 'text-brand-700 hover:bg-brand-50 disabled:text-slate-400',
  danger: 'bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:text-slate-400',
}

export function Button({
  variant = 'primary',
  busy,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      className={clsx(
        'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={clsx('rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6', className)}>{children}</section>
}

export function StatusBadge({ status }: { status: DisplayStatus }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        STATUS_STYLES[status],
      )}
    >
      {status}
    </span>
  )
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-slate-600" role="status">
      <Loader2 className="h-5 w-5 animate-spin text-brand-600" aria-hidden />
      <span>{label}</span>
    </div>
  )
}

export function Notice({ tone, children }: { tone: 'error' | 'info' | 'warn'; children: ReactNode }) {
  const styles = {
    error: 'bg-red-50 text-red-800 ring-red-200',
    info: 'bg-sky-50 text-sky-900 ring-sky-200',
    warn: 'bg-amber-50 text-amber-900 ring-amber-200',
  }
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={clsx('rounded-xl px-4 py-3 text-sm ring-1 ring-inset', styles[tone])}>
      {children}
    </div>
  )
}

export function PageShell({ schoolName, right, children, showDisconnect = true }: { schoolName: string; right?: ReactNode; children: ReactNode; showDisconnect?: boolean }) {
  const near = useNear()
  const disconnectWallet = async () => {
    await near.disconnect()
  }
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="no-print sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#101D35] text-white shadow-sm">
              <GraduationCap className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-display text-base font-bold tracking-tight text-ink sm:text-lg">{schoolName}</span>
              <span className="hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 sm:block">School fee payment portal</span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-ink shadow-sm transition hover:border-teal-300 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><Home className="h-4 w-4" aria-hidden /> Home</Link>
            <span className="hidden items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1.5 text-xs font-semibold text-brand-800 sm:inline-flex"><ShieldCheck className="h-3.5 w-3.5" /> NEAR Testnet</span>
            {showDisconnect && near.accountId && <div className="flex items-center gap-2">
              <span className="hidden max-w-[150px] truncate text-xs text-slate-500 md:inline" title={near.accountId}><Wallet className="mr-1 inline h-3.5 w-3.5" />{near.accountId}</span>
              <button type="button" onClick={() => void disconnectWallet()} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-ink shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label="Disconnect wallet"><LogOut className="h-4 w-4" /> Disconnect</button>
            </div>}
            {right}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</main>
      <footer className="no-print mx-auto flex max-w-7xl flex-col gap-2 px-4 pb-8 pt-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <span>Transparent school fee payments, powered by NEAR.</span>
        <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Payment status is verified on-chain</span>
      </footer>
    </div>
  )
}
