import { useState, type FormEvent } from 'react'
import { ArrowRight, BadgeCheck, BookOpenCheck, FlaskConical, GraduationCap, LockKeyhole, ReceiptText, ShieldCheck, WalletCards } from 'lucide-react'
import { navigate, Link } from '../lib/router'
import { Button, Card, Notice, PageShell } from '../components/ui'

function extractId(input: string): string | null {
  const match = /([0-9a-f]{32})/i.exec(input.trim())
  return match ? match[1].toLowerCase() : null
}

export default function HomePage({ schoolName }: { schoolName: string }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const open = (event: FormEvent) => {
    event.preventDefault()
    const id = extractId(value)
    if (!id) { setError('That does not look like a payment link. Paste the full link the school sent you.'); return }
    navigate(`/pay/${id}`)
  }

  return (
    <PageShell schoolName={schoolName}>
      <div className="space-y-8 pb-10 sm:space-y-10">
        <section className="sf-hero relative isolate overflow-hidden rounded-[2rem] px-6 py-10 text-white shadow-xl sm:px-10 sm:py-14 lg:px-14">
          <div className="sf-orb sf-orb-one" /><div className="sf-orb sf-orb-two" />
          <div className="relative z-10 max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold tracking-wide text-orange-100">
              <span className="h-2 w-2 rounded-full bg-[#FF7900] shadow-[0_0_12px_#FF7900]" /> SCHOOL FEES, MADE CLEAR
            </div>
            <h1 className="max-w-2xl font-display text-4xl font-bold leading-[1.06] tracking-tight sm:text-5xl lg:text-6xl">
              School payments,<br /><span className="text-[#FF9A3D]">without the confusion.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-blue-50/90 sm:text-lg">A simpler way for schools to collect fees and for parents to pay with confidence. One payment link, a clear record, and on-chain verification.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/demo" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#FF7900] px-5 text-sm font-bold text-white shadow-lg shadow-orange-950/20 transition hover:-translate-y-0.5 hover:bg-[#F06D00]">Explore live demo <ArrowRight className="h-4 w-4" /></Link>
              <a href="#pay-fee" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/15">Pay a school fee</a>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-3 text-xs font-semibold text-blue-50/90 sm:text-sm">
              <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#FF9A3D]" /> Verifiable payments</span>
              <span className="inline-flex items-center gap-2"><WalletCards className="h-4 w-4 text-[#FF9A3D]" /> USDC on NEAR</span>
              <span className="inline-flex items-center gap-2"><ReceiptText className="h-4 w-4 text-[#FF9A3D]" /> Digital receipts</span>
            </div>
          </div>
          <div className="sf-hero-art absolute right-[-2rem] top-1/2 hidden w-[43%] -translate-y-1/2 lg:block" aria-hidden="true">
            <div className="sf-school-card">
              <div className="sf-school-sun" /><div className="sf-school-roof" />
              <div className="sf-school-building"><div className="sf-school-sign">STUDENT<span>FEE</span></div><div className="sf-school-windows"><i/><i/><i/><i/><i/><i/></div><div className="sf-school-door"/></div>
              <div className="sf-school-ground"/>
            </div>
            <div className="sf-float-card sf-float-top"><span className="sf-check">✓</span><span><b>Payment confirmed</b><small>Verified on NEAR</small></span></div>
            <div className="sf-float-card sf-float-bottom"><span className="sf-mini-icon">₦</span><span><b>Every fee, in view</b><small>Clear records for everyone</small></span></div>
          </div>
          <div className="sf-hero-bottom absolute bottom-0 right-0 hidden h-2 w-1/3 rounded-tl-full bg-[#FF7900] lg:block" />
        </section>

        <section className="sf-demo-banner rounded-2xl border border-orange-200 bg-[#FFF0DF] p-5 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div><div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[#B94F00]"><FlaskConical className="h-4 w-4" /> Open public demo</div><h2 className="mt-2 font-display text-xl font-bold text-ink">See how StudentFee works before connecting a wallet.</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Explore sample fee records and learn how to try a real NEAR Testnet payment using an invoice link.</p></div>
          <Link href="/demo" className="mt-4 inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#FF7900] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#E86E00] sm:mt-0">Explore Demo <ArrowRight className="h-4 w-4" /></Link>
        </section>

        <section id="pay-fee" className="grid scroll-mt-24 gap-5 lg:grid-cols-[1.15fr,0.85fr]">
          <Card className="space-y-5">
            <div className="flex items-start justify-between gap-4"><div><div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-[#D95F00]"><ReceiptText className="h-5 w-5" /></div><h2 className="font-display text-2xl font-bold tracking-tight text-ink">Pay a school fee</h2><p className="mt-2 max-w-md text-sm leading-6 text-slate-600">Have a payment link from your school? Paste it below to review the invoice and pay securely.</p></div><span className="hidden rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-[#1877F2] sm:inline-flex">For parents</span></div>
            <form onSubmit={open} className="space-y-3"><label className="label" htmlFor="payment-link">Your invoice payment link</label><input id="payment-link" className="field !h-12 !rounded-xl" placeholder="Paste your payment link here" value={value} onChange={(e) => { setValue(e.target.value); setError(null) }} autoComplete="url" />{error && <Notice tone="error">{error}</Notice>}<Button type="submit" className="w-full !min-h-12 !rounded-xl !bg-[#FF7900] hover:!bg-[#E86E00]">Find my invoice <ArrowRight className="h-4 w-4" /></Button></form>
            <p className="flex items-center gap-2 text-xs text-slate-500"><LockKeyhole className="h-3.5 w-3.5" /> You review the amount before approving anything in your wallet.</p>
            <Link href="/parent" className="inline-flex items-center gap-2 text-sm font-bold text-[#1877F2] hover:underline">Open parent fee hub <ArrowRight className="h-4 w-4" /></Link>
          </Card>
          <Card className="flex flex-col justify-between gap-6 bg-gradient-to-br from-white to-[#FFF4E8]">
            <div><div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#172B4D] text-white"><GraduationCap className="h-5 w-5" /></div><span className="text-xs font-bold uppercase tracking-wider text-[#1877F2]">For school administrators</span><h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink">Your fee office, organised.</h2><p className="mt-3 text-sm leading-6 text-slate-600">Create student invoices, share payment links, track collections and export a clear record for your accounts team.</p><ul className="mt-5 space-y-3 text-sm text-slate-700"><li className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-[#FF7900]" /> Live payment status</li><li className="flex items-center gap-2"><BookOpenCheck className="h-4 w-4 text-[#FF7900]" /> Student and term records</li><li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#FF7900]" /> On-chain transaction references</li></ul></div>
            <Link href="/admin" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#172B4D] px-5 text-sm font-bold text-white transition hover:bg-[#223C65]">Open administrator dashboard <ArrowRight className="h-4 w-4" /></Link>
          </Card>
        </section>

        <section className="grid gap-5 lg:grid-cols-2" aria-label="Choose your workspace">
          <Card className="flex flex-col justify-between gap-5 border-orange-200 bg-gradient-to-br from-white to-[#FFF2E5]"><div><div className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-[#B94F00]"><BadgeCheck className="h-3.5 w-3.5" /> Available now · Standard v2</div><h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-ink">Standard school workspace</h2><p className="mt-2 text-sm leading-6 text-slate-600">Continue using the existing single-school fee office, invoices, parent links and payment history. Your current NEAR Testnet v2 setup stays as it is.</p></div><Link href="/admin" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#FF7900] px-5 text-sm font-bold text-white transition hover:bg-[#E86E00]">Open Standard workspace <ArrowRight className="h-4 w-4" /></Link></Card>
          <Card className="flex flex-col justify-between gap-5 border-blue-200 bg-gradient-to-br from-white to-blue-50/70"><div><div className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-[#145FC2]"><GraduationCap className="h-3.5 w-3.5" /> v3 setup · Preview</div><h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-ink">Multi-school platform</h2><p className="mt-2 text-sm leading-6 text-slate-600">A separate platform for registering multiple schools, assigning each school its own administrator and treasury, and keeping every school's fee records isolated.</p></div><Link href="/multischool" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-5 text-sm font-bold text-[#145FC2] transition hover:bg-blue-50">Explore v3 setup preview <ArrowRight className="h-4 w-4" /></Link></Card>
        </section>

        <section className="grid gap-4 rounded-2xl border border-orange-100 bg-white/85 p-5 shadow-sm sm:grid-cols-3 sm:p-6">{[{title:'Create',body:'The school creates an invoice with the student, term, amount and due date.'},{title:'Pay',body:'The parent opens a private invoice link and approves the USDC payment.'},{title:'Verify',body:'The payment is recorded on NEAR and can be checked with its transaction reference.'}].map((step,index)=><div key={step.title} className="flex gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-[#C65300]">{index+1}</span><div><h3 className="font-bold text-ink">{step.title}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{step.body}</p></div></div>)}</section>
      </div>
    </PageShell>
  )
}
