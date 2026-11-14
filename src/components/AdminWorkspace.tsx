import type { ReactNode } from 'react'
import { Activity, ArrowLeftRight, BarChart3, CreditCard, GraduationCap, Home, LayoutDashboard, LogOut, Unplug, ReceiptText, ShieldCheck, Users } from 'lucide-react'

const items = [
  { label: 'Overview', href: '/admin', icon: LayoutDashboard },
  { label: 'Fee invoices', href: '/admin#invoices', icon: ReceiptText },
  { label: 'Payments', href: '/admin#payments', icon: ArrowLeftRight },
  { label: 'Analytics', href: '/admin#analytics', icon: BarChart3 },
  { label: 'Parents', href: '/parent', icon: Users },
]

export default function AdminWorkspace({ schoolName, accountId, onSignOut, onDisconnectWallet, children }: {
  schoolName: string
  accountId: string
  onSignOut: () => void
  onDisconnectWallet: () => void
  children: ReactNode
}) {
  return (
    <div className="min-h-dvh w-full min-w-0 bg-[#05070A] text-[#edf2f7]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/[.07] bg-[#080d11] text-white lg:flex">
        <a href="/" className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#5ef2c4] text-[#05070a]"><GraduationCap className="h-6 w-6" /></span>
          <span><strong className="block font-display text-lg tracking-tight">StudentFee</strong><small className="text-[10px] uppercase tracking-[.2em] text-[#a6b3c0]">Finance workspace</small></span>
        </a>
        <div className="px-4 pt-7">
          <p className="px-3 pb-3 text-[10px] font-bold uppercase tracking-[.2em] text-[#82919d]">Workspace</p>
          <nav className="space-y-1">
            {items.map(({ label, href, icon: Icon }, index) => (
              <a key={label} href={href} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition ${index === 0 ? 'bg-[#5ef2c4]/10 text-[#5ef2c4] ring-1 ring-inset ring-[#5ef2c4]/20' : 'text-[#a6b3c0] hover:bg-white/[.06] hover:text-white'}`}>
                <Icon className="h-4 w-4" /> {label}
                {label === 'Overview' && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-teal-300" />}
              </a>
            ))}
          </nav>
        </div>
        <div className="mt-auto p-4">
          <div className="rounded-2xl border border-[#5ef2c4]/15 bg-[#5ef2c4]/[.06] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#5ef2c4]"><ShieldCheck className="h-4 w-4" /> Network protected</div>
            <p className="mt-2 text-xs leading-5 text-[#a6b3c0]">Payment records are verified against the NEAR Testnet contract.</p>
          </div>
          <button type="button" onClick={onSignOut} className="mt-3 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-[#a6b3c0] hover:bg-white/[.06] hover:text-white"><LogOut className="h-4 w-4" /> Sign out</button>
          <button type="button" onClick={onDisconnectWallet} className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-[#a6b3c0] hover:bg-white/[.06] hover:text-white"><Unplug className="h-4 w-4" /> Disconnect wallet</button>
        </div>
      </aside>
      <div className="w-full min-w-0 lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#080d11]/95 backdrop-blur-xl">
          <div className="mx-auto flex min-h-[76px] max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-7">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#5ef2c4]">School finance command centre</p>
              <p className="truncate font-display text-lg font-semibold text-white">{schoolName}</p>
            </div>
            <div className="flex items-center gap-3">
              <a href="/" className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[.06] px-3 text-sm font-semibold text-[#edf2f7] transition hover:border-teal-300/40 hover:bg-[#5ef2c4]/10 hover:text-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"><Home className="h-4 w-4" /> Home</a>
              <span className="hidden items-center gap-2 rounded-full border border-[#5ef2c4]/20 bg-[#5ef2c4]/[.08] px-3 py-2 text-xs font-semibold text-[#5ef2c4] sm:inline-flex"><Activity className="h-3.5 w-3.5" /> Live sync</span>
              <span className="hidden max-w-[180px] truncate rounded-full border border-white/10 bg-white/[.04] px-3 py-2 text-xs text-slate-300 md:inline-flex"><CreditCard className="mr-2 h-3.5 w-3.5" /> {accountId}</span>
              <button type="button" onClick={onDisconnectWallet} className="rounded-lg p-2 text-[#a6b3c0] hover:bg-white/10 lg:hidden" aria-label="Disconnect wallet"><Unplug className="h-5 w-5" /></button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t border-white/[.06] px-3 py-2 lg:hidden">
            {items.map(({ label, href }, index) => <a key={label} href={href} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${index === 0 ? 'bg-[#5ef2c4]/10 text-[#5ef2c4]' : 'text-[#a6b3c0] hover:bg-white/5 hover:text-white'}`}>{label}</a>)}
          </nav>
        </header>
        <main className="mx-auto w-full min-w-0 max-w-[1600px] px-4 py-6 sm:px-7 sm:py-8">{children}</main>
        <footer className="px-4 pb-7 text-center text-xs text-[#82919d] sm:px-7">StudentFee · Transparent school fee payments on NEAR</footer>
      </div>
    </div>
  )
}
