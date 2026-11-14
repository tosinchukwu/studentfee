import { useState, type FormEvent } from 'react'
import { ArrowRight, BadgeCheck, BookOpenCheck, FlaskConical, GraduationCap, LockKeyhole, ReceiptText, ShieldCheck, WalletCards, Check, CircleDollarSign } from 'lucide-react'
import { navigate, Link } from '../lib/router'
import { Button, Card, Notice, PageShell } from '../components/ui'

/** Accepts a full payment link or just the invoice code. */
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
    if (!id) {
      setError('That does not look like a payment link. Paste the full link the school sent you.')
      return
    }
    navigate(`/pay/${id}`)
  }

  return (
    <PageShell schoolName={schoolName}>
      <div className="space-y-10 pb-10">
        <section className="relative isolate overflow-hidden rounded-[2rem] border border-white/10 bg-[#05090c] px-6 py-12 text-white shadow-2xl sm:px-10 sm:py-16 lg:px-14 lg:py-20">
          <div className="sf-glow -right-32 -top-40" />
          <div className="pointer-events-none absolute -left-24 top-20 h-56 w-56 rounded-full bg-[#ff7900]/10 blur-[95px]" />
          <div className="sf-glow -bottom-56 left-1/4 opacity-40" />
          <div className="relative z-10 grid items-center gap-12 lg:grid-cols-[1.1fr,.9fr]">
            <div className="sf-rise max-w-3xl">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#ff9a45]/30 bg-[#ff7900]/[.10] px-4 py-2 text-xs font-bold tracking-[.16em] text-[#ffad68]">
                <span className="h-2 w-2 rounded-full bg-[#ff8a24] shadow-[0_0_14px_#ff7900]" />
                USDC ON NEAR
              </div>
              <h1 className="max-w-3xl font-display text-[2.8rem] font-bold leading-[.99] tracking-[-.045em] sm:text-6xl lg:text-[4.6rem]">
                Every school payment.
                <span className="mt-1 block bg-gradient-to-r from-[#5ef2c4] to-[#a0ffe0] bg-clip-text text-transparent">Clear, secure, <span className="font-script text-[1.12em] font-normal italic tracking-[-.02em] text-[#ffad68]">accounted for.</span></span>
              </h1>
              <p className="mt-7 max-w-xl text-base leading-8 text-[#a6b3c0] sm:text-lg">
                A simpler way for schools to collect fees and for parents to pay with confidence. One payment link, a transparent record, and on-chain verification.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link href="/demo" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#edf2f7] px-6 text-sm font-bold text-[#05070a] transition hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(237,242,247,.16)]">Explore demo <ArrowRight className="h-4 w-4" /></Link>
                <a href="#pay-fee" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[.06] px-6 text-sm font-semibold text-white transition hover:border-[#5ef2c4]/40 hover:bg-[#5ef2c4]/[.08]">Pay a fee</a>
              </div>
              <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3 text-xs font-medium text-[#a6b3c0] sm:text-sm">
                <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#5ef2c4]" /> Verifiable payments</span>
                <span className="inline-flex items-center gap-2"><WalletCards className="h-4 w-4 text-[#5ef2c4]" /> USDC on NEAR</span>
                <span className="inline-flex items-center gap-2"><ReceiptText className="h-4 w-4 text-[#5ef2c4]" /> Digital receipts</span>
              </div>
            </div>

            <div className="relative mx-auto flex min-h-[340px] w-full max-w-[470px] items-center justify-center lg:min-h-[440px]">
              <div className="absolute h-64 w-64 rounded-full bg-teal-400/20 blur-[90px]" />
              <div className="sf-float relative z-10 w-[88%] rotate-[-5deg] rounded-[28px] border border-white/15 bg-[#101a20]/90 p-5 shadow-[0_30px_90px_rgba(0,0,0,.55)] backdrop-blur-2xl sm:p-7">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#5ef2c4]/10 text-[#5ef2c4]"><GraduationCap className="h-5 w-5" /></span>
                    <span><span className="block text-sm font-bold text-white">StudentFee</span><span className="text-[10px] uppercase tracking-[.16em] text-[#a6b3c0]">School fee payment portal</span></span>
                  </div>
                  <span className="rounded-full border border-[#ff9a45]/30 bg-[#ff7900]/[.07] px-3 py-1 text-[10px] font-bold tracking-wider text-[#ffad68]">NEAR TESTNET</span>
                </div>
                <div className="py-7">
                  <p className="text-xs font-medium text-[#a6b3c0]">Fee invoice</p>
                  <p className="mt-2 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">One link. Clear records.</p>
                  <div className="mt-6 flex items-end justify-between gap-3">
                    <div><p className="text-[10px] uppercase tracking-[.15em] text-[#82919d]">Payment method</p><p className="mt-1 text-lg font-semibold text-white">USDC</p></div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#5ef2c4]/10 px-3 py-2 text-xs font-semibold text-[#5ef2c4]"><Check className="h-3.5 w-3.5" /> On-chain verification</span>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-white/10 pt-4 text-xs text-[#a6b3c0]">
                  <span className="inline-flex items-center gap-2"><CircleDollarSign className="h-4 w-4 text-[#5ef2c4]" /> Digital dollars</span>
                  <span>Powered by NEAR</span>
                </div>
              </div>
              <div className="sf-float-delay absolute right-0 top-7 z-20 rounded-2xl border border-[#5ef2c4]/20 bg-[#0d1719]/90 p-3 shadow-xl backdrop-blur-xl sm:right-[-2px]">
                <span className="flex items-center gap-2 text-xs font-semibold text-[#ffad68]"><span className="h-2 w-2 rounded-full bg-[#ff8a24]" /> Verifiable payments</span>
              </div>
              <div className="sf-float absolute bottom-4 left-0 z-20 rounded-2xl border border-white/10 bg-[#12191e]/95 p-3 shadow-xl backdrop-blur-xl">
                <span className="flex items-center gap-2 text-xs font-semibold text-white"><ShieldCheck className="h-4 w-4 text-[#5ef2c4]" /> Payment records on NEAR</span>
              </div>
            </div>
          </div>
        </section>

        <section className="sf-glass p-5 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-6">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[#5ef2c4]"><FlaskConical className="h-4 w-4" /> Open public Demo</div>
            <h2 className="mt-2 font-display text-xl font-semibold text-white">Explore StudentFee before connecting a wallet.</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[#a6b3c0]">View sample fee records and learn how to try a real NEAR Testnet payment using an invoice link.</p>
          </div>
          <Link href="/demo" className="mt-4 inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#5ef2c4] px-5 text-sm font-bold text-[#05070a] transition hover:-translate-y-0.5 sm:mt-0">Explore Demo <ArrowRight className="h-4 w-4" /></Link>
        </section>

        <section id="pay-fee" className="grid gap-5 lg:grid-cols-[1.15fr,.85fr]">
          <Card className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#5ef2c4]/10 text-[#5ef2c4]"><ReceiptText className="h-5 w-5" aria-hidden /></div>
                <h2 className="font-display text-2xl font-semibold tracking-tight text-white">Pay a school fee</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-[#a6b3c0]">Have a payment link from your school? Paste it below to review the invoice and pay securely.</p>
              </div>
              <span className="hidden rounded-full border border-white/10 bg-white/[.05] px-3 py-1 text-xs font-semibold text-[#a6b3c0] sm:inline-flex">For parents</span>
            </div>
            <form onSubmit={open} className="space-y-3">
              <label className="label" htmlFor="payment-link">Your invoice payment link</label>
              <input id="payment-link" className="field !h-12 !rounded-full" placeholder="Paste your payment link here" value={value} onChange={(e) => { setValue(e.target.value); setError(null) }} autoComplete="url" />
              {error && <Notice tone="error">{error}</Notice>}
              <Button type="submit" className="w-full !min-h-12 !rounded-full">Find my invoice <ArrowRight className="h-4 w-4" aria-hidden /></Button>
            </form>
            <p className="flex items-center gap-2 text-xs text-[#a6b3c0]"><LockKeyhole className="h-3.5 w-3.5" /> You review the amount before approving anything in your wallet.</p>
            <Link href="/parent" className="inline-flex items-center gap-2 text-sm font-semibold text-[#5ef2c4]">Open parent fee hub <ArrowRight className="h-4 w-4" aria-hidden /></Link>
          </Card>

          <Card className="flex flex-col justify-between gap-6">
            <div>
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#5ef2c4]/10 text-[#5ef2c4]"><GraduationCap className="h-5 w-5" aria-hidden /></div>
              <span className="text-xs font-semibold uppercase tracking-wider text-[#5ef2c4]">For school administrators</span>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-white">Your fee office, organised.</h2>
              <p className="mt-3 text-sm leading-6 text-[#a6b3c0]">Create student invoices, share payment links, track collections and export a clear record for your accounts team.</p>
              <ul className="mt-5 space-y-3 text-sm text-[#c5d0d9]">
                <li className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-[#5ef2c4]" /> Live payment status</li>
                <li className="flex items-center gap-2"><BookOpenCheck className="h-4 w-4 text-[#5ef2c4]" /> Student and term records</li>
                <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#5ef2c4]" /> On-chain transaction references</li>
              </ul>
            </div>
            <Link href="/admin" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[.06] px-5 text-sm font-semibold text-white transition hover:border-[#5ef2c4]/40 hover:bg-[#5ef2c4]/[.08]">Open administrator dashboard <ArrowRight className="h-4 w-4" aria-hidden /></Link>
          </Card>
        </section>

        <section className="grid gap-5 lg:grid-cols-2" aria-label="Choose your workspace">
          <Card className="flex flex-col justify-between gap-5 border-[#5ef2c4]/25">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-[#5ef2c4]/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-[#5ef2c4]"><BadgeCheck className="h-3.5 w-3.5" /> Available now · Standard v2</div>
              <h2 className="mt-4 font-display text-2xl font-semibold tracking-tight text-white">Standard school workspace</h2>
              <p className="mt-2 text-sm leading-6 text-[#a6b3c0]">Continue using the existing single-school fee office, invoices, parent links and payment history. Your current NEAR Testnet v2 setup stays as it is.</p>
            </div>
            <Link href="/admin" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#edf2f7] px-5 text-sm font-bold text-[#05070a] transition hover:-translate-y-0.5">Open Standard workspace <ArrowRight className="h-4 w-4" /></Link>
          </Card>
          <Card className="flex flex-col justify-between gap-5">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/[.07] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-[#a6b3c0]"><GraduationCap className="h-3.5 w-3.5" /> v3 setup · Preview</div>
              <h2 className="mt-4 font-display text-2xl font-semibold tracking-tight text-white">Multi-school platform</h2>
              <p className="mt-2 text-sm leading-6 text-[#a6b3c0]">A separate platform for registering multiple schools, assigning each school its own administrator and treasury, and keeping every school's fee records isolated.</p>
            </div>
            <Link href="/multischool" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[.06] px-5 text-sm font-semibold text-white transition hover:border-[#5ef2c4]/40">Explore v3 setup preview <ArrowRight className="h-4 w-4" /></Link>
          </Card>
        </section>

        <section className="sf-glass grid gap-4 p-5 sm:grid-cols-3 sm:p-6">
          {[
            { title: 'Create', body: 'The school creates an invoice with the student, term, amount and due date.' },
            { title: 'Pay', body: 'The parent opens a private invoice link and approves the USDC payment.' },
            { title: 'Verify', body: 'The payment is recorded on NEAR and can be checked with its transaction reference.' },
          ].map((step, index) => (
            <div key={step.title} className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#5ef2c4]/10 text-sm font-bold text-[#5ef2c4]">{index + 1}</span>
              <div><h3 className="font-semibold text-white">{step.title}</h3><p className="mt-1 text-sm leading-6 text-[#a6b3c0]">{step.body}</p></div>
            </div>
          ))}
        </section>
      </div>
    </PageShell>
  )
}
