import { useState, type FormEvent } from 'react'
import { ArrowRight, CheckCircle2, ClipboardList, ExternalLink, FlaskConical, WalletCards } from 'lucide-react'
import { navigate } from '../lib/router'
import { Button, Card, Notice, PageShell } from '../components/ui'

const sampleInvoices = [
  { student: 'Amara Okafor', studentId: 'DEMO-001', term: 'Term 2 2026', amount: '0.50 USDC', due: '15 Dec 2026', status: 'Pending' },
  { student: 'Daniel Bello', studentId: 'DEMO-002', term: 'Term 2 2026', amount: '0.75 USDC', due: '15 Dec 2026', status: 'Paid' },
  { student: 'Zara Ibrahim', studentId: 'DEMO-003', term: 'Term 2 2026', amount: '0.40 USDC', due: '20 Dec 2026', status: 'Overdue' },
]

function invoiceIdFrom(value: string): string | null {
  const match = /([0-9a-f]{32})/i.exec(value.trim())
  return match?.[1].toLowerCase() ?? null
}

export default function DemoPage({ schoolName }: { schoolName: string }) {
  const [invoiceLink, setInvoiceLink] = useState('')
  const [error, setError] = useState('')

  const openInvoice = (event: FormEvent) => {
    event.preventDefault()
    const id = invoiceIdFrom(invoiceLink)
    if (!id) {
      setError('Paste a valid StudentFee invoice link or its 32-character invoice ID.')
      return
    }
    navigate(`/pay/${id}`)
  }

  return (
    <PageShell schoolName={schoolName}>
      <div className="space-y-7">
        <section className="rounded-3xl bg-[#101D35] px-6 py-9 text-white sm:px-9">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-teal-100"><FlaskConical className="h-4 w-4" /> PUBLIC DEMO</div>
          <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Explore StudentFee</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">See how a school can organise fee invoices and how parents can pay with USDC on NEAR Testnet. You can explore this page without connecting a wallet.</p>
        </section>

        <Notice tone="info">
          The student records below are sample data for demonstration only. They are not real students, invoices or blockchain transactions. StudentFee is a NEAR Testnet prototype; do not use real funds.
        </Notice>

        <section className="grid gap-4 sm:grid-cols-3">
          <Card><p className="text-sm text-slate-500">Sample students</p><p className="mt-2 text-3xl font-semibold text-ink">3</p></Card>
          <Card><p className="text-sm text-slate-500">Sample invoices</p><p className="mt-2 text-3xl font-semibold text-ink">3</p></Card>
          <Card><p className="text-sm text-slate-500">Sample amount due</p><p className="mt-2 text-3xl font-semibold text-ink">0.90 <span className="text-base">USDC</span></p></Card>
        </section>

        <Card className="space-y-4">
          <div className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-brand-700" /><h2 className="font-display text-xl font-semibold text-ink">Example fee register</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="py-3 pr-4">Student</th><th className="py-3 pr-4">Student ID</th><th className="py-3 pr-4">Term</th><th className="py-3 pr-4">Amount</th><th className="py-3 pr-4">Due</th><th className="py-3">Status</th></tr></thead>
              <tbody>{sampleInvoices.map((row) => <tr key={row.studentId} className="border-b border-slate-100 last:border-0"><td className="py-3 pr-4 font-medium text-ink">{row.student}</td><td className="py-3 pr-4 text-slate-600">{row.studentId}</td><td className="py-3 pr-4 text-slate-600">{row.term}</td><td className="py-3 pr-4 text-slate-700">{row.amount}</td><td className="py-3 pr-4 text-slate-600">{row.due}</td><td className="py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${row.status === 'Paid' ? 'bg-emerald-50 text-emerald-700' : row.status === 'Overdue' ? 'bg-amber-50 text-amber-800' : 'bg-sky-50 text-sky-800'}`}>{row.status}</span></td></tr>)}</tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">These rows are static examples and cannot be paid. No wallet transaction is triggered by this sample register.</p>
        </Card>

        <section className="grid gap-5 lg:grid-cols-2">
          <Card className="space-y-4">
            <div className="flex items-center gap-2"><WalletCards className="h-5 w-5 text-brand-700" /><h2 className="font-display text-xl font-semibold text-ink">Try a live test payment</h2></div>
            <p className="text-sm leading-6 text-slate-600">If the project team has shared a real invoice link, open it here to review the invoice and try the NEAR Testnet payment flow with your own testnet wallet and testnet USDC.</p>
            <form onSubmit={openInvoice} className="space-y-3">
              <label className="label" htmlFor="demo-invoice">Live invoice link or ID</label>
              <input id="demo-invoice" className="field !h-12 !rounded-xl" value={invoiceLink} onChange={(e) => { setInvoiceLink(e.target.value); setError('') }} placeholder="Paste a real invoice link or ID" />
              {error && <Notice tone="error">{error}</Notice>}
              <Button type="submit" className="w-full">Open live invoice <ArrowRight className="h-4 w-4" /></Button>
            </form>
            <p className="text-xs text-slate-500">Only use an invoice link supplied by the project team. Check the amount and recipient in your wallet before approving.</p>
          </Card>

          <Card className="space-y-4">
            <div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-brand-700" /><h2 className="font-display text-xl font-semibold text-ink">How to test</h2></div>
            <ol className="space-y-3 text-sm leading-6 text-slate-600">
              <li><strong className="text-ink">1. Explore:</strong> Review the sample register above. No wallet is needed.</li>
              <li><strong className="text-ink">2. Get a test invoice:</strong> Ask the project team for a live NEAR Testnet invoice link.</li>
              <li><strong className="text-ink">3. Connect:</strong> Open the link and connect your own NEAR Testnet wallet.</li>
              <li><strong className="text-ink">4. Pay and settle:</strong> Approve the USDC transfer, then approve the separate settlement step if prompted.</li>
              <li><strong className="text-ink">5. Verify:</strong> Wait until the invoice displays Paid after on-chain settlement.</li>
            </ol>
            <a href="https://testnet.nearblocks.io" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 hover:text-brand-800">Open NEAR Testnet explorer <ExternalLink className="h-4 w-4" /></a>
          </Card>
        </section>
      </div>
    </PageShell>
  )
}
