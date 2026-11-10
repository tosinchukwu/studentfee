import type { ReactNode } from 'react'
import { Activity, ArrowLeftRight, BarChart3, CreditCard, GraduationCap, Home, LayoutDashboard, LogOut, ReceiptText, ShieldCheck, Users } from 'lucide-react'

const items = [
  { label: 'Overview', href: '/admin', icon: LayoutDashboard },
  { label: 'Fee invoices', href: '/admin#invoices', icon: ReceiptText },
  { label: 'Payments', href: '/admin#payments', icon: ArrowLeftRight },
  { label: 'Analytics', href: '/admin#analytics', icon: BarChart3 },
  { label: 'Parents', href: '/parent', icon: Users },
]

export default function AdminWorkspace({ schoolName, accountId, onSignOut, children }: {
  schoolName: string
  accountId: string
  onSignOut: () => void
  children: ReactNode
}) {
  return (
    <div className="min-h-dvh bg-[#0b1426] text-slate-100">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/[.07] bg-[#0d192e] text-white lg:flex">
        <a href="/" className="flex h-20 items-center gap-3 border-b border-white/[.08] px-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-400 text-[#10213b]"><GraduationCap className="h-6 w-6" /></span>
          <span><strong className="block font-display text-lg tracking-tight">StudentFee</strong><small className="text-[10px] uppercase tracking-[.2em] text-slate-400">Finance workspace</small></span>
        </a>
        <div className="px-4 pt-7">
          <p className="px-3 pb-3 text-[10px] font-bold uppercase tracking-[.2em] text-slate-500">Workspace</p>
          <nav className="space-y-1">
            {items.map(({ label, href, icon: Icon }, index) => (
              <a key={label} href={href} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition ${index === 0 ? 'bg-teal-300/10 text-teal-200 ring-1 ring-inset ring-teal-300/20' : 'text-slate-400 hover:bg-white/[.06] hover:text-white'}`}>
                <Icon className="h-4 w-4" /> {label}
                {label === 'Overview' && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-teal-300" />}
              </a>
            ))}
          </nav>
        </div>
        <div className="mt-auto p-4">
          <div className="rounded-2xl border border-teal-300/15 bg-teal-300/[.06] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-teal-200"><ShieldCheck className="h-4 w-4" /> Network protected</div>
            <p className="mt-2 text-xs leading-5 text-slate-400">Payment records are verified against the NEAR Testnet contract.</p>
          </div>
          <button type="button" onClick={onSignOut} className="mt-3 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-slate-400 hover:bg-white/[.06] hover:text-white"><LogOut className="h-4 w-4" /> Sign out</button>
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-white/[.08] bg-[#0d192e]/95 backdrop-blur-xl">
          <div className="mx-auto flex min-h-[76px] max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-7">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[.16em] text-teal-300">School finance command centre</p>
              <p className="truncate font-display text-lg font-semibold text-white">{schoolName}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/[.08] px-3 py-2 text-xs font-semibold text-emerald-200 sm:inline-flex"><Activity className="h-3.5 w-3.5" /> Live sync</span>
              <span className="hidden max-w-[180px] truncate rounded-full border border-white/10 bg-white/[.04] px-3 py-2 text-xs text-slate-300 md:inline-flex"><CreditCard className="mr-2 h-3.5 w-3.5" /> {accountId}</span>
              <button type="button" onClick={onSignOut} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 lg:hidden" aria-label="Sign out"><LogOut className="h-5 w-5" /></button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t border-white/[.06] px-3 py-2 lg:hidden">
            {items.map(({ label, href }, index) => <a key={label} href={href} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${index === 0 ? 'bg-teal-300/10 text-teal-200' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>{label}</a>)}
          </nav>
        </header>
        <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-7 sm:py-8">{children}</main>
        <footer className="px-4 pb-7 text-center text-xs text-slate-500 sm:px-7">StudentFee · Transparent school fee payments on NEAR</footer>
      </div>
    </div>
  )
}
