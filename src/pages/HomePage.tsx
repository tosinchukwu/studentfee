import { useState, type FormEvent } from 'react'
import { ArrowRight, BadgeCheck, BookOpenCheck, GraduationCap, LockKeyhole, ReceiptText, ShieldCheck, WalletCards } from 'lucide-react'
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
        <section className="relative isolate overflow-hidden rounded-[2rem] bg-[#101D35] px-6 py-12 text-white shadow-2xl shadow-slate-900/10 sm:px-10 sm:py-16 lg:px-14">
          <div className="absolute -right-24 -top-28 -z-10 h-80 w-80 rounded-full bg-teal-400/20 blur-3xl" />
          <div className="absolute -bottom-36 left-1/3 -z-10 h-80 w-80 rounded-full bg-blue-400/10 blur-3xl" />
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-teal-100">
              <span className="h-2 w-2 rounded-full bg-teal-300" />
              SCHOOL FEES, MADE CLEAR
            </div>
            <h1 className="max-w-2xl font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Every school payment.
              <span className="block text-teal-300">Clear, secure, accounted for.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
              A simpler way for schools to collect fees and for parents to pay with confidence. One payment link, a transparent record, and on-chain verification.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3 text-sm text-slate-300">
              <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-teal-300" /> Verifiable payments</span>
              <span className="hidden h-1 w-1 rounded-full bg-slate-500 sm:block" />
              <span className="inline-flex items-center gap-2"><WalletCards className="h-4 w-4 text-teal-300" /> USDC on NEAR</span>
              <span className="hidden h-1 w-1 rounded-full bg-slate-500 sm:block" />
              <span className="inline-flex items-center gap-2"><ReceiptText className="h-4 w-4 text-teal-300" /> Digital receipts</span>
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.15fr,0.85fr]">
          <Card className="space-y-5 border border-slate-200/80 shadow-xl shadow-slate-900/[0.04]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-50 text-brand-700">
                  <ReceiptText className="h-5 w-5" aria-hidden />
                </div>
                <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">Pay a school fee</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">Have a payment link from your school? Paste it below to review the invoice and pay securely.</p>
              </div>
              <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 sm:inline-flex">For parents</span>
            </div>
            <form onSubmit={open} className="space-y-3">
              <label className="label" htmlFor="payment-link">Your invoice payment link</label>
              <input id="payment-link" className="field !h-12 !rounded-xl" placeholder="Paste your payment link here" value={value} onChange={(e) => { setValue(e.target.value); setError(null) }} autoComplete="url" />
              {error && <Notice tone="error">{error}</Notice>}
              <Button type="submit" className="w-full !min-h-12 !rounded-xl">
                Find my invoice <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </form>
            <p className="flex items-center gap-2 text-xs text-slate-500"><LockKeyhole className="h-3.5 w-3.5" /> You review the amount before approving anything in your wallet.</p>
            <Link href="/parent" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 hover:text-brand-800">
              Open parent fee hub <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Card>

          <Card className="flex flex-col justify-between gap-6 border border-slate-200/80 bg-gradient-to-br from-white to-slate-50 shadow-xl shadow-slate-900/[0.04]">
            <div>
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#101D35] text-white">
                <GraduationCap className="h-5 w-5" aria-hidden />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider text-brand-700">For school administrators</span>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">Your fee office, organised.</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">Create student invoices, share payment links, track collections and export a clear record for your accounts team.</p>
              <ul className="mt-5 space-y-3 text-sm text-slate-700">
                <li className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-brand-600" /> Live payment status</li>
                <li className="flex items-center gap-2"><BookOpenCheck className="h-4 w-4 text-brand-600" /> Student and term records</li>
                <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-brand-600" /> On-chain transaction references</li>
              </ul>
            </div>
            <Link href="/admin" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#101D35] px-5 text-sm font-semibold text-white transition hover:bg-[#1A2D4D]">
              Open administrator dashboard <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Card>
        </section>

        <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white/70 p-5 sm:grid-cols-3 sm:p-6">
          {[
            { title: 'Create', body: 'The school creates an invoice with the student, term, amount and due date.' },
            { title: 'Pay', body: 'The parent opens a private invoice link and approves the USDC payment.' },
            { title: 'Verify', body: 'The payment is recorded on NEAR and can be checked with its transaction reference.' },
          ].map((step, index) => (
            <div key={step.title} className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-50 text-sm font-bold text-brand-700">{index + 1}</span>
              <div><h3 className="font-semibold text-ink">{step.title}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{step.body}</p></div>
            </div>
          ))}
        </section>
      </div>
    </PageShell>
  )
}
