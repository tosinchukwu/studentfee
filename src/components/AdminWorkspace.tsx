import type { ReactNode } from 'react'
import { Activity, ArrowLeftRight, BarChart3, CreditCard, GraduationCap, Home, LayoutDashboard, LogOut, Unplug, ReceiptText, ShieldCheck, Users, Sparkles } from 'lucide-react'

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
    <div className="min-h-dvh w-full min-w-0 bg-[#f3f2ec] text-[#17251f]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[258px] flex-col bg-[#142a24] text-white lg:flex">
        <a href="/" className="flex h-[88px] items-center gap-3 border-b border-white/[.09] px-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#d6e5b5] text-[#142a24] shadow-sm"><GraduationCap className="h-5 w-5" /></span>
          <span><strong className="block font-display text-[19px] font-semibold tracking-[-.04em]">StudentFee<span className="text-[#c6d99c]">.</span></strong><small className="mt-0.5 block text-[9px] font-bold uppercase tracking-[.22em] text-[#9fb4a8]">Institutional finance</small></span>
        </a>
        <div className="px-4 pt-8">
          <p className="px-3 pb-3 text-[9px] font-bold uppercase tracking-[.22em] text-[#81998d]">School workspace</p>
          <nav className="space-y-1">
            {items.map(({ label, href, icon: Icon }, index) => (
              <a key={label} href={href} className={`group flex min-h-12 items-center gap-3 rounded-xl px-3.5 text-[13px] font-medium transition-all duration-200 ${index === 0 ? 'bg-[#d6e5b5] text-[#142a24] shadow-[0_5px_18px_rgba(0,0,0,.12)]' : 'text-[#b4c4bb] hover:bg-white/[.07] hover:text-white'}`}>
                <Icon className="h-[17px] w-[17px]" /> {label}
                {label === 'Overview' && <span className="ml-auto rounded-full bg-[#142a24]/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">Live</span>}
              </a>
            ))}
          </nav>
        </div>
        <div className="mt-auto space-y-4 p-4">
          <div className="rounded-2xl border border-[#d6e5b5]/15 bg-[#d6e5b5]/[.07] p-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-[#d6e5b5]"><ShieldCheck className="h-4 w-4" /> On-chain assurance</div>
            <p className="mt-2 text-[11px] leading-[1.65] text-[#a9bbb0]">Payment records are checked against the deployed NEAR Testnet contract.</p>
          </div>
          <button type="button" onClick={onSignOut} className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-[12px] font-medium text-[#b4c4bb] transition hover:bg-white/[.07] hover:text-white"><LogOut className="h-4 w-4" /> Sign out</button>
          <button type="button" onClick={onDisconnectWallet} className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-[12px] font-medium text-[#b4c4bb] transition hover:bg-white/[.07] hover:text-white"><Unplug className="h-4 w-4" /> Disconnect wallet</button>
          <p className="px-3 pt-1 text-[9px] uppercase tracking-[.16em] text-[#71897d]">STUDENTFEE · TESTNET EDITION</p>
        </div>
      </aside>
      <div className="w-full min-w-0 lg:pl-[258px]">
        <header className="sticky top-0 z-30 border-b border-[#e5e4dc] bg-[#fbfaf6]/95 backdrop-blur-xl">
          <div className="mx-auto flex min-h-[78px] max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-7">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[.2em] text-[#71877b]"><Sparkles className="h-3 w-3 text-[#8ba36d]" /> School finance office <span className="text-[#c0c6bc]">/</span> Overview</div>
              <p className="mt-1 truncate font-display text-[19px] font-semibold tracking-[-.035em] text-[#17251f]">{schoolName}</p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <a href="/" className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-[#e3e4dc] bg-white px-3 text-[12px] font-semibold text-[#33483d] transition hover:border-[#a9bd8c] hover:bg-[#f5f7ef]"><Home className="h-4 w-4" /> Home</a>
              <span className="hidden items-center gap-2 rounded-full border border-[#dce8d6] bg-[#eff5e9] px-3 py-2 text-[10px] font-bold text-[#496b43] sm:inline-flex"><Activity className="h-3.5 w-3.5" /> Live sync</span>
              <span className="hidden max-w-[180px] truncate rounded-full border border-[#e5e4dc] bg-white px-3 py-2 text-[10px] text-[#607168] md:inline-flex"><CreditCard className="mr-2 h-3.5 w-3.5" /> {accountId}</span>
              <button type="button" onClick={onDisconnectWallet} className="rounded-lg p-2 text-[#607168] hover:bg-[#eeeee7] lg:hidden" aria-label="Disconnect wallet"><Unplug className="h-5 w-5" /></button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t border-[#ecebe5] px-3 py-2 lg:hidden">
            {items.map(({ label, href }, index) => <a key={label} href={href} className={`shrink-0 rounded-lg px-3 py-2 text-[11px] font-semibold ${index === 0 ? 'bg-[#e8eedc] text-[#294c35]' : 'text-[#718078] hover:bg-[#eeeee7]'}`}>{label}</a>)}
          </nav>
        </header>
        <main className="mx-auto w-full min-w-0 max-w-[1600px] px-4 py-6 sm:px-7 sm:py-8">{children}</main>
        <footer className="px-4 pb-7 text-center text-[10px] tracking-wide text-[#849188] sm:px-7">STUDENTFEE <span className="mx-1 text-[#c0c8bc]">/</span> Transparent school-fee payments on NEAR</footer>
      </div>
    </div>
  )
}
