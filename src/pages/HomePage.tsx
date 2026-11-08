import { useState, type FormEvent } from 'react'
import { ArrowRight, Receipt, ShieldCheck } from 'lucide-react'
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
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="space-y-2 pt-4 text-center">
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">School fee payments</h1>
          <p className="mx-auto max-w-xl text-pretty text-slate-600">
            Pay school fees online and keep a clear record of every payment. No paperwork, no queues.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="space-y-4">
            <Receipt className="h-7 w-7 text-brand-700" aria-hidden />
            <h2 className="font-display text-xl font-semibold">Parents</h2>
            <p className="text-sm text-slate-600">Open the payment link the school sent you, or paste it below.</p>
            <form onSubmit={open} className="space-y-3">
              <input className="field" placeholder="Paste your payment link" value={value} onChange={(e) => { setValue(e.target.value); setError(null) }} aria-label="Payment link" />
              {error && <Notice tone="error">{error}</Notice>}
              <Button type="submit" className="w-full">
                Open invoice <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </form>
          </Card>
          <Card className="flex flex-col space-y-4">
            <ShieldCheck className="h-7 w-7 text-brand-700" aria-hidden />
            <h2 className="font-display text-xl font-semibold">School office</h2>
            <p className="text-sm text-slate-600">Create invoices, share payment links, see who has paid and export records for the accountant.</p>
            <Link href="/admin" className="mt-auto inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-ink ring-1 ring-slate-300 hover:bg-slate-50">
              Administrator sign-in <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Card>
        </div>
      </div>
    </PageShell>
  )
}
