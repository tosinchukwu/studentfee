import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { GraduationCap, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import { Link } from '../lib/router'
import { STATUS_STYLES } from '../lib/format'
import type { DisplayStatus } from '../lib/types'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 disabled:bg-slate-300',
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
        'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed',
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
  return <section className={clsx('rounded-2xl bg-white p-5 shadow-card sm:p-6', className)}>{children}</section>
}

export function StatusBadge({ status }: { status: DisplayStatus }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
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
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
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
    <div role={tone === 'error' ? 'alert' : 'status'} className={clsx('rounded-lg px-4 py-3 text-sm ring-1 ring-inset', styles[tone])}>
      {children}
    </div>
  )
}

export function PageShell({ schoolName, right, children }: { schoolName: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="no-print border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-white">
              <GraduationCap className="h-5 w-5" aria-hidden />
            </span>
            <span className="truncate font-display text-lg font-semibold text-ink">{schoolName}</span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">{right}</div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  )
}
