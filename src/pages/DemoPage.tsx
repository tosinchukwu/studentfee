import { useMemo, useState, type FormEvent } from 'react'
import { ArrowRight, CheckCircle2, ClipboardList, ExternalLink, FlaskConical, WalletCards, Copy, PlusCircle } from 'lucide-react'
import { toast } from 'sonner'
import { navigate } from '../lib/router'
import { api } from '../lib/api'
import { toBaseUnits } from '../lib/money'
import { clientAdapter } from '../lib/contracts'
import { friendlyError, useNear } from '../lib/near'
import type { InvoiceView } from '../lib/types'
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

function defaultDueDate() {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + 7)
  return date.toISOString().slice(0, 10)
}

function newInvoiceId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export default function DemoPage({ schoolName }: { schoolName: string }) {
  const near = useNear()
  const { config, accountId } = near
  const [invoiceLink, setInvoiceLink] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [studentName, setStudentName] = useState('')
  const [studentId, setStudentId] = useState('')
  const [term, setTerm] = useState('Demo Term 2026')
  const [amount, setAmount] = useState('0.10')
  const [dueDate, setDueDate] = useState(defaultDueDate)
  const [note, setNote] = useState('')
  const [createdLink, setCreatedLink] = useState('')
  const [createdId, setCreatedId] = useState('')
  const [pendingMetadata, setPendingMetadata] = useState<{
    id: string; creator: string; studentName: string; studentId: string; term: string; amount: string; dueDate: number; note: string
  } | null>(null)

  const amountValid = useMemo(() => {
    const base = toBaseUnits(amount)
    return base !== null && base >= 10_000n && base <= 100_000_000n
  }, [amount])

  const openInvoice = (event: FormEvent) => {
    event.preventDefault()
    const id = invoiceIdFrom(invoiceLink)
    if (!id) {
      setError('Paste a valid StudentFee invoice link or its 32-character invoice ID.')
      return
    }
    navigate(`/pay/${id}`)
  }

  const saveMetadata = async (data: NonNullable<typeof pendingMetadata>) => {
    let lastError: unknown
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const result = await api.createDemoInvoice(data)
        const link = `${window.location.origin}/pay/${result.id}`
        setCreatedLink(link)
        setCreatedId(result.id)
        setPendingMetadata(null)
        toast.success('Your live Testnet invoice is ready.')
        return
      } catch (cause) {
        lastError = cause
        await sleep(1500)
      }
    }
    throw lastError
  }

  const createInvoice = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (!config) return
    if (!accountId) {
      near.connect()
      return
    }
    const base = toBaseUnits(amount)
    if (!base || base < 10_000n || base > 100_000_000n) {
      setError('Enter an amount from 0.01 to 100 USDC.')
      return
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate)
    if (!match) {
      setError('Choose a valid due date.')
      return
    }
    const dueMs = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59)
    if (!Number.isFinite(dueMs) || dueMs <= Date.now() || dueMs > Date.now() + 364 * 24 * 60 * 60 * 1000) {
      setError('Choose a future due date within the next 364 days.')
      return
    }

    const data = {
      id: newInvoiceId(),
      creator: accountId,
      studentName: studentName.trim(),
      studentId: studentId.trim(),
      term: term.trim(),
      amount: amount.trim(),
      dueDate: dueMs,
      note: note.trim(),
    }
    if (!data.studentName || !data.term) {
      setError('Student name and term are required.')
      return
    }

    setBusy(true)
    setCreatedLink('')
    let publishedOnChain = false
    try {
      const draft: Pick<InvoiceView, 'id' | 'contractId' | 'amountBase' | 'dueDate'> = {
        id: data.id,
        contractId: config.demoContractId,
        amountBase: base.toString(),
        dueDate: dueMs,
      }
      await near.call(clientAdapter('demo').publish(draft))
      publishedOnChain = true
      setPendingMetadata(data)
      await saveMetadata(data)
    } catch (cause) {
      if (publishedOnChain) {
        // React state updates are asynchronous; preserve this attempt's exact metadata
        // even when the registration request fails immediately after wallet approval.
        setPendingMetadata(data)
        setError('The invoice is already on-chain, but its details could not be saved yet. Use Retry registration below; do not create another invoice.')
      } else {
        setError(friendlyError(cause))
      }
    } finally {
      setBusy(false)
    }
  }

  const retryMetadata = async () => {
    if (!pendingMetadata) return
    setBusy(true)
    setError('')
    try {
      await saveMetadata(pendingMetadata)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not register invoice details. Please retry.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageShell schoolName={schoolName}>
      <div className="space-y-7">
        <section className="rounded-3xl bg-[#101D35] px-6 py-9 text-white sm:px-9">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-teal-100"><FlaskConical className="h-4 w-4" /> PUBLIC LIVE DEMO</div>
          <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Explore StudentFee</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">Create a real demonstration invoice with any NEAR Testnet wallet, then pay it from a different wallet using testnet USDC. No school administrator account is required.</p>
        </section>

        <Notice tone="warn">This is a NEAR Testnet prototype using test tokens only. Demo invoices are created on a separate public Demo contract, not the school's administrator-controlled contract. Never send real funds.</Notice>

        <section className="grid gap-5 lg:grid-cols-2">
          <Card className="space-y-4">
            <div className="flex items-center gap-2"><PlusCircle className="h-5 w-5 text-brand-700" /><h2 className="font-display text-xl font-semibold text-ink">Create a live test invoice</h2></div>
            <p className="text-sm leading-6 text-slate-600">Connect any Testnet wallet. The wallet that creates the invoice becomes its creator and pays a 0.01 NEAR storage deposit. A separate wallet can pay the USDC invoice.</p>
            {accountId ? <p className="break-all rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Connected creator wallet: <strong className="text-ink">{accountId}</strong></p> : <Button type="button" variant="secondary" className="w-full" onClick={near.connect}>Connect Testnet wallet</Button>}
            <form onSubmit={(event) => void createInvoice(event)} className="space-y-3">
              <div><label className="label" htmlFor="demo-student-name">Student name</label><input id="demo-student-name" className="field" maxLength={120} required value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="e.g. Amara Okafor" /></div>
              <div><label className="label" htmlFor="demo-student-id">Student ID (optional)</label><input id="demo-student-id" className="field" maxLength={40} value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="e.g. DEMO-104" /></div>
              <div><label className="label" htmlFor="demo-term">Term / session</label><input id="demo-term" className="field" maxLength={60} required value={term} onChange={(e) => setTerm(e.target.value)} /></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className="label" htmlFor="demo-amount">Amount (USDC)</label><input id="demo-amount" className="field" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} />{!amountValid && <p className="mt-1 text-xs text-rose-600">Enter 0.01–100 USDC (up to 6 decimals).</p>}</div>
                <div><label className="label" htmlFor="demo-due-date">Due date</label><input id="demo-due-date" className="field" type="date" min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} required value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
              </div>
              <div><label className="label" htmlFor="demo-note">Note (optional)</label><textarea id="demo-note" className="field min-h-20 py-2" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What is this fee for?" /></div>
              <Button type="submit" busy={busy} disabled={!accountId || !amountValid || !studentName.trim() || !term.trim()} className="w-full">{busy ? 'Confirm in your wallet...' : 'Create live invoice'}</Button>
            </form>
            {pendingMetadata && <div className="space-y-2"><Notice tone="warn">The on-chain invoice exists. Its display details still need to be registered.</Notice><Button type="button" variant="secondary" className="w-full" busy={busy} onClick={() => void retryMetadata()}>Retry invoice registration</Button></div>}
            {error && <Notice tone="error">{error}</Notice>}
            {createdLink && <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex items-center gap-2 font-semibold text-emerald-800"><CheckCircle2 className="h-5 w-5" /> Live invoice created</div><p className="break-all text-sm text-emerald-900">{createdLink}</p><div className="flex flex-wrap gap-2"><Button type="button" onClick={() => { void navigator.clipboard.writeText(createdLink).then(() => toast.success('Invoice link copied')) }}><Copy className="h-4 w-4" /> Copy payment link</Button><Button type="button" variant="secondary" onClick={() => navigate(`/pay/${createdId}`)}>View invoice <ArrowRight className="h-4 w-4" /></Button></div></div>}
          </Card>

          <Card className="space-y-4">
            <div className="flex items-center gap-2"><WalletCards className="h-5 w-5 text-brand-700" /><h2 className="font-display text-xl font-semibold text-ink">Pay an existing live invoice</h2></div>
            <p className="text-sm leading-6 text-slate-600">Already have an invoice link? Paste it here to open the checkout. Connect a different wallet from the one that created the invoice to test the parent payment flow.</p>
            <form onSubmit={openInvoice} className="space-y-3">
              <label className="label" htmlFor="demo-invoice">Live invoice link or ID</label>
              <input id="demo-invoice" className="field !h-12 !rounded-xl" value={invoiceLink} onChange={(e) => { setInvoiceLink(e.target.value); setError('') }} placeholder="Paste a real invoice link or ID" />
              <Button type="submit" className="w-full">Open live invoice <ArrowRight className="h-4 w-4" /></Button>
            </form>
            <div className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600"><strong className="text-ink">Try the payment flow:</strong><ol className="mt-2 list-inside list-decimal space-y-1"><li>Create an invoice with Wallet A.</li><li>Copy and share the generated link.</li><li>Open the link on another browser/device with Wallet B.</li><li>Pay using testnet USDC, then finish settlement.</li><li>Confirm the receipt displays Paid.</li></ol></div>
            <a href="https://testnet.nearblocks.io" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 hover:text-brand-800">Open NEAR Testnet explorer <ExternalLink className="h-4 w-4" /></a>
          </Card>
        </section>

        <Card className="space-y-4">
          <div className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-brand-700" /><h2 className="font-display text-xl font-semibold text-ink">Example fee register</h2></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="py-3 pr-4">Student</th><th className="py-3 pr-4">Student ID</th><th className="py-3 pr-4">Term</th><th className="py-3 pr-4">Amount</th><th className="py-3 pr-4">Due</th><th className="py-3">Status</th></tr></thead><tbody>{sampleInvoices.map((row) => <tr key={row.studentId} className="border-b border-slate-100 last:border-0"><td className="py-3 pr-4 font-medium text-ink">{row.student}</td><td className="py-3 pr-4 text-slate-600">{row.studentId}</td><td className="py-3 pr-4 text-slate-600">{row.term}</td><td className="py-3 pr-4 text-slate-700">{row.amount}</td><td className="py-3 pr-4 text-slate-600">{row.due}</td><td className="py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${row.status === 'Paid' ? 'bg-emerald-50 text-emerald-700' : row.status === 'Overdue' ? 'bg-amber-50 text-amber-800' : 'bg-sky-50 text-sky-800'}`}>{row.status}</span></td></tr>)}</tbody></table></div>
          <p className="text-xs text-slate-500">These three rows are static sample data only. Newly created live invoices are recorded separately on NEAR Testnet.</p>
        </Card>
      </div>
    </PageShell>
  )
}
