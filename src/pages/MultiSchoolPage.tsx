import { ArrowLeft, ArrowRight, Building2, CheckCircle2, CircleDashed, LockKeyhole, Network, ShieldCheck, WalletCards } from 'lucide-react'
import { Card, Notice, PageShell } from '../components/ui'
import { Link } from '../lib/router'

const stages = [
  { title: 'Separate v3 contract', detail: 'Build and deploy the school registry to a new NEAR Testnet account.', icon: Network, state: 'Next' },
  { title: 'Platform treasury setup', detail: 'Verify the platform owner, dedicated fee treasury and USDC storage registration.', icon: WalletCards, state: 'Required' },
  { title: 'School onboarding', detail: 'Register each school with its own administrator, treasury and school identifier.', icon: Building2, state: 'Planned' },
  { title: 'Tenant isolation tests', detail: 'Prove that one school cannot view, change or settle another school’s invoices.', icon: ShieldCheck, state: 'Required' },
]

export default function MultiSchoolPage() {
  return (
    <PageShell schoolName="Multi-school platform">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="relative overflow-hidden rounded-[1.75rem] bg-[#101D35] px-6 py-9 text-white shadow-card sm:px-9 sm:py-11">
          <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-indigo-400/20 blur-3xl" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200/20 bg-indigo-300/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-indigo-100"><CircleDashed className="h-4 w-4" /> Version 3 · Multi-school</div>
            <h1 className="mt-5 max-w-3xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">One platform. Every school with its own space.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">The multi-school edition is being prepared as a separate version. Each approved school will have its own administrator, treasury and isolated fee records.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-slate-200">Separate v3 contract</span>
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-slate-200">School-level access</span>
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-slate-200">Version-aware invoices</span>
            </div>
          </div>
        </section>

        <Notice tone="info"><strong>Setup preview only — not accepting schools or payments yet.</strong> The v3 contract has not been deployed. This screen does not connect to or change the existing v2 contract, wallet, invoices, treasury or payment flow.</Notice>

        <section className="grid gap-4 sm:grid-cols-2" aria-label="Multi-school platform capabilities">
          <Card><div className="flex items-center gap-3"><span className="rounded-xl bg-indigo-50 p-3 text-indigo-700"><Building2 className="h-5 w-5" /></span><div><h2 className="font-display text-lg font-semibold text-ink">Independent school workspaces</h2><p className="mt-1 text-sm text-slate-600">Each school gets its own approved admin and treasury.</p></div></div></Card>
          <Card><div className="flex items-center gap-3"><span className="rounded-xl bg-teal-50 p-3 text-teal-700"><LockKeyhole className="h-5 w-5" /></span><div><h2 className="font-display text-lg font-semibold text-ink">Private school records</h2><p className="mt-1 text-sm text-slate-600">School scope is enforced by verified identity, not a browser selector.</p></div></div></Card>
        </section>

        <Card className="space-y-5">
          <div><p className="text-xs font-bold uppercase tracking-wider text-indigo-700">Implementation roadmap</p><h2 className="mt-1 font-display text-2xl font-semibold text-ink">What must be completed before launch</h2></div>
          <div className="space-y-4">
            {stages.map(({ title, detail, icon: Icon, state }, index) => (
              <div key={title} className="flex gap-4">
                <div className="flex flex-col items-center"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><Icon className="h-5 w-5" /></span>{index < stages.length - 1 && <span className="mt-2 h-7 w-px bg-slate-200" />}</div>
                <div className="min-w-0 flex-1 pb-3"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-ink">{title}</h3><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{state}</span></div><p className="mt-1 text-sm leading-6 text-slate-600">{detail}</p></div>
              </div>
            ))}
          </div>
          <div className="rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-900"><div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" /> Standard v2 remains available</div><p className="mt-1">Existing v2 invoices and payment links stay on v2. New v3 invoices will use v3 only after the contract, adapter and security tests are verified.</p></div>
        </Card>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Back to workspace choices</Link>
          <Link href="/admin" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#101D35] px-5 text-sm font-semibold text-white hover:bg-[#1A2D4D]">Continue with Standard v2 <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </div>
    </PageShell>
  )
}
