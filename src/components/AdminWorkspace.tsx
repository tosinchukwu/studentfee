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
    <div className="min-h-dvh w-full min-w-0 bg-[#FFF8F0] text-[#17243B]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-orange-100 bg-[#FFFDF9] text-[#17243B] lg:flex">
        <a href="/" className="flex h-20 items-center gap-3 border-b border-orange-100 px-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF7900] text-white shadow-md shadow-orange-200"><GraduationCap className="h-6 w-6" /></span>
          <span><strong className="block font-display text-lg tracking-tight">StudentFee</strong><small className="text-[10px] uppercase tracking-[.2em] text-slate-500">Finance workspace</small></span>
        </a>
        <div className="px-4 pt-7">
          <p className="px-3 pb-3 text-[10px] font-bold uppercase tracking-[.2em] text-slate-400">Workspace</p>
          <nav className="space-y-1">
            {items.map(({ label, href, icon: Icon }, index) => (
              <a key={label} href={href} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${index === 0 ? 'bg-[#FFF0DF] text-[#B94F00] ring-1 ring-inset ring-orange-200' : 'text-slate-600 hover:bg-blue-50 hover:text-[#145FC2]'}`}>
                <Icon className="h-4 w-4" /> {label}
                {label === 'Overview' && <span className="ml-auto h-2 w-2 rounded-full bg-[#FF7900]" />}
              </a>
            ))}
          </nav>
        </div>
        <div className="mt-auto p-4">
          <div className="rounded-2xl border border-blue-100 bg-blue-50/80 p-4">
            <div className="flex items-center gap-2 text-xs font-bold text-[#145FC2]"><ShieldCheck className="h-4 w-4" /> Network protected</div>
            <p className="mt-2 text-xs leading-5 text-slate-600">Payment records are verified against the NEAR Testnet contract.</p>
          </div>
          <button type="button" onClick={onSignOut} className="mt-3 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-600 hover:bg-orange-50 hover:text-[#B94F00]"><LogOut className="h-4 w-4" /> Sign out</button>
          <button type="button" onClick={onDisconnectWallet} className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-700"><Unplug className="h-4 w-4" /> Disconnect wallet</button>
        </div>
      </aside>
      <div className="w-full min-w-0 lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-orange-100 bg-[#FFFDF9]/95 shadow-sm shadow-orange-950/[.03] backdrop-blur-xl">
          <div className="mx-auto flex min-h-[76px] max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-7">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[.16em] text-[#D96800]">School finance workspace</p>
              <p className="truncate font-display text-lg font-bold text-[#172B4D]">{schoolName}</p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <a href="/" className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-orange-100 bg-white px-3 text-sm font-semibold text-[#172B4D] transition hover:border-blue-200 hover:bg-blue-50 hover:text-[#145FC2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7900]"><Home className="h-4 w-4" /> Home</a>
              <span className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 sm:inline-flex"><Activity className="h-3.5 w-3.5" /> Live sync</span>
              <span className="hidden max-w-[180px] truncate rounded-full border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-medium text-[#145FC2] md:inline-flex"><CreditCard className="mr-2 h-3.5 w-3.5" /> {accountId}</span>
              <button type="button" onClick={onDisconnectWallet} className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700 lg:hidden" aria-label="Disconnect wallet"><Unplug className="h-5 w-5" /></button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t border-orange-100 px-3 py-2 lg:hidden">
            {items.map(({ label, href }, index) => <a key={label} href={href} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold ${index === 0 ? 'bg-[#FFF0DF] text-[#B94F00]' : 'text-slate-600 hover:bg-blue-50 hover:text-[#145FC2]'}`}>{label}</a>)}
          </nav>
        </header>
        <main className="mx-auto w-full min-w-0 max-w-[1600px] px-4 py-6 sm:px-7 sm:py-8">{children}</main>
        <footer className="px-4 pb-7 text-center text-xs text-slate-500 sm:px-7">StudentFee · Transparent school fee payments on NEAR</footer>
      </div>
    </div>
  )
}
